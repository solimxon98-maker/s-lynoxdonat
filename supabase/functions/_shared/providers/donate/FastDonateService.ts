import { config } from "../../config.ts";
import { FastDonateCredentials, getFastDonateCredentials } from "../../services/settings.ts";
import {
  BalanceResult,
  CheckPlayerInput,
  CheckPlayerResult,
  ConnectionResult,
  CreateOrderInput,
  DonateProvider,
  ProviderError,
  ProviderOrderResult,
} from "./types.ts";

/**
 * FastDonateService — fastdonate.su bilan HAQIQIY integratsiya (MOCK_MODE=false).
 *
 * ⚠️ HOLAT: fastdonate.su ning ommaviy API hujjati topilmadi. Endpointlar, autentifikatsiya
 * sxemasi va javob formatlari TAXMIN QILINMAGAN. Shuning uchun quyidagi 4 ta "INTEGRATSIYA NUQTASI"
 * API hujjati kelgunga qadar NOT_IMPLEMENTED xatosini qaytaradi. Buyurtmalar yo'qolmaydi —
 * ular FAILED holatiga o'tadi va admin paneldan "Qayta yuborish" mumkin.
 *
 * Hujjat kelganda faqat shu fayl o'zgaradi:
 *   1. authHeaders()      — API key / secret / imzo qanday yuborilishi
 *   2. checkPlayer()      — player tekshirish endpointi va javobni map qilish
 *   3. createOrder()      — buyurtma yaratish endpointi (externalId = idempotency)
 *   4. checkOrder()       — buyurtma holatini olish
 *   5. getBalance()       — balans endpointi
 *   6. mapError()         — provider xato kodlarini ProviderErrorCode ga moslash
 *
 * Transport qismi (timeout, tarmoq xatolari, JSON parse, HTTP status) tayyor.
 */
export class FastDonateService implements DonateProvider {
  readonly name = "fastdonate";
  readonly isMock = false;

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  async checkPlayer(_input: CheckPlayerInput): Promise<CheckPlayerResult> {
    await this.credentials();
    // INTEGRATSIYA NUQTASI: player verification endpointi.
    // Agar FastDonate verification qo'llamasa, quyidagini qaytaring:
    //   return { found: true, nickname: null, verificationSupported: false };
    throw this.notImplemented("checkPlayer");
  }

  async createOrder(_input: CreateOrderInput): Promise<ProviderOrderResult> {
    await this.credentials();
    // INTEGRATSIYA NUQTASI: buyurtma yaratish.
    // Majburiy: _input.externalId ni provider tomonidagi idempotency/external ID sifatida yuboring,
    // shunda qayta urinishda ikki marta diamond yuborilmaydi.
    throw this.notImplemented("createOrder");
  }

  async checkOrder(_providerOrderId: string): Promise<ProviderOrderResult> {
    await this.credentials();
    // INTEGRATSIYA NUQTASI: buyurtma holatini olish.
    throw this.notImplemented("checkOrder");
  }

  async getBalance(): Promise<BalanceResult | null> {
    await this.credentials();
    // INTEGRATSIYA NUQTASI: balans. API qo'llamasa `return null;` qiling.
    throw this.notImplemented("getBalance");
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const creds = await this.credentials();
      const balance = await this.getBalance();
      return {
        ok: true,
        message: balance
          ? `Ulandi (${creds.source}). Balans: ${balance.balance} ${balance.currency}`
          : `Ulandi (${creds.source})`,
      };
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError("PROVIDER_ERROR", String(e));
      return { ok: false, message: `${err.code}: ${err.message}` };
    }
  }

  // ------------------------------------------------------------------
  // Transport (tayyor)
  // ------------------------------------------------------------------

  /**
   * FastDonate API ga JSON so'rov yuboradi. Timeout, tarmoq va HTTP xatolarini
   * ProviderError ga aylantiradi. API hujjati kelganda metodlar shu orqali chaqiriladi:
   *   const data = await this.request("POST", "/path", { ... });
   */
  protected async request<T = Record<string, unknown>>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const creds = await this.credentials();
    const url = `${creds.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const payload = body ? JSON.stringify(body) : undefined;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json" } : {}),
          ...this.authHeaders(creds, payload ?? ""),
        },
        body: method === "GET" ? undefined : payload,
        signal: AbortSignal.timeout(config.fastdonate.timeoutMs),
      });
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ProviderError("TIMEOUT", `FastDonate ${config.fastdonate.timeoutMs}ms ichida javob bermadi`, { path });
      }
      throw new ProviderError("NETWORK", `FastDonate bilan aloqa xatosi: ${(e as Error)?.message}`, { path });
    }

    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    if (!res.ok) {
      throw this.mapError(res.status, data, path);
    }
    return data as T;
  }

  /**
   * INTEGRATSIYA NUQTASI: autentifikatsiya headerlari.
   * Hujjat kelmaguncha hech qanday header taxmin qilinmaydi.
   */
  protected authHeaders(_creds: FastDonateCredentials, _payload: string): Record<string, string> {
    throw this.notImplemented("authHeaders");
  }

  /** INTEGRATSIYA NUQTASI: provider xato javoblarini moslash. */
  protected mapError(status: number, data: unknown, path: string): ProviderError {
    if (status === 401 || status === 403) {
      return new ProviderError("NOT_CONFIGURED", "FastDonate API key noto'g'ri yoki ruxsat yo'q", { status, path });
    }
    if (status === 404) {
      return new ProviderError("PROVIDER_ERROR", "FastDonate endpoint topilmadi", { status, path });
    }
    if (status === 408 || status === 504) {
      return new ProviderError("TIMEOUT", "FastDonate timeout", { status, path });
    }
    return new ProviderError("PROVIDER_ERROR", `FastDonate HTTP ${status}`, {
      status,
      path,
      response: data as Record<string, unknown>,
    });
  }

  private async credentials(): Promise<FastDonateCredentials> {
    const creds = await getFastDonateCredentials();
    if (!creds.apiUrl || !creds.apiKey) {
      throw new ProviderError(
        "NOT_CONFIGURED",
        "FastDonate API URL yoki API Key kiritilmagan (admin panel → FastDonate yoki functions/.env)",
      );
    }
    return creds;
  }

  private notImplemented(method: string): ProviderError {
    return new ProviderError(
      "NOT_IMPLEMENTED",
      `FastDonate API hujjati hali integratsiya qilinmagan (${method}). MOCK_MODE=true qiling yoki FastDonateService ni to'ldiring.`,
      { method },
    );
  }
}
