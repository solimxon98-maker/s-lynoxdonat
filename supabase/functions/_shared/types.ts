/** Bazadagi (snake_case) yozuvlar */

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";
export type OrderStatus = "AWAITING_PAYMENT" | "PAID" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED";
export type ProductCategory = "bonus" | "diamonds" | "pass";
export type Tier = "oddiy" | "bronza" | "vip";

export interface TgUser {
  id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  language_code: string | null;
  photo_url: string | null;
  blocked: boolean;
  orders_count: number;
  successful_orders: number;
  total_spent: number;
  last_order_at: string | null;
  tier: Tier;
  tier_until: string | null;
  referred_by: number | null;
  referrals_total: number;
  referral_cycle: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  once_per_account: boolean;
  diamonds: number;
  bonus: number;
  price: number;
  price_bronze: number | null;
  price_vip: number | null;
  active: boolean;
  sort_order: number;
  provider_sku: string;
}

export interface OrderProduct {
  name: string;
  category: ProductCategory;
  diamonds: number;
  bonus: number;
  price: number;
  provider_sku: string | null;
}

export interface Order {
  order_no: string;
  seq: number;
  user_id: number;
  username: string | null;
  first_name: string;
  mlbb_id: string;
  server_id: string;
  nickname: string;
  product_id: string | null;
  product: OrderProduct;
  amount: number;
  price_tier: Tier;
  currency: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_id: string;
  payment_provider: string;
  donate_provider: string;
  provider_order_id: string | null;
  attempts: number;
  last_error: { code: string; message: string; at: string } | null;
  idempotency_key: string;
  mock: boolean;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  processing_at: string | null;
  completed_at: string | null;
}

export interface Payment {
  id: string;
  order_no: string;
  user_id: number;
  provider: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  external_id: string | null;
  pay_url: string | null;
  mode: string | null;
  created_at: string;
}

export const ms = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null);
