import { db, rpc } from "../db.ts";
import { forbidden } from "../http.ts";
import type { TgUser } from "../types.ts";

export interface TelegramUserInput {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

/** Telegram foydalanuvchisini yaratadi/yangilaydi. isNew — botga birinchi marta kirdi. */
export async function upsertTelegramUser(u: TelegramUserInput): Promise<TgUser & { isNew: boolean }> {
  const rows = await rpc<{ user_row: TgUser; is_new: boolean }[]>("upsert_tg_user", {
    p_id: u.id,
    p_username: u.username ?? null,
    p_first_name: u.first_name ?? "",
    p_last_name: u.last_name ?? null,
    p_language_code: u.language_code ?? null,
    p_photo_url: u.photo_url ?? null,
  });
  const r = rows[0];
  return { ...r.user_row, isNew: r.is_new };
}

export async function getUser(id: number): Promise<TgUser | null> {
  const { data, error } = await db().from("tg_users").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as TgUser | null;
}

export async function requireActiveUser(id: number): Promise<TgUser> {
  const u = await getUser(id);
  if (!u) throw forbidden("Foydalanuvchi topilmadi. Web Appni Telegram orqali qayta oching.");
  if (u.blocked) throw forbidden("Hisobingiz bloklangan. Support bilan bog‘laning.");
  return u;
}
