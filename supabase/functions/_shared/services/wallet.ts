/**
 * Balans (hamyon).
 * Oqim: mijoz summa + kartani tanlaydi -> kartaga o'tkazadi -> chek rasmini yuboradi (Web App yoki bot)
 *       -> adminlarga botda chek + ✅/✏️/❌ tugmalari -> admin tasdiqlaydi -> balans to'ladi.
 * Pul harakati faqat SQL funksiyalarda (approve_topup, pay_order_from_balance, ...) — atomik va idempotent.
 */
import { config } from "../config.ts";
import { db, must, rpc } from "../db.ts";
import { BANK_LABEL, cardShort, esc, formatDateTime, formatSum } from "../format.ts";
import { badRequest, HttpError, notFound } from "../http.ts";
import { writeLog } from "../logger.ts";
import { type InlineButton, inlineKeyboard, sendMessageSafe, tg, tgUpload, type TgSentMessage } from "../telegramApi.ts";
import { type BalanceTx, ms, type PaymentCard, type TgUser, type Topup } from "../types.ts";

const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TOPUP_NO_RE = /^TP-\d{6,}$/;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// ------------------------------------------------------------------ o'qish

export async function listActiveCards() {
  const rows = must(
    await db().from("payment_cards").select("*").eq("active", true).order("sort_order", { ascending: true }),
    "cards",
  ) as PaymentCard[];
  return rows.map((c) => ({ id: c.id, bank: c.bank, bankLabel: BANK_LABEL[c.bank] ?? "Karta", number: c.number, holder: c.holder, note: c.note }));
}

export function publicTopup(t: Topup) {
  return {
    topupNo: t.topup_no,
    amount: t.amount,
    credited: t.credited,
    status: t.status,
    card: { bank: t.card.bank, bankLabel: BANK_LABEL[t.card.bank] ?? "Karta", number: t.card.number, holder: t.card.holder },
    hasReceipt: !!t.receipt_file_id,
    rejectReason: t.reject_reason,
    createdAt: ms(t.created_at),
    decidedAt: ms(t.decided_at),
  };
}

function publicTx(t: BalanceTx) {
  return { id: t.id, delta: Number(t.delta), balanceAfter: Number(t.balance_after), kind: t.kind, ref: t.ref, note: t.note, createdAt: ms(t.created_at) };
}

export async function getWallet(user: TgUser) {
  const [cards, topups, txs] = await Promise.all([
    listActiveCards(),
    db().from("topups").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    db().from("balance_tx").select("*").eq("user_id", user.id).order("id", { ascending: false }).limit(30),
  ]);
  return {
    balance: Number(user.balance ?? 0),
    cards,
    topups: ((must(topups, "topups") ?? []) as Topup[]).map(publicTopup),
    transactions: ((must(txs, "balance_tx") ?? []) as BalanceTx[]).map(publicTx),
  };
}

async function getTopup(no: string): Promise<Topup> {
  if (!TOPUP_NO_RE.test(no)) throw notFound("So‘rov topilmadi");
  const { data, error } = await db().from("topups").select("*").eq("topup_no", no).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("So‘rov topilmadi");
  return data as Topup;
}

export async function getOwnTopup(user: TgUser, no: string): Promise<Topup> {
  const t = await getTopup(no);
  if (t.user_id !== user.id) throw notFound("So‘rov topilmadi");
  return t;
}

// ------------------------------------------------------------------ to'ldirish

export async function createTopup(user: TgUser, input: Record<string, unknown>) {
  const amount = Number(input.amount);
  const cardId = String(input.cardId ?? "").trim();
  const idem = String(input.idempotencyKey ?? "").trim();
  if (!Number.isInteger(amount)) throw badRequest("INVALID_AMOUNT", "Summani butun son bilan kiriting.");
  if (!UUID_RE.test(cardId)) throw badRequest("INVALID_CARD", "Kartani tanlang.");
  if (!IDEMPOTENCY_RE.test(idem)) throw badRequest("INVALID_IDEMPOTENCY_KEY", "Noto‘g‘ri so‘rov.");
  const row = await rpc<Topup & { reused: boolean }>("create_topup", { p_user_id: user.id, p_amount: amount, p_card_id: cardId, p_idempotency_key: idem });
  if (!row.reused) await writeLog("info", "topup_created", { topupNo: row.topup_no, userId: user.id, amount });
  return { topup: publicTopup(row), reused: row.reused };
}

function decodeImage(dataUrl: unknown): { bytes: Uint8Array; type: string; ext: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ""));
  if (!m) throw badRequest("INVALID_IMAGE", "Chek rasmini yuklang (JPG yoki PNG).");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  } catch {
    throw badRequest("INVALID_IMAGE", "Rasmni o‘qib bo‘lmadi.");
  }
  if (bytes.length < 1000 || bytes.length > MAX_RECEIPT_BYTES) throw badRequest("INVALID_IMAGE", "Rasm hajmi 1 KB – 5 MB bo‘lishi kerak.");
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw badRequest("INVALID_IMAGE", "Faqat rasm (JPG/PNG) yuklash mumkin.");
  const type = isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";
  return { bytes, type, ext: type.split("/")[1].replace("jpeg", "jpg") };
}

/** Web App: chek rasmi (base64) -> adminlarga yuboriladi -> so'rov PENDING */
export async function uploadReceipt(user: TgUser, topupNo: string, image: unknown) {
  const t = await getOwnTopup(user, topupNo);
  if (t.status !== "AWAITING_RECEIPT" && t.status !== "PENDING") throw new HttpError(409, "TOPUP_CLOSED", "Bu so‘rov yopilgan.");
  const img = decodeImage(image);
  const { fileRef, messages } = await sendReceiptToAdmins(t, user, { upload: img });
  const row = await rpc<Topup>("attach_topup_receipt", { p_topup_no: t.topup_no, p_user_id: user.id, p_file_id: fileRef });
  await rpc("set_topup_admin_messages", { p_topup_no: t.topup_no, p_messages: [...(t.admin_messages ?? []), ...messages] });
  await writeLog("info", "topup_receipt", { topupNo: t.topup_no, userId: user.id, via: "webapp" });
  return { topup: publicTopup(row) };
}

/** Bot: foydalanuvchi chekni chatga yubordi. Chek kutilayotgan eng so'nggi so'rovga biriktiriladi. */
export async function attachReceiptFromBot(user: TgUser, fileRef: string): Promise<Topup | null> {
  const { data } = await db().from("topups").select("*").eq("user_id", user.id).eq("status", "AWAITING_RECEIPT")
    .order("created_at", { ascending: false }).limit(1);
  const t = ((data ?? []) as Topup[])[0];
  if (!t) return null;
  const { messages } = await sendReceiptToAdmins(t, user, { fileRef });
  const row = await rpc<Topup>("attach_topup_receipt", { p_topup_no: t.topup_no, p_user_id: user.id, p_file_id: fileRef });
  await rpc("set_topup_admin_messages", { p_topup_no: t.topup_no, p_messages: messages });
  await writeLog("info", "topup_receipt", { topupNo: t.topup_no, userId: user.id, via: "bot" });
  return row;
}

// ------------------------------------------------------------------ admin xabarlari

function userLabel(u: Pick<TgUser, "id" | "username" | "first_name">): string {
  return `${u.username ? `@${esc(u.username)}` : esc(u.first_name || "—")} (ID: <code>${esc(u.id)}</code>)`;
}

function topupCaption(t: Topup, u: Pick<TgUser, "id" | "username" | "first_name">, footer: string): string {
  return [
    `🧾 <b>HISOBNI TO‘LDIRISH</b> #${esc(t.topup_no)}`, "",
    `👤 ${userLabel(u)}`,
    `💰 Summa: <b>${esc(formatSum(t.amount))}</b>`,
    `💳 Karta: ${esc(cardShort(t.card))}`,
    `🕒 ${esc(formatDateTime(new Date(t.created_at)))}`,
    config.mockMode ? "🧪 <i>Test rejim</i>" : "",
    "",
    footer,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

function decisionKeyboard(t: Topup) {
  const rows: InlineButton[][] = [
    [{ text: `✅ Tasdiqlash — ${formatSum(t.amount)}`, callback_data: `tp:a:${t.topup_no}` }],
    [{ text: "✏️ Boshqa summa", callback_data: `tp:e:${t.topup_no}` }, { text: "❌ Rad etish", callback_data: `tp:r:${t.topup_no}` }],
  ];
  return inlineKeyboard(rows);
}

const CHECK_HINT = "⚠️ Tasdiqlashdan oldin <b>bank ilovangizda pul tushganini tekshiring</b>. Soxta cheklar ko‘p uchraydi!";

/** Chekni har bir adminga yuboradi. Birinchi yuklashdan olingan file_id qolganlariga qayta ishlatiladi. */
async function sendReceiptToAdmins(
  t: Topup, u: TgUser, src: { upload: { bytes: Uint8Array; type: string; ext: string } } | { fileRef: string },
): Promise<{ fileRef: string; messages: { chat_id: string; message_id: number }[] }> {
  const admins = config.telegram.adminIds;
  if (!admins.length) throw new HttpError(503, "NO_ADMIN", "Admin sozlanmagan. Support bilan bog‘laning.");
  const caption = topupCaption(t, u, CHECK_HINT);
  const keyboard = decisionKeyboard(t).reply_markup;
  const extra = { caption, parse_mode: "HTML", reply_markup: keyboard };
  let fileRef = "fileRef" in src ? src.fileRef : "";
  const messages: { chat_id: string; message_id: number }[] = [];
  let lastError: unknown = null;

  for (const chatId of admins) {
    try {
      let m: TgSentMessage;
      if (!fileRef && "upload" in src) {
        m = await tgUpload<TgSentMessage>("sendPhoto", { chat_id: chatId, caption, parse_mode: "HTML", reply_markup: JSON.stringify(keyboard) },
          { field: "photo", bytes: src.upload.bytes, name: `${t.topup_no}.${src.upload.ext}`, type: src.upload.type });
        const best = m.photo?.[m.photo.length - 1]?.file_id;
        if (!best) throw new Error("Telegram rasmni qabul qilmadi");
        fileRef = `photo:${best}`;
      } else {
        const [kind, id] = splitFileRef(fileRef);
        m = await tg<TgSentMessage>(kind === "doc" ? "sendDocument" : "sendPhoto", { chat_id: chatId, [kind === "doc" ? "document" : "photo"]: id, ...extra });
      }
      messages.push({ chat_id: chatId, message_id: m.message_id });
    } catch (e) {
      lastError = e;
      console.warn("topup_admin_send_failed", chatId, String(e));
    }
  }
  if (!messages.length) {
    await writeLog("error", "topup_admin_send_failed", { topupNo: t.topup_no, message: String(lastError) });
    throw new HttpError(502, "RECEIPT_SEND_FAILED", "Chekni yuborib bo‘lmadi. Birozdan so‘ng qayta urinib ko‘ring.");
  }
  return { fileRef, messages };
}

export function splitFileRef(ref: string): ["photo" | "doc", string] {
  const i = ref.indexOf(":");
  const kind = ref.slice(0, i) === "doc" ? "doc" : "photo";
  return [kind, ref.slice(i + 1)];
}

/** Qarordan keyin adminlardagi xabarlarni yangilash (tugmalarni olib tashlash) */
async function closeAdminMessages(t: Topup, footer: string) {
  const u = await db().from("tg_users").select("id,username,first_name").eq("id", t.user_id).maybeSingle();
  const caption = topupCaption(t, (u.data ?? { id: t.user_id, username: null, first_name: "" }) as TgUser, footer);
  await Promise.all((t.admin_messages ?? []).map((m) =>
    tg("editMessageCaption", { chat_id: m.chat_id, message_id: m.message_id, caption, parse_mode: "HTML", reply_markup: { inline_keyboard: [] } })
      .catch((e) => console.warn("topup_edit_failed", String(e)))
  ));
}

// ------------------------------------------------------------------ qaror

export async function approveTopup(no: string, amount: number | null, by: string) {
  if (amount !== null && (!Number.isInteger(amount) || amount < 1 || amount > 50_000_000)) throw badRequest("INVALID_AMOUNT", "Noto‘g‘ri summa");
  await getTopup(no);
  const r = await rpc<{ result: string; topup: Topup; balance?: number }>("approve_topup", { p_topup_no: no, p_amount: amount, p_by: by });
  if (r.result !== "approved") return { result: r.result, topup: r.topup };
  const t = r.topup;
  await writeLog("info", "topup_approved", { topupNo: no, userId: t.user_id, credited: t.credited, by });
  await Promise.all([
    closeAdminMessages(t, `✅ <b>Tasdiqlandi:</b> ${esc(formatSum(t.credited!))} — ${esc(byLabel(by))}`),
    sendMessageSafe(t.user_id, [
      "✅ <b>Hisobingiz to‘ldirildi!</b>", "",
      `🧾 #${esc(t.topup_no)}`,
      `💰 +${esc(formatSum(t.credited!))}${t.credited !== t.amount ? ` <i>(so‘rovda: ${esc(formatSum(t.amount))})</i>` : ""}`,
      `💼 Balans: <b>${esc(formatSum(Number(r.balance)))}</b>`, "",
      "💎 Endi xohlagan olmos paketingizni balansdan sotib olishingiz mumkin!",
    ].join("\n"), walletButton()),
  ]);
  return { result: r.result, topup: t, balance: Number(r.balance) };
}

export async function rejectTopup(no: string, reason: string, by: string) {
  await getTopup(no);
  const r = await rpc<{ result: string; topup: Topup }>("reject_topup", { p_topup_no: no, p_reason: reason.slice(0, 300), p_by: by });
  if (r.result !== "rejected") return { result: r.result, topup: r.topup };
  const t = r.topup;
  await writeLog("info", "topup_rejected", { topupNo: no, userId: t.user_id, reason: t.reject_reason, by });
  const support = config.telegram.supportUsername;
  await Promise.all([
    closeAdminMessages(t, `❌ <b>Rad etildi</b> — ${esc(byLabel(by))}\nSabab: ${esc(t.reject_reason)}`),
    sendMessageSafe(t.user_id, [
      "❌ <b>To‘ldirish so‘rovi rad etildi</b>", "",
      `🧾 #${esc(t.topup_no)} — ${esc(formatSum(t.amount))}`,
      `Sabab: ${esc(t.reject_reason)}`, "",
      support ? `Xato bo‘lsa, chek bilan @${esc(support)} ga yozing.` : "Xato bo‘lsa, support bilan bog‘laning.",
    ].join("\n")),
  ]);
  return { result: r.result, topup: t };
}

function byLabel(by: string): string {
  return by.startsWith("tg:") ? `admin ${by.slice(3)}` : "admin panel";
}

export function walletButton() {
  const base = config.telegram.webAppUrl;
  if (!/^https:\/\//.test(base)) return {};
  return inlineKeyboard([[{ text: "💎 Olmos sotib olish", web_app: { url: `${base}/?p=donate` } }, { text: "💰 Balans", web_app: { url: `${base}/?p=wallet` } }]]);
}

// ------------------------------------------------------------------ xarid / qaytarish / qo'lda

export async function payOrderFromBalance(user: TgUser, orderNo: string) {
  return await rpc<{ result: "paid" | "already_paid" | "insufficient"; balance: number; need?: number }>(
    "pay_order_from_balance", { p_order_no: orderNo, p_user_id: user.id },
  );
}

export async function refundOrder(orderNo: string, by: string) {
  const r = await rpc<{ result: string; balance: number; amount: number; user_id: number }>("refund_order_to_balance", { p_order_no: orderNo, p_by: by });
  await writeLog("info", "order_refunded", { orderNo, amount: r.amount, by });
  await sendMessageSafe(r.user_id, [
    "↩️ <b>Pul balansingizga qaytarildi</b>", "",
    `Buyurtma: <b>#${esc(orderNo)}</b>`,
    `💰 +${esc(formatSum(r.amount))}`,
    `💼 Balans: <b>${esc(formatSum(Number(r.balance)))}</b>`,
  ].join("\n"), walletButton());
  return r;
}

export async function adjustBalance(userId: number, delta: number, note: string, by: string) {
  if (!Number.isInteger(delta) || delta === 0) throw badRequest("INVALID_AMOUNT", "Summa butun son va 0 dan farqli bo‘lsin");
  if (!note.trim()) throw badRequest("INVALID_AMOUNT", "Izoh (sabab) yozing");
  const balance = Number(await rpc<number>("admin_adjust_balance", { p_user_id: userId, p_delta: delta, p_note: note.slice(0, 200), p_by: by }));
  await writeLog("info", "balance_adjusted", { userId, delta, note, by });
  await sendMessageSafe(userId, [
    delta > 0 ? "💰 <b>Balansingizga pul qo‘shildi</b>" : "💰 <b>Balansingizdan pul yechildi</b>", "",
    `${delta > 0 ? "+" : "−"}${esc(formatSum(Math.abs(delta)))}`,
    `Izoh: ${esc(note)}`,
    `💼 Balans: <b>${esc(formatSum(balance))}</b>`,
  ].join("\n"));
  return balance;
}

