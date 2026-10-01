import { useEffect, useRef, useState } from "react";

/**
 * Sahifa ichidagi tasdiqlash/kiritish oynasi — window.confirm/prompt/alert o'rniga.
 * (Ba'zi brauzerlar va ilova ichidagi brauzerlar tizim oynalarini to'sadi — tugma "bosilmaydi".)
 */
type Kind = "confirm" | "prompt" | "alert";
interface Req {
  kind: Kind;
  message: string;
  value: string;
  resolve: (v: unknown) => void;
}

let current: Req | null = null;
const subs = new Set<() => void>();
function open<T>(kind: Kind, message: string, value = ""): Promise<T> {
  return new Promise<T>((resolve) => {
    current?.resolve(kind === "confirm" ? false : null);
    current = { kind, message, value, resolve: resolve as (v: unknown) => void };
    subs.forEach((f) => f());
  });
}

export const dialog = {
  confirm: (message: string) => open<boolean>("confirm", message),
  prompt: (message: string, value = "") => open<string | null>("prompt", message, value),
  alert: (message: string) => open<void>("alert", message),
};

export function DialogHost() {
  const [, force] = useState(0);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const f = () => {
      setValue(current?.value ?? "");
      force((n) => n + 1);
    };
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);

  useEffect(() => {
    if (current?.kind === "prompt") setTimeout(() => inputRef.current?.select(), 30);
  });

  const req = current;
  if (!req) return null;

  const close = (result: unknown) => {
    current = null;
    req.resolve(result);
    force((n) => n + 1);
  };
  const ok = () => close(req.kind === "confirm" ? true : req.kind === "prompt" ? value : undefined);
  const cancel = () => close(req.kind === "confirm" ? false : req.kind === "prompt" ? null : undefined);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={cancel} role="dialog" aria-modal="true">
      <div className="card-glow w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{req.message}</p>
        {req.kind === "prompt" && (
          <input
            ref={inputRef}
            className="input mt-4"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ok();
              if (e.key === "Escape") cancel();
            }}
          />
        )}
        <div className="mt-5 flex gap-2">
          {req.kind !== "alert" && (
            <button className="btn-ghost flex-1" onClick={cancel}>
              Bekor
            </button>
          )}
          <button className="btn-primary flex-1" onClick={ok} autoFocus={req.kind !== "prompt"}>
            {req.kind === "alert" ? "OK" : req.kind === "confirm" ? "Ha" : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}
