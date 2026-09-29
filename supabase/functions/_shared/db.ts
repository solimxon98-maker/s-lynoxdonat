import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { config } from "./config.ts";
import { HttpError } from "./http.ts";

let client: SupabaseClient | null = null;

/** Faqat testlar uchun: mijozni almashtirish */
export function setDbClientForTests(c: unknown) {
  client = c as SupabaseClient;
}

/** service_role mijoz — RLS'ni chetlab o'tadi. FAQAT serverda. */
export function db(): SupabaseClient {
  client ??= createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

const CODE_STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_ORDERS: 429,
  PRODUCT_INACTIVE: 409,
  ONCE_PER_ACCOUNT: 409,
  INVALID_TIER: 400,
  INVALID_DAYS: 400,
};

/** SQL funksiyani chaqiradi. "KOD: matn" ko'rinishidagi xatolarni HttpError ga aylantiradi. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    const m = /^([A-Z_]+): (.*)$/s.exec(error.message ?? "");
    if (m && CODE_STATUS[m[1]]) throw new HttpError(CODE_STATUS[m[1]], m[1], m[2]);
    throw new Error(`DB ${fn}: ${error.message}`);
  }
  return data as T;
}

/** Supabase so'rovidan xatoni tashlaydi */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`DB ${what}: ${res.error.message}`);
  return res.data as T;
}
