/* A/B/C/X IS THE ANSWER. ISO SEVERITY IS WHAT THAT ANSWER MEANS.

   The phone offered both as pressable segmented controls, so a fitter could
   mark a plug X and then press Incipient, and the record went out carrying
   both. Nothing downstream can resolve that: the report reads one, the KPI
   reads the other, and neither is wrong. Worse, the grade only "suggested" a
   severity when severity happened to be blank — so a grade corrected from X
   down to A left CRI sitting behind it, and the machine stayed critical on
   every count in the system after the inspector had already fixed his mistake.

   The office is the one place a severity may deliberately differ from its
   grade, because an engineer knows things the mapping does not. That is an
   OVERRIDE, and an override without a reason is indistinguishable from a
   mis-click for the rest of the record's life.

   Run: node tests/grade.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;
const MAP = { A: "NOF", B: "INC", C: "DEG", X: "CRI" };

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const errs = [];

  /* ── the phone ───────────────────────────────────────────────────────── */
  const app = await b.newPage({ viewport: { width: 390, height: 844 } });
  app.on("pageerror", e => errs.push("APP " + e.message));
  await app.goto(B + "/mobile/index.html", { waitUntil: "load" });
  await app.waitForFunction(() => (document.getElementById("verNum") || {}).textContent !== "?",
                            null, { timeout: 20000 });
  await app.waitForTimeout(700);

  console.log("\n── a technician has no independent severity control");
  const shape = await app.evaluate(() => {
    type = "MP"; selectEquip("TK149");
    const ks = items().map(x => x.k); curItem = ks[0]; loadPos();
    return { buttons: document.querySelectorAll("#sevSeg button").length,
             steps: document.querySelectorAll("#sevSeg [data-s]").length,
             readonly: document.getElementById("sevSeg").getAttribute("aria-readonly"),
             caption: (document.querySelector(".fld em.derived") || {}).textContent || "" };
  });
  ok(shape.buttons === 0, "the severity strip has no buttons at all", shape.buttons + " buttons");
  ok(shape.steps === 4, "but still shows all four steps", shape.steps + " steps");
  ok(shape.readonly === "true", "and says so to a screen reader", "aria-readonly=" + shape.readonly);
  ok(shape.caption.length > 10, "and to everyone else in words", shape.caption);

  console.log("\n── the grade derives it, every time, in both directions");
  for (const g of ["A", "B", "C", "X"]) {
    const r = await app.evaluate(gr => {
      document.querySelector("#gradeSeg .g-" + gr).click();
      return { grade: curP().grade, sev: curP().sev,
               lit: [...document.querySelectorAll("#sevSeg .on")].map(x => x.dataset.s) };
    }, g);
    ok(r.sev === MAP[g] && r.lit.length === 1 && r.lit[0] === MAP[g],
       `${g} derives ${MAP[g]}`, `sev=${r.sev} lit=${r.lit.join(",")}`);
  }
  /* The bug this replaces: X then A used to leave CRI behind. */
  const down = await app.evaluate(() => {
    /* The loop above finished on X, and the control toggles — so start from a
       known state rather than from whatever the last assertion left behind. */
    if (curP().grade) document.querySelector("#gradeSeg .g-" + curP().grade).click();
    document.querySelector("#gradeSeg .g-X").click();
    const hi = curP().sev;
    document.querySelector("#gradeSeg .g-A").click();
    return { hi, lo: curP().sev };
  });
  ok(down.hi === "CRI" && down.lo === "NOF",
     "correcting X down to A takes the severity with it", `${down.hi} → ${down.lo}`);
  const cleared = await app.evaluate(() => {
    document.querySelector("#gradeSeg .g-A").click();   // toggles it off
    return { grade: curP().grade || "", sev: curP().sev || "" };
  });
  ok(!cleared.grade && !cleared.sev, "clearing the grade clears the severity",
     `grade="${cleared.grade}" sev="${cleared.sev}"`);

  console.log("\n── a contradiction cannot be captured in the field at all");
  const contra = await app.evaluate(() => {
    document.querySelector("#gradeSeg .g-X").click();
    /* Every route the interface offers. There is no handler and no button. */
    const el = document.querySelector("#sevSeg .s-INC");
    el.click();
    return { grade: curP().grade, sev: curP().sev, tag: el.tagName };
  });
  ok(contra.sev === "CRI" && contra.grade === "X",
     "pressing a severity step changes nothing", `${contra.tag} grade=${contra.grade} sev=${contra.sev}`);

  /* ── the dashboard ───────────────────────────────────────────────────── */
  const dash = await b.newPage({ viewport: { width: 1440, height: 900 } });
  dash.on("pageerror", e => errs.push("DASH " + e.message));
  await dash.goto(B + "/dashboard/index.html", { waitUntil: "load" });
  await dash.waitForTimeout(1800);
  await dash.evaluate(() => { try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {} });

  console.log("\n── the engineer gets both, and the grade supplies the default");
  const open = await dash.evaluate(() => {
    const rec = RECS.find(r => (r.items || []).some(i => i.grade));
    openEdit(recKey(rec));
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    const sv = document.querySelector(`#edItems [data-f="sev"][data-k="${k}"]`);
    const box = document.querySelector(`#edItems [data-ovr="${k}"]`);
    return { k, hasGrade: !!g, hasSev: !!sv, hasBox: !!box,
             boxHidden: box.classList.contains("hidden") };
  });
  ok(open.hasGrade && open.hasSev, "both controls are present and editable");
  ok(open.boxHidden, "and the override slot is out of the way while they agree");

  const mapped = await dash.evaluate(() => {
    const out = {};
    for (const g of ["A", "B", "C", "X"]) {
      const gs = document.querySelector('#edItems [data-f="grade"]');
      const k = gs.dataset.k;
      const sv = document.querySelector(`#edItems [data-f="sev"][data-k="${k}"]`);
      gs.value = g; gs.dispatchEvent(new Event("change", { bubbles: true }));
      out[g] = { sev: sv.value,
                 hidden: document.querySelector(`#edItems [data-ovr="${k}"]`).classList.contains("hidden") };
    }
    return out;
  });
  ["A", "B", "C", "X"].forEach(g =>
    ok(mapped[g].sev === MAP[g] && mapped[g].hidden,
       `choosing ${g} sets ${MAP[g]} and asks for nothing`, mapped[g].sev));

  console.log("\n── a deliberate difference is allowed, and is an override");
  const div = await dash.evaluate(() => {
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    const sv = document.querySelector(`#edItems [data-f="sev"][data-k="${k}"]`);
    g.value = "X"; g.dispatchEvent(new Event("change", { bubbles: true }));
    sv.value = "INC"; sv.dispatchEvent(new Event("change", { bubbles: true }));
    return { hidden: document.querySelector(`#edItems [data-ovr="${k}"]`).classList.contains("hidden"),
             warn: document.querySelector(`#edItems [data-ovrw="${k}"]`).textContent };
  });
  ok(!div.hidden, "the reason field appears the moment they diverge");
  ok(/X/.test(div.warn) && /override/i.test(div.warn),
     "with a warning naming both values", div.warn);

  const refused = await dash.evaluate(() => {
    document.getElementById("edSave").click();
    return $("edMsg").textContent;
  });
  ok(/reason/i.test(refused), "saving without a reason is refused", refused.slice(0, 60));

  console.log("\n── and it is stored with its full provenance");
  const prov = await dash.evaluate(() => {
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    const rs = document.querySelector(`#edItems [data-f="sevReason"][data-k="${k}"]`);
    rs.value = "Bearing replaced under warranty before the next round.";
    rs.dispatchEvent(new Event("change", { bubbles: true }));
    return collectEdit()[k];
  });
  ok(prov.grade === "X", "the grade is kept as captured", prov.grade);
  ok(prov.mapSev === "CRI", "beside the severity the code maps to", prov.mapSev);
  ok(prov.sev === "INC", "and the effective severity actually in use", prov.sev);
  ok(prov.sevOverride === 1, "flagged as an override", String(prov.sevOverride));
  ok(!!prov.sevReason && !!prov.sevBy && !!prov.sevAt,
     "carrying reason, engineer and timestamp",
     `reason=${!!prov.sevReason} by=${prov.sevBy} at=${!!prov.sevAt}`);

  console.log("\n── putting it back clears the override rather than leaving a ghost");
  const back = await dash.evaluate(() => {
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    const sv = document.querySelector(`#edItems [data-f="sev"][data-k="${k}"]`);
    sv.value = "CRI"; sv.dispatchEvent(new Event("change", { bubbles: true }));
    const it = collectEdit()[k];
    return { hidden: document.querySelector(`#edItems [data-ovr="${k}"]`).classList.contains("hidden"),
             ovr: it.sevOverride, reason: it.sevReason, gaps: overrideGaps(collectEdit()).length };
  });
  ok(back.hidden, "the reason field goes away again");
  ok(back.ovr === 0 && !back.reason, "and the override provenance is cleared, not kept",
     `override=${back.ovr} reason="${back.reason}"`);
  ok(back.gaps === 0, "so the save is no longer blocked", back.gaps + " gaps");

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
