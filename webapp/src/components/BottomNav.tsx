import { Gem, Home, Package, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import { haptic } from "../lib/telegram";

const items = [
  { to: "/", label: "Asosiy", icon: Home, end: true },
  { to: "/donate", label: "Donat", icon: Gem, end: false },
  { to: "/orders", label: "Buyurtmalar", icon: Package, end: false },
  { to: "/profile", label: "Profil", icon: User, end: false },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 10px)" }}
    >
      <div className="grid w-full max-w-md grid-cols-4 rounded-[26px] border border-white/10 bg-ink-900/85 p-1.5 shadow-card backdrop-blur-2xl" style={{ height: "var(--nav-h)" }}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => haptic.select()}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-semibold transition ${
                isActive ? "text-white" : "text-slate-500 hover:text-slate-300"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute inset-0 rounded-[20px] bg-gradient-to-b from-neon-blue/20 via-neon-violet/15 to-transparent ring-1 ring-neon-blue/30" />
                )}
                <Icon size={21} strokeWidth={isActive ? 2.4 : 2} className={`relative ${isActive ? "text-neon-blue drop-shadow-[0_0_8px_rgba(46,230,255,0.8)]" : ""}`} />
                <span className="relative">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
