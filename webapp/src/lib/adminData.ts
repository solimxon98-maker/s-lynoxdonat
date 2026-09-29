/**
 * Admin panel ma'lumot qatlami: Supabase Auth (email/parol) + RLS himoyalangan jadvallar.
 * Bazadagi snake_case yozuvlar bu yerda camelCase + millisekund vaqtlarga o'giriladi.
 * Demo build'da bu modul brauzer ichidagi mock bilan almashtiriladi (vite.demo.config.ts).
 */
import { supabase } from "./supabase";
import type { OrderRecord, Product, ProductCategory, UserRecord } from "./types";

type Row = Record<string, unknown>;
const t = (v: unknown): number | null => (typeof v === "string" && v ? new Date(v).getTime() : null);

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- auth
export interface AdminUser {
  id: string;
  email: string | null;
}

export async function currentAdmin(): Promise<AdminUser | null | "denied"> {
  const { data } = await supabase().auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  const { data: row } = await supabase().from("admins").select("disabled").eq("user_id", u.id).maybeSingle();
  if (!row || row.disabled) return "denied";
  return { id: u.id, email: u.email ?? null };
}

export function onAdminAuthChange(cb: () => void): () => void {
  const { data } = supabase().auth.onAuthStateChange(() => cb());
  return () => data.subscription.unsubscribe();
}

export async function adminSignIn(email: string, password: string): Promise<void> {
  const { error } = await supabase().auth.signInWithPassword({ email, password });
  if (error) {
    const e = new Error(error.message) as Error & { code?: string };
    e.code = error.status === 429 ? "too-many-requests" : "invalid-credential";
    throw e;
  }
}

export async function adminSignOut(): Promise<void> {
  await supabase().auth.signOut();
}

// ---------------------------------------------------------------- products
const toProduct = (r: Row): Product => ({
  id: String(r.id),
  name: String(r.name),
  category: r.category as ProductCategory,
  oncePerAccount: Boolean(r.once_per_account),
  diamonds: Number(r.diamonds),
  bonus: Number(r.bonus),
  price: Number(r.price),
  priceBronze: (r.price_bronze as number | null) ?? null,
  priceVip: (r.price_vip as number | null) ?? null,
  active: Boolean(r.active),
  sortOrder: Number(r.sort_order),
  providerSku: String(r.provider_sku ?? ""),
});

export type ProductInput = Omit<Product, "id">;
const fromProduct = (p: ProductInput): Row => ({
  name: p.name,
  category: p.category,
  once_per_account: p.oncePerAccount,
  diamonds: p.diamonds,
  bonus: p.bonus,
  price: p.price,
  price_bronze: p.priceBronze ?? null,
  price_vip: p.priceVip ?? null,
  active: p.active,
  sort_order: p.sortOrder,
  provider_sku: p.providerSku ?? "",
});

export async function listProducts(): Promise<Product[]> {
  const { data, error } = await supabase().from("products").select("*").order("sort_order", { ascending: true });
  fail(error);
  return (data ?? []).map(toProduct);
}
export async function createProduct(p: ProductInput): Promise<void> {
  fail((await supabase().from("products").insert(fromProduct(p))).error);
}
export async function updateProduct(id: string, p: ProductInput): Promise<void> {
  fail((await supabase().from("products").update(fromProduct(p)).eq("id", id)).error);
}
export async function setProductActive(id: string, active: boolean): Promise<void> {
  fail((await supabase().from("products").update({ active }).eq("id", id)).error);
}
export async function deleteProduct(id: string): Promise<void> {
  fail((await supabase().from("products").delete().eq("id", id)).error);
}

// ---------------------------------------------------------------- orders
const toOrder = (r: Row): OrderRecord => {
  const p = (r.product ?? {}) as Row;
  return {
    id: String(r.order_no),
    orderNo: String(r.order_no),
    uid: `tg_${r.user_id}`,
    telegramId: String(r.user_id),
    username: (r.username as string | null) ?? null,
    firstName: String(r.first_name ?? ""),
    mlbbId: String(r.mlbb_id),
    serverId: String(r.server_id),
    nickname: String(r.nickname ?? ""),
    productId: String(r.product_id ?? ""),
    product: {
      name: String(p.name ?? ""),
      category: (p.category as ProductCategory) ?? "diamonds",
      diamonds: Number(p.diamonds ?? 0),
      bonus: Number(p.bonus ?? 0),
      price: Number(p.price ?? 0),
      providerSku: (p.provider_sku as string | null) ?? null,
    },
    amount: Number(r.amount),
    priceTier: r.price_tier as OrderRecord["priceTier"],
    currency: String(r.currency ?? "UZS"),
    status: r.status as OrderRecord["status"],
    paymentStatus: r.payment_status as OrderRecord["paymentStatus"],
    paymentId: String(r.payment_id),
    paymentProvider: String(r.payment_provider ?? ""),
    providerOrderId: (r.provider_order_id as string | null) ?? null,
    attempts: Number(r.attempts ?? 0),
    lastError: (r.last_error as OrderRecord["lastError"]) ?? null,
    mock: Boolean(r.mock),
    createdAt: t(r.created_at),
    updatedAt: t(r.updated_at),
    paidAt: t(r.paid_at),
    completedAt: t(r.completed_at),
  };
};

export async function listOrders(start: Date, end: Date, limit = 1000): Promise<OrderRecord[]> {
  const { data, error } = await supabase()
    .from("orders")
    .select("*")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  fail(error);
  return (data ?? []).map(toOrder);
}

export async function recentOrders(limit = 8): Promise<OrderRecord[]> {
  const { data, error } = await supabase().from("orders").select("*").order("created_at", { ascending: false }).limit(limit);
  fail(error);
  return (data ?? []).map(toOrder);
}

export interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  total: number;
  success: number;
  pending: number;
  failed: number;
}

export async function dashboardStats(dayStart: Date): Promise<DashboardStats> {
  const { data, error } = await supabase().rpc("admin_stats", { p_day_start: dayStart.toISOString() });
  fail(error);
  const s = (data ?? {}) as Record<string, number>;
  return {
    todayOrders: Number(s.today_orders ?? 0),
    todayRevenue: Number(s.today_revenue ?? 0),
    total: Number(s.total ?? 0),
    success: Number(s.success ?? 0),
    pending: Number(s.pending ?? 0),
    failed: Number(s.failed ?? 0),
  };
}

export async function providerStatus(): Promise<{ connected?: boolean; balance?: number | null; currency?: string | null; lowBalance?: boolean; message?: string } | null> {
  const { data } = await supabase().from("settings").select("value").eq("key", "provider_status").maybeSingle();
  return (data?.value as Record<string, never>) ?? null;
}

// ---------------------------------------------------------------- users
const toUser = (r: Row): UserRecord => ({
  id: String(r.id),
  uid: `tg_${r.id}`,
  telegramId: String(r.id),
  username: (r.username as string | null) ?? null,
  firstName: String(r.first_name ?? ""),
  lastName: (r.last_name as string | null) ?? null,
  blocked: Boolean(r.blocked),
  ordersCount: Number(r.orders_count ?? 0),
  successfulOrders: Number(r.successful_orders ?? 0),
  totalSpent: Number(r.total_spent ?? 0),
  lastOrderAt: t(r.last_order_at),
  createdAt: t(r.created_at),
  tier: r.tier as UserRecord["tier"],
  tierUntil: t(r.tier_until),
  referralsTotal: Number(r.referrals_total ?? 0),
  referralCycle: Number(r.referral_cycle ?? 0),
  referredBy: r.referred_by ? String(r.referred_by) : null,
});

export async function listUsers(limit = 2000): Promise<UserRecord[]> {
  const { data, error } = await supabase().from("tg_users").select("*").order("created_at", { ascending: false }).limit(limit);
  fail(error);
  return (data ?? []).map(toUser);
}

export async function setUserBlocked(id: string, blocked: boolean): Promise<void> {
  fail((await supabase().from("tg_users").update({ blocked }).eq("id", id)).error);
}
