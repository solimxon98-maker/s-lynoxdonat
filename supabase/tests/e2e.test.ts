import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { createHmac } from "node:crypto";
import { fakeClient } from "./fakeSupabase.ts";

const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const TOKEN = "123456:TEST_TOKEN";
const env: Record<string, string> = {
  SLD_TEST: "1", MOCK_MODE: "true", SESSION_SECRET: "x".repeat(40), TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: "whsecret_1234567890", CRON_SECRET: "cronsecret_123", ADMIN_TELEGRAM_IDS: "999",
  TELEGRAM_BOT_USERNAME: "SLynoxTestBot", WEBAPP_URL: "https://example.github.io/s-lynoxdonat", SUPPORT_USERNAME: "Solim_9804", PLAYER_CHECK: "mock",
};
for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);

// Telegram API ni ushlab qolish
const sent: { chat: string; text: string; method: string; body: Record<string, unknown> }[] = [];
let msgId = 100;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://api.telegram.org/file/")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]));
  if (url.startsWith("https://api.telegram.org/")) {
    const method = url.split("/").pop()!;
    let body: Record<string, unknown> = {};
    if (init?.body instanceof FormData) body = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "<file>"]));
    else if (init?.body) body = JSON.parse(String(init.body));
    sent.push({ chat: String(body.chat_id), text: String(body.text ?? body.caption ?? ""), method, body });
    let result: unknown = true;
    if (method === "getMe") result = { username: "SLynoxTestBot" };
    if (method === "getFile") result = { file_path: "photos/file_1.jpg" };
    if (method === "sendPhoto" || method === "sendDocument" || method === "sendMessage") {
      result = { message_id: ++msgId, chat: { id: Number(body.chat_id) }, photo: [{ file_id: "SMALL", width: 90, height: 90 }, { file_id: "PHOTO_FILE_ID_" + msgId, width: 800, height: 800 }] };
    }
    return new Response(JSON.stringify({ ok: true, result }));
  }
  return realFetch(input, init);
};

const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
await db.exec(await Deno.readTextFile(`${R}/migrations/20260929000001_init.sql`));
await db.exec(await Deno.readTextFile(`${R}/migrations/20260929000004_wallet.sql`));
await db.exec(await Deno.readTextFile(`${R}/migrations/20261001000008_permanent_tier.sql`));
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
const lastTo = (chat: number) => [...sent].reverse().find((s) => s.chat === String(chat) && s.method !== "editMessageCaption")?.text ?? "";
async function botRaw(update: Record<string, unknown>) {
  return await bot(new Request("https://x/functions/v1/telegram-bot", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": env.TELEGRAM_WEBHOOK_SECRET, "content-type": "application/json" },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update }),
  }));
}
const tapButton = (from: number, data: string) => botRaw({ callback_query: { id: "cq" + Math.random(), from: { id: from, first_name: "A" }, data, message: { message_id: 1, chat: { id: from, type: "private" } } } });
// Haqiqiy JPEG boshlanishi + to'ldiruvchi (1 KB dan katta)
const JPEG = "data:image/jpeg;base64," + btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, ...new Array(3000).fill(65)));
const ADMIN_H = { authorization: "Bearer admin-token" };

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

// ---- BALANS: to'ldirish ----
await db.query("insert into payment_cards(bank, number, holder, sort_order) values ('humo','9860123412341234','SOLIM X',1),('uzcard','8600123412341234','SOLIM X',2)");
let w = await call("GET", "/wallet", undefined, S);
ok(w.status === 200 && w.data.balance === 0 && w.data.cards.length === 2 && w.data.cards[0].number === "9860123412341234", "api: hamyon — balans 0, 2 ta karta");
const noMoney = await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: crypto.randomUUID(), payWithBalance: true }, S);
ok(noMoney.status === 200 && noMoney.data.balancePay.result === "insufficient" && noMoney.data.balancePay.need === 17000, "balans 0 — pul yechilmadi, yana 17 000 kerak");

const tk = crypto.randomUUID();
const tp1 = await call("POST", "/topups", { amount: 50000, cardId: w.data.cards[0].id, idempotencyKey: tk }, S);
ok(tp1.status === 200 && tp1.data.topup.topupNo === "TP-000001" && tp1.data.topup.status === "AWAITING_RECEIPT", "to'ldirish so'rovi TP-000001");
ok((await call("POST", "/topups", { amount: 50000, cardId: w.data.cards[0].id, idempotencyKey: tk }, S)).data.reused === true, "to'ldirish: qayta bosish — yangi so'rov yo'q");
ok((await call("POST", "/topups/TP-000001/receipt", { image: "data:text/plain;base64,QUJD" }, S)).status === 400, "chek: rasm bo'lmasa — 400");
const authOther = await call("POST", "/auth/telegram", { initData: initData(444) });
ok((await call("POST", "/topups/TP-000001/receipt", { image: JPEG }, { "x-session": authOther.data.session })).status === 404, "boshqa odam chek yuklay olmaydi");
const rc = await call("POST", "/topups/TP-000001/receipt", { image: JPEG }, S);
ok(rc.status === 200 && rc.data.topup.status === "PENDING", "chek yuklandi -> PENDING");
const adminPhoto = [...sent].reverse().find((m) => m.chat === "999" && m.method === "sendPhoto");
ok(adminPhoto && adminPhoto.text.includes("TP-000001") && adminPhoto.text.includes("50 000") && String(adminPhoto.body.reply_markup).includes("tp:a:TP-000001"), "admin: botda chek rasmi + ✅/❌ tugmalari");
ok((await call("GET", "/me", undefined, S)).data.user.balance === 0, "tasdiqlanmaguncha balans 0");
await tapButton(111, "tp:a:TP-000001");
ok((await call("GET", "/me", undefined, S)).data.user.balance === 0, "admin bo'lmagan odam tasdiqlay olmaydi");
await tapButton(999, "tp:a:TP-000001");
ok((await call("GET", "/me", undefined, S)).data.user.balance === 50000, "admin ✅ bosdi — balans 50 000");
ok(lastTo(111).includes("Hisobingiz to‘ldirildi") && lastTo(111).includes("50 000"), "user: ✅ balans to'ldirildi xabari");
ok(sent.some((m) => m.method === "editMessageCaption" && m.text.includes("Tasdiqlandi")), "admin xabari yangilandi (tugmalar olindi)");
await tapButton(999, "tp:a:TP-000001");
ok((await call("GET", "/me", undefined, S)).data.user.balance === 50000, "ikkinchi marta ✅ — balans ikki marta qo'shilmaydi");

// bot orqali chek + boshqa summa
const tp2 = await call("POST", "/topups", { amount: 30000, cardId: w.data.cards[1].id, idempotencyKey: crypto.randomUUID() }, S);
await botRaw({ message: { message_id: 5, from: { id: 111, first_name: "Ali" }, chat: { id: 111, type: "private" }, photo: [{ file_id: "P_small", width: 90, height: 90 }, { file_id: "P_big", width: 900, height: 900 }] } });
ok(lastTo(111).includes("Chek qabul qilindi") && lastTo(111).includes(tp2.data.topup.topupNo), "bot: chek rasmi chatga yuborildi — qabul qilindi");
ok((await db.query("select receipt_file_id from topups where topup_no=$1", [tp2.data.topup.topupNo])).rows[0].receipt_file_id === "photo:P_big", "bot: eng katta rasm saqlandi");
await tapButton(999, `tp:e:${tp2.data.topup.topupNo}`);
ok(lastTo(999).includes("haqiqatda tushgan"), "admin: ✏️ Boshqa summa — summa so'raldi");
await botRaw({ message: { message_id: 6, from: { id: 999, first_name: "Admin" }, chat: { id: 999, type: "private" }, text: "25 000", reply_to_message: { message_id: 7, chat: { id: 999, type: "private" }, text: lastTo(999) } } });
ok((await call("GET", "/me", undefined, S)).data.user.balance === 75000, "admin 25 000 yozdi — balans 75 000");
await botRaw({ message: { message_id: 8, from: { id: 111, first_name: "Ali" }, chat: { id: 111, type: "private" }, photo: [{ file_id: "P2", width: 9, height: 9 }] } });
ok(lastTo(111).includes("Hisobni to‘ldirish"), "bot: ochiq so'rov yo'q bo'lsa — yo'l-yo'riq");
const tp3 = await call("POST", "/topups", { amount: 10000, cardId: w.data.cards[0].id, idempotencyKey: crypto.randomUUID() }, S);
await call("POST", `/topups/${tp3.data.topup.topupNo}/receipt`, { image: JPEG }, S);
await tapButton(999, `tp:r:${tp3.data.topup.topupNo}`);
ok(lastTo(111).includes("rad etildi") && (await call("GET", "/me", undefined, S)).data.user.balance === 75000, "admin ❌ — rad etildi, balans o'zgarmadi");

// ---- XARID balansdan ----
const key = crypto.randomUUID();
const o1 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: key, payWithBalance: true }, S);
ok(o1.status === 200 && o1.data.balancePay.result === "paid" && o1.data.balancePay.balance === 58000, "balansdan to'landi: 75 000 - 17 000 = 58 000");
ok((await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: key, payWithBalance: true }, S)).data.balancePay.result === "already_paid", "api: qayta bosish — ikki marta yechilmaydi");
ok((await call("GET", "/me", undefined, S)).data.user.balance === 58000, "balans 58 000 (bir marta yechildi)");
const pay = await call("GET", `/payments/${o1.data.payment.id}`, undefined, S);
ok(pay.data.payment.status === "PAID" && pay.data.payment.mode === "balance", "to'lov: balance, PAID");

const auth2 = await call("POST", "/auth/telegram", { initData: initData(333) });
ok((await call("GET", `/payments/${o1.data.payment.id}`, undefined, { "x-session": auth2.data.session })).status === 404, "api: boshqa odamning to'lovini ko'ra olmaydi");
ok((await call("GET", `/orders/${o1.data.order.orderNo}`, undefined, { "x-session": auth2.data.session })).status === 404, "api: boshqa odamning buyurtmasini ko'ra olmaydi");
ok((await call("POST", `/orders/${noMoney.data.order.orderNo}/pay`, {}, { "x-session": auth2.data.session })).status === 404, "boshqa odamning buyurtmasini to'lay olmaydi");
const payOld = await call("POST", `/orders/${noMoney.data.order.orderNo}/pay`, {}, S);
ok(payOld.data.result === "paid" && payOld.data.balance === 41000, "avval to'lanmagan buyurtma endi balansdan to'landi (41 000)");

await sleep(300);
ok((await call("GET", `/orders/${o1.data.order.orderNo}`, undefined, S)).data.order.status === "PROCESSING", "to'lovdan keyin PROCESSING");
ok(sent.some((m) => m.chat === "999" && m.text.includes("YANGI BUYURTMA") && m.text.includes(o1.data.order.orderNo)), "admin: 🛒 YANGI BUYURTMA xabari");
await sleep(6800);
ok((await call("GET", `/orders/${o1.data.order.orderNo}`, undefined, S)).data.order.status === "SUCCESS", "~7 soniyada SUCCESS");
ok(sent.some((m) => m.chat === "111" && m.text.includes("Donat muvaffaqiyatli")), "user: ✅ muvaffaqiyat xabari");
const list = await call("GET", "/orders", undefined, S);
ok(list.data.orders.length === 2 && list.data.orders.every((o: { status: string }) => o.status === "SUCCESS"), "api: buyurtmalar tarixi");

// xato -> balansga qaytarish
const o2 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123450999", serverId: "1", idempotencyKey: crypto.randomUUID(), payWithBalance: true }, S);
await sleep(1200);
ok((await call("GET", `/orders/${o2.data.order.orderNo}`, undefined, S)).data.order.status === "FAILED", "provider xatosi — FAILED (buyurtma yo'qolmadi)");
ok(lastTo(111).includes("vaqtinchalik xatolik") && lastTo(111).includes(o2.data.order.orderNo), "user: ❌ xato xabari buyurtma ID bilan");
ok(sent.some((m) => m.chat === "999" && m.text.includes("DONAT XATOSI")), "admin: ⚠️ xato xabari");
ok((await call("GET", "/me", undefined, S)).data.user.balance === 24000, "xato buyurtma: balans hali 24 000");
ok((await call("POST", `/admin/orders/${o2.data.order.orderNo}/refund`, {})).status === 401, "admin: tokensiz qaytarish — 401");
const rf = await call("POST", `/admin/orders/${o2.data.order.orderNo}/refund`, {}, ADMIN_H);
ok(rf.status === 200 && rf.data.balance === 41000, "admin: pul balansga qaytarildi (41 000)");
ok(lastTo(111).includes("balansingizga qaytarildi"), "user: ↩️ qaytarildi xabari");
ok((await call("POST", `/admin/orders/${o2.data.order.orderNo}/refund`, {}, ADMIN_H)).status === 409, "ikkinchi marta qaytarilmaydi");
ok((await call("GET", `/orders/${o2.data.order.orderNo}`, undefined, S)).data.order.status === "REFUNDED", "buyurtma REFUNDED");

// bonus 1 martalik
const b1 = await call("POST", "/orders", { productId: pBonus.id, mlbbId: "555555555", serverId: "1", idempotencyKey: crypto.randomUUID(), payWithBalance: true }, S);
ok(b1.data.balancePay.result === "paid", "bonus paket to'landi");
const b2 = await call("POST", "/orders", { productId: pBonus.id, mlbbId: "555555555", serverId: "1", idempotencyKey: crypto.randomUUID() }, S);
ok(b2.status === 409 && b2.data.code === "ONCE_PER_ACCOUNT", "bonus paket 2-marta: 409 ONCE_PER_ACCOUNT");

// admin panel: to'ldirish, chek, balans
ok((await call("GET", "/admin/topups/TP-000001/receipt", undefined, ADMIN_H)).data.dataUrl.startsWith("data:image/jpeg;base64,"), "admin panel: chek rasmi server orqali");
ok((await call("GET", "/admin/topups/TP-000001/receipt")).status === 401, "admin panel: tokensiz chek — 401");
ok((await call("POST", "/admin/topups/TP-000001/approve", {}, ADMIN_H)).status === 409, "admin panel: allaqachon tasdiqlangan — 409");
const tp4 = await call("POST", "/topups", { amount: 20000, cardId: w.data.cards[0].id, idempotencyKey: crypto.randomUUID() }, S);
const ap4 = await call("POST", `/admin/topups/${tp4.data.topup.topupNo}/approve`, { amount: 19000 }, ADMIN_H);
ok(ap4.status === 200 && ap4.data.topup.credited === 19000, "admin panel: chekisiz ham tasdiqlash mumkin (19 000)");
const adj = await call("POST", "/admin/users/111/balance", { delta: -1000, note: "tuzatish" }, ADMIN_H);
ok(adj.status === 200, "admin: balansni qo'lda o'zgartirish");
ok((await call("POST", "/admin/users/111/balance", { delta: -99999999, note: "x" }, ADMIN_H)).status === 400 || (await call("POST", "/admin/users/111/balance", { delta: -9999999, note: "x" }, ADMIN_H)).status === 402, "balans manfiy bo'lmaydi");
w = await call("GET", "/wallet", undefined, S);
const sum = w.data.transactions.reduce((a: number, t: { delta: number }) => a + t.delta, 0);
ok(w.data.balance === sum && w.data.topups.length === 4, `hamyon: balans ${w.data.balance} = jurnal yig'indisi, 4 ta so'rov`);

// ---- ADMIN ----
ok((await call("POST", "/admin/users/111/tier", { tier: "vip", days: 7 })).status === 401, "admin: tokensiz — 401");
ok((await call("POST", "/admin/users/111/tier", { tier: "vip", days: 7 }, { authorization: "Bearer wrong" })).status === 401, "admin: noto'g'ri token — 401");
const t = await call("POST", "/admin/users/111/tier", { tier: "vip", days: 7 }, { authorization: "Bearer admin-token" });
ok(t.status === 200 && t.data.tierUntil > Date.now(), "admin: VIP berildi");
ok(lastTo(111).includes("VIP narxlar berildi"), "user: 👑 VIP xabari");
const o3 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: crypto.randomUUID() }, S);
ok(o3.data.order.amount === 16000, "VIP narx 16 000 (server hisobladi)");
ok((await call("POST", `/admin/orders/${o2.data.order.orderNo}/retry`, {}, ADMIN_H)).status === 409, "admin: qaytarilgan buyurtmani qayta yuborib bo'lmaydi");
const o5 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123450999", serverId: "1", idempotencyKey: crypto.randomUUID(), payWithBalance: true }, S);
await sleep(1200);
ok((await call("POST", "/admin/users/111/tier", { tier: "oddiy", days: 7 }, ADMIN_H)).status === 200, "admin: vaqtinchalik VIP bekor");
ok((await call("POST", "/admin/users/111/permanent", { tier: "bronza" })).status === 401, "doimiy tarif: tokensiz — 401");
ok((await call("POST", "/admin/users/111/permanent", { tier: "bronza" }, ADMIN_H)).status === 200, "admin: doimiy Bronza berildi");
ok(lastTo(111).includes("doimiy") , "user: ♾ doimiy tarif xabari");
const me2 = (await call("GET", "/me", undefined, S)).data.user;
ok(me2.tier === "bronza" && me2.tierPermanent === true && me2.tierUntil === null, "profil: Bronza ♾ doimiy, muddatsiz");
const o6 = await call("POST", "/orders", { productId: p86.id, mlbbId: "123456789", serverId: "1234", idempotencyKey: crypto.randomUUID() }, S);
ok(o6.data.order.amount === 16500, "doimiy Bronza narx 16 500 (server hisobladi)");
ok((await call("POST", "/admin/users/111/permanent", { tier: "oddiy" }, ADMIN_H)).status === 200, "admin: doimiy tarif olib tashlandi");
const retry = await call("POST", `/admin/orders/${o5.data.order.orderNo}/retry`, {}, ADMIN_H);
ok(retry.status === 200, "admin: FAILED buyurtmani qayta yuborish");
const fd = await call("GET", "/admin/fastdonate", undefined, { authorization: "Bearer admin-token" });
ok(fd.status === 200 && fd.data.mockMode === true, "admin: FastDonate sozlamalari");
await call("PUT", "/admin/fastdonate", { apiUrl: "https://api.example.com", apiKey: "SUPERSECRETKEY123" }, { authorization: "Bearer admin-token" });
const fd2 = await call("GET", "/admin/fastdonate", undefined, { authorization: "Bearer admin-token" });
ok(fd2.data.apiKeyMasked.startsWith("SUPE") && !JSON.stringify(fd2.data).includes("SUPERSECRETKEY123"), "admin: API key faqat maskalangan holda qaytadi");
const ft = (await call("POST", "/admin/fastdonate/test", {}, { authorization: "Bearer admin-token" })).data;
ok(ft.connected === false && ft.message.includes("NOT_CONFIGURED"), "admin: ulanish testi — parol kiritilmagan deb aytadi");
ok((await call("POST", "/admin/fastdonate/test-order", { productId: p86.id, mlbbId: "123456789", serverId: "1" })).status === 401, "sinov xaridi: tokensiz — 401");
ok((await call("POST", "/admin/fastdonate/test-order", { productId: p86.id, mlbbId: "123456789", serverId: "1" }, ADMIN_H)).status === 400, "sinov xaridi: tasdiqsiz — 400");

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
