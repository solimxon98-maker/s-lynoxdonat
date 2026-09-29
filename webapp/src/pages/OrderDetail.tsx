import { CreditCard, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, FullScreenLoader, OrderStatusBadge, PageHeader } from "../components/ui";
import { useTelegramAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { usePoll } from "../lib/usePoll";
import { formatDateTime, formatSum, ORDER_STATUS, productText } from "../lib/format";
import { bindBackButton, openExternal } from "../lib/telegram";
import type { OrderRecord, OrderStatus } from "../lib/types";

const FLOW: OrderStatus[] = ["AWAITING_PAYMENT", "PAID", "PROCESSING", "SUCCESS"];

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const { supportUsername } = useTelegramAuth();
  const valid = /^[A-Z]+-\d{6,}$/.test(orderId);
  const [final, setFinal] = useState(false);
  const { data: order, error: loadError } = usePoll(
    async () => {
      if (!valid) throw new Error("Buyurtma topilmadi");
      const r = await api<{ order: OrderRecord }>(`/orders/${encodeURIComponent(orderId)}`);
      setFinal(["SUCCESS", "FAILED", "CANCELLED"].includes(r.order.status));
      return r.order;
    },
    final ? 0 : 3000,
    [orderId],
  );
  const error = !order && loadError ? "Buyurtma topilmadi" : null;

  useEffect(() => bindBackButton(() => navigate("/orders")), [navigate]);

  if (error) {
    return (
      <div>
        <PageHeader title="Buyurtma" />
        <Alert>{error}</Alert>
      </div>
    );
  }
  if (!order) return <FullScreenLoader />;

  const currentIdx = FLOW.indexOf(order.status);
  const failed = order.status === "FAILED" || order.status === "REFUNDED";
  const refunded = order.status === "REFUNDED";
  const cancelled = order.status === "CANCELLED";

  return (
    <div className="space-y-4">
      <PageHeader title={`#${order.orderNo}`} subtitle={formatDateTime(order.createdAt)} right={<OrderStatusBadge status={order.status} />} />

      {/* Holat bosqichlari */}
      <div className="card p-5 animate-fade-up">
        <ol className="relative space-y-4">
          {FLOW.map((s, i) => {
            const reached = failed ? i <= 2 : cancelled ? i === 0 : i <= currentIdx;
            const active = !failed && !cancelled && i === currentIdx && s !== "SUCCESS";
            const m = ORDER_STATUS[s];
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ring-1 ${
                    reached ? "bg-neon-blue/15 ring-neon-blue/50" : "bg-white/5 ring-white/10 grayscale"
                  }`}
                >
                  {active && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-neon-blue/40" />}
                  <span className="relative">{m.emoji}</span>
                </span>
                <span className={`text-sm ${reached ? "font-semibold text-white" : "text-slate-500"}`}>{m.label}</span>
              </li>
            );
          })}
          {failed && (
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/15 text-sm ring-1 ring-rose-400/50">❌</span>
              <span className="text-sm font-semibold text-rose-300">Donat xatosi</span>
            </li>
          )}
          {refunded && (
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/15 text-sm ring-1 ring-sky-400/50">↩️</span>
              <span className="text-sm font-semibold text-sky-300">Pul balansga qaytarildi</span>
            </li>
          )}
          {cancelled && (
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-sm ring-1 ring-white/10">🚫</span>
              <span className="text-sm font-semibold text-slate-300">To‘lov bekor qilingan</span>
            </li>
          )}
        </ol>
      </div>

      {refunded && (
        <Alert tone="sky">↩️ {formatSum(order.amount)} balansingizga qaytarildi. Uni boshqa xarid uchun ishlatishingiz mumkin.</Alert>
      )}
      {failed && !refunded && (
        <Alert>
          <p className="font-semibold">❌ Buyurtmani bajarishda vaqtinchalik xatolik yuz berdi.</p>
          <p className="mt-1">Buyurtma ID: #{order.orderNo}</p>
          <p className="mt-1">Support bilan bog‘laning.</p>
        </Alert>
      )}

      {/* Tafsilotlar */}
      <div className="card divide-y divide-white/5 animate-fade-up">
        <Row label="🎮 O‘yin" value="Mobile Legends" />
        <Row label="👤 Nickname" value={order.nickname} />
        <Row label="🆔 MLBB ID" value={order.mlbbId} />
        <Row label="🌐 Server" value={order.serverId} />
        <Row label={order.product.category === "pass" ? "🎫 Propusk" : "💎 Diamond"} value={productText(order.product)} />
        <Row label="💰 Narx" value={formatSum(order.amount)} strong />
        {order.completedAt && <Row label="✅ Bajarildi" value={formatDateTime(order.completedAt)} />}
      </div>

      {order.status === "AWAITING_PAYMENT" && (
        <button className="btn-primary w-full" onClick={() => navigate(`/pay/${order.paymentId}`)}>
          <CreditCard size={18} /> To‘lovni davom ettirish
        </button>
      )}

      {((failed && !refunded) || order.status === "PROCESSING") && supportUsername && (
        <button className="btn-ghost w-full" onClick={() => openExternal(`https://t.me/${supportUsername}`)}>
          <MessageCircle size={18} /> Supportga yozish
        </button>
      )}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`truncate text-right text-sm ${strong ? "font-display text-base font-bold text-neon-blue" : "font-semibold text-white"}`}>{value}</span>
    </div>
  );
}
