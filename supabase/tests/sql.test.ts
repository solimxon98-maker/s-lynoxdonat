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
await db.exec("reset role");
console.log("\nHAMMASI O'TDI");
