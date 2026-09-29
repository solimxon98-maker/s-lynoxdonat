import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase mijozi — FAQAT admin panel uchun (email/parol login + RLS himoyalangan jadvallar).
 * Anon key ommaviy kalit, u brauzerda bo'lishi normal. Maxfiy kalitlar faqat Edge Functions'da.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error("Supabase sozlanmagan (webapp/.env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)");
  client ??= createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
