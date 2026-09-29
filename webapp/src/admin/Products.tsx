import { Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type ButtonHTMLAttributes, type ChangeEvent, type FormEvent } from "react";
import { Alert, EmptyState, PageHeader, Spinner } from "../components/ui";
import { errorMessage } from "../lib/api";
import { createProduct, deleteProduct, listProducts, setProductActive, updateProduct } from "../lib/adminData";
import { formatNumber, formatSum } from "../lib/format";
import type { Product, ProductCategory } from "../lib/types";

const CATEGORY_LABEL: Record<ProductCategory, string> = { bonus: "🎁 Bonus", diamonds: "💎 Olmos", pass: "🎫 Propusk" };

interface FormState {
  name: string;
  category: ProductCategory;
  oncePerAccount: boolean;
  diamonds: string;
  bonus: string;
  price: string;
  priceBronze: string;
  priceVip: string;
  sortOrder: string;
  providerSku: string;
  active: boolean;
}

const EMPTY: FormState = { name: "", category: "diamonds", oncePerAccount: false, diamonds: "", bonus: "0", price: "", priceBronze: "", priceVip: "", sortOrder: "0", providerSku: "", active: true };

/**
 * Diamond paketlari. Narxlar faqat shu yerdan (Supabase products jadvali) boshqariladi —
 * kodda hech qanday narx yo'q. Web App 30 soniya ichida yangi narxni ko'rsatadi.
 */
export function ProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProducts(await listProducts());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function openNew() {
    const nextSort = products && products.length ? Math.max(...products.map((p) => p.sortOrder ?? 0)) + 10 : 10;
    setEditing({ id: null, form: { ...EMPTY, sortOrder: String(nextSort) } });
  }

  function openEdit(p: Product) {
    setEditing({
      id: p.id,
      form: {
        name: p.name,
        category: p.category ?? "diamonds",
        oncePerAccount: p.oncePerAccount ?? false,
        diamonds: String(p.diamonds),
        bonus: String(p.bonus ?? 0),
        price: String(p.price),
        priceBronze: p.priceBronze ? String(p.priceBronze) : "",
        priceVip: p.priceVip ? String(p.priceVip) : "",
        sortOrder: String(p.sortOrder ?? 0),
        providerSku: p.providerSku ?? "",
        active: p.active,
      },
    });
  }

  async function toggle(p: Product) {
    setBusyId(p.id);
    setError(null);
    try {
      await setProductActive(p.id, !p.active);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p: Product) {
    if (!window.confirm(`"${p.name}" paketini o‘chirasizmi? Bu amalni qaytarib bo‘lmaydi.`)) return;
    setBusyId(p.id);
    setError(null);
    try {
      await deleteProduct(p.id);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Diamond paketlari"
        subtitle="Narx va paketlarni boshqarish"
        right={
          <button className="btn-primary px-4 py-2.5 text-sm" onClick={openNew}>
            <Plus size={16} /> Yangi paket
          </button>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {!products && <Spinner className="text-neon-blue" />}
      {products && products.length === 0 && (
        <EmptyState icon={<Plus size={26} />} title="Paketlar yo‘q" text="«Yangi paket» tugmasi orqali birinchi diamond paketini qo‘shing." />
      )}

      {products && products.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Tartib</th>
                <th className="px-4 py-3">Turi</th>
                <th className="px-4 py-3">Nomi</th>
                <th className="px-4 py-3">Diamond</th>
                <th className="px-4 py-3">Bonus</th>
                <th className="px-4 py-3">Oddiy</th>
                <th className="px-4 py-3">🥉 Bronza</th>
                <th className="px-4 py-3">👑 VIP</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3 text-right">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {products.map((p) => (
                <tr key={p.id} className={p.active ? "" : "opacity-55"}>
                  <td className="px-4 py-3 text-slate-400">{p.sortOrder}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {CATEGORY_LABEL[p.category ?? "diamonds"]}
                    {p.oncePerAccount && <span className="ml-1 text-fuchsia-300">· 1x</span>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">{p.name}</td>
                  <td className="px-4 py-3">{p.diamonds ? `💎 ${formatNumber(p.diamonds)}` : "—"}</td>
                  <td className="px-4 py-3">{p.bonus ? `+${formatNumber(p.bonus)}` : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-bold text-neon-blue">{formatSum(p.price)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-orange-300">{p.priceBronze ? formatSum(p.priceBronze) : "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-amber-200">{p.priceVip ? formatSum(p.priceVip) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{p.providerSku || "—"}</td>
                  <td className="px-4 py-3">
                    {p.active ? (
                      <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300">🟢 Faol</span>
                    ) : (
                      <span className="chip border-rose-400/30 bg-rose-400/10 text-rose-300">🔴 Nofaol</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <IconBtn title={p.active ? "Faolsizlantirish" : "Faollashtirish"} onClick={() => toggle(p)} disabled={busyId === p.id}>
                        <Power size={15} className={p.active ? "text-emerald-300" : "text-rose-300"} />
                      </IconBtn>
                      <IconBtn title="Tahrirlash" onClick={() => openEdit(p)}>
                        <Pencil size={15} />
                      </IconBtn>
                      <IconBtn title="O‘chirish" onClick={() => remove(p)} disabled={busyId === p.id}>
                        <Trash2 size={15} className="text-rose-300" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductForm
          initial={editing.form}
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function IconBtn({ children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-300 transition hover:bg-white/10 disabled:opacity-40" {...rest}>
      {children}
    </button>
  );
}

function ProductForm({ initial, id, onClose, onSaved }: { initial: FormState; id: string | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const isPass = f.category === "pass";
    const diamonds = isPass && !f.diamonds.trim() ? 0 : parseInt(f.diamonds, 10);
    const bonus = parseInt(f.bonus || "0", 10);
    const price = parseInt(f.price.replace(/\s/g, ""), 10);
    const sortOrder = parseInt(f.sortOrder || "0", 10);
    const optPrice = (v: string) => (v.trim() ? parseInt(v.replace(/\s/g, ""), 10) : null);
    const priceBronze = optPrice(f.priceBronze);
    const priceVip = optPrice(f.priceVip);
    for (const [label, v] of [["Bronza", priceBronze], ["VIP", priceVip]] as const) {
      if (v !== null && (!Number.isInteger(v) || v <= 0)) return setError(`${label} narx musbat butun son bo‘lsin (yoki bo‘sh qoldiring)`);
    }
    if (!f.name.trim()) return setError("Paket nomini kiriting");
    if (!Number.isInteger(diamonds) || diamonds < 0 || (!isPass && diamonds === 0)) {
      return setError(isPass ? "Diamond miqdori 0 yoki musbat butun son bo‘lsin" : "Diamond miqdori musbat butun son bo‘lsin");
    }
    if (!Number.isInteger(bonus) || bonus < 0) return setError("Bonus 0 yoki musbat butun son bo‘lsin");
    if (!Number.isInteger(price) || price <= 0) return setError("Narx (so‘mda) musbat butun son bo‘lsin");
    if (!Number.isInteger(sortOrder)) return setError("Tartib raqami butun son bo‘lsin");

    const data = {
      name: f.name.trim(),
      category: f.category,
      oncePerAccount: f.oncePerAccount,
      diamonds,
      bonus,
      price,
      priceBronze,
      priceVip,
      sortOrder,
      active: f.active,
      providerSku: f.providerSku.trim(),
    };

    setBusy(true);
    setError(null);
    try {
      if (id) await updateProduct(id, data);
      else await createProduct(data);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <form onSubmit={submit} className="card-glow relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 animate-fade-up">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">{id ? "Paketni tahrirlash" : "Yangi paket"}</h2>
          <button type="button" className="rounded-full p-2 text-slate-400 hover:bg-white/5" onClick={onClose} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Product name</label>
            <input className="input" value={f.name} onChange={set("name")} maxLength={80} required />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="pcat">Turi</label>
            <select
              id="pcat"
              className="input"
              value={f.category}
              onChange={(e) => {
                const category = e.target.value as ProductCategory;
                setF((s) => ({ ...s, category, oncePerAccount: category === "bonus" ? true : s.oncePerAccount }));
              }}
            >
              <option value="bonus" className="bg-ink-900">🎁 Bonus paket (1 martalik)</option>
              <option value="diamonds" className="bg-ink-900">💎 Olmos paketi</option>
              <option value="pass" className="bg-ink-900">🎫 Propusk</option>
            </select>
          </div>
          <div>
            <label className="label">Diamond amount{f.category === "pass" ? " (ixtiyoriy)" : ""}</label>
            <input className="input" inputMode="numeric" value={f.diamonds} onChange={set("diamonds")} required={f.category !== "pass"} />
          </div>
          <div>
            <label className="label">Bonus</label>
            <input className="input" inputMode="numeric" value={f.bonus} onChange={set("bonus")} />
          </div>
          <div>
            <label className="label">Oddiy narx (so‘m)</label>
            <input className="input" inputMode="numeric" value={f.price} onChange={set("price")} required />
          </div>
          <div>
            <label className="label">🥉 Bronza narx</label>
            <input className="input" inputMode="numeric" value={f.priceBronze} onChange={set("priceBronze")} placeholder="bo‘sh = oddiy" />
          </div>
          <div>
            <label className="label">👑 VIP narx</label>
            <input className="input" inputMode="numeric" value={f.priceVip} onChange={set("priceVip")} placeholder="bo‘sh = bronza" />
          </div>
          <div>
            <label className="label">Sort order</label>
            <input className="input" inputMode="numeric" value={f.sortOrder} onChange={set("sortOrder")} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">FastDonate SKU (ixtiyoriy)</label>
            <input className="input" value={f.providerSku} onChange={set("providerSku")} placeholder="API hujjati kelgach to‘ldiriladi" maxLength={120} />
          </div>
          <label className="flex cursor-pointer items-center gap-3 sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 accent-fuchsia-400" checked={f.oncePerAccount} onChange={set("oncePerAccount")} />
            <span className="text-sm text-slate-300">1 martalik — bitta MLBB akkaunt faqat bir marta sotib oladi</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 accent-cyan-400" checked={f.active} onChange={set("active")} />
            <span className="text-sm text-slate-300">Active — Web Appda ko‘rsatilsin</span>
          </label>
        </div>

        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            Bekor qilish
          </button>
          <button className="btn-primary flex-1" disabled={busy}>
            {busy && <Spinner size={16} />} Saqlash
          </button>
        </div>
      </form>
    </div>
  );
}
