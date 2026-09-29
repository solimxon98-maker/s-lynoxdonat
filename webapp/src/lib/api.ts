import { getSession } from "./session";
import { supabase, supabaseConfigured } from "./supabase";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : "/api");
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const apiConfigured = Boolean(import.meta.env.VITE_API_URL || SUPABASE_URL);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Options {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  /** Admin so'rovi: Supabase login tokeni yuboriladi */
  admin?: boolean;
}

/** Backend (Supabase Edge Function "api") ga so'rov */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (ANON) headers.apikey = ANON;
  if (opts.admin) {
    if (supabaseConfigured) {
      const { data } = await supabase().auth.getSession();
      if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } else {
    const s = getSession();
    if (s) headers["X-Session"] = s;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Internet aloqasini tekshiring va qayta urinib ko‘ring.");
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string };
  if (!res.ok || data.ok === false) {
    throw new ApiError(res.status, data.code ?? "ERROR", data.message ?? "Xatolik yuz berdi. Qayta urinib ko‘ring.");
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Xatolik yuz berdi";
}

export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
