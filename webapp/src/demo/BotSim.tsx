import { Send, ShieldCheck, User } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { DEMO_REF_LINK, DEMO_UID, productLabel, simulateReferral } from "./backend";
import { chat, type ChatButton, type ChatMessage } from "./chat";
import { demoDb } from "./store";

const ORDER_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "⏳ To‘lov kutilmoqda",
  PAID: "💳 To‘lov tasdiqlandi",
  PROCESSING: "🔄 Donat amalga oshirilmoqda",
  SUCCESS: "✅ Donat muvaffaqiyatli",
  FAILED: "❌ Donat xatosi",
  CANCELLED: "🚫 Bekor qilingan",
};
const fmt = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m`;
const date = (ms: number) => {
  const d = new Date(ms + 5 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
};

export const MAIN_MENU: ChatButton[][] = [
  [{ text: "💎 Donat qilish", action: "donate" }],
  [
    { text: "📦 Buyurtmalarim", action: "orders" },
    { text: "👤 Profil", action: "profile" },
  ],
  [{ text: "👥 Do‘st taklif qilish", action: "invite" }],
  [{ text: "💬 Yordam", action: "help" }],
];

export const WELCOME = "Assalomu alaykum 👋\n\n<b>S-LynoxDonat</b> xizmatiga xush kelibsiz!\n\nMobile Legends uchun Diamond xarid qiling.";

function botReply(action: ChatButton["action"]) {
  const back: ChatButton[][] = [[{ text: "⬅️ Menyu", action: "menu" }]];
  if (action === "menu") return chat.push({ chat: "user", from: "bot", html: WELCOME, buttons: MAIN_MENU });
  if (action === "orders") {
    const orders = demoDb
      .list("orders")
      .map(([, o]) => o)
      .filter((o) => o.uid === DEMO_UID)
      .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      .slice(0, 5);
    if (!orders.length) {
      return chat.push({ chat: "user", from: "bot", html: "📦 Sizda hali buyurtmalar yo‘q.\n\n💎 Birinchi donatingizni hoziroq qiling!", buttons: MAIN_MENU });
    }
    const lines = orders.map((o) =>
      [`<b>#${o.orderNo}</b>`, `💎 ${productLabel(o.product)}`, fmt(o.amount), `Status: ${ORDER_LABEL[o.status]}`, `Sana: ${date(o.createdAt.toMillis())}`].join("\n"),
    );
    return chat.push({
      chat: "user",
      from: "bot",
      html: `📦 <b>So‘nggi buyurtmalar</b>\n\n${lines.join("\n\n")}`,
      buttons: [[{ text: "📋 Barcha buyurtmalar", action: "webapp-orders" }], ...back],
    });
  }
  if (action === "profile") {
    const u = demoDb.get("users", DEMO_UID)!;
    const tierOk = u.tier && u.tier !== "oddiy" && (u.tierUntil?.toMillis?.() ?? 0) > Date.now();
    const tierLine = tierOk
      ? `🏷 Tarif: <b>${u.tier === "vip" ? "👑 VIP" : "🥉 Bronza"}</b>\n⏳ ${date(u.tierUntil.toMillis())} gacha`
      : "🏷 Tarif: Oddiy\n👥 5 ta do‘st qo‘shing — 🥉 Bronza, 10 ta — 👑 VIP narx!";
    return chat.push({
      chat: "user",
      from: "bot",
      html: [
        "👤 <b>Profil</b>", "",
        `Ism: ${u.firstName}`, `Username: @${u.username}`, `Telegram ID: <code>${u.telegramId}</code>`, "",
        tierLine, "",
        `📦 Buyurtmalar soni: ${u.ordersCount ?? 0}`, `💰 Umumiy xarajat: ${fmt(u.totalSpent ?? 0)}`, `📅 Ro‘yxatdan o‘tgan: ${date(u.createdAt.toMillis())}`,
      ].join("\n"),
      buttons: back,
    });
  }
  if (action === "invite") {
    const u = demoDb.get("users", DEMO_UID)!;
    const cycle = u.referralCycle ?? 0;
    const vip = u.tier === "vip" && (u.tierUntil?.toMillis?.() ?? 0) > Date.now();
    const next = cycle < 5 && !vip ? 5 : 10;
    const bar = Array.from({ length: 10 }, (_, i) => (i < cycle ? "🟦" : "⬜")).join("");
    return chat.push({
      chat: "user",
      from: "bot",
      html: [
        "👥 <b>Do‘st taklif qiling — arzon narxda oling!</b>", "",
        "🥉 5 ta do‘st — <b>Bronza</b> narx, 1 hafta",
        "👑 10 ta do‘st — <b>VIP</b> narx, 1 hafta",
        "🔁 Har keyingi 10 ta — VIP yana +1 hafta", "",
        `${bar}  ${cycle}/10`,
        `${next === 5 ? "🥉 Bronza" : "👑 VIP"}gacha yana <b>${next - cycle}</b> ta · jami: ${u.referralsTotal ?? 0}`, "",
        `🔗 Sizning havolangiz:\n<code>${DEMO_REF_LINK}</code>`, "",
        "ℹ️ Faqat botga birinchi marta kirgan yangi odamlar hisoblanadi.",
      ].join("\n"),
      buttons: [[{ text: "🧪 Test: do‘st qo‘shildi (+1)", action: "fake-ref" }], [{ text: "⬅️ Menyu", action: "menu" }]],
    });
  }
  if (action === "help") {
    return chat.push({
      chat: "user",
      from: "bot",
      html: [
        "💬 <b>Yordam</b>", "",
        "1️⃣ «💎 Donat qilish» tugmasini bosing",
        "2️⃣ MLBB ID va Server ID ni kiriting",
        "3️⃣ Akkauntni tekshiring va paketni tanlang",
        "4️⃣ To‘lovni amalga oshiring — diamondlar avtomatik yuboriladi", "",
        "MLBB ID va Server ID ni o‘yinda profil rasmingizni bosib ko‘rishingiz mumkin.", "",
        "⚠️ 🇷🇺 Ru va 🇹🇷 Turk akkauntlariga donat mavjud emas.", "",
        "Savollar bo‘yicha: @Solim_9804",
      ].join("\n"),
      buttons: [[{ text: "✉️ Supportga yozish", action: "support" }], ...back],
    });
  }
}

const BUTTON_TEXT: Record<string, string> = {
  orders: "📦 Buyurtmalarim",
  profile: "👤 Profil",
  help: "💬 Yordam",
  invite: "👥 Do‘st taklif qilish",
  menu: "/start",
};

export function BotSim() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"user" | "admin">("user");
  const [input, setInput] = useState("");
  const all = useSyncExternalStore(chat.subscribe, () => chat.all().length);
  const list = chat.all().filter((m) => m.chat === tab);
  const adminCount = chat.all().filter((m) => m.chat === "admin").length;
  const seenAdmin = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  if (tab === "admin") seenAdmin.current = adminCount;
  const adminUnread = adminCount - seenAdmin.current;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [all, tab]);

  function press(b: ChatButton) {
    if (b.action === "donate") return navigate("/donate");
    if (b.action === "webapp-orders") return navigate("/orders");
    if (b.action === "support") return window.open("https://t.me/Solim_9804", "_blank", "noopener");
    if (b.action === "fake-ref") return simulateReferral();
    chat.push({ chat: "user", from: "me", html: BUTTON_TEXT[b.action] ?? b.text });
    setTimeout(() => botReply(b.action), 350);
  }

  function send() {
    const t = input.trim();
    if (!t) return;
    setInput("");
    chat.push({ chat: "user", from: "me", html: t.replace(/</g, "&lt;") });
    const map: Record<string, ChatButton["action"]> = { "/orders": "orders", "/profile": "profile", "/help": "help", "/invite": "invite" };
    setTimeout(() => botReply(map[t.split(/\s/)[0]] ?? "menu"), 350);
  }

  return (
    <div className="app-bg flex min-h-[calc(100vh-48px)] justify-center">
      <div className="flex w-full max-w-md flex-col">
        {/* chat header */}
        <div className="sticky top-12 z-20 flex items-center gap-3 border-b border-white/5 bg-ink-900/90 px-4 py-2.5 backdrop-blur-xl">
          <Logo size={38} className="rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">S-LynoxDonat</p>
            <p className="text-xs text-sky-300">bot</p>
          </div>
          <div className="flex rounded-xl bg-white/5 p-1 text-xs font-semibold">
            <button onClick={() => setTab("user")} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 ${tab === "user" ? "bg-neon-blue/20 text-white" : "text-slate-400"}`}>
              <User size={13} /> Siz
            </button>
            <button onClick={() => setTab("admin")} className={`relative flex items-center gap-1 rounded-lg px-2.5 py-1.5 ${tab === "admin" ? "bg-neon-blue/20 text-white" : "text-slate-400"}`}>
              <ShieldCheck size={13} /> Admin
              {adminUnread > 0 && tab !== "admin" && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] text-white">{adminUnread}</span>
              )}
            </button>
          </div>
        </div>

        {tab === "admin" && (
          <p className="mx-4 mt-3 rounded-xl bg-white/5 px-3 py-2 text-center text-[11px] text-slate-400">
            Bu — sizning (admin) Telegramingizga keladigan xabarlar. Buyurtma to‘langanda shu yerda paydo bo‘ladi.
          </p>
        )}

        <div className="flex-1 space-y-2.5 px-3 py-4">
          {list.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Hozircha xabar yo‘q. Web App’da buyurtma berib ko‘ring.</p>}
          {list.map((m) => (
            <Bubble key={m.id} m={m} onPress={press} />
          ))}
          <div ref={endRef} />
        </div>

        {tab === "user" && (
          <div className="sticky bottom-0 border-t border-white/5 bg-ink-900/95 p-2.5 backdrop-blur-xl">
            <div className="mb-2 flex gap-2">
              <button className="btn-primary flex-1 py-2.5 text-sm" onClick={() => navigate("/donate")}>
                💎 Donat
              </button>
              <button className="btn-ghost py-2.5 text-sm" onClick={() => press({ text: "", action: "menu" })}>
                /start
              </button>
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input className="input py-2.5" placeholder="Xabar yozing… (/orders, /profile, /help)" value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neon-blue/20 text-neon-blue" aria-label="Yuborish">
                <Send size={18} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function Bubble({ m, onPress }: { m: ChatMessage; onPress: (b: ChatButton) => void }) {
  const mine = m.from === "me";
  return (
    <div className={`flex flex-col animate-fade-up ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${
          mine ? "rounded-br-md bg-gradient-to-br from-sky-600 to-violet-600 text-white" : "rounded-bl-md bg-ink-700 text-slate-100"
        } [&_code]:rounded [&_code]:bg-black/30 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12.5px]`}
        dangerouslySetInnerHTML={{ __html: m.html }}
      />
      {m.buttons && (
        <div className="mt-1 w-full max-w-[85%] space-y-1">
          {m.buttons.map((row, i) => (
            <div key={i} className="flex gap-1">
              {row.map((b) => (
                <button
                  key={b.text}
                  onClick={() => onPress(b)}
                  className="flex-1 rounded-xl bg-ink-700/70 px-2 py-2 text-[13px] font-semibold text-sky-200 ring-1 ring-white/5 transition hover:bg-ink-600 active:scale-[0.98]"
                >
                  {b.text}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <span className="mt-0.5 px-1 text-[10px] text-slate-600">
        {new Date(m.at).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })}
      </span>
    </div>
  );
}
