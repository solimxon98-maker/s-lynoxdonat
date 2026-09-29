/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DEMO backend: /api/* so'rovlarini brauzer ichida bajaradi (Cloud Functions o'rniga).
 * Mantiq haqiqiy backend bilan bir xil: server narxni tarifga qarab hisoblaydi, bonus paket 1 martalik,
 * to'lov tasdiqlanmaguncha donat boshlanmaydi, xatoda buyurtma FAILED bo'ladi va xabar yuboriladi.
 */
import products from "../../../supabase/products.json";
import { priceFor } from "../lib/tier";
import type { Tier } from "../lib/types";
import { chat } from "./chat";
import { demoDb, Timestamp } from "./store";

export const DEMO_TG_ID = "777000111";
export const DEMO_UID = `tg_${DEMO_TG_ID}`;
const SUPPORT = "Solim_9804";
const ADMIN_UID = "admin_demo";

// ---------------- seed ----------------
export function seedDemo() {
  (products as any[]).forEach((p, i) => {
    demoDb.set("products", `p${String(i + 1).padStart(2, "0")}`, {
      name: p.name,
      category: p.category ?? "diamonds",
      oncePerAccount: p.oncePerAccount ?? false,
      diamonds: p.diamonds,
      bonus: p.bonus ?? 0,
      price: p.price,
      priceBronze: p.priceBronze ?? null,
      priceVip: p.priceVip ?? null,
      active: true,
      sortOrder: p.sortOrder ?? (i + 1) * 10,
      providerSku: "",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
  demoDb.set("admins", ADMIN_UID, { email: "admin@demo", name: "Demo admin", disabled: false });
  demoDb.set("cards", "c1", { bank: "humo", number: "9860123412341234", holder: "SOLIM X.", note: "", active: true, sortOrder: 1 });
  demoDb.set("cards", "c2", { bank: "uzcard", number: "8600123412341234", holder: "SOLIM X.", note: "", active: true, sortOrder: 2 });
  demoDb.set("settings", "providerStatus", {
    connected: true,
    message: "MOCK rejim: ulanish simulyatsiya qilinmoqda",
    balance: 1000000,
    currency: "RUB",
    lowBalance: false,
    checkedAt: Timestamp.now(),
  });
  // Admin panelda bo'sh ko'rinmasligi uchun 2 ta namunaviy mijoz
  const now = Date.now();
  demoDb.set("users", "tg_900000001", {
    uid: "tg_900000001", telegramId: "900000001", username: "namuna_mijoz", firstName: "Namuna", lastName: "Mijoz",
    blocked: false, ordersCount: 0, successfulOrders: 0, totalSpent: 0, lastOrderAt: null,
    tier: "vip", tierUntil: Timestamp.fromMillis(now + 5 * 86400_000),
    createdAt: Timestamp.fromMillis(now - 3 * 86400_000), updatedAt: Timestamp.now(),
  });
  demoDb.set("users", "tg_900000002", {
    uid: "tg_900000002", telegramId: "900000002", username: null, firstName: "Ikkinchi", lastName: null,
    blocked: false, ordersCount: 0, successfulOrders: 0, totalSpent: 0, lastOrderAt: null,
    tier: "oddiy", tierUntil: null,
    createdAt: Timestamp.fromMillis(now - 86400_000), updatedAt: Timestamp.now(),
  });
}

// ---------------- helpers ----------------
class ApiErr extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m`;
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function effectiveTier(u: any): Tier {
  if (!u?.tier || u.tier === "oddiy") return "oddiy";
  return (u.tierUntil?.toMillis?.() ?? 0) > Date.now() ? u.tier : "oddiy";
}
const TIER_LABEL: Record<Tier, string> = { oddiy: "Oddiy", bronza: "🥉 Bronza", vip: "👑 VIP" };

export function productLabel(p: any): string {
  if (p.category === "pass") return p.name;
  return p.bonus > 0 ? `${p.diamonds}+${p.bonus} Diamonds` : `${p.diamonds} Diamonds`;
}

export function ensureDemoUser() {
  if (demoDb.get("users", DEMO_UID)) return;
  demoDb.set("users", DEMO_UID, {
    uid: DEMO_UID, telegramId: DEMO_TG_ID, username: "siz_test", firstName: "Test", lastName: "Foydalanuvchi",
    languageCode: "uz", photoUrl: null, blocked: false, ordersCount: 0, successfulOrders: 0, totalSpent: 0,
    lastOrderAt: null, tier: "oddiy", tierUntil: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });
}

export const DEMO_REF_LINK = `https://t.me/SLynoxDonat_bot?start=ref_${DEMO_TG_ID}`;

function publicUser(u: any) {
  const t = effectiveTier(u);
  return {
    referral: { total: u.referralsTotal ?? 0, cycle: u.referralCycle ?? 0, bronzaAt: 5, vipAt: 10, link: DEMO_REF_LINK },
    uid: u.uid, telegramId: u.telegramId, username: u.username, firstName: u.firstName, lastName: u.lastName,
    photoUrl: u.photoUrl ?? null, ordersCount: u.ordersCount ?? 0, successfulOrders: u.successfulOrders ?? 0,
    totalSpent: u.totalSpent ?? 0, createdAt: u.createdAt?.toMillis?.() ?? null,
    tier: t, tierUntil: t === "oddiy" ? null : u.tierUntil?.toMillis?.() ?? null,
    balance: u.balance ?? 0,
  };
}

function publicOrder(o: any) {
  return {
    id: o.orderNo, orderNo: o.orderNo, mlbbId: o.mlbbId, serverId: o.serverId, nickname: o.nickname,
    product: { name: o.product.name, category: o.product.category, diamonds: o.product.diamonds, bonus: o.product.bonus },
    amount: o.amount, priceTier: o.priceTier, currency: "UZS", status: o.status, paymentStatus: o.paymentStatus,
    paymentId: o.paymentId, mock: true, createdAt: o.createdAt?.toMillis?.() ?? null, completedAt: o.completedAt?.toMillis?.() ?? null,
  };
}

// ---------------- bot notifications ----------------
function adminNewOrder(o: any) {
  chat.push({
    chat: "admin",
    from: "bot",
    html: [
      "🛒 <b>YANGI BUYURTMA</b>", "",
      `Order:\n<b>#${esc(o.orderNo)}</b>`, "",
      `👤 User:\n@${esc(o.username ?? o.firstName)}`, "",
      `🎮 MLBB:\n<code>${esc(o.mlbbId)}</code>`, "",
      `🌐 Server:\n<code>${esc(o.serverId)}</code>`, "",
      `👤 Nickname:\n${esc(o.nickname)}`, "",
      `${o.product.category === "pass" ? "🎫 Propusk" : "💎 Diamond"}:\n${esc(productLabel(o.product))}`, "",
      `💰 Narx:\n${esc(fmt(o.amount))}${o.priceTier !== "oddiy" ? ` (${TIER_LABEL[o.priceTier as Tier]})` : ""}`, "",
      "💳 Payment:\nPAID", "",
      "📦 Status:\nPROCESSING", "",
      "🧪 <i>MOCK rejim</i>",
    ].join("\n"),
  });
}

function userSuccess(o: any) {
  chat.push({
    chat: "user",
    from: "bot",
    html: [
      "✅ <b>Donat muvaffaqiyatli bajarildi!</b>", "",
      `Buyurtma ID: <b>#${esc(o.orderNo)}</b>`,
      `💎 ${esc(productLabel(o.product))}`,
      `👤 ${esc(o.nickname)} (<code>${esc(o.mlbbId)}</code> / ${esc(o.serverId)})`, "",
      "S-LynoxDonat xizmatidan foydalanganingiz uchun rahmat! 💙",
    ].join("\n"),
  });
}

function userFailure(o: any) {
  chat.push({
    chat: "user",
    from: "bot",
    html: [
      "❌ Buyurtmani bajarishda vaqtinchalik xatolik yuz berdi.", "",
      `Buyurtma ID: <b>#${esc(o.orderNo)}</b>`, "",
      `Support bilan bog‘laning: @${SUPPORT}`,
    ].join("\n"),
  });
}

function adminFailure(o: any, code: string, message: string) {
  chat.push({
    chat: "admin",
    from: "bot",
    html: [
      "⚠️ <b>DONAT XATOSI</b>", "",
      `Order: <b>#${esc(o.orderNo)}</b>`,
      `MLBB: <code>${esc(o.mlbbId)}</code> (${esc(o.serverId)})`,
      `💎 ${esc(productLabel(o.product))} — ${esc(fmt(o.amount))}`, "",
      `Xato: <code>${esc(code)}</code>`, esc(message), "",
      "Admin panel → Buyurtmalar orqali tekshirib, qayta yuborishingiz mumkin.",
    ].join("\n"),
  });
}

// ---------------- fulfillment (FastDonate mock) ----------------
async function fulfill(orderId: string) {
  await sleep(900);
  let o = demoDb.get("orders", orderId);
  if (!o || o.status !== "PAID") return;
  demoDb.update("orders", orderId, { status: "PROCESSING", processingAt: Timestamp.now(), attempts: (o.attempts ?? 0) + 1, updatedAt: Timestamp.now() });
  o = demoDb.get("orders", orderId)!;
  adminNewOrder(o);

  await sleep(1200);
  const id: string = o.mlbbId;
  const fail = id.endsWith("999")
    ? ["ORDER_FAILED", "Mock: provider buyurtmani rad etdi"]
    : id.endsWith("998")
      ? ["INSUFFICIENT_BALANCE", "Mock: provider balansi yetarli emas"]
      : id.endsWith("997")
        ? ["TIMEOUT", "Mock: provider javob bermadi (timeout)"]
        : null;
  if (fail) {
    demoDb.update("orders", orderId, {
      status: "FAILED",
      lastError: { code: fail[0], message: fail[1], at: Timestamp.now() },
      updatedAt: Timestamp.now(),
    });
    userFailure(o);
    adminFailure(o, fail[0], fail[1]);
    return;
  }
  demoDb.update("orders", orderId, { providerOrderId: `MOCK-${Date.now()}`, updatedAt: Timestamp.now() });
  await sleep(4000);
  complete(orderId);
}

function complete(orderId: string) {
  const o = demoDb.get("orders", orderId);
  if (!o || (o.status !== "PROCESSING" && o.status !== "FAILED")) return;
  demoDb.update("orders", orderId, { status: "SUCCESS", completedAt: Timestamp.now(), lastError: null, updatedAt: Timestamp.now() });
  demoDb.update("users", o.uid, {
    successfulOrders: demoDb.increment(1),
    totalSpent: demoDb.increment(o.amount),
    updatedAt: Timestamp.now(),
  });
  userSuccess(o);
}

// ---------------- routes ----------------
type Handler = (ctx: { uid: string | null; body: any; params: string[] }) => Promise<any>;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, re: RegExp, h: Handler) => routes.push([method, re, h]);

function requireUser(uid: string | null) {
  if (!uid || !uid.startsWith("tg_")) throw new ApiErr(401, "UNAUTHORIZED", "Avtorizatsiya talab qilinadi");
  const u = demoDb.get("users", uid);
  if (!u) throw new ApiErr(403, "FORBIDDEN", "Foydalanuvchi topilmadi");
  if (u.blocked) throw new ApiErr(403, "FORBIDDEN", "Hisobingiz bloklangan. Support bilan bog‘laning.");
  return u;
}
function requireAdmin(uid: string | null) {
  if (!uid || !demoDb.get("admins", uid)) throw new ApiErr(403, "FORBIDDEN", "Admin huquqi yo'q");
}

on("POST", /^\/auth\/telegram$/, async () => {
  ensureDemoUser();
  const u = demoDb.get("users", DEMO_UID)!;
  if (u.blocked) throw new ApiErr(403, "FORBIDDEN", "Hisobingiz bloklangan. Support bilan bog‘laning.");
  return { session: DEMO_UID, expiresAt: Date.now() + 86400_000, user: publicUser(u), mockMode: true, supportUsername: SUPPORT };
});

on("GET", /^\/products$/, async () => ({
  products: demoDb
    .list("products")
    .filter(([, p]) => p.active)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder),
}));

on("GET", /^\/orders$/, async ({ uid }) => {
  requireUser(uid);
  return {
    orders: demoDb
      .list("orders")
      .map(([, o]) => o)
      .filter((o) => o.uid === uid)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      .slice(0, 50)
      .map(publicOrder),
  };
});

on("GET", /^\/me$/, async ({ uid }) => ({ user: publicUser(requireUser(uid)), mockMode: true, supportUsername: SUPPORT }));

on("POST", /^\/player\/check$/, async ({ uid, body }) => {
  requireUser(uid);
  const mlbbId = String(body?.mlbbId ?? "").trim();
  const serverId = String(body?.serverId ?? "").trim();
  if (!/^\d{5,12}$/.test(mlbbId)) throw new ApiErr(400, "INVALID_MLBB_ID", "MLBB ID faqat raqamlardan iborat bo‘lishi kerak (5–12 ta).");
  if (!/^\d{1,6}$/.test(serverId)) throw new ApiErr(400, "INVALID_SERVER_ID", "Server ID faqat raqamlardan iborat bo‘lishi kerak.");
  await sleep(600);
  if (/^0+$/.test(mlbbId)) return { found: false, nickname: null, verificationSupported: true, mlbbId, serverId, mock: true };
  return { found: true, nickname: `MLBB_Player_${mlbbId.slice(-4)}`, verificationSupported: true, mlbbId, serverId, mock: true };
});

on("POST", /^\/orders$/, async ({ uid, body }) => {
  const user = requireUser(uid);
  const mlbbId = String(body?.mlbbId ?? "");
  const serverId = String(body?.serverId ?? "");
  const key = String(body?.idempotencyKey ?? "");
  const existing = demoDb.list("orders").find(([, o]) => o.uid === uid && o.idempotencyKey === key);
  if (existing) {
    const o = existing[1];
    const res: any = { order: publicOrder(o), payment: { id: o.paymentId, mode: "balance", payUrl: `/pay/${o.paymentId}`, status: o.paymentStatus }, reused: true };
    if (body?.payWithBalance) res.balancePay = o.paymentStatus === "PAID" ? { result: "already_paid", balance: user.balance ?? 0, need: 0 } : payFromBalance(uid!, o.orderNo);
    return res;
  }
  const product = demoDb.get("products", String(body?.productId ?? ""));
  if (!product) throw new ApiErr(404, "NOT_FOUND", "Paket topilmadi.");
  if (!product.active) throw new ApiErr(409, "PRODUCT_INACTIVE", "Bu paket hozirda mavjud emas.");
  if (/^0+$/.test(mlbbId)) throw new ApiErr(400, "PLAYER_NOT_FOUND", "Akkaunt topilmadi. MLBB ID va Serverni tekshiring.");

  if (product.oncePerAccount) {
    const blocked = demoDb
      .list("orders")
      .some(([, o]) => o.mlbbId === mlbbId && o.productId === body.productId && ["PAID", "PROCESSING", "SUCCESS", "AWAITING_PAYMENT"].includes(o.status));
    if (blocked) {
      throw new ApiErr(409, "ONCE_PER_ACCOUNT", "Bu bonus paket bitta akkauntga faqat 1 marta beriladi. Bu akkaunt uni allaqachon olgan — oddiy olmos paketini tanlang.");
    }
  }

  await sleep(500);
  const counters = demoDb.get("settings", "counters") ?? { orderSeq: 0 };
  const seq = (counters.orderSeq ?? 0) + 1;
  demoDb.set("settings", "counters", { orderSeq: seq });
  const orderNo = `SLD-${String(seq).padStart(6, "0")}`;
  const paymentId = demoDb.newId();
  const priceTier = effectiveTier(user);
  const amount = priceFor(product as any, priceTier);
  const now = Timestamp.now();
  const order = {
    orderNo, seq, uid, telegramId: user.telegramId, username: user.username, firstName: user.firstName, game: "MLBB",
    mlbbId, serverId, nickname: `MLBB_Player_${mlbbId.slice(-4)}`, productId: body.productId,
    product: { name: product.name, category: product.category, diamonds: product.diamonds, bonus: product.bonus, price: product.price, providerSku: null },
    amount, priceTier, currency: "UZS", status: "AWAITING_PAYMENT", paymentStatus: "PENDING", paymentId,
    paymentProvider: "balance", donateProvider: "fastdonate-mock", providerOrderId: null, attempts: 0, lastError: null,
    idempotencyKey: key, mock: true, createdAt: now, updatedAt: now, paidAt: null, processingAt: null, completedAt: null,
  };
  demoDb.set("orders", orderNo, order);
  demoDb.set("payments", paymentId, {
    orderId: orderNo, uid, provider: "balance", amount, currency: "UZS", status: "PENDING", mode: "balance",
    payUrl: `/pay/${paymentId}`, externalId: `MOCKPAY-${paymentId}`, createdAt: now, updatedAt: now, paidAt: null,
  });
  demoDb.update("users", uid!, { lastOrderAt: now });
  const res: any = { order: publicOrder(order), payment: { id: paymentId, mode: "balance", payUrl: `/pay/${paymentId}`, status: "PENDING" }, reused: false };
  if (body?.payWithBalance) {
    res.balancePay = payFromBalance(uid!, orderNo);
    res.order = publicOrder(demoDb.get("orders", orderNo));
  }
  return res;
});

on("GET", /^\/orders\/([A-Z]+-\d+)$/, async ({ uid, params }) => {
  requireUser(uid);
  const o = demoDb.get("orders", params[0]);
  if (!o || o.uid !== uid) throw new ApiErr(404, "NOT_FOUND", "Buyurtma topilmadi");
  return { order: publicOrder(o) };
});

on("GET", /^\/payments\/([A-Za-z0-9]+)$/, async ({ uid, params }) => {
  requireUser(uid);
  const p = demoDb.get("payments", params[0]);
  if (!p || p.uid !== uid) throw new ApiErr(404, "NOT_FOUND", "To‘lov topilmadi");
  const o = demoDb.get("orders", p.orderId)!;
  return {
    payment: { id: params[0], orderId: p.orderId, amount: p.amount, currency: "UZS", status: p.status, provider: "balance", mode: "balance", payUrl: p.payUrl },
    balance: demoDb.get("users", uid!)?.balance ?? 0,
    order: { orderNo: o.orderNo, nickname: o.nickname, mlbbId: o.mlbbId, serverId: o.serverId, name: o.product.name, category: o.product.category, diamonds: o.product.diamonds, bonus: o.product.bonus, status: o.status },
  };
});

on("POST", /^\/payments\/([A-Za-z0-9]+)\/mock$/, async ({ uid, params, body }) => {
  requireUser(uid);
  const p = demoDb.get("payments", params[0]);
  if (!p || p.uid !== uid) throw new ApiErr(404, "NOT_FOUND", "To‘lov topilmadi");
  if (p.status !== "PENDING") return { result: "duplicate" };
  await sleep(700);
  const now = Timestamp.now();
  if (body?.action === "pay") {
    demoDb.update("payments", params[0], { status: "PAID", paidAt: now, updatedAt: now });
    demoDb.update("orders", p.orderId, { status: "PAID", paymentStatus: "PAID", paidAt: now, updatedAt: now });
    demoDb.update("users", uid!, { ordersCount: demoDb.increment(1) });
    void fulfill(p.orderId);
  } else {
    demoDb.update("payments", params[0], { status: "CANCELLED", updatedAt: now });
    demoDb.update("orders", p.orderId, { status: "CANCELLED", paymentStatus: "CANCELLED", updatedAt: now });
  }
  return { result: "applied" };
});

// ---- balans ----
function moveBalance(uid: string, delta: number, kind: string, ref: string | null, note: string | null) {
  const u = demoDb.get("users", uid)!;
  const next = (u.balance ?? 0) + delta;
  if (next < 0) throw new ApiErr(402, "INSUFFICIENT_FUNDS", "Balans yetarli emas");
  demoDb.update("users", uid, { balance: next });
  demoDb.set("balanceTx", demoDb.newId(), { uid, delta, balanceAfter: next, kind, ref, note, createdAt: Timestamp.now() });
  return next;
}
function payFromBalance(uid: string, orderNo: string) {
  const o = demoDb.get("orders", orderNo);
  if (!o || o.uid !== uid) throw new ApiErr(404, "NOT_FOUND", "Buyurtma topilmadi");
  const u = demoDb.get("users", uid)!;
  if (o.paymentStatus === "PAID") return { result: "already_paid", balance: u.balance ?? 0, need: 0 };
  if (o.status !== "AWAITING_PAYMENT") throw new ApiErr(409, "ORDER_CLOSED", "Bu buyurtma yopilgan. Yangi buyurtma bering.");
  if ((u.balance ?? 0) < o.amount) return { result: "insufficient", balance: u.balance ?? 0, need: o.amount - (u.balance ?? 0) };
  const bal = moveBalance(uid, -o.amount, "purchase", orderNo, null);
  const now = Timestamp.now();
  demoDb.update("payments", o.paymentId, { status: "PAID", paidAt: now });
  demoDb.update("orders", orderNo, { status: "PAID", paymentStatus: "PAID", paidAt: now, updatedAt: now });
  demoDb.update("users", uid, { ordersCount: demoDb.increment(1) });
  void fulfill(orderNo);
  return { result: "paid", balance: bal, need: 0 };
}
const BANK: Record<string, string> = { humo: "Humo", uzcard: "Uzcard", visa: "Visa", mastercard: "Mastercard", other: "Karta" };
const publicCard = (id: string, c: any) => ({ id, bank: c.bank, bankLabel: BANK[c.bank], number: c.number, holder: c.holder, note: c.note });
function publicTopup(t: any) {
  return {
    topupNo: t.topupNo, amount: t.amount, credited: t.credited ?? null, status: t.status,
    card: { ...t.card, bankLabel: BANK[t.card.bank] }, hasReceipt: !!t.receipt, rejectReason: t.rejectReason ?? null,
    createdAt: t.createdAt.toMillis(), decidedAt: t.decidedAt?.toMillis?.() ?? null,
  };
}
export function demoDecideTopup(no: string, ok: boolean, amount?: number, reason?: string) {
  const t = demoDb.get("topups", no);
  if (!t || !["PENDING", "AWAITING_RECEIPT"].includes(t.status)) throw new ApiErr(409, "ALREADY_DECIDED", "Bu so‘rov allaqachon ko‘rib chiqilgan");
  if (ok) {
    const credited = amount ?? t.amount;
    const bal = moveBalance(t.uid, credited, "topup", no, null);
    demoDb.update("topups", no, { status: "APPROVED", credited, decidedAt: Timestamp.now(), decidedBy: "admin:panel" });
    chat.push({ chat: "user", from: "bot", html: `✅ <b>Hisobingiz to‘ldirildi!</b>\n\n🧾 #${no}\n💰 +${fmt(credited)}\n💼 Balans: <b>${fmt(bal)}</b>\n\n💎 Endi xohlagan olmos paketingizni balansdan sotib olishingiz mumkin!` });
  } else {
    const r = reason || "Pul kartaga tushmadi yoki chek noto‘g‘ri";
    demoDb.update("topups", no, { status: "REJECTED", rejectReason: r, decidedAt: Timestamp.now(), decidedBy: "admin:panel" });
    chat.push({ chat: "user", from: "bot", html: `❌ <b>To‘ldirish so‘rovi rad etildi</b>\n\n🧾 #${no} — ${fmt(t.amount)}\nSabab: ${esc(r)}` });
  }
}

on("GET", /^\/wallet$/, async ({ uid }) => {
  const u = requireUser(uid);
  return {
    balance: u.balance ?? 0,
    cards: demoDb.list("cards").filter(([, c]) => c.active).sort((a, b) => a[1].sortOrder - b[1].sortOrder).map(([id, c]) => publicCard(id, c)),
    topups: demoDb.list("topups").map(([, t]) => t).filter((t) => t.uid === uid).sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()).map(publicTopup),
    transactions: demoDb.list("balanceTx").map(([id, x]): any => ({ ...x, id })).filter((x) => x.uid === uid)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      .map((x) => ({ id: x.id, delta: x.delta, balanceAfter: x.balanceAfter, kind: x.kind, ref: x.ref, note: x.note, createdAt: x.createdAt.toMillis() })),
  };
});
on("POST", /^\/topups$/, async ({ uid, body }) => {
  requireUser(uid);
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount < 1000) throw new ApiErr(400, "INVALID_AMOUNT", "Summa 1 000 dan 50 000 000 so‘mgacha bo‘lishi kerak");
  const card = demoDb.get("cards", String(body?.cardId));
  if (!card || !card.active) throw new ApiErr(404, "NOT_FOUND", "Karta topilmadi");
  await sleep(400);
  const c = demoDb.get("settings", "counters") ?? {};
  const seq = (c.topupSeq ?? 0) + 1;
  demoDb.set("settings", "counters", { ...c, topupSeq: seq });
  const topupNo = `TP-${String(seq).padStart(6, "0")}`;
  const t = { topupNo, uid, amount, status: "AWAITING_RECEIPT", card: { bank: card.bank, number: card.number, holder: card.holder }, createdAt: Timestamp.now() };
  demoDb.set("topups", topupNo, t);
  return { topup: publicTopup(t), reused: false };
});
on("POST", /^\/topups\/(TP-\d+)\/receipt$/, async ({ uid, params, body }) => {
  const u = requireUser(uid);
  const t = demoDb.get("topups", params[0]);
  if (!t || t.uid !== uid) throw new ApiErr(404, "NOT_FOUND", "So‘rov topilmadi");
  if (!/^data:image\//.test(String(body?.image ?? ""))) throw new ApiErr(400, "INVALID_IMAGE", "Chek rasmini yuklang (JPG yoki PNG).");
  await sleep(700);
  demoDb.update("topups", params[0], { status: "PENDING", receipt: body.image });
  chat.push({
    chat: "admin", from: "bot",
    html: `🧾 <b>HISOBNI TO‘LDIRISH</b> #${params[0]}\n\n👤 @${esc(u.username)} (ID: <code>${esc(u.telegramId)}</code>)\n💰 Summa: <b>${fmt(t.amount)}</b>\n💳 Karta: ${BANK[t.card.bank]} •••• ${t.card.number.slice(-4)}\n\n⚠️ Tasdiqlashdan oldin <b>bank ilovangizda pul tushganini tekshiring</b>.\n\n<i>[chek rasmi] · Demo: admin panel → To‘ldirishlar</i>`,
  });
  return { topup: publicTopup(demoDb.get("topups", params[0])) };
});
on("POST", /^\/orders\/(SLD-\d+)\/pay$/, async ({ uid, params }) => {
  requireUser(uid);
  await sleep(400);
  return payFromBalance(uid!, params[0]);
});
on("POST", /^\/admin\/topups\/(TP-\d+)\/approve$/, async ({ uid, params, body }) => {
  requireAdmin(uid);
  demoDecideTopup(params[0], true, body?.amount ? Number(body.amount) : undefined);
  return { topup: publicTopup(demoDb.get("topups", params[0])) };
});
on("POST", /^\/admin\/topups\/(TP-\d+)\/reject$/, async ({ uid, params, body }) => {
  requireAdmin(uid);
  demoDecideTopup(params[0], false, undefined, String(body?.reason ?? ""));
  return { topup: publicTopup(demoDb.get("topups", params[0])) };
});
on("GET", /^\/admin\/topups\/(TP-\d+)\/receipt$/, async ({ uid, params }) => {
  requireAdmin(uid);
  const t = demoDb.get("topups", params[0]);
  if (!t?.receipt) throw new ApiErr(404, "NOT_FOUND", "Chek yuklanmagan");
  return { type: "image/jpeg", dataUrl: t.receipt };
});
on("POST", /^\/admin\/users\/([^/]+)\/balance$/, async ({ uid, params, body }) => {
  requireAdmin(uid);
  const target = params[0].startsWith("tg_") ? params[0] : `tg_${params[0]}`;
  const balance = moveBalance(target, Number(body?.delta), "admin", null, String(body?.note ?? ""));
  return { balance };
});
on("POST", /^\/admin\/orders\/([^/]+)\/refund$/, async ({ uid, params }) => {
  requireAdmin(uid);
  const o = demoDb.get("orders", params[0]);
  if (!o || o.status !== "FAILED" || o.paymentStatus !== "PAID") throw new ApiErr(409, "REFUND_NOT_ALLOWED", "Faqat to‘langan FAILED buyurtma pulini qaytarish mumkin");
  const balance = moveBalance(o.uid, o.amount, "refund", params[0], null);
  demoDb.update("orders", params[0], { status: "REFUNDED", paymentStatus: "REFUNDED", updatedAt: Timestamp.now() });
  chat.push({ chat: "user", from: "bot", html: `↩️ <b>Pul balansingizga qaytarildi</b>\n\nBuyurtma: <b>#${params[0]}</b>\n💰 +${fmt(o.amount)}\n💼 Balans: <b>${fmt(balance)}</b>` });
  return { balance, amount: o.amount };
});

// ---- admin ----
on("GET", /^\/admin\/fastdonate$/, async ({ uid }) => {
  requireAdmin(uid);
  const s = demoDb.get("settings", "fastdonate") ?? {};
  const st = demoDb.get("settings", "providerStatus");
  const mask = (v?: string) => (v ? `${v.slice(0, 4)}••••••${v.slice(-2)}` : "");
  return {
    mockMode: true, source: s.apiKey ? "admin" : "none", apiUrl: s.apiUrl ?? "", apiKeyMasked: mask(s.apiKey), secretMasked: mask(s.secret),
    hasApiKey: !!s.apiKey, hasSecret: !!s.secret, lowBalanceThreshold: 0,
    lastStatus: st ? { ...st, checkedAt: st.checkedAt?.toMillis?.() } : null,
  };
});
on("PUT", /^\/admin\/fastdonate$/, async ({ uid, body }) => {
  requireAdmin(uid);
  const cur = demoDb.get("settings", "fastdonate") ?? {};
  for (const k of ["apiUrl", "apiKey", "secret"]) {
    const v = String(body?.[k] ?? "").trim();
    if (v === "-") delete cur[k];
    else if (v) cur[k] = v;
  }
  demoDb.set("settings", "fastdonate", cur);
  return {};
});
on("POST", /^\/admin\/fastdonate\/test$/, async ({ uid }) => {
  requireAdmin(uid);
  await sleep(600);
  const r = { connected: true, message: "MOCK rejim: ulanish simulyatsiya qilinmoqda", provider: "fastdonate-mock", mock: true, balance: 1000000, currency: "RUB", balanceError: null, lowBalance: false };
  demoDb.set("settings", "providerStatus", { ...r, checkedAt: Timestamp.now() });
  return { ...r, checkedAt: Date.now(), threshold: 0 };
});
on("POST", /^\/admin\/users\/([^/]+)\/tier$/, async ({ uid, params, body }) => {
  requireAdmin(uid);
  const target = params[0].startsWith("tg_") ? params[0] : `tg_${params[0]}`;
  const u = demoDb.get("users", target);
  if (!u) throw new ApiErr(404, "NOT_FOUND", "Foydalanuvchi topilmadi");
  const tier = body?.tier as Tier;
  if (tier === "oddiy") {
    demoDb.update("users", target, { tier: "oddiy", tierUntil: null });
    return { tier, tierUntil: null };
  }
  const days = Number(body?.days ?? 7);
  const cur = effectiveTier(u);
  const base = cur === tier ? Math.max(Date.now(), u.tierUntil?.toMillis?.() ?? 0) : Date.now();
  const until = base + days * 86400_000;
  demoDb.update("users", target, { tier, tierUntil: Timestamp.fromMillis(until) });
  if (target === DEMO_UID) {
    const d = new Date(until + 5 * 3600_000);
    const s = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    chat.push({
      chat: "user",
      from: "bot",
      html: `${tier === "vip" ? "👑" : "🥉"} <b>Tabriklaymiz! Sizga ${TIER_LABEL[tier]} narxlar berildi</b>\n\n⏳ Amal qiladi: <b>${s}</b> gacha\n\n💎 Endi Web App’da barcha paketlar siz uchun arzonroq narxda ko‘rsatiladi.`,
    });
  }
  return { tier, tierUntil: until };
});
on("POST", /^\/admin\/orders\/([^/]+)\/retry$/, async ({ uid, params }) => {
  requireAdmin(uid);
  const o = demoDb.get("orders", params[0]);
  if (!o || o.status !== "FAILED") throw new ApiErr(409, "RETRY_NOT_ALLOWED", "Faqat FAILED buyurtmani qayta yuborish mumkin");
  // Demo: qayta yuborishda muvaffaqiyatli bo'ladi
  demoDb.update("orders", params[0], { status: "PROCESSING", mlbbId: o.mlbbId, updatedAt: Timestamp.now() });
  setTimeout(() => complete(params[0]), 2500);
  return {};
});
on("POST", /^\/admin\/orders\/([^/]+)\/mark-success$/, async ({ uid, params }) => {
  requireAdmin(uid);
  complete(params[0]);
  return {};
});

// ---------------- fetch interceptor ----------------
export function installDemoBackend() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    const m = /^(?:\/functions\/v1)?\/api(\/[^?]*)/.exec(path);
    if (!m) return realFetch(input as any, init);

    const method = (init?.method ?? "GET").toUpperCase();
    const h = new Headers(init?.headers);
    const auth = h.get("Authorization");
    const uid = h.get("X-Session") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : null);
    let body: any = undefined;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      body = undefined;
    }
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    for (const [meth, re, h] of routes) {
      if (meth !== method) continue;
      const mm = re.exec(m[1]);
      if (!mm) continue;
      try {
        const data = await h({ uid, body, params: mm.slice(1) });
        return json(200, { ok: true, ...data });
      } catch (e) {
        if (e instanceof ApiErr) return json(e.status, { ok: false, code: e.code, message: e.message });
        return json(500, { ok: false, code: "INTERNAL", message: String((e as Error).message) });
      }
    }
    return json(404, { ok: false, code: "NOT_FOUND", message: "Endpoint topilmadi" });
  };
}

// ---------------- referral (demo) ----------------
let fakeFriend = 0;
const FRIEND_NAMES = ["Aziz", "Jasur", "Dilshod", "Sardor", "Bekzod", "Shoxrux", "Otabek", "Ulug‘bek", "Javlon", "Sherzod", "Ibrohim", "Asadbek"];

/** Demo: havola orqali botga yangi do'st kirdi — haqiqiy backenddagi qoidalar bilan bir xil */
export function simulateReferral() {
  const u = demoDb.get("users", DEMO_UID)!;
  const name = FRIEND_NAMES[fakeFriend++ % FRIEND_NAMES.length];
  const now = Date.now();
  const total = (u.referralsTotal ?? 0) + 1;
  let cycle = (u.referralCycle ?? 0) + 1;
  let reward: { tier: Tier; until: number } | null = null;
  const ext = (tier: Tier) => {
    const base = effectiveTier(u) === tier ? Math.max(now, u.tierUntil?.toMillis?.() ?? now) : now;
    return base + 7 * 86400_000;
  };
  if (cycle >= 10) {
    reward = { tier: "vip", until: ext("vip") };
    cycle = 0;
  } else if (cycle === 5 && effectiveTier(u) !== "vip") {
    reward = { tier: "bronza", until: ext("bronza") };
  }
  const patch: Record<string, unknown> = { referralsTotal: total, referralCycle: cycle };
  if (reward) {
    patch.tier = reward.tier;
    patch.tierUntil = Timestamp.fromMillis(reward.until);
  }
  demoDb.update("users", DEMO_UID, patch);
  const fid = `tg_9${String(100000 + fakeFriend)}`;
  demoDb.set("users", fid, {
    uid: fid, telegramId: fid.slice(3), username: null, firstName: name, lastName: null, blocked: false,
    ordersCount: 0, successfulOrders: 0, totalSpent: 0, lastOrderAt: null, tier: "oddiy", tierUntil: null,
    referredBy: DEMO_UID, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  });

  if (reward) {
    const label = reward.tier === "vip" ? "👑 VIP" : "🥉 Bronza";
    const d = new Date(reward.until + 5 * 3600_000);
    const s = `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    chat.push({
      chat: "user",
      from: "bot",
      html: [
        `🎉 <b>Tabriklaymiz! Sizga ${label} narxlar berildi</b>`, "",
        `👥 Yangi do‘st: ${name}`, `Jami taklif qilganlaringiz: <b>${total}</b>`,
        `⏳ ${label} narx <b>${s}</b> gacha amal qiladi`, "",
        reward.tier === "vip" ? "🔁 Yana 10 ta do‘st taklif qilsangiz — VIP yana 1 haftaga uzayadi!" : "👑 Yana 5 ta do‘st — VIP narx!",
      ].join("\n"),
    });
  } else {
    const vip = effectiveTier(demoDb.get("users", DEMO_UID)) === "vip";
    const next = cycle < 5 && !vip ? 5 : 10;
    chat.push({
      chat: "user",
      from: "bot",
      html: `👥 Havolangiz orqali yangi do‘st qo‘shildi: ${name}\n\nHisob: <b>${cycle}/10</b> (jami ${total})\n${next === 5 ? "🥉 Bronza" : "👑 VIP"} narxgacha yana <b>${next - cycle}</b> ta do‘st qoldi!`,
    });
  }
}
