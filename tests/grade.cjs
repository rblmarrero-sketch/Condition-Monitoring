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
const BUNDLED = require("./bundled.cjs");
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
  /* The sixteen bundled rounds, supplied explicitly — see tests/bundled.cjs. */
  await dash.evaluate(BUNDLED + "()");
  await dash.waitForTimeout(500);
  await dash.evaluate(() => { try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {} });

  const SEVL = await dash.evaluate(m => {
    const o = {}; Object.keys(m).forEach(g => { o[m[g]] = (SEV[m[g]] || {}).l || m[g]; }); return o;
  }, MAP);
  console.log("\n── the engineer edits the finding; the severity follows it");
  /* THE POLICY CHANGED, DELIBERATELY, AND THIS BLOCK CHANGED WITH IT.

     Severity used to be a second control the engineer could move away from the
     grade, with a written reason and full provenance. The reasoning was good —
     an engineer knows things the code does not — but the cost was that a
     record could carry a grade and a severity that contradict each other for
     the rest of its life, and every table, filter, chart, report and action
     downstream had to guess which one was meant.

     One mapping now, everywhere: A No failure, B Incipient, C Degraded,
     X Critical. The engineer still owns the finding; the finding is the GRADE. */
  const open = await dash.evaluate(() => {
    const rec = RECS.find(r => (r.items || []).some(i => i.grade));
    openEdit(recKey(rec));
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    return { k, hasGrade: !!g,
             hasSevControl: !!document.querySelector(`#edItems [data-f="sev"][data-k="${k}"]`),
             hasSevShown:   !!document.querySelector(`#edItems [data-sevout="${k}"]`),
             hasReason:     !!document.querySelector(`#edItems [data-f="sevReason"][data-k="${k}"]`) };
  });
  ok(open.hasGrade, "the grade is editable");
  ok(!open.hasSevControl, "there is no severity control to disagree with it");
  ok(open.hasSevShown, "but the severity is shown, so nothing is hidden from the engineer");
  ok(!open.hasReason, "and there is no override left to justify");

  const mapped = await dash.evaluate(() => {
    const out = {};
    const gs0 = document.querySelector('#edItems [data-f="grade"]');
    /* collectEdit deliberately saves only what MOVED, so the grade the record
       already carried is not in the payload — that is correct, and it is why
       this reads the on-screen value for every grade and the saved value only
       where the engineer actually changed something. */
    out.__init = gs0.dataset.init || gs0.value;
    for (const g of ["A", "B", "C", "X"]) {
      const gs = document.querySelector('#edItems [data-f="grade"]');
      const k = gs.dataset.k;
      gs.value = g; gs.dispatchEvent(new Event("change", { bubbles: true }));
      out[g] = { shown: document.querySelector(`#edItems [data-sevout="${k}"]`).textContent.trim(),
                 saved: (collectEdit()[k] || null) };
    }
    return out;
  });
  ["A", "B", "C", "X"].forEach(g => {
    ok(mapped[g].shown === SEVL[MAP[g]],
       `choosing ${g} shows ${MAP[g]} on screen`, mapped[g].shown);
    if (g === mapped.__init) {
      ok(mapped[g].saved === null,
         `  and ${g}, the grade it already had, is not written as a change`,
         JSON.stringify(mapped[g].saved));
      return;
    }
    ok(mapped[g].saved && mapped[g].saved.sev === MAP[g],
       `  and saves ${MAP[g]}`, (mapped[g].saved || {}).sev);
    ok(mapped[g].saved && mapped[g].saved.mapSev === MAP[g] && mapped[g].saved.sevOverride === 0,
       `  with no override for ${g}`,
       `map=${(mapped[g].saved||{}).mapSev} ovr=${(mapped[g].saved||{}).sevOverride}`);
  });

  console.log("\n── a change of finding carries who and when");
  const prov = await dash.evaluate(() => {
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    g.value = "X"; g.dispatchEvent(new Event("change", { bubbles: true }));
    return collectEdit()[k];
  });
  ok(prov.grade === "X", "the grade the engineer chose is what is saved", prov.grade);
  ok(prov.sev === "CRI" && prov.mapSev === "CRI",
     "with the one severity that follows from it", `${prov.mapSev}/${prov.sev}`);
  ok(!!prov.gradeBy && !!prov.gradeAt,
     "and the engineer and the time it was changed",
     `${prov.gradeBy} · ${!!prov.gradeAt}`);
  ok(prov.sevOverride === 0 && !prov.sevReason,
     "no override is created, and none can be", `ovr=${prov.sevOverride}`);

  console.log("\n── a legacy record whose grade and severity contradict each other");
  const legacy = await dash.evaluate(() => {
    /* Exactly what an old import can carry: graded C at the machine, stored
       Critical by a build that let the two diverge. */
    const rec = { equip: "TK902", date: "2026-07-29", type: "MP", cls: "HT", src: "drive",
      items: [{ key: "4C", label: "4C", grade: "C", sev: "CRI" },
              { key: "4D", label: "4D", grade: "",  sev: "INC" }] };
    if (!RECS.some(r => r.equip === "TK902")) RECS.push(rec);
    const r = RECS.find(x => x.equip === "TK902");
    const c = sevConflicts().filter(x => x.r.equip === "TK902");
    return { used: sevOf(r, r.items[0]), stored: r.items[0].sev,
             nograde: sevOf(r, r.items[1]),
             whys: c.map(x => x.why + ":" + x.was + "->" + x.now) };
  });
  ok(legacy.used === "DEG",
     "the grade decides, so the contradiction cannot survive into a count", legacy.used);
  ok(legacy.stored === "CRI", "the imported value is not destroyed on the record", legacy.stored);
  ok(legacy.whys.some(w => /^conflict:CRI->DEG$/.test(w)),
     "and it is reported as a conflict, not normalised in silence", legacy.whys.join(" | "));
  ok(legacy.nograde === "INC",
     "a severity with no grade to derive from is kept rather than thrown away", legacy.nograde);
  ok(legacy.whys.some(w => /^nograde:INC/.test(w)),
     "and named too, because nothing explains it", legacy.whys.join(" | "));

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
