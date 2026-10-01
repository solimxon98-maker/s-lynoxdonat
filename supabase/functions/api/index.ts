/**
 * S-LynoxDonat API — Web App va admin panel uchun.
 * URL: https://<project>.supabase.co/functions/v1/api/<yo'l>
 *
 * Avtorizatsiya:
 *  - Telegram foydalanuvchi: "X-Session" (initData serverda tekshirilgach beriladi)
 *  - Admin: "Authorization: Bearer <Supabase access token>" + public.admins
 */
import { config } from "../_shared/config.ts";
import { db, rpc } from "../_shared/db.ts";
import { esc, formatDateTime, TIER_LABEL, userTier } from "../_shared/format.ts";
import {
  badRequest, corsHeaders, errorResponse, forbidden, HttpError, json, notFound, readJson, unauthorized,
} from "../_shared/http.ts";
import { writeLog } from "../_shared/logger.ts";
import { ProviderError } from "../_shared/providers/donate/index.ts";
import { FastDonateService, parseSku } from "../_shared/providers/donate/FastDonateService.ts";
import { checkPlayerViaFastDonate } from "../_shared/providers/donate/playerCheck.ts";
import { getPaymentProviderById } from "../_shared/providers/payment/index.ts";
import { issueSession, verifySession } from "../_shared/session.ts";
import { validateInitData } from "../_shared/telegramAuth.ts";
import { sendMessageSafe } from "../_shared/telegramApi.ts";
import { ms, type Payment, type TgUser, type Tier } from "../_shared/types.ts";
import { completeOrder, processPaidOrder } from "../_shared/services/fulfillment.ts";
import {
  checkPlayer, createOrder, getOrder, listActiveProducts, listUserOrders, publicOrder, validatePlayerInput,
} from "../_shared/services/orders.ts";
import { applyPaymentEvent } from "../_shared/services/payments.ts";
import { referralLink, referralProgress } from "../_shared/services/referrals.ts";
import { getFastDonateCredentials, getSetting, maskSecret, mergeSetting, saveFastDonateCredentials } from "../_shared/services/settings.ts";
import { getUser, requireActiveUser, upsertTelegramUser } from "../_shared/services/users.ts";
import {
  adjustBalance, approveTopup, createTopup, getOwnTopup, getWallet, payOrderFromBalance, publicTopup, refundOrder, rejectTopup,
  splitFileRef, TOPUP_NO_RE, uploadReceipt,
} from "../_shared/services/wallet.ts";
import { downloadTelegramFile } from "../_shared/telegramApi.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

/** Javobdan keyin ham fon ishini davom ettirish (Supabase Edge Runtime) */
function background(p: Promise<unknown>) {
  const safe = p.catch((e) => console.error("background_failed", e));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(safe);
}

interface Ctx {
  req: Request;
  path: string;
  params: string[];
  body: Record<string, unknown>;
}
type Handler = (c: Ctx) => Promise<unknown>;
const routes: { method: string; re: RegExp; h: Handler }[] = [];
const on = (method: string, re: RegExp, h: Handler) => routes.push({ method, re, h });

// ---------------------------------------------------------------- helpers
async function requireUser(req: Request): Promise<TgUser> {
  const id = verifySession(req.headers.get("x-session"));
  if (!id) throw unauthorized("Sessiya muddati tugagan. Web Appni qayta oching.");
  return await requireActiveUser(id);
}

async function requireAdmin(req: Request): Promise<string> {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw unauthorized();
  const { data, error } = await db().auth.getUser(m[1]);
  if (error || !data.user) throw unauthorized("Admin sessiyasi tugagan. Qayta kiring.");
  const { data: admin } = await db().from("admins").select("disabled").eq("user_id", data.user.id).maybeSingle();
  if (!admin || admin.disabled) throw forbidden("Admin huquqi yo'q");
  return data.user.id;
}

async function publicUser(u: TgUser) {
  const { tier, permanent } = userTier(u);
  return {
    uid: `tg_${u.id}`,
    telegramId: String(u.id),
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    photoUrl: u.photo_url,
    ordersCount: u.orders_count,
    successfulOrders: u.successful_orders,
    totalSpent: Number(u.total_spent),
    createdAt: ms(u.created_at),
    tier,
    tierUntil: tier === "oddiy" || permanent ? null : ms(u.tier_until),
    tierPermanent: permanent,
    balance: Number(u.balance ?? 0),
    referral: { ...referralProgress(u), link: await referralLink(u.id) },
  };
}

const ORDER_NO_RE = /^SLD-\d{6,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- public / user
on("GET", /^\/health$/, async () => ({ service: "S-LynoxDonat", mockMode: config.mockMode, time: Date.now() }));

on("POST", /^\/auth\/telegram$/, async ({ req, body }) => {
  if (typeof body.initData !== "string") throw badRequest("INITDATA_MISSING", "initData yuborilmadi");
  let tgUser;
  try {
    tgUser = validateInitData(body.initData, config.telegram.botToken, config.telegram.initDataMaxAge).user;
  } catch (e) {
    await writeLog("warn", "initdata_rejected", { reason: (e as Error).message, ip: req.headers.get("x-forwarded-for") });
    throw unauthorized("Telegram ma'lumotlari tasdiqlanmadi. Web Appni bot orqali oching.");
  }
  const user = await upsertTelegramUser(tgUser);
  if (user.blocked) throw forbidden("Hisobingiz bloklangan. Support bilan bog‘laning.");
  const s = issueSession(user.id);
  return { session: s.token, expiresAt: s.expiresAt, user: await publicUser(user), mockMode: config.mockMode, supportUsername: config.telegram.supportUsername || null };
});

on("GET", /^\/me$/, async ({ req }) => {
  const user = await requireUser(req);
  return { user: await publicUser(user), mockMode: config.mockMode, supportUsername: config.telegram.supportUsername || null };
});

on("GET", /^\/products$/, async () => ({ products: await listActiveProducts() }));

on("POST", /^\/player\/check$/, async ({ req, body }) => {
  await requireUser(req);
  const { mlbbId, serverId } = validatePlayerInput(body.mlbbId, body.serverId);
  const r = await checkPlayer(mlbbId, serverId);
  return { ...r, mlbbId, serverId, mock: config.mockMode };
});

on("POST", /^\/orders$/, async ({ req, body }) => {
  const user = await requireUser(req);
  const res = await createOrder(user, body);
  // Balansdan darhol to'lash (Web App "Balansdan to'lash" tugmasi)
  if (body.payWithBalance === true && res.payment.mode === "balance") {
    if (res.order.paymentStatus !== "PENDING") {
      return { ...res, balancePay: { result: res.order.paymentStatus === "PAID" ? "already_paid" : "closed", balance: Number(user.balance ?? 0), need: 0 } };
    }
    const r = await payOrderFromBalance(user, res.order.orderNo);
    if (r.result === "paid") background(processPaidOrder(res.order.orderNo));
    return { ...res, balancePay: { result: r.result, balance: Number(r.balance), need: r.need ?? 0 } };
  }
  return res;
});

/** Mavjud (to'lanmagan) buyurtmani balansdan to'lash */
on("POST", /^\/orders\/(SLD-\d{6,})\/pay$/, async ({ req, params }) => {
  const user = await requireUser(req);
  const r = await payOrderFromBalance(user, params[0]);
  if (r.result === "paid") {
    await writeLog("info", "order_paid_balance", { orderNo: params[0], userId: user.id });
    background(processPaidOrder(params[0]));
  }
  return { result: r.result, balance: Number(r.balance), need: r.need ?? 0 };
});

// ---------------------------------------------------------------- balans
on("GET", /^\/wallet$/, async ({ req }) => {
  const user = await requireUser(req);
  return await getWallet(user);
});

on("POST", /^\/topups$/, async ({ req, body }) => {
  const user = await requireUser(req);
  return await createTopup(user, body);
});

on("GET", /^\/topups\/(TP-\d{6,})$/, async ({ req, params }) => {
  const user = await requireUser(req);
  return { topup: publicTopup(await getOwnTopup(user, params[0])), balance: Number(user.balance ?? 0) };
});

on("POST", /^\/topups\/(TP-\d{6,})\/receipt$/, async ({ req, params, body }) => {
  const user = await requireUser(req);
  return await uploadReceipt(user, params[0], body.image);
});

on("GET", /^\/orders$/, async ({ req }) => {
  const user = await requireUser(req);
  return { orders: await listUserOrders(user.id) };
});

on("GET", /^\/orders\/([A-Z0-9-]+)$/, async ({ req, params }) => {
  const user = await requireUser(req);
  if (!ORDER_NO_RE.test(params[0])) throw notFound("Buyurtma topilmadi");
  const o = await getOrder(params[0]);
  if (o.user_id !== user.id) throw notFound("Buyurtma topilmadi");
  return { order: publicOrder(o) };
});

async function loadOwnPayment(paymentId: string, userId: number): Promise<Payment> {
  if (!UUID_RE.test(paymentId)) throw notFound("To‘lov topilmadi");
  const { data } = await db().from("payments").select("*").eq("id", paymentId).maybeSingle();
  const p = data as Payment | null;
  if (!p || p.user_id !== userId) throw notFound("To‘lov topilmadi");
  return p;
}

on("GET", /^\/payments\/([0-9a-f-]{36})$/i, async ({ req, params }) => {
  const user = await requireUser(req);
  const p = await loadOwnPayment(params[0], user.id);
  const o = await getOrder(p.order_no);
  return {
    payment: { id: p.id, orderId: p.order_no, amount: p.amount, currency: p.currency, status: p.status, provider: p.provider, mode: p.mode, payUrl: p.pay_url },
    balance: Number(user.balance ?? 0),
    order: {
      orderNo: o.order_no, nickname: o.nickname, mlbbId: o.mlbb_id, serverId: o.server_id,
      name: o.product.name, category: o.product.category, diamonds: o.product.diamonds, bonus: o.product.bonus, status: o.status,
    },
  };
});

/** Test to'lov — FAQAT MOCK_MODE=true */
on("POST", /^\/payments\/([0-9a-f-]{36})\/mock$/i, async ({ req, params, body }) => {
  if (!config.mockMode) throw forbidden("Mock to‘lov o‘chirilgan");
  const user = await requireUser(req);
  const p = await loadOwnPayment(params[0], user.id);
  if (p.provider !== "mock") throw forbidden("Bu to‘lov mock emas");
  const action = body.action;
  if (action !== "pay" && action !== "cancel") throw badRequest("INVALID_ACTION", "Noto‘g‘ri amal");
  const result = await applyPaymentEvent(
    { paymentId: p.id, status: action === "pay" ? "PAID" : "CANCELLED", amount: p.amount, externalId: `MOCKPAY-${p.id}`, raw: { mock: true, action } },
    "mock",
  );
  if (result === "applied" && action === "pay") background(processPaidOrder(p.order_no));
  return { result };
});

// ---------------------------------------------------------------- admin
on("GET", /^\/admin\/fastdonate$/, async ({ req }) => {
  await requireAdmin(req);
  const c = await getFastDonateCredentials(true);
  const st = await getSetting<Record<string, unknown>>("provider_status");
  return {
    mockMode: config.mockMode, source: c.source, apiUrl: c.apiUrl,
    apiKeyMasked: maskSecret(c.apiKey), secretMasked: maskSecret(c.secret), hasApiKey: !!c.apiKey, hasSecret: !!c.secret,
    lowBalanceThreshold: config.fastdonate.lowBalanceThreshold,
    lastStatus: st ? { ...st, checkedAt: typeof st.checkedAt === "string" ? ms(st.checkedAt) : st.checkedAt } : null,
  };
});

on("PUT", /^\/admin\/fastdonate$/, async ({ req, body }) => {
  const adminId = await requireAdmin(req);
  const input: { apiUrl?: string; apiKey?: string; secret?: string } = {};
  if (typeof body.apiUrl === "string") {
    const u = body.apiUrl.trim();
    if (u && u !== "-" && !/^https:\/\/\S+$/i.test(u)) throw badRequest("INVALID_URL", "API URL https:// bilan boshlanishi kerak");
    input.apiUrl = u;
  }
  if (typeof body.apiKey === "string") input.apiKey = body.apiKey.slice(0, 512);
  if (typeof body.secret === "string") input.secret = body.secret.slice(0, 512);
  await saveFastDonateCredentials(input);
  await writeLog("info", "fastdonate_settings_updated", { adminId, fields: Object.keys(input).filter((k) => (input as Record<string, string>)[k]?.trim()) });
  return {};
});

on("POST", /^\/admin\/fastdonate\/test$/, async ({ req }) => {
  await requireAdmin(req);
  // Test rejimda ham haqiqiy akkaunt tekshiriladi (faqat o'qish)
  const provider = new FastDonateService();
  const conn = await provider.testConnection();
  let balance: { balance: number; currency: string } | null = null;
  let balanceError: string | null = null;
  if (conn.ok) {
    try {
      balance = await provider.getBalance();
    } catch (e) {
      balanceError = e instanceof ProviderError ? `${e.code}: ${e.message}` : String(e);
    }
  }
  const threshold = config.fastdonate.lowBalanceThreshold;
  const payload = {
    connected: conn.ok, message: conn.message, provider: provider.name, mock: provider.isMock,
    balance: balance?.balance ?? null, currency: balance?.currency ?? null, balanceError,
    lowBalance: balance !== null && threshold > 0 && balance.balance < threshold,
  };
  await mergeSetting("provider_status", { ...payload, checkedAt: new Date().toISOString() });
  return { ...payload, checkedAt: Date.now(), threshold };
});

/** Sinov: nik tekshirish */
on("POST", /^\/admin\/fastdonate\/check$/, async ({ req, body }) => {
  await requireAdmin(req);
  const { mlbbId, serverId } = validatePlayerInput(body.mlbbId, body.serverId);
  return await checkPlayerViaFastDonate(mlbbId, serverId);
});

/** FastDonate: siz uchun narxlar va so'nggi buyurtmalar (xom) */
on("GET", /^\/admin\/fastdonate\/prices$/, async ({ req }) => {
  await requireAdmin(req);
  return { prices: await new FastDonateService().priceList() };
});
on("GET", /^\/admin\/fastdonate\/orders$/, async ({ req }) => {
  await requireAdmin(req);
  return { orders: await new FastDonateService().recentOrders(10) };
});

/**
 * Sinov xaridi — HAQIQIY: FastDonate balansingizdan pul yechiladi, olmos ko'rsatilgan akkauntga ketadi.
 * Bizning buyurtma/balansga ta'sir qilmaydi. Xom javob logs ga yoziladi.
 */
on("POST", /^\/admin\/fastdonate\/test-order$/, async ({ req, body }) => {
  const adminId = await requireAdmin(req);
  const { mlbbId, serverId } = validatePlayerInput(body.mlbbId, body.serverId);
  if (body.confirm !== true) throw badRequest("CONFIRM_REQUIRED", "Tasdiqlang");
  const { data: product } = await db().from("products").select("name,provider_sku").eq("id", String(body.productId ?? "")).maybeSingle();
  if (!product) throw notFound("Paket topilmadi");
  const products = parseSku(product.provider_sku as string);
  if (!products.length) throw badRequest("NO_SKU", "Bu paketga FastDonate kodi berilmagan");
  const svc = new FastDonateService();
  try {
    const r = await svc.buyRaw(products, mlbbId, serverId);
    await writeLog("info", "fastdonate_buy_response", { adminId, test: true, product: product.name, products, mlbbId, serverId, response: r.body });
    return { ok: true, sentAt: r.at, request: { products, user_id: Number(mlbbId), server_id: Number(serverId) }, response: r.body };
  } catch (e) {
    const err = e instanceof ProviderError ? { code: e.code, message: e.message, details: e.details } : { code: "UNKNOWN", message: String(e) };
    await writeLog("error", "fastdonate_buy_response", { adminId, test: true, product: product.name, products, mlbbId, serverId, error: err });
    return { ok: false, error: err };
  }
});

on("POST", /^\/admin\/users\/(\d{1,20})\/tier$/, async ({ req, params, body }) => {
  const adminId = await requireAdmin(req);
  const userId = Number(params[0]);
  const tier = body.tier as Tier;
  if (tier !== "oddiy" && tier !== "bronza" && tier !== "vip") throw badRequest("INVALID_TIER", "Tarif: oddiy | bronza | vip");
  const days = body.days === undefined ? 7 : Number(body.days);
  if (!Number.isInteger(days)) throw badRequest("INVALID_DAYS", "Kunlar butun son bo‘lsin");
  const until = await rpc<string | null>("set_user_tier", { p_user_id: userId, p_tier: tier, p_days: days });
  await writeLog("info", "user_tier_set", { userId, tier, days, until, adminId });
  if (until && tier !== "oddiy") {
    await sendMessageSafe(userId, [
      `${tier === "vip" ? "👑" : "🥉"} <b>Tabriklaymiz! Sizga ${TIER_LABEL[tier]} narxlar berildi</b>`, "",
      `⏳ Amal qiladi: <b>${esc(formatDateTime(new Date(until)))}</b> gacha`, "",
      "💎 Endi Web App’da barcha paketlar siz uchun arzonroq narxda ko‘rsatiladi.",
    ].join("\n"));
  }
  return { tier, tierUntil: ms(until) };
});

/** Doimiy tarif (muddatsiz). "oddiy" — olib tashlash */
on("POST", /^\/admin\/users\/(\d{1,20})\/permanent$/, async ({ req, params, body }) => {
  const adminId = await requireAdmin(req);
  const userId = Number(params[0]);
  const tier = body.tier as Tier;
  if (tier !== "oddiy" && tier !== "bronza" && tier !== "vip") throw badRequest("INVALID_TIER", "Tarif: oddiy | bronza | vip");
  await rpc("set_permanent_tier", { p_user_id: userId, p_tier: tier });
  await writeLog("info", "user_permanent_tier_set", { userId, tier, adminId });
  if (tier !== "oddiy") {
    await sendMessageSafe(userId, [
      `${tier === "vip" ? "👑" : "🥉"} <b>Tabriklaymiz! Sizga doimiy ${TIER_LABEL[tier]} narxlar berildi</b>`, "",
      "♾ Muddatsiz — endi barcha paketlarni har doim arzonroq narxda olasiz.",
    ].join("\n"));
  }
  return { permanentTier: tier };
});

on("POST", /^\/admin\/orders\/(SLD-\d{6,})\/retry$/, async ({ req, params }) => {
  const adminId = await requireAdmin(req);
  const ok = await rpc<boolean>("retry_order", { p_order_no: params[0] });
  if (!ok) throw new HttpError(409, "RETRY_NOT_ALLOWED", "Faqat to‘langan FAILED buyurtmani qayta yuborish mumkin");
  await writeLog("info", "order_retry", { orderNo: params[0], adminId });
  background(processPaidOrder(params[0]));
  return {};
});

on("POST", /^\/admin\/orders\/(SLD-\d{6,})\/mark-success$/, async ({ req, params }) => {
  const adminId = await requireAdmin(req);
  const done = await completeOrder(params[0], adminId);
  if (!done) throw new HttpError(409, "MARK_NOT_ALLOWED", "Faqat to‘langan FAILED yoki PROCESSING buyurtmani belgilash mumkin");
  return {};
});

// ---------------------------------------------------------------- admin: balans
on("POST", /^\/admin\/topups\/(TP-\d{6,})\/approve$/, async ({ req, params, body }) => {
  const adminId = await requireAdmin(req);
  const amount = body.amount === undefined || body.amount === null || body.amount === "" ? null : Number(body.amount);
  const r = await approveTopup(params[0], amount, `admin:${adminId}`);
  if (r.result !== "approved") throw new HttpError(409, "ALREADY_DECIDED", "Bu so‘rov allaqachon ko‘rib chiqilgan");
  return { topup: publicTopup(r.topup), balance: r.balance };
});

on("POST", /^\/admin\/topups\/(TP-\d{6,})\/reject$/, async ({ req, params, body }) => {
  const adminId = await requireAdmin(req);
  const r = await rejectTopup(params[0], String(body.reason ?? ""), `admin:${adminId}`);
  if (r.result !== "rejected") throw new HttpError(409, "ALREADY_DECIDED", "Bu so‘rov allaqachon ko‘rib chiqilgan");
  return { topup: publicTopup(r.topup) };
});

/** Chek rasmi (Telegram'dan server orqali — bot token brauzerga chiqmaydi) */
on("GET", /^\/admin\/topups\/(TP-\d{6,})\/receipt$/, async ({ req, params }) => {
  await requireAdmin(req);
  if (!TOPUP_NO_RE.test(params[0])) throw notFound();
  const { data } = await db().from("topups").select("receipt_file_id").eq("topup_no", params[0]).maybeSingle();
  if (!data?.receipt_file_id) throw notFound("Chek yuklanmagan");
  const [, fileId] = splitFileRef(data.receipt_file_id as string);
  const f = await downloadTelegramFile(fileId).catch(() => null);
  if (!f) throw new HttpError(502, "RECEIPT_UNAVAILABLE", "Chekni Telegram'dan olib bo‘lmadi");
  let bin = "";
  for (let i = 0; i < f.bytes.length; i += 0x8000) bin += String.fromCharCode(...f.bytes.subarray(i, i + 0x8000));
  return { type: f.type, dataUrl: `data:${f.type};base64,${btoa(bin)}` };
});

on("POST", /^\/admin\/users\/(\d{1,20})\/balance$/, async ({ req, params, body }) => {
  const adminId = await requireAdmin(req);
  const userId = Number(params[0]);
  if (!(await getUser(userId))) throw notFound("Foydalanuvchi topilmadi");
  const balance = await adjustBalance(userId, Number(body.delta), String(body.note ?? ""), `admin:${adminId}`);
  return { balance };
});

on("POST", /^\/admin\/orders\/(SLD-\d{6,})\/refund$/, async ({ req, params }) => {
  const adminId = await requireAdmin(req);
  const r = await refundOrder(params[0], `admin:${adminId}`);
  return { balance: Number(r.balance), amount: r.amount };
});

// ---------------------------------------------------------------- payment webhooks
/** Click / Payme / Uzum webhooklari. Imzo tekshiruvi provider klassida. */
async function handleWebhook(req: Request, providerId: string): Promise<Response> {
  const provider = getPaymentProviderById(providerId);
  if (!provider) return json(req, 404, { ok: false, code: "NOT_FOUND" });
  const raw = await req.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = Object.fromEntries(new URLSearchParams(raw));
  }
  const url = new URL(req.url);
  const result = await provider.handleWebhook({ headers: req.headers, query: url.searchParams, body, rawBody: raw, ip: req.headers.get("x-forwarded-for") });
  if (result.events.length === 0 && result.httpStatus >= 400) {
    await writeLog("warn", "payment_webhook_rejected", { provider: providerId, status: result.httpStatus });
  }
  for (const ev of result.events) {
    const r = await applyPaymentEvent(ev, `webhook:${providerId}`);
    if (r === "applied" && ev.status === "PAID") {
      const { data } = await db().from("payments").select("order_no").eq("id", ev.paymentId).maybeSingle();
      if (data?.order_no) background(processPaidOrder(data.order_no));
    }
  }
  return new Response(JSON.stringify(result.body), { status: result.httpStatus, headers: { "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------- server
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";

    const wh = /^\/payments\/webhook\/([a-z0-9_-]{1,32})$/.exec(path);
    if (wh) return await handleWebhook(req, wh[1]);

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(path);
      if (!m) continue;
      // Chek rasmi uchun kattaroq so'rov ruxsat etiladi
      const body = await readJson(req, /\/receipt$/.test(path) && req.method === "POST" ? 8_000_000 : 100_000);
      const data = await r.h({ req, path, params: m.slice(1), body });
      return json(req, 200, { ok: true, ...(data as Record<string, unknown>) });
    }
    return json(req, 404, { ok: false, code: "NOT_FOUND", message: "Endpoint topilmadi" });
  } catch (e) {
    return errorResponse(req, e);
  }
}

// Testlarda (SLD_TEST=1) server ishga tushmaydi
if (!Deno.env.get("SLD_TEST")) Deno.serve(handler);
