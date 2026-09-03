/* THE GRADE IS THE ANSWER. THE ISO CLASS IS WHAT IT EXPORTS AS.

   The phone once offered a grade and a severity as two pressable controls, so
   a fitter could mark a plug the worst grade and then press Incipient, and
   the record went out carrying both. Nothing downstream can resolve that.
   Severity became derived and read-only; now it is not on the capture screen
   at all. The grade — 1 Normal · 2 Incipient · 3 Degraded · 4 Severe ·
   5 Critical, from mobile/grade.js — is the one assessment a record carries,
   and the ISO 14224 class (NOF / INC / DEG / CRI) is computed from it on the
   way out, for 1C and for the sidecar's `sev`.

   The office edits the finding; the finding is the grade. A grade lowered by
   the office needs a reason, and every change carries who and when. A record
   from before grades decided everything — a stored class with no grade, or
   one that contradicts its grade — is named and counted, never normalised in
   silence.

   Run: node tests/grade.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;
const ISO = { 1: "NOF", 2: "INC", 3: "DEG", 4: "DEG", 5: "CRI" };

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

  console.log("\n── a technician has no severity control, and five grade cards");
  const shape = await app.evaluate(() => {
    type = "MP"; selectEquip("TK149");
    const ks = items().map(x => x.k); curItem = ks[0]; loadPos();
    return { sevSteps: document.querySelectorAll("#sevSeg [data-s], #sevSeg button").length,
             sevHidden: document.getElementById("sevSeg").classList.contains("hidden"),
             cards: [...document.querySelectorAll("#gradeSeg .gcard")].map(c => c.dataset.g),
             labels: [...document.querySelectorAll("#gradeSeg .gcard .gt b")].map(c => c.textContent) };
  });
  ok(shape.sevSteps === 0 && shape.sevHidden, "the severity strip is gone from the capture screen", shape.sevSteps + " steps");
  ok(shape.cards.join("") === "12345", "five cards, 1 to 5", shape.cards.join(","));
  ok(shape.labels.every((l, i) => l.startsWith((i + 1) + " – ")), "each says its number and its name", shape.labels.join(" | "));

  console.log("\n── the grade derives the ISO class, every time, in both directions");
  for (const g of [1, 2, 3, 4, 5]) {
    const r = await app.evaluate(gr => {
      if (curP().grade) document.querySelector(`#gradeSeg [data-g="${curP().grade}"]`).click();
      document.querySelector(`#gradeSeg [data-g="${gr}"]`).click();
      return { grade: curP().grade, sev: curP().sev, eff: effSev(curP()) };
    }, g);
    ok(r.grade === g && r.sev === ISO[g] && r.eff === ISO[g],
       `${g} derives ${ISO[g]}`, `grade=${r.grade} sev=${r.sev}`);
  }
  /* The bug this replaces: worst then best used to leave CRI behind. */
  const down = await app.evaluate(() => {
    if (curP().grade) document.querySelector(`#gradeSeg [data-g="${curP().grade}"]`).click();
    document.querySelector('#gradeSeg [data-g="5"]').click();
    const hi = curP().sev;
    document.querySelector('#gradeSeg [data-g="1"]').click();
    return { hi, lo: curP().sev };
  });
  ok(down.hi === "CRI" && down.lo === "NOF",
     "correcting 5 down to 1 takes the class with it", `${down.hi} → ${down.lo}`);
  const cleared = await app.evaluate(() => {
    document.querySelector('#gradeSeg [data-g="1"]').click();   // toggles it off
    return { grade: curP().grade || "", sev: curP().sev || "" };
  });
  ok(!cleared.grade && !cleared.sev, "clearing the grade clears the class",
     `grade="${cleared.grade}" sev="${cleared.sev}"`);

  console.log("\n── a letter off an old record reads as its number");
  const legacyPhone = await app.evaluate(() => {
    curP().grade = "X"; renderGrade();
    const on = (document.querySelector("#gradeSeg .gcard.on") || {}).dataset;
    const eff = effSev(curP());
    document.querySelector('#gradeSeg [data-g="5"]').click();   // toggles the same grade off
    return { on: on && on.g, eff, after: curP().grade || "" };
  });
  ok(legacyPhone.on === "5" && legacyPhone.eff === "CRI", "an X on the draft lights card 5 and reads as Critical", JSON.stringify(legacyPhone));
  ok(legacyPhone.after === "", "and tapping card 5 toggles that same grade off", legacyPhone.after);

  /* ── the dashboard ───────────────────────────────────────────────────── */
  const dash = await b.newPage({ viewport: { width: 1440, height: 900 } });
  dash.on("pageerror", e => errs.push("DASH " + e.message));
  await dash.goto(B + "/dashboard/index.html", { waitUntil: "load" });
  await dash.waitForTimeout(1800);
  /* The sixteen bundled rounds, supplied explicitly — see tests/bundled.cjs. */
  await dash.evaluate(BUNDLED + "()");
  await dash.waitForTimeout(500);
  await dash.evaluate(() => { try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {} });

  console.log("\n── the engineer edits the finding; the class follows it");
  const open = await dash.evaluate(() => {
    const rec = RECS.find(r => (r.items || []).some(i => i.grade));
    openEdit(recKey(rec));
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    return { k, hasGrade: !!g, options: [...g.options].map(o => o.value),
             hasSevControl: !!document.querySelector(`#edItems [data-f="sev"][data-k="${k}"]`),
             hasSevShown:   !!document.querySelector(`#edItems [data-sevout="${k}"]`),
             hasWhy:        !!document.querySelector(`#edItems [data-gwhy="${k}"]`),
             hasReason:     !!document.querySelector(`#edItems [data-f="sevReason"][data-k="${k}"]`) };
  });
  ok(open.hasGrade && open.options.join("") === "12345", "the grade is editable, 1 to 5", open.options.join(","));
  ok(!open.hasSevControl && !open.hasSevShown, "there is no severity control and no severity read-out to disagree with it");
  ok(open.hasWhy, "and a reason box for a grade lowered by the office");
  ok(!open.hasReason, "and no severity override left to justify");

  const mapped = await dash.evaluate(() => {
    const out = {};
    const gs0 = document.querySelector('#edItems [data-f="grade"]');
    out.__init = Number(gs0.dataset.init || gs0.value);
    for (const g of [1, 2, 3, 4, 5]) {
      const gs = document.querySelector('#edItems [data-f="grade"]');
      const k = gs.dataset.k;
      gs.value = String(g); gs.dispatchEvent(new Event("change", { bubbles: true }));
      out[g] = { saved: (collectEdit()[k] || null),
                 whyShown: !document.querySelector(`#edItems [data-gwhy="${k}"]`).classList.contains("hidden") };
    }
    return out;
  });
  [1, 2, 3, 4, 5].forEach(g => {
    if (g === mapped.__init) {
      ok(mapped[g].saved === null,
         `  ${g}, the grade it already had, is not written as a change`, JSON.stringify(mapped[g].saved));
      return;
    }
    ok(mapped[g].saved && mapped[g].saved.grade === g && mapped[g].saved.sev === ISO[g],
       `choosing ${g} saves the number and ${ISO[g]}`, JSON.stringify(mapped[g].saved || {}).slice(0, 80));
    ok(mapped[g].saved && mapped[g].saved.mapSev === ISO[g] && mapped[g].saved.sevOverride === 0,
       `  with no override for ${g}`, `map=${(mapped[g].saved||{}).mapSev} ovr=${(mapped[g].saved||{}).sevOverride}`);
    ok(mapped[g].whyShown === (g < mapped.__init),
       `  the reason box ${g < mapped.__init ? "opens" : "stays closed"} for ${g} against ${mapped.__init}`, String(mapped[g].whyShown));
  });

  console.log("\n── a change of finding carries who, when, and the trail");
  const prov = await dash.evaluate(() => {
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    g.value = "5"; g.dispatchEvent(new Event("change", { bubbles: true }));
    return collectEdit()[k];
  });
  ok(prov.grade === 5, "the grade the engineer chose is what is saved, as a number", prov.grade);
  ok(prov.sev === "CRI" && prov.mapSev === "CRI", "with the one class that follows from it", `${prov.mapSev}/${prov.sev}`);
  ok(!!prov.gradeBy && !!prov.gradeAt, "and the engineer and the time it was changed", `${prov.gradeBy} · ${!!prov.gradeAt}`);
  ok(Array.isArray(prov.gradeAudit) && prov.gradeAudit.length === 1 && prov.gradeAudit[0].to === 5 && prov.gradeAudit[0].office === 1,
     "and one audit entry, from the office", JSON.stringify(prov.gradeAudit));
  ok(prov.sevOverride === 0 && !prov.sevReason, "no override is created, and none can be", `ovr=${prov.sevOverride}`);
  const lowered = await dash.evaluate(() => {
    const g = document.querySelector('#edItems [data-f="grade"]');
    const k = g.dataset.k;
    const init = Number(g.dataset.init);
    if (init <= 1) return { skip: true };
    g.value = "1"; g.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector(`#edItems [data-gwhy="${k}"] input`).value = "re-measured, within limit";
    const e = collectEdit()[k];
    return { why: e.gradeWhy, from: e.gradeAudit[0].from, to: e.gradeAudit[0].to, init };
  });
  ok(lowered.skip || (lowered.why === "re-measured, within limit" && lowered.from === lowered.init && lowered.to === 1),
     "a lowered grade carries its reason and the from → to", JSON.stringify(lowered));

  console.log("\n── a legacy record whose grade and class contradict each other");
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
  ok(legacy.used === 3, "the grade decides — C reads as 3 — so the contradiction cannot survive into a count", legacy.used);
  ok(legacy.stored === "CRI", "the imported value is not destroyed on the record", legacy.stored);
  ok(legacy.whys.some(w => /^conflict:5->3$/.test(w)), "and it is reported as a conflict, not normalised in silence", legacy.whys.join(" | "));
  ok(legacy.nograde === 2, "a class with no grade to derive from is kept, read as its grade", legacy.nograde);
  ok(legacy.whys.some(w => /^nograde:2/.test(w)), "and named too, because nothing explains it", legacy.whys.join(" | "));

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
