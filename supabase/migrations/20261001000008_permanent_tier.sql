-- =====================================================================
-- Doimiy tarif: admin foydalanuvchiga muddatsiz Bronza/VIP narx beradi.
-- Haqiqiy tarif = doimiy va vaqtinchalik (do'st taklifi / admin 7 kun) dan YUQORIrog'i.
-- =====================================================================
alter table public.tg_users add column permanent_tier text not null default 'oddiy'
  check (permanent_tier in ('oddiy', 'bronza', 'vip'));

create or replace function public.tier_rank(p text) returns integer
language sql immutable as $$ select case p when 'vip' then 2 when 'bronza' then 1 else 0 end $$;

create or replace function public.user_tier(u public.tg_users) returns text
language sql stable as $$
  select case when public.tier_rank(u.permanent_tier) >= public.tier_rank(public.effective_tier(u.tier, u.tier_until))
              then u.permanent_tier else public.effective_tier(u.tier, u.tier_until) end;
$$;

create or replace function public.create_order(
  p_user_id bigint,
  p_product_id uuid,
  p_mlbb_id text,
  p_server_id text,
  p_nickname text,
  p_idempotency_key text,
  p_payment_provider text,
  p_donate_provider text,
  p_mock boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user public.tg_users;
  v_product public.products;
  v_existing public.orders;
  v_tier text;
  v_amount integer;
  v_seq bigint;
  v_order_no text;
  v_payment_id uuid := gen_random_uuid();
  v_recent integer;
begin
  -- Idempotency: shu kalit bilan buyurtma bor bo'lsa — o'shani qaytaramiz
  select * into v_existing from public.orders where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_no', v_existing.order_no, 'payment_id', v_existing.payment_id, 'reused', true);
  end if;

  select * into v_user from public.tg_users where id = p_user_id for update;
  if not found then raise exception 'FORBIDDEN: Foydalanuvchi topilmadi'; end if;
  if v_user.blocked then raise exception 'FORBIDDEN: Hisobingiz bloklangan. Support bilan bog‘laning.'; end if;

  select count(*) into v_recent from public.orders
   where user_id = p_user_id and created_at > now() - interval '10 minutes';
  if v_recent >= 10 then raise exception 'TOO_MANY_ORDERS: Juda ko‘p buyurtma. Birozdan so‘ng urinib ko‘ring.'; end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then raise exception 'NOT_FOUND: Paket topilmadi.'; end if;
  if not v_product.active then raise exception 'PRODUCT_INACTIVE: Bu paket hozirda mavjud emas.'; end if;

  -- 1 martalik bonus paket: shu MLBB akkaunt uchun (poyga holatidan himoya — advisory lock)
  if v_product.once_per_account then
    perform pg_advisory_xact_lock(hashtext('once:' || p_mlbb_id || ':' || p_product_id::text));
    if exists (
      select 1 from public.orders o
       where o.mlbb_id = p_mlbb_id and o.product_id = p_product_id
         and (o.status in ('PAID', 'PROCESSING', 'SUCCESS')
              or (o.status = 'AWAITING_PAYMENT' and o.created_at > now() - interval '30 minutes'))
    ) then
      raise exception 'ONCE_PER_ACCOUNT: Bu bonus paket bitta akkauntga faqat 1 marta beriladi. Bu akkaunt uni allaqachon olgan — oddiy olmos paketini tanlang.';
    end if;
  end if;

  v_tier := public.user_tier(v_user);
  v_amount := public.price_for(v_product, v_tier);
  v_seq := nextval('public.order_seq');
  v_order_no := 'SLD-' || lpad(v_seq::text, 6, '0');

  insert into public.orders (
    order_no, seq, user_id, username, first_name, mlbb_id, server_id, nickname, product_id, product,
    amount, price_tier, status, payment_status, payment_id, payment_provider, donate_provider,
    idempotency_key, mock
  ) values (
    v_order_no, v_seq, p_user_id, v_user.username, v_user.first_name, p_mlbb_id, p_server_id, coalesce(p_nickname, ''),
    v_product.id,
    jsonb_build_object(
      'name', v_product.name, 'category', v_product.category, 'diamonds', v_product.diamonds,
      'bonus', v_product.bonus, 'price', v_product.price, 'provider_sku', nullif(v_product.provider_sku, '')
    ),
    v_amount, v_tier, 'AWAITING_PAYMENT', 'PENDING', v_payment_id, p_payment_provider, p_donate_provider,
    p_idempotency_key, coalesce(p_mock, false)
  );

  insert into public.payments (id, order_no, user_id, provider, amount, status)
  values (v_payment_id, v_order_no, p_user_id, p_payment_provider, v_amount, 'PENDING');

  update public.tg_users set last_order_at = now() where id = p_user_id;

  return jsonb_build_object('order_no', v_order_no, 'payment_id', v_payment_id, 'reused', false);
end $$;

create or replace function public.credit_referral(p_new_user_id bigint, p_referrer_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.tg_users;
  v_total integer;
  v_cycle integer;
  v_reward text := null;
  v_until timestamptz := null;
begin
  if p_new_user_id = p_referrer_id then return jsonb_build_object('credited', false, 'reason', 'self'); end if;
  select * into r from public.tg_users where id = p_referrer_id for update;
  if not found then return jsonb_build_object('credited', false, 'reason', 'no_referrer'); end if;
  if r.blocked then return jsonb_build_object('credited', false, 'reason', 'referrer_blocked'); end if;

  begin
    insert into public.referrals (new_user_id, referrer_id) values (p_new_user_id, p_referrer_id);
  exception when unique_violation then
    return jsonb_build_object('credited', false, 'reason', 'already_referred');
  end;
  update public.tg_users set referred_by = p_referrer_id where id = p_new_user_id and referred_by is null;

  v_total := r.referrals_total + 1;
  v_cycle := r.referral_cycle + 1;
  if v_cycle >= 10 then
    v_reward := 'vip';
    v_until := public.extend_tier_until(r.tier, r.tier_until, 'vip', 7);
    v_cycle := 0;
  elsif v_cycle = 5 and public.user_tier(r) <> 'vip' then
    v_reward := 'bronza';
    v_until := public.extend_tier_until(r.tier, r.tier_until, 'bronza', 7);
  end if;

  update public.tg_users
     set referrals_total = v_total,
         referral_cycle = v_cycle,
         tier = coalesce(v_reward, tier),
         tier_until = coalesce(v_until, tier_until)
   where id = p_referrer_id;

  return jsonb_build_object(
    'credited', true, 'total', v_total, 'cycle', v_cycle,
    'reward', v_reward, 'until', v_until,
    'referrer', jsonb_build_object('id', r.id, 'tier', r.tier, 'tier_until', r.tier_until)
  );
end $$;

create or replace function public.set_permanent_tier(p_user_id bigint, p_tier text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_tier not in ('oddiy', 'bronza', 'vip') then raise exception 'INVALID_TIER: Tarif: oddiy | bronza | vip'; end if;
  update public.tg_users set permanent_tier = p_tier where id = p_user_id;
  if not found then raise exception 'NOT_FOUND: Foydalanuvchi topilmadi'; end if;
  return p_tier;
end $$;

revoke execute on function public.tier_rank(text) from public, anon, authenticated;
revoke execute on function public.user_tier(public.tg_users) from public, anon, authenticated;
revoke execute on function public.set_permanent_tier(bigint, text) from public, anon, authenticated;
revoke execute on function public.create_order(bigint, uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.credit_referral(bigint, bigint) from public, anon, authenticated;
