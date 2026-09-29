import { Ban, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, PageHeader, Spinner } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { activeTier, TIER_META } from "../lib/tier";
import type { Tier } from "../lib/types";
import { listUsers, setUserBlocked } from "../lib/adminData";
import { formatDate, formatDateTime, formatSum } from "../lib/format";
import type { UserRecord } from "../lib/types";

const MAX_ROWS = 2000;

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRecord[] | null>(null);
  const [search, setSearch] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers(MAX_ROWS));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!users) return null;
    const s = search.trim().toLowerCase().replace(/^@/, "");
    return users.filter((u) => {
      if (onlyBlocked && !u.blocked) return false;
      if (!s) return true;
      return (
        u.telegramId.includes(s) ||
        (u.username ?? "").toLowerCase().includes(s) ||
        `${u.firstName} ${u.lastName ?? ""}`.toLowerCase().includes(s)
      );
    });
  }, [users, search, onlyBlocked]);

  async function setTier(u: UserRecord, tier: Tier) {
    const label = u.username ? `@${u.username}` : u.firstName;
    const cur = activeTier(u.tier, u.tierUntil);
    const msg =
      tier === "oddiy"
        ? `${label} ning tarifini bekor qilasizmi?`
        : cur === tier
          ? `${label} ga ${TIER_META[tier].label} yana 7 kunga uzaytirilsinmi?`
          : `${label} ga ${TIER_META[tier].label} narx 7 kunga berilsinmi?`;
    if (!window.confirm(msg)) return;
    setBusy(u.id);
    try {
      const r = await api<{ tier: Tier; tierUntil: number | null }>(`/admin/users/${encodeURIComponent(u.id)}/tier`, {
        body: { tier, days: 7 },
        admin: true,
      });
      setUsers(
        (list) =>
          list?.map((x) =>
            x.id === u.id ? { ...x, tier: r.tier, tierUntil: r.tierUntil } : x,
          ) ?? null,
      );
    } catch (e) {
      window.alert(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function changeBalance(u: UserRecord) {
    const label = u.username ? `@${u.username}` : u.firstName;
    const raw = window.prompt(`${label} balansi: ${formatSum(u.balance ?? 0)}\n\nQancha qo‘shish kerak? (ayirish uchun minus: -5000)`, "");
    if (raw === null) return;
    const delta = Number(raw.replace(/[\s,]/g, ""));
    if (!Number.isInteger(delta) || delta === 0) return void window.alert("Butun son kiriting, masalan 10000 yoki -5000");
    const note = window.prompt("Sabab (izoh) — mijozga ham ko‘rsatiladi:", delta > 0 ? "Bonus" : "Tuzatish");
    if (!note?.trim()) return;
    setBusy(u.id);
    try {
      const r = await api<{ balance: number }>(`/admin/users/${encodeURIComponent(u.id)}/balance`, { body: { delta, note }, admin: true });
      setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, balance: r.balance } : x)) ?? null);
    } catch (e) {
      window.alert(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleBlock(u: UserRecord) {
    const next = !u.blocked;
    const label = u.username ? `@${u.username}` : u.firstName;
    if (!window.confirm(next ? `${label} ni bloklaysizmi?` : `${label} ni blokdan chiqarasizmi?`)) return;
    setBusy(u.id);
    try {
      await setUserBlocked(u.id, next);
      setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, blocked: next } : x)) ?? null);
    } catch (e) {
      window.alert(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Foydalanuvchilar"
        subtitle={filtered ? `${filtered.length} ta` : undefined}
        right={
          <button className="btn-ghost px-3 py-2 text-sm" onClick={load} disabled={loading}>
            {loading ? <Spinner size={16} /> : <RefreshCw size={16} />} Yangilash
          </button>
        }
      />

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input py-2.5 pl-11" placeholder="Telegram ID, username yoki ism" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" className="h-4 w-4 accent-rose-400" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} />
          Faqat bloklanganlar
        </label>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {filtered && filtered.length === 0 && <p className="card px-5 py-10 text-center text-sm text-slate-500">Foydalanuvchilar topilmadi</p>}

      {filtered && filtered.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1220px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Telegram ID</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Balans</th>
                <th className="px-4 py-3">Tarif</th>
                <th className="px-4 py-3">Do‘stlar</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Total spent</th>
                <th className="px-4 py-3">Last order</th>
                <th className="px-4 py-3">Registration</th>
                <th className="px-4 py-3 text-right">Holat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((u) => (
                <tr key={u.id} className={u.blocked ? "bg-rose-500/[0.04]" : ""}>
                  <td className="px-4 py-3 font-mono text-xs">{u.telegramId}</td>
                  <td className="px-4 py-3 text-white">{u.username ? `@${u.username}` : "—"}</td>
                  <td className="px-4 py-3">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <b className="text-emerald-300">{formatSum(u.balance ?? 0)}</b>
                    <button className="mt-1 block rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/5" disabled={busy === u.id} onClick={() => changeBalance(u)}>
                      ± Balans
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const t = activeTier(u.tier, u.tierUntil);
                      return (
                        <div className="space-y-1.5">
                          <span className={`chip ${TIER_META[t].chip}`}>
                            {TIER_META[t].emoji} {TIER_META[t].label}
                          </span>
                          {t !== "oddiy" && <p className="text-[11px] text-slate-500">{formatDateTime(u.tierUntil)} gacha</p>}
                          <div className="flex gap-1">
                            <button className="whitespace-nowrap rounded-lg border border-orange-400/30 px-2 py-1 text-[11px] text-orange-300 hover:bg-orange-400/10" disabled={busy === u.id} onClick={() => setTier(u, "bronza")}>
                              +🥉 7 kun
                            </button>
                            <button className="whitespace-nowrap rounded-lg border border-amber-300/40 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-300/10" disabled={busy === u.id} onClick={() => setTier(u, "vip")}>
                              +👑 7 kun
                            </button>
                            {t !== "oddiy" && (
                              <button className="whitespace-nowrap rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5" disabled={busy === u.id} onClick={() => setTier(u, "oddiy")}>
                                Bekor
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <b className="text-white">{u.referralsTotal ?? 0}</b>
                    <span className="text-xs text-slate-500"> · {u.referralCycle ?? 0}/10</span>
                    {u.referredBy && <p className="text-[11px] text-slate-500">← {u.referredBy.replace(/^tg_/, "")}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {u.ordersCount ?? 0}
                    <span className="text-xs text-slate-500"> ({u.successfulOrders ?? 0} ✅)</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-neon-blue">{formatSum(u.totalSpent ?? 0)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{formatDateTime(u.lastOrderAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className={u.blocked ? "btn-ghost px-3 py-1.5 text-xs" : "btn-danger px-3 py-1.5 text-xs"}
                      onClick={() => toggleBlock(u)}
                      disabled={busy === u.id}
                    >
                      {u.blocked ? <ShieldCheck size={14} /> : <Ban size={14} />}
                      {u.blocked ? "Unblock" : "Block"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
