import { AlertTriangle, KeyRound, Link2, PlugZap, Save, Wallet } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Alert, PageHeader, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatDateTime, formatNumber } from "../lib/format";
import { listProducts } from "../lib/adminData";
import type { Product } from "../lib/types";

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
            🧪 <b>Test rejim yoqilgan</b> — mijoz buyurtmalari FastDonate'ga yuborilmaydi (olmos ketmaydi). Nik tekshiruvi esa haqiqiy.
            Pastdagi «Sinov xaridi» muvaffaqiyatli o‘tgach, test rejimi o‘chiriladi.
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
          <p className="font-display text-sm font-bold text-white">FastDonate akkaunti</p>
          {settings && (
            <span className="chip border-white/10 bg-white/5 text-slate-400">
              Manba: {settings.source === "admin" ? "admin panel" : settings.source === "env" ? ".env" : "kiritilmagan"}
            </span>
          )}
        </div>

        <div>
          <label className="label">API manzili (odatda o‘zgartirilmaydi)</label>
          <div className="relative">
            <Link2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-11" placeholder="https://api.fastdonate.su" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Login (fastdonate.su) {settings?.hasApiKey && <span className="normal-case text-slate-500">— joriy: {settings.apiKeyMasked}</span>}</label>
          <div className="relative">
            <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-11"
              type="text"
              autoComplete="off"
              placeholder={settings?.hasApiKey ? "O‘zgartirish uchun yangi qiymat kiriting" : "FastDonate login"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Parol (fastdonate.su) {settings?.hasSecret && <span className="normal-case text-slate-500">— joriy: {settings.secretMasked}</span>}</label>
          <div className="relative">
            <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-11"
              type="password"
              autoComplete="new-password"
              placeholder={settings?.hasSecret ? "O‘zgartirish uchun yangi qiymat kiriting" : "FastDonate parol"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Bo‘sh qoldirilgan maydon o‘zgarmaydi. O‘chirish uchun «-» kiriting. Login va parol faqat serverda saqlanadi, brauzerga qaytarilmaydi.
          Saqlagach «Ulanishni tekshirish» ni bosing.
        </p>
        {saved && <Alert tone="emerald">✅ Saqlandi</Alert>}
        <button className="btn-primary" disabled={saving}>
          {saving ? <Spinner size={16} /> : <Save size={16} />} Saqlash
        </button>
      </form>

      <TestPurchase />
    </div>
  );
}

/** Haqiqiy sinov xaridi: FastDonate balansidan yechiladi, bizning buyurtma/balansga ta'sir qilmaydi */
function TestPurchase() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [mlbbId, setMlbbId] = useState("");
  const [serverId, setServerId] = useState("");
  const [nick, setNick] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<unknown>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    listProducts()
      .then((ps) => {
        const list = ps.filter((p) => p.active && p.providerSku);
        setProducts(list);
        const cheapest = [...list].sort((a, b) => a.price - b.price)[0];
        if (cheapest) setProductId(cheapest.id);
      })
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  async function run(kind: "check" | "prices" | "orders" | "buy") {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === "check") {
        const r = await api<{ found: boolean; nickname: string | null }>("/admin/fastdonate/check", { body: { mlbbId, serverId }, admin: true });
        setNick(r.found ? r.nickname : "");
        return;
      }
      if (kind === "prices") return setOut(await api("/admin/fastdonate/prices", { admin: true }));
      if (kind === "orders") return setOut(await api("/admin/fastdonate/orders", { admin: true }));
      const p = products.find((x) => x.id === productId);
      if (!p || !nick) return;
      setConfirming(false);
      setOut(await api("/admin/fastdonate/test-order", { body: { productId, mlbbId, serverId, confirm: true }, admin: true }));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card mt-5 space-y-4 p-5">
      <div>
        <p className="font-display text-sm font-bold text-white">🧪 Sinov xaridi (haqiqiy)</p>
        <p className="mt-1 text-xs text-slate-400">
          O‘zingizning akkauntingizga eng arzon paketni oling. FastDonate balansingizdan yechiladi. Mijozlar balansiga ta'sir qilmaydi.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input className="input" inputMode="numeric" placeholder="MLBB ID" value={mlbbId} onChange={(e) => { setMlbbId(e.target.value.replace(/\D/g, "")); setNick(null); }} />
        <input className="input" inputMode="numeric" placeholder="Server" value={serverId} onChange={(e) => { setServerId(e.target.value.replace(/\D/g, "")); setNick(null); }} />
        <button className="btn-ghost" onClick={() => run("check")} disabled={!!busy || !mlbbId || !serverId}>
          {busy === "check" ? <Spinner size={16} /> : null} Nikni tekshirish
        </button>
      </div>
      {nick !== null && (nick ? <Alert tone="emerald">✅ Akkaunt: <b>{nick}</b></Alert> : <Alert>Akkaunt topilmadi</Alert>)}
      <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — FastDonate kod: {p.providerSku}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => { setErr(null); setConfirming(true); }} disabled={!!busy || !nick || !productId || confirming}>
          {busy === "buy" ? <Spinner size={16} /> : null} Sinov xaridini qilish
        </button>
        <button className="btn-ghost" onClick={() => run("orders")} disabled={!!busy}>
          {busy === "orders" ? <Spinner size={16} /> : null} FastDonate buyurtmalarim
        </button>
        <button className="btn-ghost" onClick={() => run("prices")} disabled={!!busy}>
          {busy === "prices" ? <Spinner size={16} /> : null} Mening narxlarim
        </button>
      </div>
      {confirming && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
          <p className="font-bold">⚠️ HAQIQIY XARID</p>
          <p className="mt-1">
            {products.find((x) => x.id === productId)?.name} → <b>{nick}</b> ({mlbbId} / {serverId}). FastDonate balansingizdan pul yechiladi.
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary px-4 py-2 text-sm" onClick={() => run("buy")} disabled={!!busy}>
              {busy === "buy" ? <Spinner size={16} /> : null} Ha, sotib olish
            </button>
            <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setConfirming(false)} disabled={!!busy}>
              Bekor
            </button>
          </div>
        </div>
      )}
      {err && <Alert>{err}</Alert>}
      {out !== null && (
        <pre className="max-h-96 overflow-auto rounded-2xl bg-ink-950/80 p-4 text-[11px] leading-relaxed text-slate-300 ring-1 ring-white/5">
          {JSON.stringify(out, null, 2)}
        </pre>
      )}
    </div>
  );
}
