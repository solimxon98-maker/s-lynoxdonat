import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Ma'lumotni yuklaydi va `interval` ms da qayta yangilaydi (sahifa ko'rinib turganda).
 * interval = 0 bo'lsa — faqat bir marta. Ilovaga qaytilganda darhol yangilanadi.
 */
export function usePoll<T>(load: () => Promise<T>, interval: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      const v = await loadRef.current();
      setData(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await refresh();
      if (alive && interval > 0) timer = setTimeout(tick, interval);
    };
    tick();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, refresh, ...deps]);

  return { data, error, refresh };
}
