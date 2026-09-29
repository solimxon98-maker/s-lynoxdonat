-- =====================================================================
-- S-LynoxDonat — Supabase (Postgres) sxemasi
--
-- Qoidalar:
--  * Buyurtma, to'lov, tarif, referal — FAQAT Edge Functions (service_role) orqali,
--    atomik SQL funksiyalar bilan o'zgaradi. Brauzer ularga yoza olmaydi.
--  * Telegram foydalanuvchilari Supabase Auth'ga kirmaydi: ular Edge Function (api)
--    bilan server imzolagan sessiya orqali ishlaydi.
--  * Admin = Supabase Auth (email/parol) + public.admins jadvalida yozuv.
--  * FastDonate kalitlari (settings.key = 'fastdonate') brauzerga hech qachon ochilmaydi.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Jadvallar
-- ---------------------------------------------------------------------

create table public.tg_users (
  id                bigint primary key,                 -- Telegram ID
  username          text,
  first_name        text not null default '',
  last_name         text,
  language_code     text,
  photo_url         text,
  blocked           boolean not null default false,
  orders_count      integer not null default 0,         -- to'langan buyurtmalar
  successful_orders integer not null default 0,
  total_spent       bigint  not null default 0,         -- so'm
  last_order_at     timestamptz,
  tier              text not null default 'oddiy' check (tier in ('oddiy', 'bronza', 'vip')),
  tier_until        timestamptz,
  referred_by       bigint references public.tg_users (id) on delete set null,
  referrals_total   integer not null default 0,
  referral_cycle    integer not null default 0 check (referral_cycle between 0 and 9),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 80),
  category         text not null default 'diamonds' check (category in ('bonus', 'diamonds', 'pass')),
  once_per_account boolean not null default false,
  diamonds         integer not null default 0 check (diamonds >= 0),
  bonus            integer not null default 0 check (bonus >= 0),
  price            integer not null check (price > 0),           -- Oddiy narx, so'm
  price_bronze     integer check (price_bronze is null or price_bronze > 0),
  price_vip        integer check (price_vip is null or price_vip > 0),
  active           boolean not null default true,
  sort_order       integer not null default 0,
  provider_sku     text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (category = 'pass' or diamonds > 0)
);
create unique index products_name_key on public.products (name);
create index products_active_sort on public.products (active, sort_order);

create sequence public.order_seq;

create table public.orders (
  order_no          text primary key,                     -- SLD-000001
  seq               bigint not null unique,
  user_id           bigint not null references public.tg_users (id),
  username          text,
  first_name        text not null default '',
  game              text not null default 'MLBB',
  mlbb_id           text not null check (mlbb_id ~ '^\d{5,12}$'),
  server_id         text not null check (server_id ~ '^\d{1,6}$'),
  nickname          text not null default '',
  product_id        uuid references public.products (id) on delete set null,
  product           jsonb not null,                       -- narx va nom snapshot
  amount            integer not null check (amount > 0),
  price_tier        text not null default 'oddiy' check (price_tier in ('oddiy', 'bronza', 'vip')),
  currency          text not null default 'UZS',
  status            text not null check (status in ('AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  payment_status    text not null check (payment_status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
  payment_id        uuid not null,
  payment_provider  text not null,
  donate_provider   text not null,
  provider_order_id text,
  attempts          integer not null default 0,
  last_error        jsonb,
  idempotency_key   text not null,
  mock              boolean not null default false,
  manual_by         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  paid_at           timestamptz,
  processing_at     timestamptz,
  completed_at      timestamptz,
  unique (user_id, idempotency_key)
);
create index orders_user_created on public.orders (user_id, created_at desc);
create index orders_status_updated on public.orders (status, updated_at);
create index orders_created on public.orders (created_at desc);
create index orders_mlbb_product on public.orders (mlbb_id, product_id);

create table public.payments (
  id          uuid primary key default gen_random_uuid(),
  order_no    text not null references public.orders (order_no) on delete cascade,
  user_id     bigint not null references public.tg_users (id),
  provider    text not null,
  amount      integer not null check (amount > 0),
  currency    text not null default 'UZS',
  status      text not null check (status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
  external_id text,
  pay_url     text,
  mode        text,
  raw         jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index payments_order on public.payments (order_no);

create table public.admins (
  user_id    uuid primary key,                           -- auth.users.id
  email      text,
  name       text,
  disabled   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.settings (
  key        text primary key,          -- 'fastdonate' (maxfiy), 'provider_status', 'public', 'cron' (maxfiy)
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.referrals (
  new_user_id bigint primary key references public.tg_users (id) on delete cascade,
  referrer_id bigint not null references public.tg_users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index referrals_referrer on public.referrals (referrer_id);

create table public.logs (
  id         bigserial primary key,
  level      text not null,
  event      text not null,
  order_no   text,
  data       jsonb,
  created_at timestamptz not null default now()
);
create index logs_created on public.logs (created_at desc);

-- ---------------------------------------------------------------------
-- Yordamchi funksiyalar
-- ---------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid() and not a.disabled);
$$;

-- Muddati o'tgan tarif = oddiy
create or replace function public.effective_tier(p_tier text, p_until timestamptz) returns text
language sql immutable as $$
  select case when p_tier in ('bronza', 'vip') and p_until is not null and p_until > now() then p_tier else 'oddiy' end;
$$;

-- Tarifga mos narx: VIP yo'q bo'lsa -> Bronza -> Oddiy
create or replace function public.price_for(p public.products, p_tier text) returns integer
language sql immutable as $$
  select case
    when p_tier = 'vip'    then coalesce(p.price_vip, p.price_bronze, p.price)
    when p_tier = 'bronza' then coalesce(p.price_bronze, p.price)
    else p.price end;
$$;

-- Xuddi shu tarif amal qilayotgan bo'lsa — qolgan muddat ustiga qo'shiladi
create or replace function public.extend_tier_until(p_cur_tier text, p_cur_until timestamptz, p_new_tier text, p_days integer)
returns timestamptz language sql stable as $$
  select (case
            when public.effective_tier(p_cur_tier, p_cur_until) = p_new_tier then greatest(now(), p_cur_until)
            else now() end) + make_interval(days => p_days);
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tg_users_touch before update on public.tg_users for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger orders_touch   before update on public.orders   for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Foydalanuvchi
-- ---------------------------------------------------------------------

-- Telegram foydalanuvchisini yaratish/yangilash. is_new = birinchi marta kirdi.
create or replace function public.upsert_tg_user(
  p_id bigint, p_username text, p_first_name text, p_last_name text, p_language_code text, p_photo_url text
) returns table (user_row jsonb, is_new boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_inserted boolean;
  v_row public.tg_users;
begin
  insert into public.tg_users (id, username, first_name, last_name, language_code, photo_url)
  values (p_id, p_username, coalesce(p_first_name, ''), p_last_name, p_language_code, p_photo_url)
  on conflict (id) do update
    set username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        language_code = excluded.language_code,
        photo_url = coalesce(excluded.photo_url, public.tg_users.photo_url)
  returning (xmax = 0) into v_inserted;
  select * into v_row from public.tg_users where id = p_id;
  return query select to_jsonb(v_row), v_inserted;
end $$;

-- ---------------------------------------------------------------------
-- Buyurtma yaratish (atomik)
-- Xatolar: RAISE EXCEPTION '<KOD>: <matn>' — Edge Function kodni ajratib oladi.
-- ---------------------------------------------------------------------
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

  v_tier := public.effective_tier(v_user.tier, v_user.tier_until);
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

-- ---------------------------------------------------------------------
-- To'lov hodisasi (webhook yoki mock) — idempotent
-- Natija: applied | duplicate | ignored | not_found | amount_mismatch
-- ---------------------------------------------------------------------
create or replace function public.apply_payment_event(
  p_payment_id uuid, p_status text, p_amount integer, p_external_id text, p_raw jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payments;
  v_order public.orders;
begin
  if p_status not in ('PAID', 'FAILED', 'CANCELLED') then raise exception 'BAD_STATUS: %', p_status; end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then return 'not_found'; end if;
  select * into v_order from public.orders where order_no = v_pay.order_no for update;
  if not found then return 'not_found'; end if;

  if v_pay.status = p_status then return 'duplicate'; end if;
  if v_pay.status <> 'PENDING' then return 'ignored'; end if;
  if p_status = 'PAID' and p_amount is not null and p_amount <> v_pay.amount then return 'amount_mismatch'; end if;
  if v_order.status <> 'AWAITING_PAYMENT' then return 'ignored'; end if;

  update public.payments
     set status = p_status, external_id = coalesce(p_external_id, external_id), raw = p_raw,
         paid_at = case when p_status = 'PAID' then now() else null end
   where id = p_payment_id;

  if p_status = 'PAID' then
    update public.orders set status = 'PAID', payment_status = 'PAID', paid_at = now() where order_no = v_order.order_no;
    update public.tg_users set orders_count = orders_count + 1 where id = v_order.user_id;
  else
    update public.orders set status = 'CANCELLED', payment_status = p_status where order_no = v_order.order_no;
  end if;
  return 'applied';
end $$;

-- ---------------------------------------------------------------------
-- Bajarish (fulfillment) holatlari
-- ---------------------------------------------------------------------

-- PAID -> PROCESSING. Faqat to'langan buyurtma provayderga yuboriladi; ikki marta yuborilmaydi.
create or replace function public.claim_paid_order(p_order_no text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  update public.orders
     set status = 'PROCESSING', processing_at = now(), attempts = attempts + 1, last_error = null
   where order_no = p_order_no and status = 'PAID' and payment_status = 'PAID'
  returning * into v;
  if not found then return null; end if;
  return to_jsonb(v);
end $$;

create or replace function public.set_provider_order(p_order_no text, p_provider_order_id text) returns void
language sql security definer set search_path = public as $$
  update public.orders set provider_order_id = p_provider_order_id where order_no = p_order_no;
$$;

-- PROCESSING (yoki admin qo'lda: FAILED) -> SUCCESS, foydalanuvchi statistikasi
create or replace function public.complete_order(p_order_no text, p_manual_by uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  update public.orders
     set status = 'SUCCESS', completed_at = now(), last_error = null, manual_by = p_manual_by
   where order_no = p_order_no
     and payment_status = 'PAID'
     and (status = 'PROCESSING' or (p_manual_by is not null and status = 'FAILED'))
  returning * into v;
  if not found then return null; end if;
  update public.tg_users
     set successful_orders = successful_orders + 1, total_spent = total_spent + v.amount
   where id = v.user_id;
  return to_jsonb(v);
end $$;

create or replace function public.fail_order(p_order_no text, p_code text, p_message text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.orders;
begin
  update public.orders
     set status = 'FAILED',
         last_error = jsonb_build_object('code', p_code, 'message', left(p_message, 500), 'at', now())
   where order_no = p_order_no and status in ('PROCESSING', 'PAID')
  returning * into v;
  if not found then return null; end if;
  return to_jsonb(v);
end $$;

-- Admin: FAILED -> PAID (qayta yuborish uchun)
create or replace function public.retry_order(p_order_no text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'PAID', provider_order_id = null
   where order_no = p_order_no and status = 'FAILED' and payment_status = 'PAID';
  return found;
end $$;

-- 24 soatdan ortiq to'lanmagan buyurtmalarni bekor qilish
create or replace function public.expire_unpaid_orders() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.payments p set status = 'CANCELLED'
    from public.orders o
   where p.order_no = o.order_no and p.status = 'PENDING'
     and o.status = 'AWAITING_PAYMENT' and o.created_at < now() - interval '24 hours';
  update public.orders set status = 'CANCELLED', payment_status = 'CANCELLED'
   where status = 'AWAITING_PAYMENT' and created_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Tariflar
-- ---------------------------------------------------------------------

-- Admin tarif beradi. 'oddiy' — bekor qiladi. Qaytaradi: yangi muddat (yoki null)
create or replace function public.set_user_tier(p_user_id bigint, p_tier text, p_days integer) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v public.tg_users;
  v_until timestamptz;
begin
  if p_tier not in ('oddiy', 'bronza', 'vip') then raise exception 'INVALID_TIER: Tarif: oddiy | bronza | vip'; end if;
  if p_days < 1 or p_days > 365 then raise exception 'INVALID_DAYS: Kunlar 1–365 oralig‘ida'; end if;
  select * into v from public.tg_users where id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND: Foydalanuvchi topilmadi'; end if;
  if p_tier = 'oddiy' then
    update public.tg_users set tier = 'oddiy', tier_until = null where id = p_user_id;
    return null;
  end if;
  v_until := public.extend_tier_until(v.tier, v.tier_until, p_tier, p_days);
  update public.tg_users set tier = p_tier, tier_until = v_until where id = p_user_id;
  return v_until;
end $$;

-- ---------------------------------------------------------------------
-- Referal (do'st taklif qilish)
-- Faqat botga birinchi marta kirgan foydalanuvchi hisoblanadi (Edge Function is_new ni tekshiradi).
-- Aylana: 5-do'st -> Bronza 7 kun (VIP amal qilmayotgan bo'lsa); 10-do'st -> VIP 7 kun (ustiga), hisob 0 dan.
-- ---------------------------------------------------------------------
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
  elsif v_cycle = 5 and public.effective_tier(r.tier, r.tier_until) <> 'vip' then
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

-- ---------------------------------------------------------------------
-- Admin dashboard statistikasi (bitta chaqiruv)
-- ---------------------------------------------------------------------
create or replace function public.admin_stats(p_day_start timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'today_orders',  (select count(*) from public.orders where created_at >= p_day_start),
    'today_revenue', (select coalesce(sum(amount), 0) from public.orders where created_at >= p_day_start and payment_status = 'PAID'),
    'total',         (select count(*) from public.orders),
    'success',       (select count(*) from public.orders where status = 'SUCCESS'),
    'pending',       (select count(*) from public.orders where status in ('AWAITING_PAYMENT', 'PAID', 'PROCESSING')),
    'failed',        (select count(*) from public.orders where status = 'FAILED')
  );
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.tg_users  enable row level security;
alter table public.products  enable row level security;
alter table public.orders    enable row level security;
alter table public.payments  enable row level security;
alter table public.admins    enable row level security;
alter table public.settings  enable row level security;
alter table public.referrals enable row level security;
alter table public.logs      enable row level security;

-- products: faol paketlarni hamma ko'radi; boshqarish — admin
create policy products_read on public.products for select using (active or public.is_admin());
create policy products_insert on public.products for insert to authenticated with check (public.is_admin());
create policy products_update on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_delete on public.products for delete to authenticated using (public.is_admin());

-- tg_users: admin o'qiydi; admin faqat "blocked" ni o'zgartira oladi (ustun huquqi pastda)
create policy tg_users_admin_read on public.tg_users for select to authenticated using (public.is_admin());
create policy tg_users_admin_block on public.tg_users for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- orders / payments / referrals / logs: faqat admin o'qiydi, yozish yo'q
create policy orders_admin_read    on public.orders    for select to authenticated using (public.is_admin());
create policy payments_admin_read  on public.payments  for select to authenticated using (public.is_admin());
create policy referrals_admin_read on public.referrals for select to authenticated using (public.is_admin());
create policy logs_admin_read      on public.logs      for select to authenticated using (public.is_admin());

-- admins: har kim faqat o'z yozuvini ko'radi
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());

-- settings: admin o'qiydi, maxfiy kalitlarni emas
create policy settings_admin_read on public.settings for select to authenticated
  using (public.is_admin() and key not in ('fastdonate', 'cron'));

-- Ustun darajasidagi huquqlar
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.tg_users, public.orders, public.payments, public.referrals, public.logs, public.settings, public.admins to authenticated;
grant update (blocked) on public.tg_users to authenticated;

-- SQL funksiyalar: faqat server (service_role). Admin faqat is_admin va admin_stats ni chaqira oladi.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.admin_stats(timestamptz) to authenticated;
grant execute on function public.effective_tier(text, timestamptz) to anon, authenticated;
grant execute on function public.price_for(public.products, text) to anon, authenticated;
