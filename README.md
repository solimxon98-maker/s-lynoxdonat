# S-LynoxDonat

Mobile Legends: Bang Bang uchun Telegram donat bot + Telegram Web App + Admin panel.
Provider: **FastDonate.su** · Baza va server: **Supabase** (bepul) · Sayt: **GitHub Pages** (bepul) · Til: **o‘zbek**

> Faqat MLBB Diamonds va propusklar. Narxlar kodda emas — bazada (`products` jadvali), admin paneldan boshqariladi.

---

## 1. Arxitektura

```
 Telegram foydalanuvchi
    │
    ├── Bot chat ────────────► Edge Function "telegram-bot"  (Supabase)
    │                           /start, Buyurtmalarim, Profil, Do‘st taklif qilish, Yordam
    │                           /start ref_<id> → do‘st hisoblanadi
    │
    └── Telegram Web App (React, GitHub Pages)
           │ initData ─► POST api/auth/telegram  (server HMAC tekshiradi → imzolangan sessiya)
           │ X-Session bilan: /products, /player/check, /orders, /payments/...
           ▼
        Edge Function "api" ──► SQL funksiyalar (atomik): create_order, apply_payment_event,
           │                     claim_paid_order, complete_order, fail_order, set_user_tier, credit_referral
           ├─► FastDonateService / MockDonateProvider   (donat)
           └─► MockPaymentProvider / Click / Payme / Uzum (to‘lov)
                         │
                   Postgres (Supabase) ◄── pg_cron har daqiqa ─► Edge Function "cron"
                                                              (holat tekshirish, bekor qilish, balans)

 Admin (brauzer) ─► /admin : Supabase Auth (email/parol) + admins jadvali
                    paketlar CRUD, buyurtmalar, foydalanuvchilar (block, tarif), FastDonate sozlamalari
```

Asosiy qoidalar:
- **Narx faqat serverda.** Buyurtma summasi `create_order` SQL funksiyasida mahsulot va foydalanuvchi tarifidan hisoblanadi.
- **To‘lov tasdiqlanmasdan donat ketmaydi.** `claim_paid_order` faqat `PAID` buyurtmani `PROCESSING` ga o‘tkazadi — ikki marta yuborilmaydi.
- **Kalitlar faqat serverda.** Bot token, FastDonate kaliti, service key — Supabase Edge secrets’da. Brauzerda faqat ommaviy `anon` kalit.

## 2. Papkalar

```
s-lynoxdonat/
├── .github/workflows/
│   ├── pages.yml          Web App → GitHub Pages (avtomatik)
│   └── supabase.yml       baza + Edge Functions + secrets + bot webhook (avtomatik)
├── scripts/setup-bot.sh   Telegram webhook, buyruqlar, menyu tugmasi
├── supabase/
│   ├── config.toml
│   ├── migrations/        001 sxema/RLS/SQL funksiyalar · 002 pg_cron · 003 cron manzili
│   ├── seed.sql           21 ta paket: Oddiy / Bronza / VIP narxlar (products.json dan)
│   ├── products.json
│   ├── functions/
│   │   ├── api/           Web App + admin API
│   │   ├── telegram-bot/  bot webhook
│   │   ├── cron/          har daqiqalik ishlar
│   │   └── _shared/       config, db, sessiya, initData, Telegram, providerlar, servislar
│   └── tests/             sql.test.ts · e2e.test.ts (76 tekshiruv)
└── webapp/                React + Vite + TypeScript + Tailwind
    ├── src/pages          Asosiy, Donat, To‘lov, Buyurtmalar, Buyurtma, Profil
    ├── src/admin          Login, Dashboard, Paketlar, Buyurtmalar, Foydalanuvchilar, FastDonate
    ├── src/lib            api, session, supabase, adminData, tier, format, telegram
    └── src/demo           serversiz demo (bot chat simulyatori + test backend)
```

## 3. Baza (Postgres)

| Jadval | Asosiy ustunlar |
|---|---|
| `tg_users` | `id` (Telegram ID), `username`, `first_name`, `blocked`, `orders_count`, `successful_orders`, `total_spent`, `tier` (oddiy/bronza/vip), `tier_until`, `referred_by`, `referrals_total`, `referral_cycle` |
| `products` | `name`, `category` (bonus/diamonds/pass), `once_per_account`, `diamonds`, `bonus`, `price`, `price_bronze`, `price_vip`, `active`, `sort_order`, `provider_sku` |
| `orders` | `order_no` (SLD-000001), `user_id`, `mlbb_id`, `server_id`, `nickname`, `product` (snapshot), `amount`, `price_tier`, `status`, `payment_status`, `payment_id`, `provider_order_id`, `attempts`, `last_error`, `idempotency_key` (unique), vaqtlar |
| `payments` | `order_no`, `provider`, `amount`, `status`, `external_id`, `pay_url`, `mode`, `raw` |
| `admins` | `user_id` (auth.users), `email`, `disabled` |
| `settings` | `fastdonate` (maxfiy), `provider_status`, `cron` (maxfiy) |
| `referrals` | `new_user_id` (PK — bir odam bir marta), `referrer_id` |
| `logs` | `level`, `event`, `order_no`, `data` (kalitlar `***`) |

Statuslar: `AWAITING_PAYMENT` ⏳ → `PAID` 💳 → `PROCESSING` 🔄 → `SUCCESS` ✅ / `FAILED` ❌ · `CANCELLED` 🚫 (24 soatda to‘lanmasa).

## 4. Xavfsizlik (RLS)

- `anon`: faqat **faol** paketlarni o‘qiydi. Buyurtma/to‘lov/foydalanuvchi jadvallariga kira olmaydi, SQL funksiyalarni chaqira olmaydi.
- Admin (login + `admins` yozuvi): paketlar CRUD, buyurtma/foydalanuvchi/loglarni o‘qish, faqat `blocked` ustunini o‘zgartirish. Tarif, qayta yuborish, FastDonate — faqat API orqali.
- FastDonate va cron kalitlari (`settings`) admin uchun ham SQL orqali yopiq; panelda maskalangan ko‘rinadi.
- Telegram `initData` HMAC-SHA256 bilan tekshiriladi; sessiya server imzolagan token (24 soat).
- Bot webhook `X-Telegram-Bot-Api-Secret-Token`, cron `x-cron-secret` bilan himoyalangan.
- Idempotency (qayta bosish), 10 daqiqada 10 buyurtma cheklovi, bonus paket uchun advisory lock.

## 5. Bot va Web App

- **Bot:** /start → «💎 Donat qilish» (Web App), «📦 Buyurtmalarim», «👤 Profil», «👥 Do‘st taklif qilish», «💬 Yordam». Xabarlar: user — ✅/❌ natija, tarif, yangi do‘st; admin — 🛒 YANGI BUYURTMA, ⚠️ xato, 💰 past balans.
- **Web App:** MLBB ID + Server → akkaunt tekshirish → 3 bo‘lim (🎁 Bonus 1 martalik, 💎 Olmos, 🎟 Propusk) → tasdiqlash → to‘lov → holat avtomatik yangilanadi. Tarif narxi va oddiy narx (chizilgan) ko‘rinadi. Profilda taklif havolasi va 0/10 hisob.

## 6. Tariflar va do‘st taklif qilish

- Har paketda 3 narx: Oddiy / 🥉 Bronza / 👑 VIP. VIP bo‘lmasa → Bronza → Oddiy.
- Havola: `https://t.me/<BOT>?start=ref_<telegramId>`. Faqat botga **birinchi marta** kirgan odam hisoblanadi.
- Aylana: **5** → Bronza 7 kun (VIP amal qilmayotgan bo‘lsa), **10** → VIP 7 kun va hisob 0 dan; har keyingi 10 → VIP yana +1 hafta.
- Admin ham qo‘lda beradi: Foydalanuvchilar → «+🥉 7 kun» / «+👑 7 kun» / «Bekor».

## 7. Balans (hamyon) — kartaga o‘tkazma

YaTT/merchant shartnomasiz ishlaydi:

1. Mijoz Web App → **💰 Balans** → summa + karta tanlaydi → karta raqamini nusxalab, **aniq shu summani** o‘tkazadi.
2. Chek rasmini yuklaydi (yoki botga rasm qilib yuboradi). So‘rov `PENDING` bo‘ladi.
3. Adminlarga botda chek rasmi + **✅ Tasdiqlash / ✏️ Boshqa summa / ❌ Rad etish** tugmalari keladi (admin panel → To‘ldirishlar ham).
4. ✅ bosilganda balans to‘ladi (faqat bir marta — `approve_topup`), mijozga xabar boradi.
5. Xarid balansdan (`pay_order_from_balance`): yetmasa buyurtma saqlanadi va "yana X so‘m" deb to‘ldirishga yo‘naltiriladi.

- Kartalar: admin panel → **Kartalar** (Humo, Uzcard, …; yoqish/o‘chirish).
- Xato bo‘lgan buyurtma: admin panel → Buyurtmalar → **↩️ Balansga** (pul qaytadi).
- Balansni qo‘lda o‘zgartirish: Foydalanuvchilar → **± Balans** (izoh majburiy, mijozga xabar boradi).
- Har bir pul harakati `balance_tx` jurnalida. Chek yuborilmagan so‘rov 3 soatda yopiladi.
- ⚠️ ✅ bosishdan oldin **bank ilovasida pul tushganini tekshiring** — soxta chek rasmlari uchraydi.

## 8. FastDonate va to‘lov

- `MOCK_MODE=true` — player tekshirish, to‘lov va donat simulyatsiya. Test ID lar: `…999` → ORDER_FAILED, `…998` → balans yetarli emas, `…997` → timeout, `000000000` → akkaunt topilmadi.
- `supabase/functions/_shared/providers/donate/FastDonateService.ts` — fastdonate.su ning ommaviy API hujjati topilmagani uchun endpointlar **taxmin qilinmagan**. Transport (timeout, xatolar, kalitlar) tayyor; hujjat kelganda faqat shu fayldagi integratsiya nuqtalari to‘ldiriladi.
- To‘lov: `providers/payment/` — standart `BalancePaymentProvider` (balansdan). Click/Payme/Uzum: yangi klass + registry + `PAYMENT_PROVIDER`; webhook: `https://<ref>.supabase.co/functions/v1/api/payments/webhook/<provider>`.

---

## 9. Ishga tushirish (bir marta)

Kerak: GitHub akkaunt (**solimxon98-maker**), Supabase akkaunt (GitHub orqali kirasiz), Telegram bot.

**A. Telegram bot** — @BotFather → `/newbot` → nom `S-LynoxDonat` → username (masalan `SLynoxDonat_bot`). Token keladi. Avatar: `/setuserpic` → `webapp/public/logo.png`. Admin ID: @userinfobot.

**B. Supabase** — supabase.com → New project → nom `s-lynoxdonat`, region **Frankfurt**, kuchli **Database password** (saqlab qo‘ying). Keyin:
- Project Settings → General → **Reference ID** (masalan `abcdefghijklmnopqrst`)
- Project Settings → API → **anon public** key
- Account → Access Tokens → **Generate new token**

**C. GitHub** — yangi repo `s-lynoxdonat` (Public — GitHub Pages bepul ishlashi uchun), kodni yuklash. Keyin repo → Settings:
- **Pages** → Source: **GitHub Actions**
- **Secrets and variables → Actions → Secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `APP_SECRET` (istalgan 40+ belgili tasodifiy satr)
- **Variables**: `SUPABASE_PROJECT_REF`, `SUPABASE_ANON_KEY`, `TELEGRAM_BOT_USERNAME`, `ADMIN_TELEGRAM_IDS`, `SUPPORT_USERNAME`=`Solim_9804`, `MOCK_MODE`=`true`

**D. Deploy** — Actions → «Supabase (baza + server + bot)» → Run workflow; keyin «Web App (GitHub Pages)» → Run workflow. Sayt: `https://solimxon98-maker.github.io/s-lynoxdonat/`, admin: `…/s-lynoxdonat/admin`.

**E. Admin** — Supabase → Authentication → Users → Add user (email + parol, Auto confirm). So‘ng SQL Editor:
```sql
insert into public.admins (user_id, email)
select id, email from auth.users where email = 'SIZNING@EMAIL' on conflict do nothing;
```

Keyingi o‘zgarishlar: `main` ga push qilinsa ikkala workflow avtomatik ishlaydi.

**Real rejim:** FastDonate API ulangach (admin panel → FastDonate yoki `FASTDONATE_*` secrets) va to‘lov provider qo‘shilgach → Variable `MOCK_MODE=false` → «Supabase» workflow’ni qayta ishga tushiring.

## 10. Lokal ishlash va testlar

```bash
cd webapp && npm install
npm run dev:demo        # serversiz demo: bot chat + Web App + admin (brauzerda)
npm run build           # production build (webapp/.env kerak)

# Server testlari (Deno kerak): haqiqiy Postgres (PGlite) ustida
cd supabase/tests
deno run -A sql.test.ts   # sxema, SQL funksiyalar, RLS — 45 tekshiruv
deno run -A e2e.test.ts   # bot + API + admin + cron — 38 tekshiruv
```

## 11. Bepul limitlar (2026-09)

Supabase Free: 500 MB baza, 5 GB trafik, 500 000 Edge Function chaqiruv/oy, 50 000 MAU, 2 ta faol loyiha, 1 hafta faolsiz qolsa pauza (cron har daqiqa ishlagani uchun faol turadi). GitHub Pages: 1 GB sayt, ~100 GB/oy trafik. Karta talab qilinmaydi.
