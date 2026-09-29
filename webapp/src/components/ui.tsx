import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { ORDER_STATUS, PAYMENT_STATUS, TONE_CLASS } from "../lib/format";
import type { OrderStatus, PaymentStatus } from "../lib/types";

export function Spinner({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export function FullScreenLoader({ text = "Yuklanmoqda..." }: { text?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
      <div className="relative">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-neon-blue/30" />
        <Spinner size={30} className="relative text-neon-blue" />
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function OrderStatusBadge({ status, full = false }: { status: OrderStatus; full?: boolean }) {
  const m = ORDER_STATUS[status] ?? ORDER_STATUS.AWAITING_PAYMENT;
  return (
    <span className={`chip ${TONE_CLASS[m.tone]}`}>
      <span>{m.emoji}</span>
      {full ? m.label : m.short}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const m = PAYMENT_STATUS[status] ?? PAYMENT_STATUS.PENDING;
  return <span className={`chip ${TONE_CLASS[m.tone]}`}>{m.label}</span>;
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3 animate-fade-up">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center animate-fade-up">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-neon-blue/20 to-neon-purple/20 text-neon-blue ring-1 ring-white/10">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-white">{title}</h3>
      {text && <p className="mt-1.5 max-w-xs text-sm text-slate-400">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "rose", children }: { tone?: "rose" | "amber" | "sky" | "emerald"; children: ReactNode }) {
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${TONE_CLASS[tone]}`}>{children}</div>;
}

export function MockBadge() {
  return <span className="chip border-amber-400/30 bg-amber-400/10 text-amber-300">🧪 TEST rejim</span>;
}
