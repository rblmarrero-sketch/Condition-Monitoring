/* ONE DEFINITION OF "AN ACTION", proven across every surface that counts one.

   The 2026-08-27 audit of the public build found the navigation reporting 21
   actions to plan beside an Action Register showing 138 open findings, and both
   were labelled actions. There were four predicates in the file:

     navigation badge   action && action !== "MON"        (never checked status)
     Overview KPI       action && action !== "MON"        (never checked status)
     Action Register    action OR severity >= Degraded    (a union)
     equipment drawer   a third rule again

   The first two counted finished work as work to plan. The third counted every
   Degraded finding as an action whether or not anybody had proposed one. None
   of them could produce the same number, and no arrangement of them could,
   because they were answering different questions.

   The audit also found a TK126 drawer reading "Critical · 7 findings" beside
   "Nothing open on this machine." A critical exception with nobody assigned is
   not nothing. It is untriaged, and this file exists so that sentence can never
   be printed again.

   Run: node tests/actdef.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(() => {
    window.__w = [];
    CMDrive.saveEdit = d => { window.__w.push(d); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
  });

  console.log("\n── the states are exhaustive and exclusive");
  const st = await p.evaluate(() => {
    const seen = {}, f = findings(filtered());
    f.forEach(x => { const k = actionState(x.r, x.i).k; seen[k] = (seen[k] || 0) + 1; });
    return { seen, total: f.length, sum: Object.values(seen).reduce((a, c) => a + c, 0) };
  });
  ok(st.sum === st.total, "every finding lands in exactly one state",
     JSON.stringify(st.seen) + " of " + st.total);
  ok(Object.keys(st.seen).every(k => ["open", "triage", "closed", "noaction", "none"].includes(k)),
     "and only in the five defined states", Object.keys(st.seen).join(","));

  console.log("\n── every surface counts the same thing");
  const counts = await p.evaluate(() => {
    showTab("actions"); actView = "table"; renderActions();
    const f = findings(filtered());
    const required = f.filter(x => actionRequired(x.r, x.i)).length;
    return {
      predicate: required,
      nav: Number($("nbAct").textContent || 0),
      kpi: Number(document.querySelector("#kpiAct .v").textContent || 0),
      segOpen: Number(document.querySelector('#aSeg [data-af="open"] .n').textContent || 0),
      rows: document.querySelectorAll("#actionTbl tbody tr").length,
      registerAll: actionRows().length,
    };
  });
  ["nav", "kpi", "segOpen", "rows"].forEach(k =>
    ok(counts[k] === counts.predicate, `${k} agrees with the predicate`,
       counts[k] + " vs " + counts.predicate));
  ok(counts.registerAll >= counts.predicate,
     "and the register holds at least the outstanding ones",
     counts.registerAll + " rows, " + counts.predicate + " outstanding");

  console.log("\n── the same predicate survives a filter");
  const filtered2 = await p.evaluate(() => {
    setDrill("sev", "CRI");
    renderActions();
    const f = findings(filtered());
    return { predicate: f.filter(x => actionRequired(x.r, x.i)).length,
             nav: Number($("nbAct").textContent || 0),
             kpi: Number(document.querySelector("#kpiAct .v").textContent || 0),
             rows: document.querySelectorAll("#actionTbl tbody tr").length };
  });
  ok(filtered2.nav === filtered2.predicate && filtered2.kpi === filtered2.predicate,
     "narrowed to Critical, the badge and tile still agree",
     `nav ${filtered2.nav} / kpi ${filtered2.kpi} / predicate ${filtered2.predicate}`);
  await p.evaluate(() => { clearDrill(); });
  await p.waitForTimeout(300);

  console.log("\n── an exception missing its plan is triage, not open, and not nothing");
  const tri = await p.evaluate(() => {
    const f = findings(filtered());
    const x = f.find(y => ["CRI", "DEG"].includes(sevOf(y.r, y.i)));
    if (!x) return { skip: true };
    const s = actionState(x.r, x.i);
    return { skip: false, k: s.k, miss: s.miss, required: actionRequired(x.r, x.i) };
  });
  if (!tri.skip) {
    ok(tri.k === "triage", "a C/X finding with no owner or date is triage", tri.k);
    ok(tri.miss.length > 0, "and it names exactly what is missing", tri.miss.join(", "));
    ok(tri.required === true, "triage still counts as outstanding work", String(tri.required));
  }

  console.log("\n── it leaves triage only when it can actually be planned");
  const promote = await p.evaluate(async () => {
    const f = findings(filtered());
    const x = f.find(y => ["CRI", "DEG"].includes(sevOf(y.r, y.i)));
    const tgt = { rk: recKey(x.r), ik: x.i.key };
    const step = async patch => {
      await patchItems([tgt], patch, null);
      const r2 = RECS.find(z => recKey(z) === tgt.rk);
      const i2 = (r2.items || []).find(z => z.key === tgt.ik);
      return actionState(r2, i2);
    };
    const a = await step({ action: "RA-07", actionLabel: "Replace bearing" });
    const bb = await step({ prio: "P2" });
    const c = await step({ owner: "Petrov" });
    const d = await step({ due: "2026-09-30" });
    return { a: a.k, aMiss: a.miss, b: bb.k, c: c.k, d: d.k, dMiss: d.miss };
  });
  ok(promote.a === "triage", "an action alone does not make it plannable", promote.a + " missing " + promote.aMiss.join(","));
  ok(promote.b === "triage" && promote.c === "triage",
     "nor a priority, nor an owner on their own", promote.b + " / " + promote.c);
  ok(promote.d === "open", "only action + priority + owner + due promotes it to open",
     promote.d + (promote.dMiss.length ? " missing " + promote.dMiss.join(",") : ""));

  console.log("\n── \"no action required\" is a decision, and a decision has an author");
  const noact = await p.evaluate(async () => {
    const f = findings(filtered());
    const x = f.find(y => ["CRI", "DEG"].includes(sevOf(y.r, y.i)) && !y.i.dispBy);
    const tgt = { rk: recKey(x.r), ik: x.i.key };
    const read = () => { const r2 = RECS.find(z => recKey(z) === tgt.rk);
      const i2 = (r2.items || []).find(z => z.key === tgt.ik); return actionState(r2, i2); };
    /* Status set to NOACT with no provenance — the shape a careless import or a
       future code path could still produce. It must NOT close the finding. */
    await patchItems([tgt], { status: "NOACT" }, null);
    const bare = read();
    await patchItems([tgt], { dispReason: "Guard fitted, not accessible", dispBy: "R. Marrero",
                              dispAt: new Date().toISOString() }, null);
    const full = read();
    return { bare: bare.k, bareMiss: bare.miss, full: full.k,
             fullRequired: (() => { const r2 = RECS.find(z => recKey(z) === tgt.rk);
               const i2 = (r2.items || []).find(z => z.key === tgt.ik);
               return actionRequired(r2, i2); })() };
  });
  ok(noact.bare === "triage", "NOACT with no reason or approver stays in triage",
     noact.bare + " missing " + noact.bareMiss.join(","));
  ok(noact.full === "noaction", "with both, it becomes an audited disposition", noact.full);
  ok(noact.fullRequired === false, "and only then stops counting as outstanding",
     String(noact.fullRequired));

  console.log("\n── the dialog is the only way in through the interface");
  await p.evaluate(() => { clearDrill(); showTab("actions"); actView = "table"; renderActions(); });
  await p.waitForTimeout(400);
  const dlg = await p.evaluate(() => {
    window.__w = [];
    const s = document.querySelector("#actionTbl .ist");
    s.value = "NOACT"; s.dispatchEvent(new Event("change", { bubbles: true }));
    return { open: !document.getElementById("dispBox").classList.contains("hidden"),
             writes: window.__w.length };
  });
  ok(dlg.open, "picking No action required opens the disposition dialog");
  ok(dlg.writes === 0, "and writes nothing until it is answered", dlg.writes + " write(s)");
  await p.click("#dispSave"); await p.waitForTimeout(300);
  const refuse = await p.evaluate(() => ({ msg: $("dispMsg").textContent,
    writes: window.__w.length,
    open: !document.getElementById("dispBox").classList.contains("hidden") }));
  ok(refuse.writes === 0 && refuse.open, "an empty reason is refused", refuse.msg.slice(0, 40));
  await p.fill("#dispReason", "Plug behind a fixed guard; re-check at next service.");
  await p.click("#dispSave"); await p.waitForTimeout(1000);
  const saved = await p.evaluate(() => {
    const d = window.__w[0]; const k = d && Object.keys(d.items)[0]; const i = k && d.items[k];
    return { writes: window.__w.length, status: i && i.status, by: i && i.dispBy,
             reason: !!(i && i.dispReason), at: !!(i && i.dispAt),
             closed: document.getElementById("dispBox").classList.contains("hidden") };
  });
  ok(saved.writes === 1 && saved.status === "NOACT", "a complete disposition saves", saved.status);
  ok(!!saved.by && saved.reason && saved.at,
     "carrying approver, reason and timestamp",
     `by=${saved.by} reason=${saved.reason} at=${saved.at}`);
  ok(saved.closed, "and the dialog closes");

  console.log("\n── the drawer cannot say \"nothing open\" over an undispositioned exception");
  const drw = await p.evaluate(() => {
    /* Find a machine that has a C/X exception, open its drawer, and read what
       the panel is willing to claim. */
    const unit = (RECS.find(r => (r.items || []).some(i =>
      ["CRI", "DEG"].includes(sevOf(r, i)))) || {}).equip;
    if (!unit) return { skip: true };
    showTab("overview"); openUnit(unit);
    const body = document.getElementById("drwBody").textContent;
    const exc = RECS.filter(r => r.equip === unit)
      .flatMap(r => (r.items || []).map(i => ({ r, i })))
      .filter(({ r, i }) => ["CRI", "DEG"].includes(sevOf(r, i)));
    const undisposed = exc.filter(({ r, i }) => actionRequired(r, i)).length;
    return { skip: false, unit, exceptions: exc.length, undisposed,
             saysNothing: /Nothing open on this machine/i.test(body),
             rows: document.querySelectorAll("#drwBody .urow").length,
             triageMarks: document.querySelectorAll("#drwBody .tri").length };
  });
  if (!drw.skip) {
    ok(drw.exceptions > 0, "the machine has C/X exceptions to account for",
       drw.exceptions + " on " + drw.unit);
    ok(!(drw.undisposed > 0 && drw.saysNothing),
       "it does not claim nothing is open while exceptions are undispositioned",
       `${drw.undisposed} undispositioned, saysNothing=${drw.saysNothing}`);
    ok(drw.undisposed === 0 || drw.rows > 0, "each one is listed", drw.rows + " rows");
    ok(drw.undisposed === 0 || drw.triageMarks > 0,
       "and untriaged ones are marked as such", drw.triageMarks + " marked");
  }

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
