-- Uzum karta turi
alter table public.payment_cards drop constraint if exists payment_cards_bank_check;
alter table public.payment_cards add constraint payment_cards_bank_check
  check (bank in ('humo', 'uzcard', 'uzum', 'visa', 'mastercard', 'other'));
