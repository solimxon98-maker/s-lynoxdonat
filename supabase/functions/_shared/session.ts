import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { config } from "./config.ts";

/**
 * Web App sessiyasi: initData server tomonda tekshirilgandan keyin beriladigan imzolangan token.
 * Format: base64url(JSON{u: telegramId, e: expiry}) . base64url(HMAC-SHA256)
 * Frontend yuborgan Telegram ID ga emas, faqat shu tokenga ishoniladi.
 */
const TTL_SECONDS = 24 * 3600;

function sign(payload: string): string {
  if (!config.sessionSecret || config.sessionSecret.length < 32) throw new Error("SESSION_SECRET kamida 32 belgi bo'lishi kerak");
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

export function issueSession(telegramId: number): { token: string; expiresAt: number } {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ u: telegramId, e: exp })).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresAt: exp * 1000 };
}

export function verifySession(token: string | null): number | null {
  if (!token || token.length > 500) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof u !== "number" || typeof e !== "number" || e * 1000 < Date.now()) return null;
    return u;
  } catch {
    return null;
  }
}
