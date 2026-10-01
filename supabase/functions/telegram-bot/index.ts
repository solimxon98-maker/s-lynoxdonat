/**
 * Telegram bot webhook.
 * URL: https://<project>.supabase.co/functions/v1/telegram-bot
 * Har bir so'rov X-Telegram-Bot-Api-Secret-Token bilan tekshiriladi (setWebhook secret_token).
 */
import { config } from "../_shared/config.ts";
import { db } from "../_shared/db.ts";
import { esc, userTier, formatDate, formatDateTime, formatSum, ORDER_STATUS_LABEL, productLabel, TIER_LABEL } from "../_shared/format.ts";
import { safeEqual } from "../_shared/http.ts";
import { writeLog } from "../_shared/logger.ts";
import { type InlineButton, inlineKeyboard, sendMessage, tg } from "../_shared/telegramApi.ts";
import type { Order, TgUser } from "../_shared/types.ts";
import { creditReferral, parseRefPayload, REF_BRONZA_AT, REF_VIP_AT, referralLink } from "../_shared/services/referrals.ts";
import { upsertTelegramUser } from "../_shared/services/users.ts";
import { approveTopup, attachReceiptFromBot, rejectTopup } from "../_shared/services/wallet.ts";

interface TgFrom {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgFrom;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string; file_name?: string };
  reply_to_message?: TgMessage;
}
interface TgCallbackQuery {
  id: string;
  from: TgFrom;
  message?: TgMessage;
  data?: string;
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

type User = TgUser & { isNew: boolean };

const BTN = {
  donate: "💎 Donat qilish",
  orders: "📦 Buyurtmalarim",
  profile: "👤 Profil",
  help: "💬 Yordam",
  invite: "👥 Do‘st taklif qilish",
  wallet: "💰 Balans / To‘ldirish",
};

const WELCOME = ["Assalomu alaykum 👋", "", "<b>S-LynoxDonat</b> xizmatiga xush kelibsiz!", "", "Mobile Legends uchun Diamond xarid qiling."].join("\n");

function webAppUrl(route = ""): string | null {
  const base = config.telegram.webAppUrl;
  if (!/^https:\/\//.test(base)) return null;
  // GitHub Pages uchun: yo'l ?p= orqali uzatiladi (index.html uni o'qiydi)
  return route ? `${base}/?p=${encodeURIComponent(route)}` : `${base}/`;
}

function mainMenu() {
  const donateUrl = webAppUrl("donate");
  const walletUrl = webAppUrl("wallet");
  const rows: InlineButton[][] = [
    [donateUrl ? { text: BTN.donate, web_app: { url: donateUrl } } : { text: BTN.donate, callback_data: "donate" }],
    [walletUrl ? { text: BTN.wallet, web_app: { url: walletUrl } } : { text: BTN.wallet, callback_data: "profile" }],
    [{ text: BTN.orders, callback_data: "orders" }, { text: BTN.profile, callback_data: "profile" }],
    [{ text: BTN.invite, callback_data: "invite" }],
    [{ text: BTN.help, callback_data: "help" }],
  ];
  return inlineKeyboard(rows);
}
const backMenu = () => inlineKeyboard([[{ text: "⬅️ Menyu", callback_data: "menu" }]]);

async function ensureUser(from: TgFrom): Promise<User | null> {
  if (from.is_bot) return null;
  return await upsertTelegramUser(from);
}

async function onMessage(msg: TgMessage) {
  if (!msg.from || msg.chat.type !== "private") return;
  const user = await ensureUser(msg.from);
  if (!user) return;
  const chatId = msg.chat.id;
  if (user.blocked) return void (await sendMessage(chatId, "⛔ Hisobingiz bloklangan. Savollar bo‘yicha support bilan bog‘laning."));

  // Admin: "✏️ Boshqa summa" so'roviga javob
  if (isAdmin(user.id) && msg.reply_to_message?.text && /#(TP-\d{6,})/.test(msg.reply_to_message.text)) {
    return await onAdminAmountReply(msg, user);
  }

  // Chek rasmi (to'lov cheki)
  const imageDoc = msg.document && /^image\/|^application\/pdf$/.test(msg.document.mime_type ?? "") ? msg.document : null;
  if (msg.photo?.length || imageDoc) {
    const ref = msg.photo?.length ? `photo:${msg.photo[msg.photo.length - 1].file_id}` : `doc:${imageDoc!.file_id}`;
    const t = await attachReceiptFromBot(user, ref).catch(async (e) => {
      await writeLog("error", "bot_receipt_failed", { userId: user.id, message: (e as Error).message });
      return "error" as const;
    });
    if (t === "error") return void (await sendMessage(chatId, "⚠️ Chekni qabul qilib bo‘lmadi. Birozdan so‘ng qayta yuboring."));
    if (!t) {
      const url = webAppUrl("wallet");
      return void (await sendMessage(chatId, "🧾 Avval Web App’da <b>«Hisobni to‘ldirish»</b> ni bosib, summa va kartani tanlang. So‘ng chek rasmini yuboring.",
        url ? inlineKeyboard([[{ text: BTN.wallet, web_app: { url } }]]) : {}));
    }
    return void (await sendMessage(chatId, [
      "✅ <b>Chek qabul qilindi!</b>", "",
      `🧾 #${esc(t.topup_no)} — ${esc(formatSum(t.amount))}`,
      "⏳ Admin tekshirgach, balansingiz avtomatik to‘ldiriladi va sizga xabar keladi.",
    ].join("\n")));
  }

  const text = (msg.text ?? "").trim();
  const cmd = text.split(/\s+/)[0].split("@")[0];

  // Taklif havolasi: /start ref_<id> — faqat botga birinchi marta kirgan odam hisoblanadi
  if (cmd === "/start") {
    const refId = parseRefPayload(text);
    if (refId) await creditReferral(user, refId).catch((e) => console.error("referral_failed", e));
  }

  if (cmd === "/orders" || text === BTN.orders) return await sendOrders(chatId, user);
  if (cmd === "/profile" || cmd === "/balance" || text === BTN.profile) return await sendProfile(chatId, user);
  if (cmd === "/help" || text === BTN.help) return await sendHelp(chatId);
  if (cmd === "/invite" || text === BTN.invite) return await sendInvite(chatId, user);
  if (text === BTN.donate) return await sendDonate(chatId);
  await sendMessage(chatId, WELCOME, mainMenu());
}

const isAdmin = (id: number) => config.telegram.adminIds.includes(String(id));

/** Admin tugmalari: tp:a:<no> tasdiqlash, tp:r:<no> rad etish, tp:e:<no> boshqa summa */
async function onTopupCallback(cq: TgCallbackQuery) {
  const m = /^tp:([are]):(TP-\d{6,})$/.exec(cq.data ?? "");
  if (!m || !isAdmin(cq.from.id)) {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Ruxsat yo‘q", show_alert: true }).catch(() => undefined);
    return;
  }
  const [, action, no] = m;
  const by = `tg:${cq.from.id}`;
  if (action === "e") {
    await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
    await sendMessage(cq.from.id, `✏️ #${no} — kartaga <b>haqiqatda tushgan</b> summani yozing (faqat raqam, masalan: 48000).\n\nShu xabarga javob (reply) qilib yuboring.`,
      { reply_markup: { force_reply: true, input_field_placeholder: "Masalan: 48000" } });
    return;
  }
  try {
    const r = action === "a" ? await approveTopup(no, null, by) : await rejectTopup(no, "Pul kartaga tushmadi yoki chek noto‘g‘ri", by);
    const text = r.result === "approved" ? "✅ Tasdiqlandi" : r.result === "rejected" ? "❌ Rad etildi" : "Bu so‘rov allaqachon ko‘rib chiqilgan";
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text }).catch(() => undefined);
  } catch (e) {
    await writeLog("error", "topup_decision_failed", { no, action, message: (e as Error).message });
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Xatolik: " + (e as Error).message.slice(0, 150), show_alert: true }).catch(() => undefined);
  }
}

async function onAdminAmountReply(msg: TgMessage, user: User) {
  const no = /#(TP-\d{6,})/.exec(msg.reply_to_message!.text!)![1];
  const amount = Number((msg.text ?? "").replace(/[\s,.’'`]/g, ""));
  if (!Number.isInteger(amount) || amount < 1) {
    return void (await sendMessage(msg.chat.id, "⚠️ Summani faqat raqam bilan yozing, masalan: <code>48000</code>. Qaytadan «✏️ Boshqa summa» ni bosing."));
  }
  try {
    const r = await approveTopup(no, amount, `tg:${user.id}`);
    await sendMessage(msg.chat.id, r.result === "approved"
      ? `✅ #${esc(no)} tasdiqlandi: <b>${esc(formatSum(amount))}</b> balansga qo‘shildi.`
      : `ℹ️ #${esc(no)} allaqachon ko‘rib chiqilgan.`);
  } catch (e) {
    await sendMessage(msg.chat.id, `⚠️ Xatolik: ${esc((e as Error).message)}`);
  }
}

async function onCallback(cq: TgCallbackQuery) {
  if (cq.data?.startsWith("tp:")) return await onTopupCallback(cq);
  const chatId = cq.message?.chat.id ?? cq.from.id;
  await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
  const user = await ensureUser(cq.from);
  if (!user) return;
  if (user.blocked) return void (await sendMessage(chatId, "⛔ Hisobingiz bloklangan. Savollar bo‘yicha support bilan bog‘laning."));
  switch (cq.data) {
    case "orders": return await sendOrders(chatId, user);
    case "profile": return await sendProfile(chatId, user);
    case "help": return await sendHelp(chatId);
    case "donate": return await sendDonate(chatId);
    case "invite": return await sendInvite(chatId, user);
    default: await sendMessage(chatId, WELCOME, mainMenu());
  }
}

async function sendDonate(chatId: number) {
  const url = webAppUrl("donate");
  if (!url) return void (await sendMessage(chatId, "⚙️ Web App hali sozlanmagan. Iltimos, birozdan so‘ng urinib ko‘ring."));
  await sendMessage(chatId, "💎 Donat qilish uchun quyidagi tugmani bosing:", inlineKeyboard([[{ text: BTN.donate, web_app: { url } }]]));
}

async function sendOrders(chatId: number, user: User) {
  const { data } = await db().from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
  const orders = (data ?? []) as Order[];
  if (!orders.length) return void (await sendMessage(chatId, "📦 Sizda hali buyurtmalar yo‘q.\n\n💎 Birinchi donatingizni hoziroq qiling!", mainMenu()));
  const lines = orders.map((o) => [
    `<b>#${esc(o.order_no)}</b>`,
    `💎 ${esc(productLabel(o.product))}`,
    esc(formatSum(o.amount)),
    `Status: ${ORDER_STATUS_LABEL[o.status] ?? esc(o.status)}`,
    `Sana: ${formatDate(new Date(o.created_at))}`,
  ].join("\n"));
  const rows: InlineButton[][] = [];
  const url = webAppUrl("orders");
  if (url) rows.push([{ text: "📋 Barcha buyurtmalar", web_app: { url } }]);
  rows.push([{ text: "⬅️ Menyu", callback_data: "menu" }]);
  await sendMessage(chatId, `📦 <b>So‘nggi buyurtmalar</b>\n\n${lines.join("\n\n")}`, inlineKeyboard(rows));
}

function tierLine(u: TgUser): string {
  const { tier: t, permanent } = userTier(u);
  if (permanent) return `🏷 Tarif: <b>${TIER_LABEL[t]}</b> ♾ doimiy`;
  if (t === "oddiy") return "🏷 Tarif: Oddiy\n👥 Botga 5 ta do‘st taklif qiling — 🥉 Bronza, 10 ta — 👑 VIP narx!";
  return `🏷 Tarif: <b>${TIER_LABEL[t]}</b>\n⏳ ${esc(formatDateTime(new Date(u.tier_until!)))} gacha`;
}

async function sendProfile(chatId: number, u: User) {
  await sendMessage(chatId, [
    "👤 <b>Profil</b>", "",
    `Ism: ${esc(u.first_name)}`,
    `Username: ${u.username ? `@${esc(u.username)}` : "—"}`,
    `Telegram ID: <code>${esc(u.id)}</code>`, "",
    `💼 Balans: <b>${esc(formatSum(Number(u.balance ?? 0)))}</b>`, "",
    tierLine(u),
    `👥 Taklif qilgan do‘stlar: ${u.referrals_total} (hisob: ${u.referral_cycle}/${REF_VIP_AT})`, "",
    `📦 Buyurtmalar soni: ${u.orders_count}`,
    `💰 Umumiy xarajat: ${esc(formatSum(Number(u.total_spent)))}`,
    `📅 Ro‘yxatdan o‘tgan: ${formatDate(new Date(u.created_at))}`,
  ].join("\n"), backMenu());
}

async function sendInvite(chatId: number, u: User) {
  const link = await referralLink(u.id);
  const cycle = u.referral_cycle;
  const vip = userTier(u).tier === "vip";
  const next = cycle < REF_BRONZA_AT && !vip ? REF_BRONZA_AT : REF_VIP_AT;
  const bar = Array.from({ length: REF_VIP_AT }, (_, i) => (i < cycle ? "🟦" : "⬜")).join("");
  const text = [
    "👥 <b>Do‘st taklif qiling — arzon narxda oling!</b>", "",
    `🥉 ${REF_BRONZA_AT} ta do‘st — <b>Bronza</b> narx, 1 hafta`,
    `👑 ${REF_VIP_AT} ta do‘st — <b>VIP</b> narx, 1 hafta`,
    `🔁 Har keyingi ${REF_VIP_AT} ta — VIP yana +1 hafta`, "",
    `${bar}  ${cycle}/${REF_VIP_AT}`,
    `${next === REF_BRONZA_AT ? "🥉 Bronza" : "👑 VIP"}gacha yana <b>${next - cycle}</b> ta · jami: ${u.referrals_total}`, "",
    link ? `🔗 Sizning havolangiz:\n<code>${esc(link)}</code>` : "⚙️ Havola hali tayyor emas.", "",
    "ℹ️ Faqat botga birinchi marta kirgan yangi odamlar hisoblanadi.",
  ].join("\n");
  const rows: InlineButton[][] = [];
  if (link) {
    rows.push([{ text: "📤 Do‘stlarga yuborish", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("💎 MLBB almazlarni arzon va tez — S-LynoxDonat!")}` }]);
  }
  rows.push([{ text: "⬅️ Menyu", callback_data: "menu" }]);
  await sendMessage(chatId, text, inlineKeyboard(rows));
}

async function sendHelp(chatId: number) {
  const support = config.telegram.supportUsername;
  const rows: InlineButton[][] = [];
  if (support) rows.push([{ text: "✉️ Supportga yozish", url: `https://t.me/${support}` }]);
  rows.push([{ text: "⬅️ Menyu", callback_data: "menu" }]);
  await sendMessage(chatId, [
    "💬 <b>Yordam</b>", "",
    "1️⃣ «💎 Donat qilish» tugmasini bosing",
    "2️⃣ MLBB ID va Server ID ni kiriting",
    "3️⃣ Akkauntni tekshiring va paketni tanlang",
    "4️⃣ Balansdan to‘lang — diamondlar avtomatik yuboriladi", "",
    "💰 <b>Balansni to‘ldirish:</b> «💰 Balans» → summa va karta → kartaga o‘tkazing → chek rasmini yuboring. Admin tasdiqlagach balans to‘ladi.", "",
    "MLBB ID va Server ID ni o‘yinda profil rasmingizni bosib ko‘rishingiz mumkin.", "",
    "⚠️ 🇷🇺 Ru va 🇹🇷 Turk akkauntlariga donat mavjud emas.", "",
    support ? `Savollar bo‘yicha: @${esc(support)}` : "Savollar bo‘yicha support bilan bog‘laning.",
  ].join("\n"), inlineKeyboard(rows));
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const expected = config.telegram.webhookSecret;
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !safeEqual(got, expected)) {
    await writeLog("warn", "telegram_webhook_rejected", {});
    return new Response("Unauthorized", { status: 401 });
  }
  let update: TgUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }
  try {
    if (update.message) await onMessage(update.message);
    else if (update.callback_query) await onCallback(update.callback_query);
  } catch (e) {
    await writeLog("error", "bot_update_failed", { updateId: update.update_id, message: (e as Error).message });
  }
  // Telegram qayta yubormasligi uchun har doim 200
  return new Response("ok");
}

// Testlarda (SLD_TEST=1) server ishga tushmaydi
if (!Deno.env.get("SLD_TEST")) Deno.serve(handler);
