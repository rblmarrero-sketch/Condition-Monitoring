/* NO CARD TEXT RUNS OFF THE EDGE OF ITS CELL.

   A photograph-with-findings card on a narrow two-up sheet holds a photo grid
   and, beneath it, the defect, the action and the owner/target line — in both
   languages, Russian first, which is the longest this text ever gets. The
   owner line was a nowrap `.code`, so on a ~370px card it set the value column
   wider than the card and the card's overflow:hidden clipped every row: the
   defect, the action and the owner all cut off mid-word (reported from a real
   TK156 sheet).

   This renders the cards WITH the report stylesheet (grid + overflow:hidden are
   what make the bug), at the real page width, and fails if any cell — or any
   value inside one — extends past its own right edge, in English and Russian.

   Run: node tests/rptwrap.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const fails = [];
const ok = (c, n, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : ""));
                          if (!c) fails.push(n); };

const REC = {
  equip: "TK156", date: "2026-09-10", type: "INSP", cls: "HT", model: "TR60", by: "I", smu: 9100, wear: false,
  items: [
    { key: "DRS.AXL", name: "Axles", nameAlt: "Мосты", grade: 3,
      defect: "Наружная утечка масла / гидрожидкости", defectCode: "FM-MEC-04", iso: "ELP",
      action: "Наблюдать / проверить на следующем ТО", actionAlt: "Monitor / re-inspect next PM",
      resp: "Y. Rayanov", target: "2026-12-01", prio: "P4", wo: "88214",
      comment: "Течь сальника моста задний", photos: [PX, PX, PX] },
    { key: "SS.SP", name: "Steering Pump", nameAlt: "Насос рулевого управления", grade: 2,
      defect: "Течь с рулевого насоса", action: "Monitor", photos: [PX, PX, PX] },
    { key: "HS.DL", name: "Hydraulic Lines", nameAlt: "Гидролинии", grade: 3,
      defect: "Наружная утечка масла / гидрожидкости",
      action: "Наблюдать / проверить на следующем ТО", actionAlt: "Monitor / re-inspect next PM",
      resp: "K. Rayanov", target: "2026-12-15", comment: "Запотевания РВД", photos: [PX, PX, PX] } ]
};

const overflowIn = (p, lang) => p.evaluate(({ rec, lang, PX }) => {
  const html = CMR.sections({ lang, bi: true, mode: "unit", title: "x", titleAlt: "x", stamp: new Date(),
    sevLabel: s => s, sevLabelAlt: s => s, records: [rec] }).map(s => s.html || "").join("\n");
  document.querySelectorAll("#rptwrapHolder,#rptwrapStyle").forEach(e => e.remove());
  const st = document.createElement("style"); st.id = "rptwrapStyle"; st.textContent = CMR.CSS;
  document.head.appendChild(st);
  const holder = document.createElement("div"); holder.id = "rptRoot";
  holder.setAttribute("id", "rptRoot");
  holder.style.cssText = "width:760px;position:absolute;left:-9999px;top:0;";
  const inner = document.createElement("div"); inner.id = "rptwrapHolder"; inner.innerHTML = html;
  holder.appendChild(inner); document.body.appendChild(holder);
  const R = el => el.getBoundingClientRect();
  const cels = [...holder.querySelectorAll(".cel")];
  let celOver = 0, kidOver = 0; const samples = [];
  cels.forEach(c => {
    if (c.scrollWidth > c.clientWidth + 1) celOver++;
    const cr = R(c).right;
    c.querySelectorAll("dd,dt,.code,.pk,.pn,b,.cm").forEach(e => {
      if (R(e).right > cr + 0.5) { kidOver++; if (samples.length < 4) samples.push((e.innerText || "").replace(/\s+/g, " ").slice(0, 30)); }
    });
  });
  const n = cels.length;
  holder.remove(); st.remove();
  return { n, celOver, kidOver, samples };
}, { rec: REC, lang, PX });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1400 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(300);

  for (const lang of ["ru", "en"]) {
    const r = await overflowIn(p, lang);
    console.log(`\n[${lang}] ${r.n} cards`);
    ok(r.n >= 3, "  the findings cards rendered", r.n + " cards");
    ok(r.celOver === 0, "  no card overflows its own width", r.celOver + " overflowing");
    ok(r.kidOver === 0, "  and no defect / action / owner line runs past the card edge",
       r.kidOver ? r.kidOver + " clipped: " + r.samples.join(" | ") : "clean");
  }

  ok(errs.length === 0, "no page errors", errs.slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
