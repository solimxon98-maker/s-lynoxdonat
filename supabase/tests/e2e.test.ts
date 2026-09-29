import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { createHmac } from "node:crypto";
import { fakeClient } from "./fakeSupabase.ts";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const TOKEN = "123456:TEST_TOKEN";
const env: Record<string, string> = {
  SLD_TEST: "1", MOCK_MODE: "true", SESSION_SECRET: "x".repeat(40), TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: "whsecret_1234567890", CRON_SECRET: "cronsecret_123", ADMIN_TELEGRAM_IDS: "999",
  TELEGRAM_BOT_USERNAME: "SLynoxTestBot", WEBAPP_URL: "https://example.github.io/s-lynoxdonat", SUPPORT_USERNAME: "Solim_9804",
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

// Telegram API ni ushlab qolish
const sent: { chat: string; text: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.telegram.org/")) {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith("/sendMessage")) sent.push({ chat: String(body.chat_id), text: body.text });
    return new Response(JSON.stringify({ ok: true, result: url.endsWith("/getMe") ? { username: "SLynoxTestBot" } : true }));
  }
  return realFetch(input, init);
};

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
await db.exec(await Deno.readTextFile(`${R}/migrations/20260929000001_init.sql`));
await db.exec(await Deno.readTextFile(`${R}/seed.sql`));
const ADMIN_UUID = "00000000-0000-0000-0000-0000000000aa";
await db.query("insert into admins(user_id,email) values ($1,'a@a')", [ADMIN_UUID]);

const { setDbClientForTests } = await import(`${R}/functions/_shared/db.ts`);
setDbClientForTests(fakeClient(db, { "admin-token": ADMIN_UUID }));
const api = (await import(`${R}/functions/api/index.ts`)).handler;
const bot = (await import(`${R}/functions/telegram-bot/index.ts`)).handler;
const cron = (await import(`${R}/functions/cron/index.ts`)).handler;

let passed = 0;
const ok = (c: unknown, m: string) => { if (!c) { console.error("✗", m); Deno.exit(1); } passed++; console.log("✓", m); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = "https://x.supabase.co/functions/v1/api";
async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await api(new Request(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: await res.json() };
}
async function botSend(from: number, text: string, secret = env.TELEGRAM_WEBHOOK_SECRET) {
  return await bot(new Request("https://x/functions/v1/telegram-bot", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": secret, "content-type": "application/json" },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: { message_id: 1, from: { id: from, first_name: "U" + from, username: "u" + from }, chat: { id: from, type: "private" }, text } }),
  }));
}
function initData(id: number) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "Q", user: JSON.stringify({ id, first_name: "Ali", username: "ali" }) });
  const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const sk = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  p.set("hash", createHmac("sha256", sk).update(dcs).digest("hex"));
  return p.toString();
}
const lastTo = (chat: number) => [...sent].reverse().find((s) => s.chat === String(chat))?.text ?? "";

// ---- BOT ----
ok((await botSend(111, "/start", "wrong")).status === 401, "bot: noto'g'ri secret — 401");
await botSend(111, "/start");
ok(lastTo(111).includes("xush kelibsiz"), "bot: /start — salom xabari");
await botSend(222, "/start ref_111");
ok(lastTo(111).includes("yangi do‘st qo‘shildi") && lastTo(111).includes("1/10"), "bot: taklif havolasi — 111 ga '1/10' xabari");
await botSend(222, "/start ref_111");
ok(sent.filter((s) => s.chat === "111" && s.text.includes("yangi do‘st")).length === 1, "bot: qayta kirgan odam ikkinchi marta hisoblanmaydi");
await botSend(111, "/invite");
ok(lastTo(111).includes("https://t.me/SLynoxTestBot?start=ref_111"), "bot: /invite — shaxsiy havola");
await botSend(111, "/profile");
ok(lastTo(111).includes("Taklif qilgan do‘stlar: 1"), "bot: profil — 1 do'st");

// ---- WEB APP ----
ok((await call("POST", "/auth/telegram", { initData: initData(111).replace(/hash=[a-f0-9]+/, "hash=" + "0".repeat(64)) })).status === 401, "api: soxta initData rad etildi");
const auth = await call("POST", "/auth/telegram", { initData: initData(111) });
ok(auth.status === 200 && auth.data.session && auth.data.user.referral.total === 1, "api: initData tekshirildi, sessiya berildi");
const S = { "x-session": auth.data.session };
ok((await call("GET", "/me", undefined, { "x-session": auth.data.session + "x" })).status === 401, "api: buzilgan sessiya — 401");
const products = (await call("GET", "/products")).data.products;
ok(products.length === 21, "api: 21 ta paket");
const p86 = products.find((p: { name: string }) => p.name === "86 Diamonds");
const pBonus = products.find((p: { name: string }) => p.name === "50+50 Bonus");
const chk = await call("POST", "/player/check", { mlbbId: "123456789", serverId: "1234" }, S);
ok(chk.data.found && chk.data.nickname === "MLBB_Player_6789", "api: akkaunt tekshirildi");

const key = crypto.randomUUID();
const o1 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: key }, S);
ok(o1.status === 200 && o1.data.order.orderNo === "SLD-000001" && o1.data.order.amount === 17000, "api: buyurtma yaratildi, 17 000");
ok((await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: key }, S)).data.reused === true, "api: qayta bosish — yangi buyurtma yo'q");
const pay = await call("GET", `/payments/${o1.data.payment.id}`, undefined, S);
ok(pay.data.payment.status === "PENDING" && pay.data.payment.mode === "in_app_mock", "api: to'lov oynasi");

const auth2 = await call("POST", "/auth/telegram", { initData: initData(333) });
ok((await call("GET", `/payments/${o1.data.payment.id}`, undefined, { "x-session": auth2.data.session })).status === 404, "api: boshqa odamning to'lovini ko'ra olmaydi");
ok((await call("GET", `/orders/SLD-000001`, undefined, { "x-session": auth2.data.session })).status === 404, "api: boshqa odamning buyurtmasini ko'ra olmaydi");

await call("POST", `/payments/${o1.data.payment.id}/mock`, { action: "pay" }, S);
await sleep(300);
ok((await call("GET", "/orders/SLD-000001", undefined, S)).data.order.status === "PROCESSING", "to'lovdan keyin PROCESSING");
ok(lastTo(999).includes("YANGI BUYURTMA") && lastTo(999).includes("SLD-000001"), "admin: 🛒 YANGI BUYURTMA xabari");
await sleep(6800);
ok((await call("GET", "/orders/SLD-000001", undefined, S)).data.order.status === "SUCCESS", "~7 soniyada SUCCESS");
ok(lastTo(111).includes("Donat muvaffaqiyatli"), "user: ✅ muvaffaqiyat xabari");
const list = await call("GET", "/orders", undefined, S);
ok(list.data.orders.length === 1 && list.data.orders[0].status === "SUCCESS", "api: buyurtmalar tarixi");

// xato
const o2 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123450999", serverId: "1", idempotencyKey: crypto.randomUUID() }, S);
await call("POST", `/payments/${o2.data.payment.id}/mock`, { action: "pay" }, S);
await sleep(1200);
ok((await call("GET", `/orders/${o2.data.order.orderNo}`, undefined, S)).data.order.status === "FAILED", "provider xatosi — FAILED (buyurtma yo'qolmadi)");
ok(lastTo(111).includes("vaqtinchalik xatolik") && lastTo(111).includes(o2.data.order.orderNo), "user: ❌ xato xabari buyurtma ID bilan");
ok(lastTo(999).includes("DONAT XATOSI"), "admin: ⚠️ xato xabari");

// bonus 1 martalik
const b1 = await call("POST", "/orders", { productId: pBonus.id, mlbbId: "555555555", serverId: "1", idempotencyKey: crypto.randomUUID() }, S);
await call("POST", `/payments/${b1.data.payment.id}/mock`, { action: "pay" }, S);
const b2 = await call("POST", "/orders", { productId: pBonus.id, mlbbId: "555555555", serverId: "1", idempotencyKey: crypto.randomUUID() }, S);
ok(b2.status === 409 && b2.data.code === "ONCE_PER_ACCOUNT", "bonus paket 2-marta: 409 ONCE_PER_ACCOUNT");

// ---- ADMIN ----
ok((await call("POST", "/admin/users/111/tier", { tier: "vip", days: 7 })).status === 401, "admin: tokensiz — 401");
ok((await call("POST", "/admin/users/111/tier", { tier: "vip", days: 7 }, { authorization: "Bearer wrong" })).status === 401, "admin: noto'g'ri token — 401");
const t = await call("POST", "/admin/users/111/tier", { tier: "vip", days: 7 }, { authorization: "Bearer admin-token" });
ok(t.status === 200 && t.data.tierUntil > Date.now(), "admin: VIP berildi");
ok(lastTo(111).includes("VIP narxlar berildi"), "user: 👑 VIP xabari");
const o3 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: crypto.randomUUID() }, S);
ok(o3.data.order.amount === 16000, "VIP narx 16 000 (server hisobladi)");
const retry = await call("POST", `/admin/orders/${o2.data.order.orderNo}/retry`, {}, { authorization: "Bearer admin-token" });
ok(retry.status === 200, "admin: qayta yuborish");
const fd = await call("GET", "/admin/fastdonate", undefined, { authorization: "Bearer admin-token" });
ok(fd.status === 200 && fd.data.mockMode === true, "admin: FastDonate sozlamalari");
await call("PUT", "/admin/fastdonate", { apiUrl: "https://api.example.com", apiKey: "SUPERSECRETKEY123" }, { authorization: "Bearer admin-token" });
const fd2 = await call("GET", "/admin/fastdonate", undefined, { authorization: "Bearer admin-token" });
ok(fd2.data.apiKeyMasked.startsWith("SUPE") && !JSON.stringify(fd2.data).includes("SUPERSECRETKEY123"), "admin: API key faqat maskalangan holda qaytadi");
ok((await call("POST", "/admin/fastdonate/test", {}, { authorization: "Bearer admin-token" })).data.connected === true, "admin: ulanish testi");

// ---- CRON ----
const cronBad = await cron(new Request("https://x/functions/v1/cron", { method: "POST", headers: { "x-cron-secret": "no" } }));
ok(cronBad.status === 401, "cron: secret'siz — 401");
const cronOk = await cron(new Request("https://x/functions/v1/cron", { method: "POST", headers: { "x-cron-secret": env.CRON_SECRET } }));
ok(cronOk.status === 200, "cron: ishladi " + JSON.stringify(await cronOk.json()));

const logs = (await db.query("select count(*)::int c from logs")).rows[0] as { c: number };
ok(logs.c > 5, `loglar yozildi (${logs.c})`);
const leaked = (await db.query("select count(*)::int c from logs where data::text like '%SUPERSECRETKEY123%'")).rows[0] as { c: number };
ok(leaked.c === 0, "loglarda maxfiy kalit yo'q");
await sleep(7000); // fon ishlari tugashini kutish
console.log(`\n${passed} ta tekshiruv — HAMMASI O'TDI`);
Deno.exit(0);
