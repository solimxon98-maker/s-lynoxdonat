import { AlertTriangle, Ban, RefreshCw, Send } from "lucide-react";
import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { useTelegramAuth } from "../context/AuthContext";
import { BottomNav } from "./BottomNav";
import { Logo } from "./Logo";
import { FullScreenLoader } from "./ui";

export function UserLayout() {
  const { status, error, retry, supportUsername } = useTelegramAuth();

  return (
    <div className="app-bg relative min-h-screen">
      <div className="grid-overlay pointer-events-none fixed inset-x-0 top-0 h-[420px]" />
      <main className="safe-top safe-bottom-nav relative mx-auto w-full max-w-md px-4">
        {status === "loading" && <FullScreenLoader text="Telegram orqali kirilmoqda..." />}
        {status === "ready" && <Outlet />}
        {status === "no-telegram" && (
          <Gate
            icon={<Send size={26} />}
            title="Telegram orqali oching"
            text="S-LynoxDonat faqat Telegram Web App ichida ishlaydi. Botga kirib «💎 Donat qilish» tugmasini bosing."
          />
        )}
        {status === "not-configured" && (
          <Gate icon={<AlertTriangle size={26} />} title="Sozlanmagan" text="Server manzili (webapp/.env: VITE_SUPABASE_URL) kiritilmagan." />
        )}
        {status === "blocked" && (
          <Gate
            icon={<Ban size={26} />}
            title="Hisob bloklangan"
            text={`${error ?? "Hisobingiz bloklangan."}${supportUsername ? ` Support: @${supportUsername}` : ""}`}
          />
        )}
        {status === "error" && (
          <Gate
            icon={<AlertTriangle size={26} />}
            title="Ulanishda xatolik"
            text={error ?? "Qayta urinib ko‘ring."}
            action={
              <button className="btn-primary" onClick={retry}>
                <RefreshCw size={18} /> Qayta urinish
              </button>
            }
          />
        )}
      </main>
      {status === "ready" && <BottomNav />}
    </div>
  );
}

function Gate({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center animate-fade-up">
      <Logo size={72} className="mb-6 shadow-glow" />
      <div className="card-glow w-full px-6 py-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-neon-blue">{icon}</div>
        <h2 className="font-display text-xl font-bold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}
