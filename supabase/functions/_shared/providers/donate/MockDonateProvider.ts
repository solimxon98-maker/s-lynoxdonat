import { config } from "../../config.ts";
import { checkPlayerViaFastDonate } from "./playerCheck.ts";
import {
  BalanceResult,
  CheckPlayerInput,
  CheckPlayerResult,
  ConnectionResult,
  CreateOrderInput,
  DonateProvider,
  ProviderError,
  ProviderOrderResult,
} from "./types.ts";

/**
 * MOCK donat provider — MOCK_MODE=true bo'lganda ishlaydi.
 * Haqiqiy pul sarflanmaydi, hech qanday tashqi API chaqirilmaydi.
 *
 * Test ssenariylari (MLBB ID bo'yicha):
 *   000000000        -> akkaunt topilmadi (PLAYER_NOT_FOUND)
 *   ...999 bilan tugasa -> buyurtma xatosi (ORDER_FAILED)
 *   ...998 bilan tugasa -> balans yetarli emas (INSUFFICIENT_BALANCE)
 *   ...997 bilan tugasa -> timeout (TIMEOUT)
 *   qolgan hammasi    -> PROCESSING, ~5 soniyadan keyin SUCCESS
 */
export class MockDonateProvider implements DonateProvider {
  readonly name = "fastdonate-mock";
  readonly isMock = true;

  private static readonly COMPLETE_AFTER_MS = 5000;

  async checkPlayer({ mlbbId, serverId }: CheckPlayerInput): Promise<CheckPlayerResult> {
    // Test rejimda ham nik haqiqiy tekshiriladi (FastDonate, login shart emas)
    if (config.fastdonate.playerCheck === "real") return await checkPlayerViaFastDonate(mlbbId, serverId);
    await delay(400);
    if (/^0+$/.test(mlbbId)) {
      return { found: false, nickname: null, verificationSupported: true };
    }
    return {
      found: true,
      nickname: `MLBB_Player_${mlbbId.slice(-4)}`,
      verificationSupported: true,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrderResult> {
    await delay(500);
    if (input.mlbbId.endsWith("999")) {
      throw new ProviderError("ORDER_FAILED", "Mock: provider buyurtmani rad etdi");
    }
    if (input.mlbbId.endsWith("998")) {
      throw new ProviderError("INSUFFICIENT_BALANCE", "Mock: provider balansi yetarli emas");
    }
    if (input.mlbbId.endsWith("997")) {
      throw new ProviderError("TIMEOUT", "Mock: provider javob bermadi (timeout)");
    }
    if (/^0+$/.test(input.mlbbId)) {
      throw new ProviderError("PLAYER_NOT_FOUND", "Mock: akkaunt topilmadi");
    }
    const providerOrderId = `MOCK-${Date.now()}-${input.externalId}`;
    return { providerOrderId, status: "PROCESSING", message: "Mock buyurtma qabul qilindi" };
  }

  async checkOrder(providerOrderId: string): Promise<ProviderOrderResult> {
    const m = /^MOCK-(\d+)-/.exec(providerOrderId);
    if (!m) throw new ProviderError("PROVIDER_ERROR", "Mock: noma'lum buyurtma ID");
    const createdAt = Number(m[1]);
    const done = Date.now() - createdAt >= MockDonateProvider.COMPLETE_AFTER_MS;
    return {
      providerOrderId,
      status: done ? "SUCCESS" : "PROCESSING",
      message: done ? "Mock: diamondlar yuborildi" : "Mock: bajarilmoqda",
    };
  }

  async getBalance(): Promise<BalanceResult | null> {
    return { balance: 1_000_000, currency: "RUB" };
  }

  async testConnection(): Promise<ConnectionResult> {
    return { ok: true, message: "MOCK rejim: ulanish simulyatsiya qilinmoqda" };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
