-- =====================================================================
-- Balans (hamyon): kartaga o'tkazma -> chek -> admin tasdiqlaydi -> balans to'ladi
-- Xarid balansdan. Hamma pul harakati balance_tx jurnalida.
-- Balans FAQAT shu fayldagi SQL funksiyalar orqali o'zgaradi (service_role).
-- =====================================================================

alter table public.tg_users add column balance bigint not null default 0 check (balance >= 0);

-- Buyurtma: balansga qaytarilgan holat
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED'));
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'));
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'));

-- To'lov qabul qilinadigan kartalar (admin boshqaradi)
create table public.payment_cards (
  id         uuid primary key default gen_random_uuid(),
  bank       text not null default 'humo' check (bank in ('humo', 'uzcard', 'visa', 'mastercard', 'other')),
  number     text not null check (number ~ '^\d{16}$'),
  holder     text not null default '' check (char_length(holder) <= 80),
  note       text not null default '' check (char_length(note) <= 200),
  active     boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_cards_touch before update on public.payment_cards for each row execute function public.touch_updated_at();

create sequence public.topup_seq;

create table public.topups (
  topup_no        text primary key,                        -- TP-000001
  user_id         bigint not null references public.tg_users (id),
  amount          integer not null check (amount > 0),     -- mijoz aytgan summa
  credited        integer check (credited is null or credited > 0), -- admin tasdiqlagan summa
  card_id         uuid references public.payment_cards (id) on delete set null,
  card            jsonb not null,                          -- {bank, number, holder} snapshot
  status          text not null check (status in ('AWAITING_RECEIPT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  receipt_file_id text,
  receipt_at      timestamptz,
  admin_messages  jsonb not null default '[]'::jsonb,      -- [{chat_id, message_id}] — qaror bo'lgach tahrirlanadi
  reject_reason   text,
  decided_by      text,
  decided_at      timestamptz,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index topups_user_created on public.topups (user_id, created_at desc);
create index topups_status_created on public.topups (status, created_at desc);
create trigger topups_touch before update on public.topups for each row execute function public.touch_updated_at();

create table public.balance_tx (
  id            bigserial primary key,
  user_id       bigint not null references public.tg_users (id),
  delta         bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  kind          text not null check (kind in ('topup', 'purchase', 'refund', 'admin')),
  ref           text,                                      -- TP-.. / SLD-..
  note          text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index balance_tx_user on public.balance_tx (user_id, id desc);
-- Bitta buyurtma uchun bitta yechim va bitta qaytarish; bitta to'ldirish bitta marta
create unique index balance_tx_once on public.balance_tx (kind, ref) where kind in ('topup', 'purchase', 'refund');

-- ---------------------------------------------------------------------
-- Ichki: balansni o'zgartirish + jurnal (qulflangan user qatori bilan chaqiriladi)
-- ---------------------------------------------------------------------
create or replace function public._balance_move(
  p_user_id bigint, p_delta bigint, p_kind text, p_ref text, p_note text, p_by text
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_new bigint;
begin
  update public.tg_users set balance = balance + p_delta where id = p_user_id and balance + p_delta >= 0
  returning balance into v_new;
  if not found then raise exception 'INSUFFICIENT_FUNDS: Balans yetarli emas'; end if;
  insert into public.balance_tx (user_id, delta, balance_after, kind, ref, note, created_by)
  values (p_user_id, p_delta, v_new, p_kind, p_ref, p_note, p_by);
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- To'ldirish so'rovi
-- ---------------------------------------------------------------------
create or replace function public.create_topup(p_user_id bigint, p_amount integer, p_card_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user public.tg_users;
  v_card public.payment_cards;
  v_existing public.topups;
  v_open integer;
  v_recent integer;
  v_no text;
  v_row public.topups;
begin
  select * into v_existing from public.topups where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then return to_jsonb(v_existing) || jsonb_build_object('reused', true); end if;

  select * into v_user from public.tg_users where id = p_user_id for update;
  if not found then raise exception 'FORBIDDEN: Foydalanuvchi topilmadi'; end if;
  if v_user.blocked then raise exception 'FORBIDDEN: Hisobingiz bloklangan. Support bilan bog‘laning.'; end if;
  if p_amount is null or p_amount < 1000 or p_amount > 50000000 then
    raise exception 'INVALID_AMOUNT: Summa 1 000 dan 50 000 000 so‘mgacha bo‘lishi kerak';
  end if;

  select * into v_card from public.payment_cards where id = p_card_id and active;
  if not found then raise exception 'NOT_FOUND: Karta topilmadi. Boshqa kartani tanlang.'; end if;

  select count(*) into v_open from public.topups where user_id = p_user_id and status in ('AWAITING_RECEIPT', 'PENDING');
  if v_open >= 3 then raise exception 'TOO_MANY_TOPUPS: Sizda tekshirilmagan 3 ta so‘rov bor. Avval ular tasdiqlanishini kuting.'; end if;
  select count(*) into v_recent from public.topups where user_id = p_user_id and created_at > now() - interval '1 hour';
  if v_recent >= 10 then raise exception 'TOO_MANY_TOPUPS: Juda ko‘p so‘rov. Birozdan so‘ng urinib ko‘ring.'; end if;

  v_no := 'TP-' || lpad(nextval('public.topup_seq')::text, 6, '0');
  insert into public.topups (topup_no, user_id, amount, card_id, card, status, idempotency_key)
  values (v_no, p_user_id, p_amount, v_card.id,
          jsonb_build_object('bank', v_card.bank, 'number', v_card.number, 'holder', v_card.holder),
          'AWAITING_RECEIPT', p_idempotency_key)
  returning * into v_row;
  return to_jsonb(v_row) || jsonb_build_object('reused', false);
end $$;

-- Chek biriktirish (Web App yoki bot orqali). Tekshirilayotgan chekni almashtirish mumkin.
create or replace function public.attach_topup_receipt(p_topup_no text, p_user_id bigint, p_file_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.topups;
begin
  update public.topups
     set receipt_file_id = p_file_id, receipt_at = now(), status = 'PENDING'
   where topup_no = p_topup_no and user_id = p_user_id and status in ('AWAITING_RECEIPT', 'PENDING')
  returning * into v;
  if not found then raise exception 'TOPUP_CLOSED: Bu so‘rov yopilgan yoki topilmadi'; end if;
  return to_jsonb(v);
end $$;

create or replace function public.set_topup_admin_messages(p_topup_no text, p_messages jsonb) returns void
language sql security definer set search_path = public as $$
  update public.topups set admin_messages = coalesce(p_messages, '[]'::jsonb) where topup_no = p_topup_no;
$$;

-- Admin tasdiqlaydi. p_amount — kartaga haqiqatda tushgan summa (null = mijoz aytgani).
-- Natija: {result: approved | already_decided, topup, balance}
create or replace function public.approve_topup(p_topup_no text, p_amount integer, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v public.topups;
  v_amount integer;
  v_balance bigint;
begin
  select * into v from public.topups where topup_no = p_topup_no for update;
  if not found then raise exception 'NOT_FOUND: So‘rov topilmadi'; end if;
  if v.status not in ('AWAITING_RECEIPT', 'PENDING') then
    return jsonb_build_object('result', 'already_decided', 'topup', to_jsonb(v));
  end if;
  v_amount := coalesce(p_amount, v.amount);
  if v_amount < 1 or v_amount > 50000000 then raise exception 'INVALID_AMOUNT: Noto‘g‘ri summa'; end if;

  perform 1 from public.tg_users where id = v.user_id for update;
  v_balance := public._balance_move(v.user_id, v_amount, 'topup', v.topup_no, null, p_by);
  update public.topups
     set status = 'APPROVED', credited = v_amount, decided_by = p_by, decided_at = now()
   where topup_no = p_topup_no
  returning * into v;
  return jsonb_build_object('result', 'approved', 'topup', to_jsonb(v), 'balance', v_balance);
end $$;

create or replace function public.reject_topup(p_topup_no text, p_reason text, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v public.topups;
begin
  select * into v from public.topups where topup_no = p_topup_no for update;
  if not found then raise exception 'NOT_FOUND: So‘rov topilmadi'; end if;
  if v.status not in ('AWAITING_RECEIPT', 'PENDING') then
    return jsonb_build_object('result', 'already_decided', 'topup', to_jsonb(v));
  end if;
  update public.topups
     set status = 'REJECTED', reject_reason = left(coalesce(nullif(trim(p_reason), ''), 'To‘lov tasdiqlanmadi'), 300),
         decided_by = p_by, decided_at = now()
   where topup_no = p_topup_no
  returning * into v;
  return jsonb_build_object('result', 'rejected', 'topup', to_jsonb(v));
end $$;

-- Chek yuborilmagan so'rovlar 3 soatda yopiladi
create or replace function public.expire_topups() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.topups set status = 'EXPIRED'
   where status = 'AWAITING_RECEIPT' and created_at < now() - interval '3 hours';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Buyurtmani balansdan to'lash (atomik, idempotent)
-- Natija: {result: paid | already_paid | insufficient, balance, need}
-- ---------------------------------------------------------------------
create or replace function public.pay_order_from_balance(p_order_no text, p_user_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  u public.tg_users;
  v_balance bigint;
begin
  select * into o from public.orders where order_no = p_order_no for update;
  if not found or o.user_id <> p_user_id then raise exception 'NOT_FOUND: Buyurtma topilmadi'; end if;
  select * into u from public.tg_users where id = p_user_id for update;
  if u.blocked then raise exception 'FORBIDDEN: Hisobingiz bloklangan. Support bilan bog‘laning.'; end if;

  if o.payment_status = 'PAID' then
    return jsonb_build_object('result', 'already_paid', 'balance', u.balance);
  end if;
  if o.status <> 'AWAITING_PAYMENT' or o.payment_status <> 'PENDING' then
    raise exception 'ORDER_CLOSED: Bu buyurtma yopilgan. Yangi buyurtma bering.';
  end if;
  if o.payment_provider <> 'balance' then raise exception 'ORDER_CLOSED: Bu buyurtma balans orqali to‘lanmaydi'; end if;
  if u.balance < o.amount then
    return jsonb_build_object('result', 'insufficient', 'balance', u.balance, 'need', o.amount - u.balance);
  end if;

  v_balance := public._balance_move(p_user_id, -o.amount, 'purchase', o.order_no, null, null);
  update public.payments set status = 'PAID', paid_at = now(), external_id = 'BALANCE-' || o.order_no where id = o.payment_id;
  update public.orders set status = 'PAID', payment_status = 'PAID', paid_at = now() where order_no = o.order_no;
  update public.tg_users set orders_count = orders_count + 1 where id = p_user_id;
  return jsonb_build_object('result', 'paid', 'balance', v_balance);
end $$;

-- Admin: xato bo'lgan (FAILED) balansdan to'langan buyurtma pulini balansga qaytarish
create or replace function public.refund_order_to_balance(p_order_no text, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_balance bigint;
begin
  select * into o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'NOT_FOUND: Buyurtma topilmadi'; end if;
  if o.status <> 'FAILED' or o.payment_status <> 'PAID' or o.payment_provider <> 'balance' then
    raise exception 'REFUND_NOT_ALLOWED: Faqat balansdan to‘langan FAILED buyurtma pulini qaytarish mumkin';
  end if;
  perform 1 from public.tg_users where id = o.user_id for update;
  v_balance := public._balance_move(o.user_id, o.amount, 'refund', o.order_no, null, p_by);
  update public.orders set status = 'REFUNDED', payment_status = 'REFUNDED' where order_no = o.order_no;
  update public.payments set status = 'REFUNDED' where id = o.payment_id;
  update public.tg_users set orders_count = greatest(orders_count - 1, 0) where id = o.user_id;
  return jsonb_build_object('result', 'refunded', 'balance', v_balance, 'amount', o.amount, 'user_id', o.user_id);
end $$;

-- Admin: balansni qo'lda o'zgartirish (+/-)
create or replace function public.admin_adjust_balance(p_user_id bigint, p_delta bigint, p_note text, p_by text) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if p_delta = 0 or abs(p_delta) > 50000000 then raise exception 'INVALID_AMOUNT: Noto‘g‘ri summa'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'INVALID_AMOUNT: Izoh yozing (sabab)'; end if;
  perform 1 from public.tg_users where id = p_user_id for update;
  if not found then raise exception 'NOT_FOUND: Foydalanuvchi topilmadi'; end if;
  return public._balance_move(p_user_id, p_delta, 'admin', null, left(p_note, 200), p_by);
end $$;

-- Dashboard: to'ldirishlar ham
create or replace function public.admin_stats(p_day_start timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  return jsonb_build_object(
    'today_orders',   (select count(*) from public.orders where created_at >= p_day_start),
    'today_revenue',  (select coalesce(sum(amount), 0) from public.orders where created_at >= p_day_start and payment_status = 'PAID'),
    'total',          (select count(*) from public.orders),
    'success',        (select count(*) from public.orders where status = 'SUCCESS'),
    'pending',        (select count(*) from public.orders where status in ('AWAITING_PAYMENT', 'PAID', 'PROCESSING')),
    'failed',         (select count(*) from public.orders where status = 'FAILED'),
    'pending_topups', (select count(*) from public.topups where status = 'PENDING'),
    'today_topups',   (select coalesce(sum(credited), 0) from public.topups where status = 'APPROVED' and decided_at >= p_day_start),
    'total_balance',  (select coalesce(sum(balance), 0) from public.tg_users)
  );
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.payment_cards enable row level security;
alter table public.topups        enable row level security;
alter table public.balance_tx    enable row level security;

create policy cards_admin_read   on public.payment_cards for select to authenticated using (public.is_admin());
create policy cards_admin_insert on public.payment_cards for insert to authenticated with check (public.is_admin());
create policy cards_admin_update on public.payment_cards for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy cards_admin_delete on public.payment_cards for delete to authenticated using (public.is_admin());
create policy topups_admin_read     on public.topups     for select to authenticated using (public.is_admin());
create policy balance_tx_admin_read on public.balance_tx for select to authenticated using (public.is_admin());

revoke all on public.payment_cards, public.topups, public.balance_tx from anon, authenticated;
revoke all on sequence public.topup_seq, public.balance_tx_id_seq from anon, authenticated;
grant select, insert, update, delete on public.payment_cards to authenticated;
grant select on public.topups, public.balance_tx to authenticated;

-- Yangi funksiyalar: faqat server. (Postgres yangi funksiyaga PUBLIC execute beradi — olib tashlaymiz)
revoke execute on function public._balance_move(bigint, bigint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_topup(bigint, integer, uuid, text) from public, anon, authenticated;
revoke execute on function public.attach_topup_receipt(text, bigint, text) from public, anon, authenticated;
revoke execute on function public.set_topup_admin_messages(text, jsonb) from public, anon, authenticated;
revoke execute on function public.approve_topup(text, integer, text) from public, anon, authenticated;
revoke execute on function public.reject_topup(text, text, text) from public, anon, authenticated;
revoke execute on function public.expire_topups() from public, anon, authenticated;
revoke execute on function public.pay_order_from_balance(text, bigint) from public, anon, authenticated;
revoke execute on function public.refund_order_to_balance(text, text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_balance(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.admin_stats(timestamptz) to authenticated;
