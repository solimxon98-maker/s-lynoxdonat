-- FastDonate paket kodlari (fastdonate.su price_list ID lari; "6x2" = 2 dona).
-- Bonusli paketlar (50+5, 150+15, 250+25, 500+65): bonusi ishlatilmagan akkauntga x2 tushadi, aks holda oddiy (55, 275, 565).
update public.products p set provider_sku = m.sku
from (values
  ('50+50 Bonus', '1'), ('150+150 Bonus', '2'), ('250+250 Bonus', '3'), ('500+500 Bonus', '4'),
  ('55 Diamonds', '1'), ('86 Diamonds', '5'), ('172 Diamonds', '6'), ('257 Diamonds', '7'),
  ('275 Diamonds', '3'), ('344 Diamonds', '6x2'), ('565 Diamonds', '4'), ('706 Diamonds', '8'),
  ('1412 Diamonds', '8x2'), ('2195 Diamonds', '9'), ('3688 Diamonds', '10'), ('4390 Diamonds', '9x2'),
  ('5532 Diamonds', '11'), ('9288 Diamonds', '12'),
  ('Haftalik Propusk', '13'), ('Haftalik Elitniy', '14'), ('Oylik Epicheskiy', '15')
) as m(name, sku)
where p.name = m.name and coalesce(p.provider_sku, '') = '';
