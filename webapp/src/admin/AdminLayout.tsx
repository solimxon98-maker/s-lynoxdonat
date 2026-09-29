import { Cable, CreditCard, Gem, LayoutDashboard, LogOut, Package, Receipt, Users } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet } from "react-router-dom";
import { Logo } from "../components/Logo";
import { FullScreenLoader, Spinner } from "../components/ui";
import { adminSignOut, currentAdmin, onAdminAuthChange, type AdminUser } from "../lib/adminData";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/products", label: "Paketlar", icon: Gem, end: false },
  { to: "/admin/topups", label: "To‘ldirishlar", icon: Receipt, end: false },
  { to: "/admin/orders", label: "Buyurtmalar", icon: Package, end: false },
  { to: "/admin/users", label: "Foydalanuvchilar", icon: Users, end: false },
  { to: "/admin/cards", label: "Kartalar", icon: CreditCard, end: false },
  { to: "/admin/fastdonate", label: "FastDonate", icon: Cable, end: false },
];

type GuardState = { status: "loading" } | { status: "anon" } | { status: "denied" } | { status: "ok"; user: AdminUser };

/** Admin panel: Supabase Auth (email/parol) + public.admins jadvalida yozuv */
export function AdminLayout() {
  const [state, setState] = useState<GuardState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const a = await currentAdmin();
        if (!alive) return;
        if (a === null) setState({ status: "anon" });
        else if (a === "denied") {
          await adminSignOut();
          setState({ status: "denied" });
        } else setState({ status: "ok", user: a });
      } catch {
        if (alive) setState({ status: "anon" });
      }
    };
    check();
    const off = onAdminAuthChange(check);
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="app-bg min-h-screen">
        <FullScreenLoader />
      </div>
    );
  }
  if (state.status === "anon") return <Navigate to="/admin/login" replace />;
  if (state.status === "denied") return <Navigate to="/admin/login?denied=1" replace />;

  return (
    <div className="app-bg min-h-screen">
      <div className="mx-auto flex max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 p-5 lg:flex">
          <div className="mb-8 flex items-center gap-3">
            <Logo size={40} />
            <div>
              <p className="font-display text-sm font-bold text-white">S-LynoxDonat</p>
              <p className="text-xs text-slate-500">Admin panel</p>
            </div>
          </div>
          <nav className="space-y-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? "bg-neon-blue/10 text-white ring-1 ring-neon-blue/30" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon size={18} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto">
            <p className="mb-2 truncate text-xs text-slate-500">{state.user.email}</p>
            <button className="btn-ghost w-full py-2.5 text-sm" onClick={() => adminSignOut()}>
              <LogOut size={16} /> Chiqish
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl lg:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <Logo size={32} />
                <p className="font-display text-sm font-bold text-white">Admin</p>
              </div>
              <button className="rounded-xl p-2 text-slate-400 hover:bg-white/5" onClick={() => adminSignOut()} aria-label="Chiqish">
                <LogOut size={18} />
              </button>
            </div>
            <nav className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-3">
              {nav.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                      isActive ? "bg-neon-blue/15 text-white ring-1 ring-neon-blue/30" : "text-slate-400"
                    }`
                  }
                >
                  <Icon size={15} /> {label}
                </NavLink>
              ))}
            </nav>
          </header>
          <main className="px-4 py-6 lg:px-8 lg:py-8">
            <Suspense fallback={<Spinner className="text-neon-blue" />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
