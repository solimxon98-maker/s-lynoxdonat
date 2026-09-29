import { AlertTriangle, CheckCircle2, Clock, Package, RefreshCw, TrendingUp, Wallet, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, OrderStatusBadge, PageHeader, Spinner } from "../components/ui";
import { errorMessage } from "../lib/api";
import { dashboardStats, providerStatus, recentOrders } from "../lib/adminData";
import { formatDateTime, productEmoji, productText, formatNumber, formatSum, tashkentDayStart } from "../lib/format";
import type { OrderRecord } from "../lib/types";

interface Stats {
  todayOrders: number;
  todayRevenue: number;
  total: number;
  success: number;
  pending: number;
  failed: number;
  pendingTopups: number;
  todayTopups: number;
  totalBalance: number;
  recent: OrderRecord[];
  provider: { connected?: boolean; balance?: number | null; currency?: string | null; lowBalance?: boolean; message?: string } | null;
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, recent, provider] = await Promise.all([dashboardStats(tashkentDayStart(0)), recentOrders(8), providerStatus()]);
      setStats({ ...st, recent, provider });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Umumiy ko‘rsatkichlar"
        right={
          <button className="btn-ghost px-3 py-2 text-sm" onClick={load} disabled={loading}>
            {loading ? <Spinner size={16} /> : <RefreshCw size={16} />} Yangilash
          </button>
        }
      />
      {error && <Alert>{error}</Alert>}

      {stats?.provider?.lowBalance && (
        <div className="mb-4">
          <Alert tone="amber">
            <span className="inline-flex items-center gap-2 font-semibold">
              <AlertTriangle size={16} /> FastDonate balansi past: {formatNumber(stats.provider.balance ?? 0)} {stats.provider.currency}
            </span>
          </Alert>
        </div>
      )}

      {stats && stats.pendingTopups > 0 && (
        <Link to="/admin/topups" className="mb-4 block">
          <Alert tone="amber">
            <span className="font-semibold">🧾 {stats.pendingTopups} ta to‘ldirish so‘rovi tekshirilishini kutmoqda →</span>
          </Alert>
        </Link>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi icon={<Wallet size={18} />} label="Bugun to‘ldirildi (kartaga tushgan)" value={stats ? formatSum(stats.todayTopups) : "…"} tone="text-emerald-300" />
        <Kpi icon={<Clock size={18} />} label="Tekshiruvdagi to‘ldirishlar" value={stats ? formatNumber(stats.pendingTopups) : "…"} tone="text-amber-300" />
        <Kpi icon={<Wallet size={18} />} label="Mijozlar balansi (jami)" value={stats ? formatSum(stats.totalBalance) : "…"} tone="text-neon-blue" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={<Package size={18} />} label="Bugungi buyurtmalar" value={stats ? formatNumber(stats.todayOrders) : "…"} tone="text-neon-blue" />
        <Kpi icon={<Wallet size={18} />} label="Bugungi tushum" value={stats ? formatSum(stats.todayRevenue) : "…"} tone="text-emerald-300" />
        <Kpi icon={<TrendingUp size={18} />} label="Umumiy buyurtmalar" value={stats ? formatNumber(stats.total) : "…"} tone="text-violet-300" />
        <Kpi icon={<CheckCircle2 size={18} />} label="Muvaffaqiyatli" value={stats ? formatNumber(stats.success) : "…"} tone="text-emerald-300" />
        <Kpi icon={<Clock size={18} />} label="Kutilayotgan" value={stats ? formatNumber(stats.pending) : "…"} tone="text-amber-300" />
        <Kpi icon={<XCircle size={18} />} label="Xatolikdagi" value={stats ? formatNumber(stats.failed) : "…"} tone="text-rose-300" />
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <p className="font-display text-sm font-bold text-white">So‘nggi buyurtmalar</p>
          <Link to="/admin/orders" className="text-xs font-semibold text-neon-blue">
            Barchasi →
          </Link>
        </div>
        {stats && stats.recent.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Buyurtmalar yo‘q</p>}
        <ul className="divide-y divide-white/5">
          {stats?.recent.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  #{o.orderNo} <span className="font-normal text-slate-400">· {o.nickname}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {productEmoji(o.product)} {productText(o.product)} · {formatSum(o.amount)} · {formatDateTime(o.createdAt)}
                </p>
              </div>
              <OrderStatusBadge status={o.status} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="card p-4">
      <div className={`mb-3 ${tone}`}>{icon}</div>
      <p className="font-display text-lg font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{label}</p>
    </div>
  );
}
