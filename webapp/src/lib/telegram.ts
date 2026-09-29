/** Telegram Web App SDK uchun yupqa, tiplangan o'ram. */

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgHaptic {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
  notificationOccurred(type: "error" | "success" | "warning"): void;
  selectionChanged(): void;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name: string; username?: string; photo_url?: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  isExpanded: boolean;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  isVersionAtLeast?(v: string): boolean;
  openLink(url: string, opts?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  showAlert?(message: string, cb?: () => void): void;
  showConfirm?(message: string, cb?: (ok: boolean) => void): void;
  BackButton: TgBackButton;
  HapticFeedback?: TgHaptic;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function getTg(): TgWebApp | null {
  const wa = window.Telegram?.WebApp;
  return wa && typeof wa.ready === "function" ? wa : null;
}

export function getInitData(): string {
  return getTg()?.initData ?? "";
}

export function isInTelegram(): boolean {
  return getInitData().length > 0;
}

/** Ilova ochilganda bir marta chaqiriladi. */
export function initTelegram(): void {
  const tg = getTg();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    const at = (v: string) => (tg.isVersionAtLeast ? tg.isVersionAtLeast(v) : false);
    if (at("6.1")) {
      tg.setHeaderColor?.("#070a1a");
      tg.setBackgroundColor?.("#04050d");
    }
    if (at("7.10")) tg.setBottomBarColor?.("#070a1a");
    if (at("7.7")) tg.disableVerticalSwipes?.();
    document.documentElement.dataset.tgPlatform = tg.platform;
  } catch {
    /* eski Telegram versiyalari */
  }
}

export const haptic = {
  tap() {
    try {
      getTg()?.HapticFeedback?.impactOccurred("light");
    } catch {
      /* noop */
    }
  },
  success() {
    try {
      getTg()?.HapticFeedback?.notificationOccurred("success");
    } catch {
      /* noop */
    }
  },
  error() {
    try {
      getTg()?.HapticFeedback?.notificationOccurred("error");
    } catch {
      /* noop */
    }
  },
  select() {
    try {
      getTg()?.HapticFeedback?.selectionChanged();
    } catch {
      /* noop */
    }
  },
};

export function openExternal(url: string): void {
  const tg = getTg();
  if (tg && url.startsWith("https://t.me/")) tg.openTelegramLink(url);
  else if (tg) tg.openLink(url);
  else window.open(url, "_blank", "noopener");
}

/** Telegram BackButton ni sahifa bilan bog'lash */
export function bindBackButton(onBack: () => void): () => void {
  const tg = getTg();
  if (!tg?.BackButton || !(tg.isVersionAtLeast?.("6.1") ?? false)) return () => undefined;
  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onBack);
    tg.BackButton.hide();
  };
}
