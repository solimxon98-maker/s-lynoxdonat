import { config } from "../../config.ts";
import { db } from "../../db.ts";
import { type FastDonateCredentials, getFastDonateCredentials } from "../../services/settings.ts";
import { checkPlayerViaFastDonate } from "./playerCheck.ts";
import {
  type BalanceResult,
  type CheckPlayerInput,
  type CheckPlayerResult,
  type ConnectionResult,
  type CreateOrderInput,
  type DonateProvider,
  ProviderError,
  type ProviderOrderResult,
} from "./types.ts";

/**
 * FastDonateService — fastdonate.su bilan haqiqiy integratsiya.
 *
 * Manba: fastdonate.su saytining o'z (ommaviy) kodi — sayt aynan shu so'rovlarni yuboradi:
 *   POST {api}/auth/login          { username, password }          -> data.access_token | data.token
 *   GET  {api}/auth/me             (Bearer)                        -> data.balance (so'm)
 *   GET  {api}/merchant/check_ml?user_id=&server_id=               -> data.name
 *   POST {api}/merchant/buy        (Bearer) { products:[{id,count}], user_id:number, server_id:number }
 *   GET  {api}/profile/orders?page=&limit= (Bearer)                -> data.orders[{id,status,user_id,server_id,diamonds,created_at}], status 1 = bajarildi
 * Javob formati: { success: true, data } | { success: false, error: { code, message } }
 *
 * Login/parol: admin panel → FastDonate ("Login" / "Parol") yoki FASTDONATE_API_KEY / FASTDONATE_SECRET.
 * Paket: products.provider_sku — FastDonate paket ID si, soni bilan: "5" yoki "6x2".
 *
 * ⚠️ /merchant/buy javobida buyurtma ID si bor-yo'qligi hali tasdiqlanmagan — shuning uchun holat
 * /profile/orders dan (shu MLBB ID + server, xariddan keyingi vaqt) aniqlanadi. Birinchi sinov xaridida
 * xom javob logs jadvaliga yoziladi (event: fastdonate_buy_response).
 */

const ORDER_WAIT_MS = 20 * 60_000; // shu vaqt ichida "bajarildi" bo'lmasa — FAILED (admin tekshiradi)
let tokenCache: { token: string; key: string } | null = null;

export interface FdOrderRow {
  id: number | string;
  status: number;
  user_id?: number | string;
  server_id?: number | string;
  diamonds?: number;
  created_at?: string;
}

export function parseSku(sku: string | null | undefined): { id: number; count: number }[] {
  const s = String(sku ?? "").trim();
  if (!s) return [];
  return s.split(/[,+;]\s*/).map((part) => {
    const m = /^(\d{1,6})(?:\s*[x×*]\s*(\d{1,2}))?$/i.exec(part.trim());
    if (!m) throw new ProviderError("INVALID_PRODUCT", `Noto'g'ri FastDonate paket kodi: "${part}". Masalan: 5 yoki 6x2`);
    return { id: Number(m[1]), count: m[2] ? Number(m[2]) : 1 };
  });
}

export class FastDonateService implements DonateProvider {
  readonly name = "fastdonate";
  readonly isMock = false;

  // ------------------------------------------------------------------ API

  async checkPlayer(input: CheckPlayerInput): Promise<CheckPlayerResult> {
    return await checkPlayerViaFastDonate(input.mlbbId, input.serverId);
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrderResult> {
    const products = parseSku(input.providerSku);
    if (!products.length) {
      throw new ProviderError("INVALID_PRODUCT", `"${input.productName}" paketiga FastDonate kodi berilmagan (admin panel → Paketlar → Provider SKU)`);
    }
    const count = products.reduce((a, p) => a + p.count, 0);
    // Javob: { success: true, data: { message: "ok" } } — buyurtma ID qaytmaydi, FastDonate darhol bajaradi.
    const r = await this.buyRaw(products, input.mlbbId, input.serverId);
    const base = `FD:${r.at}:${input.mlbbId}:${input.serverId}:${count}`;
    // Odatda buyurtma tarixida darhol "status 1" bilan paydo bo'ladi
    for (const wait of [1500, 3000]) {
      await new Promise((res) => setTimeout(res, wait));
      const done = await this.checkOrder(base).catch(() => null);
      if (done?.status === "SUCCESS") return { ...done, raw: r.body ?? undefined };
    }
    return { providerOrderId: base, status: "PROCESSING", message: "FastDonate buyurtmani qabul qildi", raw: r.body ?? undefined };
  }

  /**
   * Holat — /profile/orders dan: shu MLBB ID + server, xariddan keyin yaratilgan, boshqa buyurtmamizga
   * biriktirilmagan qatorlar. "6x2" kabi paketda FastDonate har bir dona uchun alohida qator yozadi.
   */
  async checkOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    const m = /^FD:(\d+):(\d+):(\d+)(?::(\d+))?(?::([\d,]+))?$/.exec(providerOrderId);
    if (!m) throw new ProviderError("PROVIDER_ERROR", `Noma'lum FastDonate buyurtma ID: ${providerOrderId}`);
    if (m[5]) return { providerOrderId, status: "SUCCESS", message: "FastDonate: bajarildi" };
    const at = Number(m[1]);
    const count = Number(m[4] ?? 1);
    const [orders, claimed] = await Promise.all([this.recentOrders(50), claimedFdIds(providerOrderId)]);
    const mine = orders
      .filter((o) => String(o.user_id) === m[2] && String(o.server_id) === m[3] && !claimed.has(String(o.id)) && createdAfter(o.created_at, at))
      .sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))
      .slice(0, count);
    if (mine.length >= count && mine.every((o) => Number(o.status) === 1)) {
      return { providerOrderId: `FD:${m[1]}:${m[2]}:${m[3]}:${count}:${mine.map((o) => o.id).join(",")}`, status: "SUCCESS", message: "FastDonate: bajarildi" };
    }
    if (Date.now() - at > ORDER_WAIT_MS) {
      return {
        providerOrderId,
        status: "FAILED",
        message: mine.length
          ? `FastDonate'da buyurtma bajarilmadi (status: ${mine.map((o) => o.status).join(",")}). Saytda tekshiring.`
          : "FastDonate'da buyurtma topilmadi. Saytdagi buyurtmalar tarixida tekshiring.",
      };
    }
    return { providerOrderId, status: "PROCESSING", message: "FastDonate: bajarilmoqda" };
  }

  async getBalance(): Promise<BalanceResult | null> {
    const r = await this.authed("GET", "/auth/me");
    const d = (r.data ?? {}) as Record<string, unknown>;
    const balance = Number(d.balance);
    if (!Number.isFinite(balance)) return null;
    return { balance, currency: "UZS" };
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const me = await this.authed("GET", "/auth/me");
      const d = (me.data ?? {}) as Record<string, unknown>;
      return { ok: true, message: `Ulandi: ${d.username ?? "?"} (${d.role ?? "user"}). Balans: ${d.balance ?? "?"} so'm` };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError("PROVIDER_ERROR", String(e));
      return { ok: false, message: `${err.code}: ${err.message}` };
    }
  }

  // ------------------------------------------------------------------ admin uchun (sinov)

  /** Xom xarid — javob o'zgarishsiz qaytadi (admin sinov xaridi uchun) */
  async buyRaw(products: { id: number; count: number }[], mlbbId: string, serverId: string) {
    const at = Date.now();
    const r = await this.authed("POST", "/merchant/buy", { products, user_id: Number(mlbbId), server_id: Number(serverId) });
    return { at, data: r.data, body: r.body };
  }

  async recentOrders(limit = 20): Promise<FdOrderRow[]> {
    const r = await this.authed("GET", `/profile/orders?page=1&limit=${limit}`);
    const d = (r.data ?? {}) as Record<string, unknown>;
    return (Array.isArray(d.orders) ? d.orders : Array.isArray(r.data) ? r.data : []) as FdOrderRow[];
  }

  async priceList(): Promise<{ id: number; name: string; price: number; type: number }[]> {
    const r = await this.authed("GET", "/merchant/price_list");
    const d = (r.data ?? {}) as Record<string, unknown>;
    return (Array.isArray(d.prices) ? d.prices : []) as { id: number; name: string; price: number; type: number }[];
  }

  // ------------------------------------------------------------------ transport

  private async creds(): Promise<FastDonateCredentials> {
    const c = await getFastDonateCredentials();
    if (!c.apiKey || !c.secret) {
      throw new ProviderError("NOT_CONFIGURED", "FastDonate login yoki paroli kiritilmagan (admin panel → FastDonate)");
    }
    return { ...c, apiUrl: c.apiUrl || "https://api.fastdonate.su" };
  }

  private async login(c: FastDonateCredentials): Promise<string> {
    const r = await this.send(c.apiUrl, "POST", "/auth/login", { username: c.apiKey, password: c.secret }, null);
    const d = (r.data ?? {}) as Record<string, unknown>;
    const token = (d.access_token ?? d.token) as string | undefined;
    if (!token) throw new ProviderError("NOT_CONFIGURED", "FastDonate login javobida token yo'q");
    tokenCache = { token, key: `${c.apiUrl}|${c.apiKey}|${c.secret.length}` };
    return token;
  }

  /** Login bilan so'rov; 401 bo'lsa bir marta qayta login (tarmoq xatosida qayta yuborilmaydi — xarid ikki marta ketmasin). */
  private async authed(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
    const c = await this.creds();
    const key = `${c.apiUrl}|${c.apiKey}|${c.secret.length}`;
    let token = tokenCache?.key === key ? tokenCache.token : await this.login(c);
    try {
      return await this.send(c.apiUrl, method, path, body, token);
    } catch (e) {
      if (e instanceof ProviderError && e.details.status === 401) {
        tokenCache = null;
        token = await this.login(c);
        return await this.send(c.apiUrl, method, path, body, token);
      }
      throw e;
    }
  }

  private async send(base: string, method: "GET" | "POST", path: string, body: Record<string, unknown> | undefined, token: string | null) {
    const url = `${base.replace(/\/+$/, "")}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(config.fastdonate.timeoutMs),
      });
    } catch (e) {
      const n = (e as Error)?.name;
      if (n === "TimeoutError" || n === "AbortError") {
        throw new ProviderError("TIMEOUT", `FastDonate ${config.fastdonate.timeoutMs / 1000} soniyada javob bermadi (${path})`, { path });
      }
      throw new ProviderError("NETWORK", `FastDonate bilan aloqa xatosi: ${(e as Error)?.message}`, { path });
    }
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new ProviderError("PROVIDER_ERROR", `FastDonate tushunarsiz javob (HTTP ${res.status})`, { status: res.status, path });
    }
    if (!res.ok || json?.success === false) {
      const err = (json?.error ?? {}) as Record<string, unknown>;
      const msg = String(err.message ?? json?.message ?? json?.detail ?? `HTTP ${res.status}`);
      const code = String(err.code ?? "");
      const details = { status: res.status, path, code };
      if (res.status === 401) throw new ProviderError("NOT_CONFIGURED", `FastDonate: login/parol noto'g'ri yoki sessiya tugagan (${msg})`, details);
      if (/balan|insufficient|mablag|yetarli/i.test(`${code} ${msg}`)) throw new ProviderError("INSUFFICIENT_BALANCE", `FastDonate balansi yetarli emas: ${msg}`, details);
      if (path.startsWith("/merchant/buy")) throw new ProviderError("ORDER_FAILED", `FastDonate buyurtmani rad etdi: ${msg}`, details);
      throw new ProviderError("PROVIDER_ERROR", `FastDonate: ${msg}`, details);
    }
    const data = json && typeof json === "object" && "data" in json ? json.data : json;
    return { data, body: json };
  }
}

/** FastDonate vaqti zonasiz bo'lishi mumkin — UTC va Toshkent (UTC+5) sifatida ham tekshiriladi */
function createdAfter(createdAt: string | undefined, buyAt: number): boolean {
  if (!createdAt) return false;
  const slack = 60_000;
  const asIs = Date.parse(createdAt);
  const hasTz = /[zZ]|[+-]\d\d:?\d\d$/.test(createdAt);
  const candidates = hasTz ? [asIs] : [Date.parse(createdAt + "Z"), Date.parse(createdAt + "+05:00")];
  return candidates.some((t) => Number.isFinite(t) && t >= buyAt - slack && t <= buyAt + ORDER_WAIT_MS + slack);
}

/** Boshqa buyurtmalarimizga allaqachon biriktirilgan FastDonate qatorlari (bitta o'yinchiga ketma-ket xarid bo'lsa adashmaslik uchun) */
async function claimedFdIds(self: string): Promise<Set<string>> {
  const since = new Date(Date.now() - 2 * 86400_000).toISOString();
  const { data } = await db().from("orders").select("provider_order_id").gte("updated_at", since);
  const out = new Set<string>();
  for (const r of (data ?? []) as { provider_order_id: string | null }[]) {
    const v = r.provider_order_id ?? "";
    if (!v.startsWith("FD:") || v === self) continue;
    const ids = v.split(":")[5];
    if (ids) ids.split(",").forEach((x) => out.add(x));
  }
  return out;
}
