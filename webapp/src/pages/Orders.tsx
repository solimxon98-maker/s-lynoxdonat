import { ChevronRight, Package } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, EmptyState, OrderStatusBadge, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { usePoll } from "../lib/usePoll";
import { formatDate, formatSum, productEmoji, productText } from "../lib/format";
import type { OrderRecord } from "../lib/types";

export function OrdersPage() {
  const navigate = useNavigate();
  // Faqat o'z buyurtmalari (server sessiya bo'yicha filtrlaydi). Jarayondagi buyurtma bo'lsa tez-tez yangilanadi.
  const [fast, setFast] = useState(false);
  const { data, error } = usePoll(
    async () => {
      const r = await api<{ orders: OrderRecord[] }>("/orders");
      setFast(r.orders.some((o) => ["AWAITING_PAYMENT", "PAID", "PROCESSING"].includes(o.status)));
      return r.orders;
    },
    fast ? 4000 : 20000,
  );
  const orders = data;

  return (
    <div>
      <PageHeader title="Buyurtmalar" subtitle="Buyurtmalar tarixi va holati" />
      {error && !orders && <Alert>Buyurtmalarni yuklab bo‘lmadi: {error}</Alert>}

      {!orders && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-[92px] animate-pulse" />
          ))}
        </div>
      )}

      {orders && orders.length === 0 && (
        <EmptyState
          icon={<Package size={28} />}
          title="Hali buyurtma yo‘q"
          text="Birinchi donatingizni qiling — u shu yerda paydo bo‘ladi."
          action={
            <button className="btn-primary" onClick={() => navigate("/donate")}>
              💎 Donat qilish
            </button>
          }
        />
      )}

      {orders && orders.length > 0 && (
        <ul className="space-y-3">
          {orders.map((o, i) => (
            <li key={o.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              <Link to={`/orders/${o.id}`} className="card flex items-center gap-3 p-4 transition hover:border-neon-blue/30 active:scale-[0.99]">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 text-xl ring-1 ring-white/10">{productEmoji(o.product)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-sm font-bold text-white">#{o.orderNo}</p>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    {productText(o.product)} · <span className="font-bold text-neon-blue">{formatSum(o.amount)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(o.createdAt)} · {o.nickname}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-slate-600" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
