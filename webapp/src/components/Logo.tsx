import { useState } from "react";

/**
 * Brend logotipi. Siz yuboradigan avatar/logo faylini webapp/public/logo.png ga qo'ying.
 * Fayl hali qo'yilmagan bo'lsa vaqtinchalik "S" harfi ko'rsatiladi (bu yangi logo dizayni emas).
 */
export function Logo({ size = 44, className = "" }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10 ${className}`}
      style={{ width: size, height: size }}
    >
      {!failed ? (
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="S-LynoxDonat"
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-ink-700 font-display font-bold text-slate-200" style={{ fontSize: size * 0.42 }}>
          S
        </div>
      )}
    </div>
  );
}
