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

/** Fayl bilan so'rov (sendPhoto/sendDocument) — multipart/form-data */
export async function tgUpload<T = unknown>(method: string, fields: Record<string, string>, file: { field: string; bytes: Uint8Array; name: string; type: string }): Promise<T> {
  const token = config.telegram.botToken;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan");
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append(file.field, new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.type }), file.name);
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} xatosi: ${data.description ?? res.status}`);
  return data.result as T;
}

export interface TgSentMessage {
  message_id: number;
  chat: { id: number };
  photo?: { file_id: string; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string };
}

/** Telegram faylini yuklab olish (chek rasmi admin panel uchun). Token brauzerga chiqmaydi. */
export async function downloadTelegramFile(fileId: string): Promise<{ bytes: Uint8Array; type: string }> {
  const f = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!f.file_path) throw new Error("Fayl topilmadi");
  const res = await fetch(`https://api.telegram.org/file/bot${config.telegram.botToken}/${f.file_path}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Faylni yuklab bo'lmadi: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const ext = f.file_path.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "pdf" ? "application/pdf" : "image/jpeg";
  return { bytes, type };
}
