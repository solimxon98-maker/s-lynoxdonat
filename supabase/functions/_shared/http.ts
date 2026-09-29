import { config } from "./config.ts";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
export const badRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const unauthorized = (msg = "Avtorizatsiya talab qilinadi") => new HttpError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "Ruxsat yo'q") => new HttpError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Topilmadi") => new HttpError(404, "NOT_FOUND", msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = config.allowedOrigin;
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = !allowed ? "*" : allowed.split(",").map((s) => s.trim()).includes(origin) ? origin : allowed.split(",")[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-session, content-type, apikey, x-client-info",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

export function json(req: Request, status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

export function errorResponse(req: Request, e: unknown): Response {
  if (e instanceof HttpError) return json(req, e.status, { ok: false, code: e.code, message: e.message });
  console.error("Unhandled", e);
  return json(req, 500, { ok: false, code: "INTERNAL", message: "Serverda xatolik yuz berdi." });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET") return {};
  const text = await req.text();
  if (text.length > 100_000) throw badRequest("TOO_LARGE", "So'rov juda katta");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    throw badRequest("BAD_JSON", "Noto'g'ri JSON");
  }
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
