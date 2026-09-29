import { config } from "../../config.ts";
import { FastDonateService } from "./FastDonateService.ts";
import { MockDonateProvider } from "./MockDonateProvider.ts";
import type { DonateProvider } from "./types.ts";

export * from "./types.ts";

let mock: MockDonateProvider | null = null;
let real: FastDonateService | null = null;

/** MOCK_MODE ga qarab to'g'ri donat providerni qaytaradi. */
export function getDonateProvider(): DonateProvider {
  if (config.mockMode) {
    mock ??= new MockDonateProvider();
    return mock;
  }
  real ??= new FastDonateService();
  return real;
}
