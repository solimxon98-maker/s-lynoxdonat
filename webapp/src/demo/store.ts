/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DEMO: brauzer xotirasidagi mini-baza (demo backend va admin mock uchun).
 * Faqat demo build'da ishlatiladi. Haqiqiy loyihaga ta'sir qilmaydi.
 */

export class Timestamp {
  constructor(private ms: number) {}
  static now() {
    return new Timestamp(Date.now());
  }
  static fromMillis(ms: number) {
    return new Timestamp(ms);
  }
  static fromDate(d: Date) {
    return new Timestamp(d.getTime());
  }
  toMillis() {
    return this.ms;
  }
  toDate() {
    return new Date(this.ms);
  }
}

const SERVER_TS = { __serverTimestamp: true };
export function serverTimestamp(): any {
  return SERVER_TS;
}

type Data = Record<string, any>;
const store = new Map<string, Map<string, Data>>();
const listeners = new Set<() => void>();

function colMap(name: string) {
  let m = store.get(name);
  if (!m) store.set(name, (m = new Map()));
  return m;
}

function resolve(data: Data): Data {
  const out: Data = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === SERVER_TS) out[k] = Timestamp.now();
    else if (v && typeof v === "object" && v.__increment !== undefined) out[k] = v;
    else out[k] = v;
  }
  return out;
}

let notifyQueued = false;
function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    listeners.forEach((l) => l());
  });
}

// ---------- low-level API used by the demo backend ----------
export const demoDb = {
  get(col: string, id: string): Data | undefined {
    const d = colMap(col).get(id);
    return d ? { ...d } : undefined;
  },
  set(col: string, id: string, data: Data) {
    colMap(col).set(id, resolve(data));
    notify();
  },
  update(col: string, id: string, patch: Data) {
    const cur = colMap(col).get(id);
    if (!cur) throw new Error(`Demo: ${col}/${id} topilmadi`);
    const next = { ...cur };
    for (const [k, v] of Object.entries(resolve(patch))) {
      if (v && typeof v === "object" && typeof v.__increment === "number") next[k] = (Number(next[k]) || 0) + v.__increment;
      else next[k] = v;
    }
    colMap(col).set(id, next);
    notify();
  },
  delete(col: string, id: string) {
    colMap(col).delete(id);
    notify();
  },
  list(col: string): [string, Data][] {
    return [...colMap(col).entries()].map(([id, d]) => [id, { ...d }]);
  },
  newId() {
    return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  },
  increment(n: number) {
    return { __increment: n };
  },
};
