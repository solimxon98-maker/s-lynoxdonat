import { config } from "../config.ts";
import { db } from "../db.ts";

export interface FastDonateCredentials {
  apiUrl: string;
  apiKey: string;
  secret: string;
  source: "admin" | "env" | "none";
}

let cache: { value: FastDonateCredentials; at: number } | null = null;

/** Admin paneldagi qiymat (settings.fastdonate) ustun, bo'lmasa Edge secrets (FASTDONATE_*) */
export async function getFastDonateCredentials(force = false): Promise<FastDonateCredentials> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.value;
  const { data } = await db().from("settings").select("value").eq("key", "fastdonate").maybeSingle();
  const d = (data?.value ?? {}) as Partial<Record<"apiUrl" | "apiKey" | "secret", string>>;
  const apiUrl = (d.apiUrl || config.fastdonate.apiUrl || "").replace(/\/+$/, "");
  const apiKey = d.apiKey || config.fastdonate.apiKey || "";
  const secret = d.secret || config.fastdonate.secret || "";
  const source: FastDonateCredentials["source"] = d.apiUrl || d.apiKey || d.secret ? "admin" : apiUrl || apiKey ? "env" : "none";
  const value = { apiUrl, apiKey, secret, source };
  cache = { value, at: Date.now() };
  return value;
}

/** Bo'sh satr — o'zgartirmaslik, "-" — o'chirish */
export async function saveFastDonateCredentials(input: { apiUrl?: string; apiKey?: string; secret?: string }): Promise<void> {
  const { data } = await db().from("settings").select("value").eq("key", "fastdonate").maybeSingle();
  const cur = { ...((data?.value ?? {}) as Record<string, string>) };
  for (const k of ["apiUrl", "apiKey", "secret"] as const) {
    const v = input[k];
    if (typeof v !== "string" || !v.trim()) continue;
    if (v.trim() === "-") delete cur[k];
    else cur[k] = v.trim();
  }
  const { error } = await db().from("settings").upsert({ key: "fastdonate", value: cur, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cache = null;
}

export function maskSecret(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "•".repeat(v.length);
  return `${v.slice(0, 4)}${"•".repeat(Math.min(12, v.length - 8))}${v.slice(-4)}`;
}

export async function getSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const { data } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function mergeSetting(key: string, patch: Record<string, unknown>): Promise<void> {
  const cur = (await getSetting(key)) ?? {};
  await db().from("settings").upsert({ key, value: { ...cur, ...patch }, updated_at: new Date().toISOString() });
}
