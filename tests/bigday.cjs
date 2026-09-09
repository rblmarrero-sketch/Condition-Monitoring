/* A DAY'S WORK ON THE FOLDER THIS SITE WILL ACTUALLY HAVE.

   scaleload.cjs proves the office SURVIVES a thousand inspections — it loads,
   nothing renders every row, no picker lists 1,128 machines. perf.cjs proves
   the interactions are quick, at 80 rounds and at 400. Neither asks the
   question a superintendent asks in a year's time: with the folder full, is
   changing a filter still something you do, or something you wait for.

   And nothing at all measured THE PHONE at that size. It is the surface that
   matters most: a handset in a pit with 1,128 machines in its register and a
   season of rounds in its cache, opened at −40 with gloves on. A dashboard
   that takes four seconds is annoying; a phone that takes four seconds to
   open the equipment list is a phone somebody stops using.

   So: one folder of the real size, both surfaces, and the things a person
   actually does, timed.

   The budgets are of SCRIPTING in a headless browser — no photographs
   decoded, no radio — so they are deliberately well inside what a person
   would call fast, leaving the rest of the second for the parts this cannot
   measure. They are held at the size the folder reaches, not the size it is.

   Run: node tests/bigday.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require("./pw.cjs"));
const BASE = process.env.CMPORT ? "http://127.0.0.1:" + process.env.CMPORT : "http://127.0.0.1:8099";
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };
const note = (n, d) => console.log("  ....  " + n + (d !== undefined ? "   " + d : ""));
const reset = q => fetch(BASE + "/__reset?" + q).then(r => r.text());

/* At a thousand rounds every one of these still has to feel like a click.
   perf.cjs holds 1500/500/1000/800/1000 at four hundred; a folder two and a
   half times larger is allowed twice the room and no more. */
const OFFICE = { all: 3000, tab: 1000, filter: 2000, history: 1600, report: 2000, sort: 1200, page: 1200 };
/* The phone is a phone. Boot is measured to USABLE — the register in hand and
   a machine selectable — not to first paint. */
const PHONE = { boot: 12000, due: 2500, pick: 1500, search: 800, step: 1200, saved: 1500 };

const OFFICE_RUN = `(async function(){
  const T = {}; const time = (k, f) => { const t0 = performance.now(); f(); T[k] = Math.round(performance.now() - t0); };
  showTab('overview', true);
  time('all', () => renderAll());
  /* THREE PASSES, AND THE MEDIAN OF EACH TAB — because one sample of the
     slowest page measures whatever else this machine was doing at that
     instant, not the page. It failed at random on both sides of a change that
     did not touch it: 692 ms and 1015 ms from the same build, minutes apart.
     A budget that trips on load is noise a real regression hides in.

     The median, not the best: a lucky run is as misleading as an unlucky one.
     Whole cycles rather than three shows of one tab, so every sample is a
     genuine switch from a different page.

     And the sample has to be a COLD one. A page already built shows again in
     a millisecond, so three straight cycles measure the cache and can never
     fail; renderAll() before each cycle puts every page back in the state a
     planner meets it in — the folder has just refreshed and they move to the
     screen they want. */
  const TABS = ['failure','wear','actions','due','equipment','lube','sync','reports','overview'];
  const runs = {}; TABS.forEach(t => runs[t] = []);
  for (let pass = 0; pass < 3; pass++) {
    renderAll();
    for (const tab of TABS) {
      const t0 = performance.now(); showTab(tab, true);
      runs[tab].push(performance.now() - t0);
    }
  }
  let worst = 0, which = '';
  TABS.forEach(tab => {
    const m = runs[tab].sort((a, b) => a - b)[1];      // median of three
    if (m > worst) { worst = m; which = tab; }
  });
  T.tab = Math.round(worst); T.tabWorst = which;
  T.tabAll = Math.round(Math.max.apply(null, TABS.map(t => runs[t][2])));
  showTab('overview', true);
  time('filter', () => { $('fGrade').value = '5'; $('fGrade').dispatchEvent(new Event('change')); });
  time('filterOff', () => { $('fGrade').value = ''; $('fGrade').dispatchEvent(new Event('change')); });
  showTab('equipment', true);
  time('history', () => { $('equipSel').value = RECS[0].equip; $('equipSel').dispatchEvent(new Event('change')); });
  showTab('reports', true);
  time('report', () => { $('rScope').value = 'unit'; refreshReportTargets(); });
  /* The register is the screen a planner lives in: sorting it and turning its
     pages are the two things they do all morning. */
  showTab('actions', true);
  const th = document.querySelector('#actionTbl th[data-asort="owner"]');
  time('sort', () => { if (th) th.click(); });
  const nx = document.querySelector('[data-pg="actions-table:next"]') || document.querySelector('[data-pg="actions:next"]');
  time('page', () => { if (nx) nx.click(); });
  showTab('overview', true);
  return Object.assign({ records: RECS.length, sorted: !!th, paged: !!nx }, T);
})()`;

(async () => {
  await reset("n=0");
  await reset("scale=1000,1128");
  const b = await chromium.launch();

  console.log("1. THE OFFICE, ON A THOUSAND INSPECTIONS");
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const derr = []; p.on("pageerror", e => derr.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem("cm_drive_url", u); localStorage.setItem("cm_drive_sec", "");
    localStorage.setItem("cm_drive_cursor", "0"); localStorage.setItem("cm_swap_off", "1");
    localStorage.setItem("cm_dash_lang", "en");
  }, BASE + "/exec");
  await p.goto(BASE + "/dashboard/index.html", { waitUntil: "load" });
  await p.waitForFunction(() => typeof RECS !== "undefined" && RECS.length > 900, null, { timeout: 180000 });
  await p.waitForTimeout(3500);
  const size = await p.evaluate(() => ({
    recs: RECS.length,
    units: new Set(RECS.map(r => r.equip)).size,
    findings: RECS.reduce((a, r) => a + (r.items || []).length, 0),
  }));
  ok("the folder is the size this is about", size.recs >= 1000 && size.findings >= 10000,
     size.recs + " inspections · " + size.units + " units · " + size.findings + " findings");
  /* Warm once: the office does not reload the page between clicks, and the
     first pass builds memos every later one shares. */
  await p.evaluate(OFFICE_RUN);
  const T = await p.evaluate(OFFICE_RUN);
  console.log("   " + JSON.stringify(T));
  ok("a full re-render", T.all <= OFFICE.all, T.all + " ms of " + OFFICE.all);
  ok("moving between pages", T.tab <= OFFICE.tab,
     T.tab + " ms of " + OFFICE.tab + " (worst: " + T.tabWorst
     + ", slowest single sample " + T.tabAll + " ms)");
  ok("changing the grade filter", T.filter <= OFFICE.filter, T.filter + " ms of " + OFFICE.filter);
  ok("  and clearing it", T.filterOff <= OFFICE.filter, T.filterOff + " ms of " + OFFICE.filter);
  ok("opening a machine's history", T.history <= OFFICE.history, T.history + " ms of " + OFFICE.history);
  ok("switching what a report is about", T.report <= OFFICE.report, T.report + " ms of " + OFFICE.report);
  ok("sorting the action register", T.sorted && T.sort <= OFFICE.sort, T.sort + " ms of " + OFFICE.sort);
  ok("turning its page", T.paged && T.page <= OFFICE.page, T.page + " ms of " + OFFICE.page);

  console.log("\n2. AND THE OFFICE IS STILL BOUNDED, NOT MERELY QUICK");
  /* Quick and unbounded is quick until somebody presses "100". */
  const bound = await p.evaluate(() => {
    showTab("actions", true);
    const rows = document.querySelectorAll("#actionTbl tbody tr").length;
    showTab("due", true);
    const due = document.querySelectorAll("#ddList tbody tr").length;
    const opts = Math.max(...[...document.querySelectorAll("select")].map(s => s.options.length), 0);
    return { rows, due, opts };
  });
  ok("no table has rendered more than a page of rows",
     bound.rows <= 105 && bound.due <= 105, "register " + bound.rows + " · schedule " + bound.due);
  ok("  and no dropdown carries the fleet", bound.opts < 200, bound.opts + " options in the longest");

  console.log("\n3. THE PHONE, ON THE SAME FOLDER");
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(u => {
    localStorage.setItem("up_dests", JSON.stringify([{ id: "gas", on: true, url: u, sec: "", folder: "" }]));
    localStorage.setItem("cm_swap_off", "1"); localStorage.setItem("lang", "en");
  }, BASE + "/exec");
  const m = await ctx.newPage(); const merr = []; m.on("pageerror", e => merr.push(e.message));
  const t0 = Date.now();
  await m.goto(BASE + "/mobile/index.html", { waitUntil: "load" });
  /* Usable, not painted: the register in hand and a machine selectable. */
  await m.waitForFunction(() => typeof ASSETS !== "undefined" && ASSETS.length > 1000
    && typeof selectEquip === "function", null, { timeout: 120000 });
  const boot = Date.now() - t0;
  ok("it opens with the whole fleet in hand", boot <= PHONE.boot, boot + " ms of " + PHONE.boot);

  /* The history the phone would hold after a season, pulled the way it pulls
     it — so the Due screen is doing arithmetic over a real folder and not an
     empty one. */
  const pulled = await m.evaluate(async () => {
    try { await teamPull(true, true); } catch (e) { return { err: String(e && e.message || e) }; }
    histCache = null;
    return { rows: teamAll().length, units: (window.ASSETS || []).length };
  });
  ok("  and pulls the season's history", !pulled.err && pulled.rows > 500,
     pulled.err || pulled.rows + " rounds cached");

  const P = await m.evaluate(() => {
    const T = {}; const time = (k, f) => { const t0 = performance.now(); f(); T[k] = Math.round(performance.now() - t0); };
    time("due", () => { showPane("paneDue"); });
    T.dueRows = document.querySelectorAll("#dueList .duerow, #dueList tr, #dueList .row").length;
    showPane("paneCapture");
    const unit = (window.ASSETS || [])[500];
    time("pick", () => { selectEquip(unit && (unit.n || unit.u)); });
    /* The picker is the control an inspector fights with in gloves: it has to
       narrow the whole register while they type. It is a full-screen overlay
       with its own search — #pickSearch — not a select, so the measurement is
       of opening it and typing into it, which is what the gloves do. */
    time("open", () => { openPicker("equip"); });
    const q = document.getElementById("pickSearch");
    /* A prefix the REGISTER actually has. A literal "TK1" found nothing on
       this fixture and the search still "passed" — an empty list narrows very
       fast. Two characters off a real unit name, so the query has work to do
       and the result is something a person would see. */
    const any = String(((window.ASSETS || [])[500] || {}).n || "");
    T.query = any.slice(0, 2);
    time("search", () => { if (q) { q.value = T.query; q.dispatchEvent(new Event("input")); } });
    T.hits = document.querySelectorAll("#pickList [data-k]").length;
    closePicker();
    time("step", () => { goStep(2); });
    time("saved", () => { showPane("paneQueue"); });
    showPane("paneCapture");
    return Object.assign({ unit: unit && (unit.n || unit.u), searched: !!q }, T);
  });
  console.log("   " + JSON.stringify(P));
  ok("opening the Due screen", P.due <= PHONE.due, P.due + " ms of " + PHONE.due);
  ok("choosing a machine from the register", P.pick <= PHONE.pick, P.pick + " ms of " + PHONE.pick + " (" + P.unit + ")");
  ok("  opening the picker over the whole fleet", P.open <= PHONE.pick, P.open + " ms of " + PHONE.pick);
  ok("  typing into its search", P.searched && P.search <= PHONE.search, P.search + " ms of " + PHONE.search);
  ok("  which finds machines and shows a list somebody can read",
     P.hits > 1 && P.hits < 200, P.hits + " machines for \"" + P.query + "\"");
  ok("moving to the Findings step", P.step <= PHONE.step, P.step + " ms of " + PHONE.step);
  ok("opening Saved", P.saved <= PHONE.saved, P.saved + " ms of " + PHONE.saved);
  note("rows drawn on the Due screen", String(P.dueRows));

  console.log("\n4. AND THE PHONE DOES NOT DRAW THE FLEET IT KNOWS");
  const mb = await m.evaluate(() => {
    showPane("paneDue");
    const due = document.querySelectorAll("#dueList *").length;
    showPane("paneCapture");
    const sel = [...document.querySelectorAll("select")].map(s => s.options.length);
    return { due, opts: Math.max(...sel, 0), nodes: document.querySelectorAll("*").length };
  });
  ok("the Due screen is a screen, not the whole schedule", mb.due < 6000, mb.due + " elements");
  ok("  no picker renders 1,128 options", mb.opts < 400, mb.opts + " in the longest");
  ok("  and the page stays a page", mb.nodes < 30000, mb.nodes + " elements in the document");

  ok("no page errors on either surface", derr.length === 0 && merr.length === 0,
     [...derr, ...merr].slice(0, 3).join(" | ") || "none");
  await b.close();
  console.log(fails.length ? "\nFAILED: " + fails.length + "\n" + fails.join("\n") : "\nall green");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
