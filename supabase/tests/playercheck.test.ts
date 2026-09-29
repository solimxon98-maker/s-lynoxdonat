// FastDonate check_ml javoblarini o'qish (fetch soxta)
Deno.env.set("SLD_TEST", "1");
const { checkPlayerViaFastDonate } = await import("../functions/_shared/providers/donate/playerCheck.ts");
let reply: { status: number; body: unknown } = { status: 200, body: {} };
let lastUrl = "";
globalThis.fetch = async (u: RequestInfo | URL) => { lastUrl = String(u); return new Response(JSON.stringify(reply.body), { status: reply.status }); };
const ok = (c: unknown, m: string) => { if (!c) { console.error("✗", m); Deno.exit(1); } console.log("✓", m); };
reply = { status: 200, body: { success: true, data: { name: "SoLyNoX" } } };
let r = await checkPlayerViaFastDonate("123456789", "1234");
ok(r.found && r.nickname === "SoLyNoX", "success + data.name -> nik");
ok(lastUrl === "https://api.fastdonate.su/merchant/check_ml?user_id=123456789&server_id=1234", "to'g'ri manzil");
reply = { status: 200, body: { success: true, data: { data: { name: "Ichki" } } } };
ok((await checkPlayerViaFastDonate("1", "2")).nickname === "Ichki", "data.data.name ham o'qiladi");
reply = { status: 500, body: { success: false, error: { code: "internal_error" } } };
ok((await checkPlayerViaFastDonate("1", "2")).found === false, "noto'g'ri ID -> topilmadi");
reply = { status: 502, body: "<html>" as unknown };
let threw = false;
try { await checkPlayerViaFastDonate("1", "2"); } catch { threw = true; }
ok(threw, "tushunarsiz javob -> xato (topildi deb aldamaydi)");
console.log("HAMMASI O'TDI");
