// FastDonateService — soxta FastDonate API bilan (login, xarid, holat, xatolar)
Deno.env.set("SLD_TEST", "1");
Deno.env.set("FASTDONATE_API_KEY", "mylogin");
Deno.env.set("FASTDONATE_SECRET", "mypass");
const { setDbClientForTests } = await import("../functions/_shared/db.ts");
let ourOrders: { provider_order_id: string | null }[] = [];
const q: Record<string, unknown> = { select: () => q, eq: () => q, gte: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (res: (v: unknown) => unknown) => res({ data: ourOrders, error: null }) };
setDbClientForTests({ from: () => q });
const { FastDonateService, parseSku } = await import("../functions/_shared/providers/donate/FastDonateService.ts");

const ok = (c: unknown, m: string) => { if (!c) { console.error("✗", m); Deno.exit(1); } console.log("✓", m); };
const calls: { path: string; auth: string | null; body: unknown }[] = [];
let tokenValid = "T1";
let buyReply: unknown = { success: true, message: "ok", data: { message: "ok" } };
let orders: unknown[] = [];
let logins = 0;
let fdSeq = 10000;
let autoRows = false;
let autoStatus = 1;
globalThis.fetch = async (u: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(u));
  const auth = new Headers(init?.headers).get("authorization");
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  calls.push({ path: url.pathname + url.search, auth, body });
  const j = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s });
  if (url.pathname === "/auth/login") {
    logins++;
    return body.username === "mylogin" && body.password === "mypass" ? j(200, { success: true, data: { access_token: tokenValid } }) : j(401, { success: false, error: { code: "bad", message: "bad creds" } });
  }
  if (auth !== `Bearer ${tokenValid}`) return j(401, { success: false, error: { code: "unauthorized", message: "expired" } });
  if (url.pathname === "/auth/me") return j(200, { success: true, data: { username: "TURSUN", role: "premium", balance: 52000 } });
  if (url.pathname === "/merchant/buy") {
    if (typeof buyReply === "function") return (buyReply as () => Response)();
    if ((buyReply as { success: boolean }).success && autoRows) {
      for (const p of body.products) for (let i = 0; i < p.count; i++) orders.push({ id: ++fdSeq, status: autoStatus, user_id: body.user_id, server_id: body.server_id, diamonds: 0, created_at: new Date().toISOString().replace("Z", "+00:00") });
    }
    return j(200, buyReply);
  }
  if (url.pathname === "/profile/orders") return j(200, { success: true, data: { orders } });
  return j(404, { success: false, error: { code: "nf", message: "nf" } });
};

ok(JSON.stringify(parseSku("6x2")) === '[{"id":6,"count":2}]' && JSON.stringify(parseSku("5")) === '[{"id":5,"count":1}]', "paket kodi: 5, 6x2");
let bad = false; try { parseSku("abc"); } catch { bad = true; } ok(bad, "noto'g'ri kod rad etiladi");

const fd = new FastDonateService();
ok((await fd.getBalance())?.balance === 52000, "login + balans (52 000 so'm)");
ok(calls[0].path === "/auth/login" && calls[1].auth === "Bearer T1", "Bearer token bilan so'rov");
const t = await fd.testConnection();
ok(t.ok && t.message.includes("premium"), "ulanish testi: " + t.message);

// Haqiqiy javob (sinov xaridi): buyurtma darhol status 1 bilan tarixda paydo bo'ladi
autoRows = true;
orders = [{ id: 9990, status: 1, user_id: 123456789, server_id: 1234, created_at: new Date(Date.now() - 3600_000).toISOString() }];
const r = await fd.createOrder({ externalId: "SLD-000001", mlbbId: "123456789", serverId: "1234", category: "diamonds", productName: "344", diamonds: 344, bonus: 0, providerSku: "6x2" });
const buy = calls.find((c) => c.path === "/merchant/buy")!;
ok(JSON.stringify(buy.body) === '{"products":[{"id":6,"count":2}],"user_id":123456789,"server_id":1234}', "xarid so'rovi: products + raqamli ID");
ok(r.status === "SUCCESS" && /^FD:\d+:123456789:1234:2:10001,10002$/.test(r.providerOrderId), "darhol SUCCESS, 2 ta qator biriktirildi: " + r.providerOrderId);
ourOrders = [{ provider_order_id: r.providerOrderId }];
const r2 = await fd.createOrder({ externalId: "SLD-000002", mlbbId: "123456789", serverId: "1234", category: "pass", productName: "Haftalik", diamonds: 0, bonus: 0, providerSku: "13" });
ok(r2.status === "SUCCESS" && r2.providerOrderId.endsWith(":1:10003"), "ketma-ket ikkinchi xarid boshqa qatorni oladi (adashmaydi)");
ok((await fd.checkOrder(r2.providerOrderId)).status === "SUCCESS", "biriktirilgan buyurtma — SUCCESS");
autoStatus = 0;
const r3 = await fd.createOrder({ externalId: "SLD-000003", mlbbId: "555555555", serverId: "1", category: "d", productName: "86", diamonds: 86, bonus: 0, providerSku: "5" });
ok(r3.status === "PROCESSING" && r3.providerOrderId.split(":").length === 5, "bajarilmagan (status 0) -> PROCESSING");
orders = orders.map((o) => (o as { user_id: number }).user_id === 555555555 ? { ...(o as object), status: 1 } : o);
ok((await fd.checkOrder(r3.providerOrderId)).status === "SUCCESS", "keyin status 1 bo'ldi -> SUCCESS");
autoRows = false;
const old = `FD:${Date.now() - 25 * 60_000}:777777777:1:1`;
ok((await fd.checkOrder(old)).status === "FAILED", "20 daqiqada topilmasa -> FAILED (admin tekshiradi)");

tokenValid = "T2";
const before = logins;
ok((await fd.getBalance())?.balance === 52000 && logins === before + 1, "token eskirsa — avtomatik qayta login");

buyReply = { success: false, error: { code: "insufficient_balance", message: "Balans yetarli emas" } };
let code = ""; try { await fd.createOrder({ externalId: "x", mlbbId: "1", serverId: "1", category: "d", productName: "x", diamonds: 1, bonus: 0, providerSku: "5" }); } catch (e) { code = (e as { code: string }).code; }
ok(code === "INSUFFICIENT_BALANCE", "FastDonate balansi yetmasa -> INSUFFICIENT_BALANCE");
buyReply = { success: false, error: { code: "invalid_user", message: "User not found" } };
code = ""; try { await fd.createOrder({ externalId: "x", mlbbId: "1", serverId: "1", category: "d", productName: "x", diamonds: 1, bonus: 0, providerSku: "5" }); } catch (e) { code = (e as { code: string }).code; }
ok(code === "ORDER_FAILED", "rad etilgan xarid -> ORDER_FAILED");
code = ""; try { await fd.createOrder({ externalId: "x", mlbbId: "1", serverId: "1", category: "d", productName: "Yangi", diamonds: 1, bonus: 0, providerSku: "" }); } catch (e) { code = (e as { code: string }).code; }
ok(code === "INVALID_PRODUCT", "kodi yo'q paket FastDonate'ga yuborilmaydi");
const buysBefore = calls.filter((c) => c.path === "/merchant/buy").length;
buyReply = () => { throw new TypeError("connection reset"); };
code = ""; try { await fd.createOrder({ externalId: "x", mlbbId: "1", serverId: "1", category: "d", productName: "x", diamonds: 1, bonus: 0, providerSku: "5" }); } catch (e) { code = (e as { code: string }).code; }
ok(code === "NETWORK" && calls.filter((c) => c.path === "/merchant/buy").length === buysBefore + 1, "tarmoq xatosida xarid qayta yuborilmaydi (ikki marta ketmasin)");
console.log("HAMMASI O'TDI");
