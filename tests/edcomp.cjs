/* THE CORRECTION PANEL'S "COMPONENT (POINT)" SELECT HAD NOWHERE TO GO ON A
   REGISTER ROUND.

   Read off a real INSP finding, circled: "cannot change the Component. we
   should be able to edit. And ensure that the photos inside will move or
   rename also, right?" pointOptions()/orphanPointOptions() built the select
   from points.js's PTS.CLASSES catalogue alone — which has never carried
   INSP or TEMP's own vocabulary (see compNameOf's own comment: "INSP and
   TEMP only... the rounds that address register components are these two"),
   only MP/FC's plug positions. So on any INSP/TEMP finding the picker had
   nothing to offer beyond whatever handful of points already happen to be on
   THIS round — the exact "component (point) cannot be selected" shape
   build 257 already fixed once for MP's own vocabulary (tests/edswap.cjs),
   recurring one layer over for the register's.

   Two things had to be true, and this proves both:
     · the select offers the machine's own real ISO 14224 components
       (componentsForUnit(), the identical lookup the phone's own picker
       uses to build the walk), not just the round's existing keys;
     · a photograph filed under the OLD component name — on a round with no
       attachment manifest, so mediaOf() falls back to predicting the file
       name from the key — is still found after the correction, because
       photoBasesFor() now also tries `_from`, the key CMEdits.apply() marks
       an item with the instant an office correction changes it. A modern,
       manifest-carrying round (attOf()) was never at risk: its filenames
       are explicit and never derived from the key at all.

   Run: node tests/edcomp.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(600);

  console.log("── a register round on a real machine, one finding, no manifest — the shape a round predating the attachment list still has");
  const T = await p.evaluate(() => {
    CMDrive.saveEdit = d => Promise.resolve({ ok: true });
    const a = (window.ASSETS || []).find(x => x.cat === "TRUCK, DUMP" && CLASS_BY[x.cat]);
    const equip = a.n, date = "2026-09-20", type = "INSP";
    const dot = date.split("-").reverse().join(".");
    const name = `${equip}.CH.UC_${dot}_${type}_1.jpg`;
    const rec = { equip, date, type, cls: a.cls, by: "Ivanov", smu: "1000",
      items: [{ key: "CH.UC", label: "Undercarriage", grade: 4, defect: "External leak", comment: "Leak from final drive" }] };
    imported.push(rec); rebuild();
    const r = RECS.find(x => x.equip === equip && x.date === date && x.type === type);
    if (!folderPhotos) folderPhotos = {};
    folderPhotos[name] = "https://example/" + name;
    const it = r.items.find(i => i.key === "CH.UC");
    const beforePh = mediaOf(it, r, true).map(m => m.name);
    return { rk: ekOf(r), equip, date, type, name, beforePh, cls: a.cls };
  });
  ok(T.beforePh.indexOf(T.name) >= 0, "sanity: the panel can already find the photograph under its own key", JSON.stringify(T));

  console.log("\n── the select offers the machine's own real components, not just the one key already on the round");
  const before = await p.evaluate(({ rk }) => {
    openEdit(rk);
    const sel = document.querySelector('#edItems select[data-f="key"][data-k="CH.UC"]');
    const opts = sel ? [...sel.options].map(o => o.value) : [];
    const chal = sel ? [...sel.options].find(o => o.value === "CH.AL") : null;
    return { n: opts.length, hasChAl: !!chal, taken: chal ? chal.dataset.taken === "1" : null, opts: opts.slice(0, 6) };
  }, T);
  ok(before.n > 5, "far more than the one point this round happens to carry", JSON.stringify(before));
  ok(before.hasChAl && !before.taken, "a real, distinct component on this same machine is offered, and free", JSON.stringify(before));

  console.log("\n── choosing it and saving moves the finding, and the photograph is still found under its OLD name");
  await p.evaluate(() => {
    const sel = document.querySelector('#edItems select[data-f="key"][data-k="CH.UC"]');
    sel.value = "CH.AL";
    document.getElementById("edBy").value = "R. Marrero";
    document.getElementById("edSave").click();
  });
  await p.waitForTimeout(700);
  const after = await p.evaluate(({ rk, name }) => {
    const r = RECS.find(x => ekOf(x) === rk);
    const it = r.items.find(i => i.key === "CH.AL");
    return { has: !!it, from: it && it._from, ph: it ? mediaOf(it, r, true).map(m => m.name) : [],
             stillCH_UC: r.items.some(i => i.key === "CH.UC") };
  }, T);
  ok(after.has && after.from === "CH.UC", "the finding now reads under the new component, with where it came from", JSON.stringify(after));
  ok(!after.stillCH_UC, "and the old key is gone, not left behind as a second position", JSON.stringify(after));
  ok(after.ph.indexOf(T.name) >= 0, "the photograph is still found — filed under its old name, the record just knows to look there too", JSON.stringify(after));

  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
