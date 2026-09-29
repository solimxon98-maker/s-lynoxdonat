export type OrderStatus = "AWAITING_PAYMENT" | "PAID" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export type ProductCategory = "bonus" | "diamonds" | "pass";

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  oncePerAccount: boolean;
  diamonds: number;
  bonus: number;
  price: number;
  priceBronze?: number | null;
  priceVip?: number | null;
  active: boolean;
  sortOrder: number;
  providerSku?: string;
}

export type Tier = "oddiy" | "bronza" | "vip";

export interface Profile {
  uid: string;
  referral?: { total: number; cycle: number; bronzaAt: number; vipAt: number; link: string | null };
  tier: Tier;
  tierUntil: number | null;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photoUrl: string | null;
  ordersCount: number;
  successfulOrders: number;
  totalSpent: number;
  createdAt: number | null;
}

/** Firestore dagi orders hujjati (client o'qiydigan maydonlar) */
export interface OrderRecord {
  id: string;
  orderNo: string;
  uid: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  mlbbId: string;
  serverId: string;
  nickname: string;
  productId: string;
  product: { name: string; category?: ProductCategory; diamonds: number; bonus: number; price: number; providerSku: string | null };
  amount: number;
  priceTier?: Tier;
  currency: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentId: string;
  paymentProvider: string;
  providerOrderId: string | null;
  attempts: number;
  lastError: { code: string; message: string; at: string } | null;
  mock: boolean;
  createdAt: number | null;
  updatedAt: number | null;
  paidAt: number | null;
  completedAt: number | null;
}

export interface UserRecord {
  id: string;
  referralsTotal?: number;
  referralCycle?: number;
  referredBy?: string | null;
  tier?: Tier;
  tierUntil?: number | null;
  uid: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  blocked: boolean;
  ordersCount: number;
  successfulOrders: number;
  totalSpent: number;
  lastOrderAt: number | null;
  createdAt: number | null;
}

export interface PlayerCheck {
  found: boolean;
  nickname: string | null;
  verificationSupported: boolean;
  mlbbId: string;
  serverId: string;
  mock: boolean;
}
