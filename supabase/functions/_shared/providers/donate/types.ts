/**
 * Donat provider abstraksiyasi.
 * Butun loyiha faqat shu interfeys bilan ishlaydi — FastDonate API hujjati kelganda
 * faqat FastDonateService.ts ichi o'zgaradi.
 */

export type ProviderErrorCode =
  | "NOT_CONFIGURED" // API URL / key kiritilmagan
  | "NOT_IMPLEMENTED" // API hujjati hali integratsiya qilinmagan
  | "TIMEOUT"
  | "NETWORK"
  | "PROVIDER_ERROR"
  | "INSUFFICIENT_BALANCE"
  | "PLAYER_NOT_FOUND"
  | "ORDER_FAILED"
  | "INVALID_PRODUCT";

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface CheckPlayerInput {
  mlbbId: string;
  serverId: string;
}

export interface CheckPlayerResult {
  found: boolean;
  nickname: string | null;
  /** Provider nickname tekshirishni qo'llamasa false */
  verificationSupported: boolean;
}

export interface CreateOrderInput {
  /** Bizning buyurtma raqami (SLD-000001). Provider tomonda idempotency uchun ishlatiladi. */
  externalId: string;
  mlbbId: string;
  serverId: string;
  /** "bonus" | "diamonds" | "pass" */
  category: string;
  /** Mahsulot nomi (propusklar uchun muhim) */
  productName: string;
  diamonds: number;
  bonus: number;
  providerSku: string | null;
}

export type ProviderOrderStatus = "PROCESSING" | "SUCCESS" | "FAILED";

export interface ProviderOrderResult {
  providerOrderId: string;
  status: ProviderOrderStatus;
  message?: string;
  raw?: Record<string, unknown>;
}

export interface BalanceResult {
  balance: number;
  currency: string;
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

export interface DonateProvider {
  readonly name: string;
  readonly isMock: boolean;
  checkPlayer(input: CheckPlayerInput): Promise<CheckPlayerResult>;
  createOrder(input: CreateOrderInput): Promise<ProviderOrderResult>;
  checkOrder(providerOrderId: string): Promise<ProviderOrderResult>;
  /** Provider balansni qo'llamasa null qaytaradi */
  getBalance(): Promise<BalanceResult | null>;
  testConnection(): Promise<ConnectionResult>;
}
