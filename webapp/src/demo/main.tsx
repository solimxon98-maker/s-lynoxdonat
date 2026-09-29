/**
 * DEMO kirish nuqtasi: Supabase va Telegram o'rniga brauzer ichidagi test backend.
 * Build: npm run build:demo  →  dist-demo/
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import App from "../App";
import "../index.css";
import { BotSim, MAIN_MENU, WELCOME } from "./BotSim";
import { ensureDemoUser, installDemoBackend, seedDemo } from "./backend";
import { chat } from "./chat";

// Telegram Web App o'rniga soxta obyekt (initData serverda "tekshiriladi" — demo)
const noop = () => undefined;
(window as unknown as { Telegram: unknown }).Telegram = {
  WebApp: {
    initData: "demo=1",
    initDataUnsafe: {},
    version: "7.0",
    platform: "demo",
    colorScheme: "dark",
    isExpanded: true,
    ready: noop,
    expand: noop,
    close: noop,
    isVersionAtLeast: () => false,
    openLink: (u: string) => window.open(u, "_blank", "noopener"),
    openTelegramLink: (u: string) => window.open(u, "_blank", "noopener"),
    BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
  },
};

seedDemo();
ensureDemoUser();
installDemoBackend();
chat.push({ chat: "user", from: "me", html: "/start" });
chat.push({ chat: "user", from: "bot", html: WELCOME, buttons: MAIN_MENU });

if (!location.hash || location.hash === "#/" || location.hash === "#") location.hash = "#/bot";

function DemoBar() {
  const loc = useLocation();
  const isAdmin = loc.pathname.startsWith("/admin");
  const isBot = loc.pathname.startsWith("/bot");
  const tab = (active: boolean) =>
    `flex-1 whitespace-nowrap rounded-xl px-1 py-1.5 text-center text-[12px] font-bold transition ${active ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`;
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-12 items-center gap-2 border-b border-amber-400/20 bg-[#0b0d1d]/95 px-3 backdrop-blur-xl">
      <span className="shrink-0 rounded-lg bg-amber-400/15 px-2 py-1 text-[11px] font-bold text-amber-300">🧪<span className="hidden sm:inline"> DEMO</span></span>
      <nav className="mx-auto flex w-full max-w-md gap-1 rounded-2xl bg-white/5 p-1">
        <NavLink to="/bot" className={() => tab(isBot)}>🤖 Bot</NavLink>
        <NavLink to="/" className={() => tab(!isBot && !isAdmin)}>📱 Web App</NavLink>
        <NavLink to="/admin" className={() => tab(isAdmin)}>🛠 Admin</NavLink>
      </nav>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <DemoBar />
      <div style={{ paddingTop: 48 }}>
        <Routes>
          <Route path="/bot" element={<BotSim />} />
          <Route path="*" element={<App />} />
        </Routes>
      </div>
    </HashRouter>
  </StrictMode>,
);
