/** Telegram foydalanuvchi sessiyasi (server imzolagan token). Sahifa yangilansa ham saqlanadi. */
const KEY = "sld:session";
let token: string | null = null;

export function getSession(): string | null {
  if (token) return token;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { token: string; exp: number };
    if (v.exp > Date.now() + 60_000) token = v.token;
  } catch {
    /* sessionStorage mavjud emas */
  }
  return token;
}

export function setSession(t: string, exp: number) {
  token = t;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ token: t, exp }));
  } catch {
    /* noop */
  }
}

export function clearSession() {
  token = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
