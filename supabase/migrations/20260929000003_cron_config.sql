-- Cron Edge Function manzili va kaliti. __CRON_URL__ / __CRON_SECRET__ ni GitHub Actions
-- (supabase.yml) deploy paytida almashtiradi. Qo'lda ishlatsangiz — o'zingiz almashtiring.
insert into public.settings (key, value)
values ('cron', jsonb_build_object('url', '__CRON_URL__', 'secret', '__CRON_SECRET__'))
on conflict (key) do update set value = excluded.value, updated_at = now();
