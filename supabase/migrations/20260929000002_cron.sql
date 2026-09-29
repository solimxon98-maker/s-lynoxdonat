-- =====================================================================
-- Har daqiqada "cron" Edge Function'ni chaqirish:
--   * PROCESSING buyurtmalar holatini tekshirish, qotib qolganlarni tiklash
--   * 24 soat to'lanmagan buyurtmalarni bekor qilish
--   * FastDonate balansini tekshirish
--   * Bepul Supabase loyihasi "uxlab qolmasligi" uchun doimiy faollik
--
-- URL va maxfiy kalit settings jadvalida saqlanadi (key = 'cron'), deploy paytida yoziladi:
--   insert into public.settings(key, value) values
--     ('cron', '{"url":"https://<ref>.supabase.co/functions/v1/cron","secret":"<CRON_SECRET>"}')
--   on conflict (key) do update set value = excluded.value;
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

create or replace function public.call_cron() returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select value into v from public.settings where key = 'cron';
  if v is null or coalesce(v->>'url', '') = '' then return; end if;
  perform net.http_post(
    url := v->>'url',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', coalesce(v->>'secret', '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end $$;
revoke execute on function public.call_cron() from public, anon, authenticated;

select cron.unschedule('slynox-every-minute') where exists (select 1 from cron.job where jobname = 'slynox-every-minute');
select cron.schedule('slynox-every-minute', '* * * * *', 'select public.call_cron()');
