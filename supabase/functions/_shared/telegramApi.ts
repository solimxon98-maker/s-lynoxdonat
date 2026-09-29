import { config } from "./config.ts";

type Json = Record<string, unknown>;

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

export async function tg<T = unknown>(method: string, body: Json, token = config.telegram.botToken): Promise<T> {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} xatosi: ${data.description ?? res.status}`);
  return data.result as T;
}

export async function sendMessage(chatId: string | number, text: string, extra: Json = {}): Promise<void> {
  await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
}

/** Xato bo'lsa ham asosiy jarayonni to'xtatmaydi */
export async function sendMessageSafe(chatId: string | number, text: string, extra: Json = {}): Promise<boolean> {
  if (!config.telegram.botToken) return false;
  try {
    await sendMessage(chatId, text, extra);
    return true;
  } catch (e) {
    console.warn("telegram_send_failed", String(chatId), String(e));
    return false;
  }
}

export async function notifyAdmins(text: string): Promise<void> {
  await Promise.all(config.telegram.adminIds.map((id) => sendMessageSafe(id, text)));
}

export function inlineKeyboard(rows: InlineButton[][]): Json {
  return { reply_markup: { inline_keyboard: rows } };
}
