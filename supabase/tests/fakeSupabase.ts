// PGlite ustida supabase-js ning biz ishlatadigan qismi (faqat testlar uchun)
import { PGlite } from "npm:@electric-sql/pglite@0.3";

type Filter = { col: string; op: string; val: unknown };
const SETOF = new Set(["upsert_tg_user"]);

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, norm(x)]));
  return v;
}
const param = (v: unknown) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);

class QB {
  op = "select"; cols = "*"; filters: Filter[] = []; orders: string[] = []; lim?: number; mode: "many" | "maybe" | "single" = "many"; values?: Record<string, unknown>;
  constructor(private db: PGlite, private table: string) {}
  select(c = "*") { if (this.op === "select") this.cols = c; return this; }
  insert(v: Record<string, unknown>) { this.op = "insert"; this.values = v; return this; }
  update(v: Record<string, unknown>) { this.op = "update"; this.values = v; return this; }
  upsert(v: Record<string, unknown>) { this.op = "upsert"; this.values = v; return this; }
  eq(col: string, val: unknown) { this.filters.push({ col, op: "=", val }); return this; }
  lte(col: string, val: unknown) { this.filters.push({ col, op: "<=", val }); return this; }
  gte(col: string, val: unknown) { this.filters.push({ col, op: ">=", val }); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push(`${col} ${o?.ascending === false ? "desc" : "asc"}`); return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  async run() {
    const params: unknown[] = [];
    const where = this.op === "select" && this.filters.length ? " where " + this.filters.map((f) => { params.push(param(f.val)); return `${f.col} ${f.op} $${params.length}`; }).join(" and ") : "";
    let sql = "";
    if (this.op === "select") {
      sql = `select ${this.cols} from public.${this.table}${where}${this.orders.length ? " order by " + this.orders.join(",") : ""}${this.lim ? " limit " + this.lim : ""}`;
    } else if (this.op === "insert" || this.op === "upsert") {
      const keys = Object.keys(this.values!);
      const ph = keys.map((k) => { params.push(param(this.values![k])); return `$${params.length}`; });
      sql = `insert into public.${this.table} (${keys.join(",")}) values (${ph.join(",")})`;
      if (this.op === "upsert") sql += ` on conflict (key) do update set ${keys.filter((k) => k !== "key").map((k) => `${k} = excluded.${k}`).join(",")}`;
    } else if (this.op === "update") {
      const sets = Object.keys(this.values!).map((k) => { params.push(param(this.values![k])); return `${k} = $${params.length}`; });
      // filtrlar parametrlari set'lardan keyin kelishi kerak
      const wparams: string[] = [];
      for (const f of this.filters) { params.push(param(f.val)); wparams.push(`${f.col} ${f.op} $${params.length}`); }
      sql = `update public.${this.table} set ${sets.join(",")}${wparams.length ? " where " + wparams.join(" and ") : ""}`;
    }
    try {
      const r = await this.db.query(sql, params);
      const rows = norm(r.rows) as Record<string, unknown>[];
      if (this.mode === "many") return { data: rows, error: null };
      return { data: rows[0] ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return this.run().then(res, rej); }
}

export function fakeClient(db: PGlite, admins: Record<string, string>) {
  return {
    from: (t: string) => new QB(db, t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const keys = Object.keys(args);
      const call = `public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
      try {
        const r = await db.query(SETOF.has(fn) ? `select * from ${call}` : `select ${call} as v`, keys.map((k) => param(args[k])));
        const rows = norm(r.rows) as Record<string, unknown>[];
        return { data: SETOF.has(fn) ? rows : rows[0]?.v ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
    auth: {
      getUser: async (token: string) =>
        admins[token] ? { data: { user: { id: admins[token] } }, error: null } : { data: { user: null }, error: { message: "bad" } },
    },
  };
}
