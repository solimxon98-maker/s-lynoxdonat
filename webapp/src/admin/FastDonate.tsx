import { AlertTriangle, KeyRound, Link2, PlugZap, Save, Wallet } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, PageHeader, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatDateTime, formatNumber } from "../lib/format";

interface Settings {
  mockMode: boolean;
  source: "admin" | "env" | "none";
  apiUrl: string;
  apiKeyMasked: string;
  secretMasked: string;
  hasApiKey: boolean;
  hasSecret: boolean;
  lowBalanceThreshold: number;
  lastStatus: {
    connected?: boolean;
    message?: string;
    balance?: number | null;
    currency?: string | null;
    lowBalance?: boolean;
    checkedAt?: number;
  } | null;
}

interface TestResult {
  connected: boolean;
  message: string;
  provider: string;
  mock: boolean;
  balance: number | null;
  currency: string | null;
  balanceError: string | null;
  lowBalance: boolean;
  checkedAt: number;
  threshold: number;
}

/**
 * FastDonate sozlamalari. Kalitlar faqat backendga yuboriladi va Firestore settings/fastdonate da
 * saqlanadi (Security Rules clientga o'qishni taqiqlaydi). Bu sahifa faqat maskalangan qiymatni ko'radi.
 */
export function FastDonatePage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<Settings>("/admin/fastdonate", { admin: true });
      setSettings(s);
      setApiUrl(s.apiUrl);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api("/admin/fastdonate", { method: "PUT", body: { apiUrl, apiKey, secret }, admin: true });
      setApiKey("");
      setSecret("");
      setSaved(true);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setError(null);
    try {
      setTest(await api<TestResult>("/admin/fastdonate/test", { body: {}, admin: true }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  const status = test ?? (settings?.lastStatus as Partial<TestResult> | null);

  return (
    <div className="max-w-3xl">
      <PageHeader title="FastDonate" subtitle="fastdonate.su provider sozlamalari" />

      {settings?.mockMode && (
        <div className="mb-4">
          <Alert tone="amber">
            🧪 <b>MOCK_MODE=true</b> — player tekshirish, to‘lov va donat buyurtmalari simulyatsiya qilinmoqda. Haqiqiy API uchun
            Supabase Edge Function secrets'da MOCK_MODE=false qiling.
          </Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {/* Ulanish holati */}
      <div className="card mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{status?.connected === undefined ? "⚪" : status.connected ? "🟢" : "🔴"}</span>
            <div>
              <p className="font-display text-sm font-bold text-white">
                {status?.connected === undefined ? "Tekshirilmagan" : status.connected ? "Connected" : "Connection error"}
              </p>
              {status?.message && <p className="text-xs text-slate-400">{status.message}</p>}
              {status?.checkedAt && <p className="text-[11px] text-slate-500">Oxirgi tekshiruv: {formatDateTime(status.checkedAt)}</p>}
            </div>
          </div>
          <button className="btn-primary px-4 py-2.5 text-sm" onClick={runTest} disabled={testing}>
            {testing ? <Spinner size={16} /> : <PlugZap size={16} />} Ulanishni tekshirish
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-ink-950/60 p-4 ring-1 ring-white/5">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Wallet size={14} /> Balance
            </p>
            <p className="mt-1 font-display text-xl font-bold text-white">
              {status?.balance != null ? `${formatNumber(status.balance)} ${status.currency ?? ""}` : "—"}
            </p>
            {test?.balanceError && <p className="mt-1 text-xs text-rose-300/80">{test.balanceError}</p>}
          </div>
          <div className="rounded-2xl bg-ink-950/60 p-4 ring-1 ring-white/5">
            <p className="text-xs uppercase tracking-wider text-slate-500">Low balance chegara</p>
            <p className="mt-1 font-display text-xl font-bold text-white">
              {settings && settings.lowBalanceThreshold > 0 ? formatNumber(settings.lowBalanceThreshold) : "o‘chirilgan"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Edge secrets → LOW_BALANCE_THRESHOLD</p>
          </div>
        </div>

        {status?.lowBalance && (
          <div className="mt-4">
            <Alert tone="amber">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle size={16} /> Balans past! Buyurtmalar xatoga uchramasligi uchun FastDonate balansini to‘ldiring.
              </span>
            </Alert>
          </div>
        )}
      </div>

      {/* API sozlamalari */}
      <form onSubmit={save} className="card space-y-4 p-5">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-bold text-white">API ma'lumotlari</p>
          {settings && (
            <span className="chip border-white/10 bg-white/5 text-slate-400">
              Manba: {settings.source === "admin" ? "admin panel" : settings.source === "env" ? ".env" : "kiritilmagan"}
            </span>
          )}
        </div>

        <div>
          <label className="label">API URL</label>
          <div className="relative">
            <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-11" placeholder="https://..." value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">API Key {settings?.hasApiKey && <span className="normal-case text-slate-500">— joriy: {settings.apiKeyMasked}</span>}</label>
          <div className="relative">
            <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-11"
              type="password"
              autoComplete="new-password"
              placeholder={settings?.hasApiKey ? "O‘zgartirish uchun yangi qiymat kiriting" : "API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Secret {settings?.hasSecret && <span className="normal-case text-slate-500">— joriy: {settings.secretMasked}</span>}</label>
          <div className="relative">
            <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-11"
              type="password"
              autoComplete="new-password"
              placeholder={settings?.hasSecret ? "O‘zgartirish uchun yangi qiymat kiriting" : "Secret"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Bo‘sh qoldirilgan maydon o‘zgarmaydi. Qiymatni o‘chirish uchun «-» kiriting. Kalitlar faqat serverda saqlanadi va brauzerga qaytarilmaydi.
        </p>
        {saved && <Alert tone="emerald">✅ Saqlandi</Alert>}
        <button className="btn-primary" disabled={saving}>
          {saving ? <Spinner size={16} /> : <Save size={16} />} Saqlash
        </button>
      </form>
    </div>
  );
}
