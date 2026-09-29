import { config } from "../../config.ts";
import { type CheckPlayerResult, ProviderError } from "./types.ts";

/**
 * MLBB akkauntini FastDonate orqali tekshirish (login talab qilinmaydi).
 * Manba: fastdonate.su saytining o'z kodi — GET {api}/merchant/check_ml?user_id=&server_id=
 * Javob: { success: true, data: { name } }  |  noto'g'ri ID: { success: false, error: {...} }
 */
export async function checkPlayerViaFastDonate(mlbbId: string, serverId: string): Promise<CheckPlayerResult> {
  const base = (config.fastdonate.apiUrl || "https://api.fastdonate.su").replace(/\/+$/, "");
  const url = `${base}/merchant/check_ml?user_id=${encodeURIComponent(mlbbId)}&server_id=${encodeURIComponent(serverId)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  } catch (e) {
    const n = (e as Error)?.name;
    throw new ProviderError(n === "TimeoutError" || n === "AbortError" ? "TIMEOUT" : "NETWORK", `FastDonate: ${(e as Error)?.message}`);
  }
  const text = await res.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderError("PROVIDER_ERROR", `FastDonate: tushunarsiz javob (HTTP ${res.status})`);
  }
  if (body && body.success === true) {
    const d = (body.data ?? body) as Record<string, unknown>;
    const inner = (d.data ?? {}) as Record<string, unknown>;
    const name = [d.name, inner.name, d.username, d.nickname].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    if (name) return { found: true, nickname: name.trim(), verificationSupported: true };
    return { found: false, nickname: null, verificationSupported: true };
  }
  if (body && body.success === false) return { found: false, nickname: null, verificationSupported: true };
  throw new ProviderError("PROVIDER_ERROR", `FastDonate HTTP ${res.status}`);
}
