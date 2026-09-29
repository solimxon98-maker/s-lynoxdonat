import { config } from "../config.ts";
import { db, must, rpc } from "../db.ts";
import { badRequest, HttpError, notFound } from "../http.ts";
import { writeLog } from "../logger.ts";
import { getDonateProvider, ProviderError } from "../providers/donate/index.ts";
import { getActivePaymentProvider } from "../providers/payment/index.ts";
import { ms, type Order, type Payment, type TgUser } from "../types.ts";
import { productLabel } from "../format.ts";

const MLBB_ID_RE = /^\d{5,12}$/;
const SERVER_ID_RE = /^\d{1,6}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validatePlayerInput(mlbbId: unknown, serverId: unknown): { mlbbId: string; serverId: string } {
  const id = String(mlbbId ?? "").trim();
  const server = String(serverId ?? "").trim();
  if (!MLBB_ID_RE.test(id)) throw badRequest("INVALID_MLBB_ID", "MLBB ID faqat raqamlardan iborat bo‘lishi kerak (5–12 ta).");
  if (!SERVER_ID_RE.test(server)) throw badRequest("INVALID_SERVER_ID", "Server ID faqat raqamlardan iborat bo‘lishi kerak.");
  return { mlbbId: id, serverId: server };
}

export async function checkPlayer(mlbbId: string, serverId: string) {
  try {
    return await getDonateProvider().checkPlayer({ mlbbId, serverId });
  } catch (e) {
    if (e instanceof ProviderError && e.code === "PLAYER_NOT_FOUND") return { found: false, nickname: null, verificationSupported: true };
    await writeLog("error", "player_check_failed", {
      mlbbId, serverId, code: e instanceof ProviderError ? e.code : "UNKNOWN", message: (e as Error).message,
    });
    throw new HttpError(503, "PLAYER_CHECK_UNAVAILABLE", "Akkauntni tekshirish vaqtincha ishlamayapti. Birozdan so‘ng urinib ko‘ring.");
  }
}

/** Faol paketlar (Web App uchun) */
export async function listActiveProducts() {
  const rows = must(
    await db().from("products")
      .select("id,name,category,once_per_account,diamonds,bonus,price,price_bronze,price_vip,sort_order")
      .eq("active", true).order("sort_order", { ascending: true }),
    "products",
  ) as Record<string, unknown>[];
  return rows.map((p) => ({
    id: p.id, name: p.name, category: p.category, oncePerAccount: p.once_per_account, diamonds: p.diamonds,
    bonus: p.bonus, price: p.price, priceBronze: p.price_bronze, priceVip: p.price_vip, sortOrder: p.sort_order, active: true,
  }));
}

/**
 * Buyurtma + to'lov. Narx, tarif, 1 martalik bonus, idempotency, spam cheklovi —
 * hammasi create_order SQL funksiyasida atomik tekshiriladi. Clientdan narx olinmaydi.
 */
export async function createOrder(user: TgUser, input: Record<string, unknown>) {
  const { mlbbId, serverId } = validatePlayerInput(input.mlbbId, input.serverId);
  const productId = String(input.productId ?? "").trim();
  const idem = String(input.idempotencyKey ?? "").trim();
  if (!UUID_RE.test(productId)) throw badRequest("INVALID_PRODUCT", "Paket tanlanmagan.");
  if (!IDEMPOTENCY_RE.test(idem)) throw badRequest("INVALID_IDEMPOTENCY_KEY", "Noto‘g‘ri so‘rov.");

  // Takroriy so'rov bo'lsa player tekshiruvini qayta qilmaymiz
  const existing = await getOrderByKey(user.id, idem);
  if (existing) return await withPayment(existing, true);

  const player = await checkPlayer(mlbbId, serverId);
  if (!player.found) throw badRequest("PLAYER_NOT_FOUND", "Akkaunt topilmadi. MLBB ID va Serverni tekshiring.");

  const paymentProvider = getActivePaymentProvider();
  const donateProvider = getDonateProvider();
  const created = await rpc<{ order_no: string; payment_id: string; reused: boolean }>("create_order", {
    p_user_id: user.id,
    p_product_id: productId,
    p_mlbb_id: mlbbId,
    p_server_id: serverId,
    p_nickname: player.nickname ?? "—",
    p_idempotency_key: idem,
    p_payment_provider: paymentProvider.id,
    p_donate_provider: donateProvider.name,
    p_mock: config.mockMode,
  });

  const order = await getOrder(created.order_no);
  if (created.reused) return await withPayment(order, true);

  try {
    const pay = await paymentProvider.createPayment({
      paymentId: order.payment_id,
      orderId: order.order_no,
      amount: order.amount,
      currency: order.currency,
      description: `S-LynoxDonat #${order.order_no} — ${productLabel(order.product)}`,
      returnUrl: `${config.telegram.webAppUrl}/orders`,
    });
    must(await db().from("payments").update({ external_id: pay.externalId, pay_url: pay.payUrl, mode: pay.mode }).eq("id", order.payment_id), "payment update");
    await writeLog("info", "order_created", { orderNo: order.order_no, userId: user.id, amount: order.amount, tier: order.price_tier });
    return { order: publicOrder(order), payment: { id: order.payment_id, mode: pay.mode, payUrl: pay.payUrl, status: "PENDING" }, reused: false };
  } catch (e) {
    await db().from("payments").update({ status: "FAILED" }).eq("id", order.payment_id);
    await db().from("orders").update({
      status: "CANCELLED", payment_status: "FAILED",
      last_error: { code: "PAYMENT_CREATE_FAILED", message: (e as Error).message, at: new Date().toISOString() },
    }).eq("order_no", order.order_no);
    await writeLog("error", "payment_create_failed", { orderNo: order.order_no, message: (e as Error).message });
    throw new HttpError(502, "PAYMENT_CREATE_FAILED", "To‘lovni yaratib bo‘lmadi. Birozdan so‘ng urinib ko‘ring.");
  }
}

async function withPayment(order: Order, reused: boolean) {
  const p = (await db().from("payments").select("*").eq("id", order.payment_id).maybeSingle()).data as Payment | null;
  return {
    order: publicOrder(order),
    payment: { id: order.payment_id, mode: p?.mode ?? "in_app_mock", payUrl: p?.pay_url ?? null, status: p?.status ?? "PENDING" },
    reused,
  };
}

async function getOrderByKey(userId: number, key: string): Promise<Order | null> {
  const { data } = await db().from("orders").select("*").eq("user_id", userId).eq("idempotency_key", key).maybeSingle();
  return data as Order | null;
}

export async function getOrder(orderNo: string): Promise<Order> {
  const { data, error } = await db().from("orders").select("*").eq("order_no", orderNo).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Buyurtma topilmadi");
  return data as Order;
}

export async function listUserOrders(userId: number, limit = 50) {
  const rows = must(
    await db().from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    "orders",
  ) as Order[];
  return rows.map(publicOrder);
}

/** Clientga qaytariladigan xavfsiz ko'rinish */
export function publicOrder(o: Order) {
  return {
    id: o.order_no,
    orderNo: o.order_no,
    mlbbId: o.mlbb_id,
    serverId: o.server_id,
    nickname: o.nickname,
    product: { name: o.product.name, category: o.product.category, diamonds: o.product.diamonds, bonus: o.product.bonus },
    amount: o.amount,
    priceTier: o.price_tier,
    currency: o.currency,
    status: o.status,
    paymentStatus: o.payment_status,
    paymentId: o.payment_id,
    mock: o.mock,
    createdAt: ms(o.created_at),
    completedAt: ms(o.completed_at),
  };
}
