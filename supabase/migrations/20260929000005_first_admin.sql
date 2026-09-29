-- Birinchi admin (solimxon98@gmail.com): Supabase Auth'da yaratilishi bilan admin huquqi beriladi.
-- Foydalanuvchi allaqachon bo'lsa — darhol, keyin yaratilsa — trigger orqali.
create or replace function public.grant_first_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'solimxon98@gmail.com' then
    insert into public.admins (user_id, email, name) values (new.id, new.email, 'Solim')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.grant_first_admin() from public, anon, authenticated;

drop trigger if exists grant_first_admin on auth.users;
create trigger grant_first_admin after insert or update of email on auth.users
  for each row execute function public.grant_first_admin();

insert into public.admins (user_id, email, name)
select id, email, 'Solim' from auth.users where lower(email) = 'solimxon98@gmail.com'
on conflict (user_id) do nothing;
