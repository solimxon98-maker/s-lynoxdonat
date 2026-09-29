import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, apiConfigured } from "../lib/api";
import { clearSession, setSession } from "../lib/session";
import { getInitData } from "../lib/telegram";
import type { Profile } from "../lib/types";

type Status = "loading" | "ready" | "no-telegram" | "blocked" | "error" | "not-configured";

interface AuthState {
  status: Status;
  error: string | null;
  profile: Profile | null;
  mockMode: boolean;
  supportUsername: string | null;
  refreshProfile: () => Promise<void>;
  retry: () => void;
}

interface AuthResponse {
  session?: string;
  expiresAt?: number;
  user: Profile;
  mockMode: boolean;
  supportUsername: string | null;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Telegram foydalanuvchisini avtorizatsiya qiladi:
 *  initData -> POST /auth/telegram (server HMAC bilan tekshiradi) -> imzolangan sessiya.
 * Frontend o'zi hech qanday Telegram ID yubormaydi.
 */
export function TelegramAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [supportUsername, setSupport] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;

    if (!apiConfigured) {
      setStatus("not-configured");
      return;
    }
    const initData = getInitData();
    if (!initData) {
      setStatus("no-telegram");
      return;
    }

    (async () => {
      setStatus("loading");
      setError(null);
      try {
        clearSession();
        const data = await api<AuthResponse>("/auth/telegram", { body: { initData } });
        if (!data.session || !data.expiresAt) throw new Error("Sessiya olinmadi");
        setSession(data.session, data.expiresAt);
        setProfile(data.user);
        setMockMode(data.mockMode);
        setSupport(data.supportUsername);
        setStatus("ready");
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          setStatus("blocked");
          setError(e.message);
        } else {
          setStatus("error");
          setError(e instanceof Error ? e.message : "Xatolik");
        }
      }
    })();
  }, [attempt]);

  const refreshProfile = useCallback(async () => {
    const data = await api<AuthResponse>("/me");
    setProfile(data.user);
    setMockMode(data.mockMode);
    setSupport(data.supportUsername);
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const value = useMemo<AuthState>(
    () => ({ status, error, profile, mockMode, supportUsername, refreshProfile, retry }),
    [status, error, profile, mockMode, supportUsername, refreshProfile, retry],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTelegramAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTelegramAuth TelegramAuthProvider ichida ishlatilishi kerak");
  return v;
}
