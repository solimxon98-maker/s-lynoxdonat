export type OrderStatus = "AWAITING_PAYMENT" | "PAID" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED" | "REFUNDED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

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
  tierPermanent?: boolean;
  balance?: number;
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
  permanentTier?: Tier;
  uid: string;
  telegramId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  blocked: boolean;
  balance?: number;
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

export type CardBank = "humo" | "uzcard" | "uzum" | "visa" | "mastercard" | "other";

export interface PaymentCard {
  id: string;
  bank: CardBank;
  bankLabel?: string;
  number: string;
  holder: string;
  note: string;
  active?: boolean;
  sortOrder?: number;
}

export type TopupStatus = "AWAITING_RECEIPT" | "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface Topup {
  topupNo: string;
  amount: number;
  credited: number | null;
  status: TopupStatus;
  card: { bank: CardBank; bankLabel: string; number: string; holder: string };
  hasReceipt: boolean;
  rejectReason: string | null;
  createdAt: number | null;
  decidedAt: number | null;
}

export interface BalanceTx {
  id: number;
  delta: number;
  balanceAfter: number;
  kind: "topup" | "purchase" | "refund" | "admin";
  ref: string | null;
  note: string | null;
  createdAt: number | null;
}

export interface WalletData {
  balance: number;
  cards: PaymentCard[];
  topups: Topup[];
  transactions: BalanceTx[];
}

/** Admin panel: to'ldirish so'rovi (foydalanuvchi bilan) */
export interface TopupRecord extends Topup {
  userId: string;
  username: string | null;
  firstName: string;
  decidedBy: string | null;
}
