import { db } from "./db.ts";

export type LogLevel = "info" | "warn" | "error";
const SECRET_KEYS = /(key|secret|token|password|authorization|sign)/i;

function sanitize(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SECRET_KEYS.test(k)) out[k] = "***";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = sanitize(v as Record<string, unknown>);
    else if (typeof v === "string" && v.length > 2000) out[k] = v.slice(0, 2000);
    else out[k] = v;
  }
  return out;
}

/** Konsol + logs jadvali. Maxfiy kalitlar "***" bilan almashtiriladi. */
export async function writeLog(level: LogLevel, event: string, data: Record<string, unknown> = {}): Promise<void> {
  const safe = sanitize(data);
  const line = JSON.stringify({ level, event, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  try {
    await db().from("logs").insert({
      level,
      event,
      order_no: typeof safe.orderNo === "string" ? safe.orderNo : null,
      data: safe,
    });
  } catch (e) {
    console.error("log_write_failed", String(e));
  }
}
