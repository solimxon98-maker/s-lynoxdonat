import { PGlite } from "npm:@electric-sql/pglite@0.3";
import fs from "node:fs";
import process from "node:process";
const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const db = new PGlite();
const ok = (c, m) => { if (!c) { console.error("✗", m); process.exit(1); } console.log("✓", m); };
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const err = async (sql, p = []) => { try { await db.query(sql, p); return null; } catch (e) { return e.message; } };

// Supabase muhitini taqlid qilish
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
try { await db.exec(fs.readFileSync(`${R}/migrations/20260929000001_init.sql`, "utf8")); } catch (e) { console.error("MIGRATION ERROR:", e.message, "pos", e.position, e.hint ?? ""); const s = fs.readFileSync(`${R}/migrations/20260929000001_init.sql`, "utf8"); if (e.position) console.error(s.slice(Math.max(0, +e.position - 200), +e.position + 100)); process.exit(1); }
try { await db.exec(fs.readFileSync(`${R}/migrations/20260929000004_wallet.sql`, "utf8")); await db.exec(fs.readFileSync(`${R}/migrations/20260929000006_uzum_card.sql`, "utf8")); } catch (e) { console.error("WALLET MIGRATION ERROR:", e.message); process.exit(1); }
await db.exec(`grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; grant execute on all functions in schema public to service_role;`);
await db.exec(fs.readFileSync(`${R}/seed.sql`, "utf8"));
ok((await one("select count(*)::int c from products")).c === 21, "21 ta paket yuklandi");
await db.exec(fs.readFileSync(`${R}/seed.sql`, "utf8"));
ok((await one("select count(*)::int c from products")).c === 21, "seed qayta ishga tushsa ham 21 ta (dublikat yo'q)");

// foydalanuvchi
let u = await one("select * from upsert_tg_user(111, 'ali', 'Ali', null, 'uz', null)");
ok(u.is_new === true, "yangi foydalanuvchi is_new=true");
u = await one("select * from upsert_tg_user(111, 'ali2', 'Ali', null, 'uz', null)");
ok(u.is_new === false && u.user_row.username === "ali2", "qayta kirganda is_new=false, ma'lumot yangilandi");

const p86 = (await one("select id from products where name='86 Diamonds'")).id;
const pBonus = (await one("select id from products where name='50+50 Bonus'")).id;
const order = (pid, mlbb, key) => one("select create_order(111, $1, $2, '1234', 'Nick', $3, 'mock', 'fastdonate-mock', true) r", [pid, mlbb, key]);

let o = (await order(p86, "123456789", "k1")).r;
ok(o.order_no === "SLD-000001" && !o.reused, "buyurtma SLD-000001 yaratildi");
ok((await order(p86, "123456789", "k1")).r.reused === true, "shu idempotency kalit — yangi buyurtma yaratilmadi");
let row = await one("select amount, price_tier, status from orders where order_no='SLD-000001'");
ok(row.amount === 17000 && row.price_tier === "oddiy" && row.status === "AWAITING_PAYMENT", "oddiy narx 17 000, AWAITING_PAYMENT");

ok((await one("select claim_paid_order('SLD-000001') r")).r === null, "to'lanmagan buyurtma providerga yuborilmaydi");
ok((await one("select apply_payment_event($1,'PAID',99999,null,null) r", [o.payment_id])).r === "amount_mismatch", "summa mos kelmasa rad etiladi");
ok((await one("select apply_payment_event($1,'PAID',17000,'x',null) r", [o.payment_id])).r === "applied", "to'lov tasdiqlandi");
ok((await one("select apply_payment_event($1,'PAID',17000,'x',null) r", [o.payment_id])).r === "duplicate", "takroriy webhook — duplicate");
ok((await one("select orders_count from tg_users where id=111")).orders_count === 1, "orders_count=1");
const c1 = (await one("select claim_paid_order('SLD-000001') r")).r;
ok(c1 && c1.status === "PROCESSING" && c1.attempts === 1, "PAID -> PROCESSING");
ok((await one("select claim_paid_order('SLD-000001') r")).r === null, "ikkinchi claim yo'q (ikki marta yuborilmaydi)");
ok((await one("select complete_order('SLD-000001') r")).r.status === "SUCCESS", "SUCCESS");
let usr = await one("select successful_orders, total_spent from tg_users where id=111");
ok(usr.successful_orders === 1 && Number(usr.total_spent) === 17000, "statistika: 1 ta, 17 000");

// xato va qayta yuborish
o = (await order(p86, "123450999", "k2")).r;
await db.query("select apply_payment_event($1,'PAID',17000,null,null)", [o.payment_id]);
await db.query("select claim_paid_order($1)", [o.order_no]);
ok((await one("select fail_order($1,'ORDER_FAILED','rad etildi') r", [o.order_no])).r.status === "FAILED", "FAILED, xato saqlandi");
ok((await one("select retry_order($1) r", [o.order_no])).r === true, "admin qayta yubordi -> PAID");
ok((await one("select claim_paid_order($1) r", [o.order_no])).r.attempts === 2, "urinish 2");

// bonus 1 martalik
const b1 = (await order(pBonus, "555555555", "k3")).r;
await db.query("select apply_payment_event($1,'PAID',11000,null,null)", [b1.payment_id]);
ok(/ONCE_PER_ACCOUNT/.test(await err("select create_order(111,$1,'555555555','1','n','k4','mock','m',true)", [pBonus])), "bonus paket shu akkauntga ikkinchi marta berilmaydi");
ok(!(await err("select create_order(111,$1,'666666666','1','n','k5','mock','m',true)", [pBonus])), "boshqa akkauntga bonus mumkin");

// tarif narxlari
const until = (await one("select set_user_tier(111,'vip',7) r")).r;
o = (await order(p86, "123456789", "k6")).r;
row = await one("select amount, price_tier from orders where order_no=$1", [o.order_no]);
ok(row.amount === 16000 && row.price_tier === "vip", "VIP narx 16 000");
const until2 = (await one("select set_user_tier(111,'vip',7) r")).r;
ok(Math.round((new Date(until2) - new Date(until)) / 86400000) === 7, "VIP qayta berilsa +7 kun ustiga");
await db.query("update tg_users set tier_until = now() - interval '1 minute' where id=111");
o = (await order(p86, "123456789", "k7")).r;
ok((await one("select amount from orders where order_no=$1", [o.order_no])).amount === 17000, "muddat tugasa yana oddiy narx");

// spam cheklovi
for (let i = 0; i < 4; i++) await db.query("select create_order(111,$1,'123456789','1','n',$2,'mock','m',true)", [p86, "s" + i]);
ok(/TOO_MANY_ORDERS/.test(await err("select create_order(111,$1,'123456789','1','n','s9','mock','m',true)", [p86])), "10 daqiqada 10 tadan ortiq buyurtma yo'q");

// referal: 1 + 1 + 8 = VIP
await db.query("select * from upsert_tg_user(200,'boss','Boss',null,null,null)");
let res;
for (let i = 1; i <= 10; i++) {
  await db.query("select * from upsert_tg_user($1,null,'F',null,null,null)", [1000 + i]);
  res = (await one("select credit_referral($1, 200) r", [1000 + i])).r;
  if (i === 5) ok(res.reward === "bronza", "5-do'st: Bronza");
}
ok(res.reward === "vip" && res.cycle === 0 && res.total === 10, "10-do'st: VIP, hisob 0");
ok((await one("select credit_referral(1001, 200) r")).r.reason === "already_referred", "bir odam ikki marta hisoblanmaydi");
ok((await one("select credit_referral(200, 200) r")).r.reason === "self", "o'zini taklif qilish hisoblanmaydi");
ok((await one("select referred_by from tg_users where id=1003")).referred_by == 200, "referred_by yozildi");

// muddati o'tgan to'lanmaganlar
await db.query("update orders set created_at = now() - interval '25 hours' where status='AWAITING_PAYMENT'");
ok((await one("select expire_unpaid_orders() r")).r > 0, "24 soatlik to'lanmaganlar bekor qilindi");


// ---- BALANS ----
await db.query("insert into payment_cards(bank, number, holder) values ('humo','9860123412341234','SOLIM X'),('uzcard','8600123412341234','SOLIM X'),('uzum','4916123412341234','SOLIM X')");
const card = (await one("select id from payment_cards where bank='humo'")).id;
await db.query("select * from upsert_tg_user(700,'w','Wallet',null,null,null)");
ok(/INVALID_AMOUNT/.test(await err("select create_topup(700, 500, $1, 'tk0')", [card])), "to'ldirish: 1000 dan kam summa rad");
let tp = (await one("select create_topup(700, 50000, $1, 'tk1') r", [card])).r;
ok(tp.topup_no === "TP-000001" && tp.status === "AWAITING_RECEIPT" && tp.card.number === "9860123412341234", "to'ldirish so'rovi TP-000001, karta snapshot");
ok((await one("select create_topup(700, 50000, $1, 'tk1') r", [card])).r.reused === true, "to'ldirish: qayta bosish — yangi so'rov yo'q");
ok(/TOPUP_CLOSED/.test(await err("select attach_topup_receipt('TP-000001', 111, 'F')")), "boshqa odam chek biriktira olmaydi");
ok((await one("select attach_topup_receipt('TP-000001', 700, 'FILE1') r")).r.status === "PENDING", "chek biriktirildi -> PENDING");
let ap = (await one("select approve_topup('TP-000001', 48000, 'admin:tg:999') r")).r;
ok(ap.result === "approved" && Number(ap.balance) === 48000 && ap.topup.credited === 48000, "admin tasdiqladi (haqiqiy summa 48 000) -> balans 48 000");
ok((await one("select approve_topup('TP-000001', null, 'x') r")).r.result === "already_decided", "ikkinchi marta tasdiqlash balansni oshirmaydi");
ok(Number((await one("select balance from tg_users where id=700")).balance) === 48000, "balans 48 000 (ikki marta qo'shilmadi)");
tp = (await one("select create_topup(700, 20000, $1, 'tk2') r", [card])).r;
ok((await one("select reject_topup($1, 'Pul tushmadi', 'a') r", [tp.topup_no])).r.topup.status === "REJECTED", "rad etildi");
ok(Number((await one("select balance from tg_users where id=700")).balance) === 48000, "rad etilganda balans o'zgarmaydi");
for (const k of ["a1", "a2", "a3"]) await db.query("select create_topup(700, 10000, $1, $2)", [card, k]);
ok(/TOO_MANY_TOPUPS/.test(await err("select create_topup(700, 10000, $1, 'a4')", [card])), "3 tadan ortiq ochiq so'rov yo'q");
await db.query("update topups set created_at = now() - interval '4 hours' where status='AWAITING_RECEIPT'");
ok((await one("select expire_topups() r")).r === 3, "chek yuborilmagan so'rovlar 3 soatda yopildi");

const buy = (key) => one("select create_order(700, $1, '777777777', '1', 'N', $2, 'balance', 'fastdonate-mock', true) r", [p86, key]);
let ob = (await buy("b1")).r;
let pr = (await one("select pay_order_from_balance($1, 700) r", [ob.order_no])).r;
ok(pr.result === "paid" && Number(pr.balance) === 31000, "balansdan to'landi: 48 000 - 17 000 = 31 000");
ok((await one("select status, payment_status from orders where order_no=$1", [ob.order_no])).status === "PAID", "buyurtma PAID");
ok((await one("select pay_order_from_balance($1, 700) r", [ob.order_no])).r.result === "already_paid", "ikki marta yechilmaydi");
ok(Number((await one("select balance from tg_users where id=700")).balance) === 31000, "balans 31 000 (ikki marta yechilmadi)");
ok(/NOT_FOUND/.test(await err("select pay_order_from_balance($1, 111)", [ob.order_no])), "boshqa odamning buyurtmasini to'lay olmaydi");
await db.query("select claim_paid_order($1)", [ob.order_no]);
ok(/REFUND_NOT_ALLOWED/.test(await err("select refund_order_to_balance($1,'a')", [ob.order_no])), "PROCESSING buyurtmani qaytarib bo'lmaydi");
await db.query("select fail_order($1,'ORDER_FAILED','x')", [ob.order_no]);
let rf = (await one("select refund_order_to_balance($1,'a') r", [ob.order_no])).r;
ok(rf.result === "refunded" && Number(rf.balance) === 48000, "FAILED -> balansga qaytarildi (48 000)");
ok(/REFUND_NOT_ALLOWED/.test(await err("select refund_order_to_balance($1,'a')", [ob.order_no])), "ikkinchi marta qaytarilmaydi");
ok((await one("select retry_order($1) r", [ob.order_no])).r === false, "qaytarilgan buyurtmani qayta yuborib bo'lmaydi");
for (let i = 2; i <= 3; i++) await one("select pay_order_from_balance($1, 700) r", [(await buy("b" + i)).r.order_no]);
ob = (await buy("b4")).r;
pr = (await one("select pay_order_from_balance($1, 700) r", [ob.order_no])).r;
ok(pr.result === "insufficient" && Number(pr.need) === 3000 && Number(pr.balance) === 14000, "balans yetmasa: yana 3 000 kerak, pul yechilmaydi");
ok(/INSUFFICIENT_FUNDS/.test(await err("select admin_adjust_balance(700, -20000, 'xato', 'a')")), "balans manfiy bo'lmaydi");
ok(Number((await one("select admin_adjust_balance(700, 3000, 'bonus', 'a') r")).r) === 17000, "admin +3 000 qo'shdi");
ok((await one("select pay_order_from_balance($1, 700) r", [ob.order_no])).r.result === "paid", "endi to'landi");
const txs = (await db.query("select kind, delta from balance_tx where user_id=700 order by id")).rows;
ok(txs.length === 7 && txs.reduce((a, t) => a + Number(t.delta), 0) === 0, "jurnal: 7 ta yozuv, yig'indisi = joriy balans (0)");

// ---- RLS ----
await db.exec("set role anon");
ok((await one("select count(*)::int c from products")).c === 21, "anon faol paketlarni ko'radi");
ok(/permission denied/.test(await err("select * from orders")), "anon buyurtmalarni ko'ra olmaydi");
ok(/permission denied/.test(await err("select create_order(111,null,'1','1','n','z','m','m',true)")), "anon create_order chaqira olmaydi");
ok(/permission denied|row-level/.test(await err("update products set price=1")) || (await db.query("update products set price=1")).affectedRows === 0, "anon narx o'zgartira olmaydi");
await db.exec("reset role");
await db.exec("update products set active=false where name='55 Diamonds'");
await db.exec("set role anon");
ok((await one("select count(*)::int c from products")).c === 20, "nofaol paket anon'ga ko'rinmaydi");
await db.exec("reset role");

const ADMIN = "00000000-0000-0000-0000-000000000001", USER = "00000000-0000-0000-0000-000000000002";
await db.query("insert into admins(user_id,email) values ($1,'a@a')", [ADMIN]);
await db.query("insert into settings(key,value) values ('fastdonate','{\"apiKey\":\"SECRET\"}'),('provider_status','{}')");
await db.exec(`set test.uid = '${USER}'; set role authenticated`);
ok((await db.query("select * from orders")).rows.length === 0, "admin bo'lmagan login buyurtmalarni ko'rmaydi");
const upd = await db.query("update products set price=1 where name='86 Diamonds'");
ok(upd.affectedRows === 0, "admin bo'lmagan narx o'zgartira olmaydi");
await db.exec(`reset role; set test.uid = '${ADMIN}'; set role authenticated`);
ok((await db.query("select * from orders")).rows.length > 0, "admin buyurtmalarni ko'radi");
ok((await db.query("update products set price=17500 where name='86 Diamonds'")).affectedRows === 1, "admin narxni o'zgartiradi");
ok((await db.query("select key from settings")).rows.every((r) => r.key !== "fastdonate"), "admin ham FastDonate kalitini SQL orqali ko'rmaydi");
ok(/permission denied/.test(await err("update tg_users set tier='vip' where id=111")), "admin tarifni to'g'ridan-to'g'ri o'zgartira olmaydi (faqat API orqali)");
ok((await db.query("update tg_users set blocked=true where id=111")).affectedRows === 1, "admin block qila oladi");
const st = (await one("select admin_stats(now() - interval '1 day') s")).s;
ok(st.total > 0, `admin_stats: ${JSON.stringify(st)}`);
ok(/permission denied/.test(await err("select set_user_tier(111,'vip',7)")), "admin set_user_tier ni to'g'ridan-to'g'ri chaqira olmaydi");
ok(/permission denied/.test(await err("select approve_topup('TP-000001', 1, 'x')")), "admin approve_topup ni to'g'ridan-to'g'ri chaqira olmaydi");
ok(/permission denied/.test(await err("update tg_users set balance=999999 where id=700")), "admin balansni SQL orqali o'zgartira olmaydi");
ok((await db.query("select * from topups")).rows.length > 0, "admin to'ldirishlarni ko'radi");
ok((await db.query("update payment_cards set active=false where bank='uzcard'")).affectedRows === 1, "admin kartani o'chira oladi");
await db.exec("reset role");
await db.exec("set role anon");
ok(/permission denied/.test(await err("select * from payment_cards")), "anon kartalar jadvalini o'qiy olmaydi");
ok(/permission denied/.test(await err("select pay_order_from_balance('SLD-000001', 700)")), "anon pay_order_from_balance chaqira olmaydi");
await db.exec("reset role");
await db.exec(`set test.uid = '${USER}'; set role authenticated`);
ok((await db.query("select * from topups")).rows.length === 0, "admin bo'lmagan to'ldirishlarni ko'rmaydi");
await db.exec("reset role");
console.log("\nHAMMASI O'TDI");
