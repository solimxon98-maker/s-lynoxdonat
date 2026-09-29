-- S-LynoxDonat paketlari va narxlari (Oddiy / Bronza / VIP).
-- Qayta ishga tushirilsa narxlar yangilanadi (nom bo'yicha). Keyin admin paneldan tahrirlanadi.
insert into public.products (name, category, once_per_account, diamonds, bonus, price, price_bronze, price_vip, sort_order)
values
  ('50+50 Bonus', 'bonus', true, 50, 50, 11000, 10500, 10000, 10),
  ('150+150 Bonus', 'bonus', true, 150, 150, 32000, 31000, 30000, 20),
  ('250+250 Bonus', 'bonus', true, 250, 250, 50000, 49000, 48000, 30),
  ('500+500 Bonus', 'bonus', true, 500, 500, 105000, 102000, 99000, 40),
  ('55 Diamonds', 'diamonds', false, 55, 0, 11000, 10500, 10000, 110),
  ('86 Diamonds', 'diamonds', false, 86, 0, 17000, 16500, 16000, 120),
  ('172 Diamonds', 'diamonds', false, 172, 0, 32500, 31500, 31000, 130),
  ('257 Diamonds', 'diamonds', false, 257, 0, 47500, 46500, 46000, 140),
  ('275 Diamonds', 'diamonds', false, 275, 0, 50000, 49000, 48000, 150),
  ('344 Diamonds', 'diamonds', false, 344, 0, 65000, 63000, 62000, 160),
  ('565 Diamonds', 'diamonds', false, 565, 0, 105000, 102000, 99000, 170),
  ('706 Diamonds', 'diamonds', false, 706, 0, 123000, 122000, 121000, 180),
  ('1412 Diamonds', 'diamonds', false, 1412, 0, 246000, 244000, 242000, 190),
  ('2195 Diamonds', 'diamonds', false, 2195, 0, 370000, 368000, 366000, 200),
  ('3688 Diamonds', 'diamonds', false, 3688, 0, 613000, 610000, 608000, 210),
  ('4390 Diamonds', 'diamonds', false, 4390, 0, 733000, 730000, 728000, 220),
  ('5532 Diamonds', 'diamonds', false, 5532, 0, 930000, 925000, 920000, 230),
  ('9288 Diamonds', 'diamonds', false, 9288, 0, 1535000, 1530000, 1520000, 240),
  ('Haftalik Propusk', 'pass', false, 0, 0, 20000, 19800, 19500, 310),
  ('Haftalik Elitniy', 'pass', false, 0, 0, 12000, 11500, 10500, 320),
  ('Oylik Epicheskiy', 'pass', false, 0, 0, 54000, 53000, 52000, 330)
on conflict (name) do update set
  category = excluded.category, once_per_account = excluded.once_per_account, diamonds = excluded.diamonds,
  bonus = excluded.bonus, price = excluded.price, price_bronze = excluded.price_bronze,
  price_vip = excluded.price_vip, sort_order = excluded.sort_order;
