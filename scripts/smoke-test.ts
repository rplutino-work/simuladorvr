/**
 * Smoke / use-case tests contra PRODUCCIÓN.
 * Verifica los flujos críticos sin romper nada (limpia lo que crea).
 * Uso: npx tsx scripts/smoke-test.ts
 */
const BASE = process.env.TEST_BASE ?? "https://simuladorvr.vercel.app";
const PUESTOS = {
  sim1: "cmlsu288d0002481omf31y94i",
  sim2: "cmlsu288d0003481olzokle5t",
  sim3: "cmlsu288d0004481ofadsigxq",
  sim4: "cmoawdg2a0000kz043vkvkd2l",
  sim5: "cmoawdtty0001kz04i8zbgxxg",
};
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
  cond ? pass++ : fail++;
}
// UA de navegador real: el edge middleware throttlea (429) UAs de bot
// (curl/node-fetch/axios) en los endpoints públicos. Los clientes reales usan
// un navegador, así que el test debe imitarlo para reflejar la experiencia real.
const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
async function j(path: string, init?: RequestInit) {
  const headers = { "User-Agent": BROWSER_UA, ...(init?.headers ?? {}) };
  const r = await fetch(BASE + path, { ...init, headers });
  let body: any = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
}

(async () => {
  console.log(`\n== SMOKE TEST contra ${BASE} ==\n`);

  // 1) version
  const v = await j("/api/version");
  ok("GET /api/version responde v", v.status === 200 && !!v.body?.v, `v=${v.body?.v}`);

  // 2) puestos
  const p = await j("/api/puestos");
  ok("GET /api/puestos = 5 activos", p.status === 200 && Array.isArray(p.body) && p.body.filter((x:any)=>x.active).length === 5);

  // 3) status
  const s = await j(`/api/tablet/${PUESTOS.sim1}/status`);
  ok("GET status shape ok", s.status === 200 && "session" in s.body && "screenOn" in s.body && !!s.body.puestoName);

  // 4) heartbeat
  const h = await j("/api/devices/heartbeat", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ puestoId: PUESTOS.sim1, deviceType:"TV" }) });
  ok("POST heartbeat = {ok,hasActiveSession,shouldBeOn}", h.status===200 && h.body?.ok===true && "hasActiveSession" in h.body && "shouldBeOn" in h.body);

  // 5) direct-options
  const opt = await j(`/api/tablet/${PUESTOS.sim1}/direct-options`);
  ok("GET direct-options tiene opciones", opt.status===200 && Array.isArray(opt.body?.options) && opt.body.options.length>0);

  // 6) CÓDIGOS especiales
  const c9999 = await j("/api/tablet/activate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ code:"9999", puestoId: PUESTOS.sim1 }) });
  ok("9999 rechazado (vencido, era sólo el 22)", c9999.status===400, `status=${c9999.status} msg=${c9999.body?.error}`);

  const cBad = await j("/api/tablet/activate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ code:"ZZZZ", puestoId: PUESTOS.sim1 }) });
  ok("Código inexistente = 404", cBad.status===404, `status=${cBad.status}`);

  // 7) ⭐ FIX DEL QR: dos direct-purchase seguidos en el mismo puesto → el 2do NO debe dar 409
  const buy = (m:number) => j(`/api/tablet/${PUESTOS.sim4}/direct-purchase`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ tier:30, actualMinutes:m }) });
  const b1 = await buy(10);
  const b2 = await buy(10); // antes del fix esto daba 409
  ok("QR #1 crea (200)", b1.status===200 && !!b1.body?.bookingId, `status=${b1.status}`);
  ok("⭐ QR #2 NO da 409 (fix del loop)", b2.status===200 && !!b2.body?.bookingId, `status=${b2.status} msg=${b2.body?.error ?? ""}`);
  // limpieza: cancelar los pendings de prueba
  for (const b of [b1, b2]) {
    if (b.body?.bookingId) {
      await j("/api/tablet/direct-cancel", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ bookingId: b.body.bookingId }) });
    }
  }
  ok("Limpieza QR de prueba enviada", true);

  console.log(`\n== RESULTADO: ${pass} OK / ${fail} FALLARON ==\n`);
  process.exit(fail ? 1 : 0);
})();
