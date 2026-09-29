/**
 * Markaziy konfiguratsiya — Supabase Edge Function secrets (supabase secrets set ...).
 * Hech narsa brauzerga chiqmaydi.
 */
function str(name: string, fallback = ""): string {
  const v = Deno.env.get(name);
  return v === undefined ? fallback : v.trim();
}
function num(name: string, fallback: number): number {
  const v = Number(Deno.env.get(name));
  return Number.isFinite(v) && Deno.env.get(name) !== undefined && Deno.env.get(name) !== "" ? v : fallback;
}

export const config = {
  /** true -> player tekshirish, to'lov va FastDonate MOCK rejimda */
  get mockMode(): boolean {
    return str("MOCK_MODE", "true").toLowerCase() !== "false";
  },
  supabase: {
    get url() {
      return str("SUPABASE_URL");
    },
    get serviceKey() {
      return str("SUPABASE_SERVICE_ROLE_KEY");
    },
  },
  /** Web App sessiyasini imzolash uchun maxfiy kalit */
  get sessionSecret() {
    return str("SESSION_SECRET");
  },
  get cronSecret() {
    return str("CRON_SECRET");
  },
  /** CORS: Web App manzili (GitHub Pages). Bo'sh bo'lsa — hamma */
  get allowedOrigin() {
    return str("ALLOWED_ORIGIN");
  },
  telegram: {
    get botToken() {
      return str("TELEGRAM_BOT_TOKEN");
    },
    get webhookSecret() {
      return str("TELEGRAM_WEBHOOK_SECRET");
    },
    get adminIds(): string[] {
      return str("ADMIN_TELEGRAM_IDS").split(",").map((s) => s.trim()).filter(Boolean);
    },
    get botUsername() {
      return str("TELEGRAM_BOT_USERNAME").replace(/^@/, "");
    },
    get webAppUrl() {
      return str("WEBAPP_URL").replace(/\/+$/, "");
    },
    get supportUsername() {
      return str("SUPPORT_USERNAME", "Solim_9804").replace(/^@/, "");
    },
    get initDataMaxAge() {
      return num("INITDATA_MAX_AGE_SECONDS", 86400);
    },
  },
  fastdonate: {
    get apiUrl() {
      return str("FASTDONATE_API_URL");
    },
    get apiKey() {
      return str("FASTDONATE_API_KEY");
    },
    get secret() {
      return str("FASTDONATE_SECRET");
    },
    get timeoutMs() {
      return num("FASTDONATE_TIMEOUT_MS", 20000);
    },
    get lowBalanceThreshold() {
      return num("LOW_BALANCE_THRESHOLD", 0);
    },
  },
  payment: {
    get provider() {
      return str("PAYMENT_PROVIDER", "balance").toLowerCase();
    },
  },
};

export const CURRENCY = "UZS";
