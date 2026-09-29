import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { initTelegram } from "./lib/telegram";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Bot Web App tugmalari "?p=donate" ko'rinishida ochadi (GitHub Pages statik hosting).
 * Shu yerda uni ichki yo'lga aylantiramiz. Telegram qo'shgan #tgWebAppData... hash saqlanadi
 * (telegram-web-app.js uni allaqachon o'qib bo'lgan).
 */
(function routeFromQuery() {
  const url = new URL(window.location.href);
  const p = url.searchParams.get("p");
  if (!p || !/^[a-z0-9/_-]{1,60}$/i.test(p)) return;
  url.searchParams.delete("p");
  const qs = url.searchParams.toString();
  window.history.replaceState(null, "", `${BASE}/${p.replace(/^\/+/, "")}${qs ? `?${qs}` : ""}${url.hash}`);
})();

initTelegram();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={BASE || "/"}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
