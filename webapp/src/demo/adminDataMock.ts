/* eslint-disable @typescript-eslint/no-explicit-any */
/** DEMO: lib/adminData.ts o'rniga — brauzer ichidagi demo bazadan o'qiydi */
import type { OrderRecord, Product, UserRecord } from "../lib/types";
import { demoDb, Timestamp } from "./store";
import { demoAuth } from "./supabaseMock";

const ms = (v: any): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : null);
const ADMIN_UID = "admin_demo";

export interface AdminUser {
  id: string;
  email: string | null;
}
export type ProductInput = Omit<Product, "id">;

export async function currentAdmin(): Promise<AdminUser | null | "denied"> {
  if (!demoAuth.token) return null;
  return { id: demoAuth.token, email: "admin@demo" };
}
export function onAdminAuthChange(cb: () => void) {
  const off = demoAuth.subscribe(cb);
  return () => {
    off();
  };
}
export async function adminSignIn(email: string, password: string) {
  await new Promise((r) => setTimeout(r, 400));
  if (!email || !password) throw Object.assign(new Error("bad"), { code: "invalid-credential" });
  demoAuth.signIn(ADMIN_UID);
}
export async function adminSignOut() {
  demoAuth.signOut();
}

const toProduct = (id: string, d: any): Product => ({ id, ...d, priceBronze: d.priceBronze ?? null, priceVip: d.priceVip ?? null });
export async function listProducts(): Promise<Product[]> {
  return demoDb
    .list("products")
    .map(([id, d]) => toProduct(id, d))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
export async function createProduct(p: ProductInput) {
  demoDb.set("products", demoDb.newId(), { ...p, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
}
export async function updateProduct(id: string, p: ProductInput) {
  demoDb.update("products", id, { ...p, updatedAt: Timestamp.now() });
}
export async function setProductActive(id: string, active: boolean) {
  demoDb.update("products", id, { active });
}
export async function deleteProduct(id: string) {
  demoDb.delete("products", id);
}

const toOrder = (id: string, o: any): OrderRecord => ({
  ...o,
  id,
  createdAt: ms(o.createdAt),
  updatedAt: ms(o.updatedAt),
  paidAt: ms(o.paidAt),
  completedAt: ms(o.completedAt),
  lastError: o.lastError ? { ...o.lastError, at: String(ms(o.lastError.at)) } : null,
});
const allOrders = () =>
  demoDb
    .list("orders")
    .map(([id, o]) => toOrder(id, o))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

export async function listOrders(start: Date, end: Date, limit = 1000) {
  return allOrders()
    .filter((o) => (o.createdAt ?? 0) >= start.getTime() && (o.createdAt ?? 0) <= end.getTime())
    .slice(0, limit);
}
export async function recentOrders(limit = 8) {
  return allOrders().slice(0, limit);
}
export async function dashboardStats(dayStart: Date) {
  const all = allOrders();
  const today = all.filter((o) => (o.createdAt ?? 0) >= dayStart.getTime());
  return {
    todayOrders: today.length,
    todayRevenue: today.filter((o) => o.paymentStatus === "PAID").reduce((a, o) => a + o.amount, 0),
    total: all.length,
    success: all.filter((o) => o.status === "SUCCESS").length,
    pending: all.filter((o) => ["AWAITING_PAYMENT", "PAID", "PROCESSING"].includes(o.status)).length,
    failed: all.filter((o) => o.status === "FAILED").length,
  };
}
export async function providerStatus() {
  return (demoDb.get("settings", "providerStatus") as any) ?? null;
}

export async function listUsers(limit = 2000): Promise<UserRecord[]> {
  return demoDb
    .list("users")
    .map(([id, u]) => ({
      ...u,
      id: id.replace(/^tg_/, ""),
      tierUntil: ms(u.tierUntil),
      lastOrderAt: ms(u.lastOrderAt),
      createdAt: ms(u.createdAt),
    }))
    .sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, limit) as UserRecord[];
}
export async function setUserBlocked(id: string, blocked: boolean) {
  demoDb.update("users", `tg_${id}`, { blocked });
}
