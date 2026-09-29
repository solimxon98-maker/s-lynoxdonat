import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_bot?: boolean;
}

/**
 * Telegram Web App initData ni server tomonda tekshiradi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string, maxAgeSeconds: number): { user: TelegramWebAppUser; authDate: number } {
  if (!botToken) throw new Error("BOT_TOKEN_NOT_CONFIGURED");
  if (!initData || initData.length > 10000) throw new Error("INITDATA_MISSING");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error("INITDATA_NO_HASH");
  params.delete("hash");
  const dataCheckString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error("INITDATA_BAD_SIGNATURE");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error("INITDATA_NO_AUTH_DATE");
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) throw new Error("INITDATA_EXPIRED");

  const raw = params.get("user");
  if (!raw) throw new Error("INITDATA_NO_USER");
  let user: TelegramWebAppUser;
  try {
    user = JSON.parse(raw);
  } catch {
    throw new Error("INITDATA_BAD_USER");
  }
  if (!user || typeof user.id !== "number" || user.is_bot) throw new Error("INITDATA_BAD_USER");
  return { user, authDate };
}
