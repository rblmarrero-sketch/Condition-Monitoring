/* The machine reference, edited in the lube master.

   The point of this screen is not that it saves. It is that an edit reaches
   everything computed from it — the matrix, the coverage bars, the export —
   without any of those needing to know edits exist. So the checks follow a
   figure from the box somebody typed it into all the way to the number a
   manager reads.

   And it has to be undoable: "I typed 380 instead of 38" must never become
   permanent. Since 2026-10-04 the reference is the shared lube master on the
   server (dashboard/lube-master.js) rather than one browser's localStorage,
   so this runs against the real backend function (tests/ya-srv.cjs).

   Run: node tests/luberef.cjs   (spawns tests/ya-srv.cjs) */
const { chromium } = require(require("./pw.cjs"));
const { spawn } = require("child_process");
const path = require("path");
const PORT = 8195, B = `http://127.0.0.1:${PORT}`, EXEC = B + "/exec";
const URL = B + "/dashboard/index.html";

let fail = 0, pass = 0;
const ok = (c, w) => { if (!c) { fail++; console.log("  FAIL  " + w); }
                       else { pass++; console.log("  PASS  " + w); } return c; };
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w),
  what + "  (got " + JSON.stringify(g) + ", wanted " + JSON.stringify(w) + ")");
const wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(__dirname, "ya-srv.cjs"), String(PORT), "NONE"], { stdio: "ignore" });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on("exit", bye);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC); break; } catch (e) { await wait(250); } }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(url => { if (!sessionStorage.getItem("b")) { sessionStorage.setItem("b", 1);
    localStorage.setItem("cm_drive_url", url); localStorage.setItem("cm_dash_who", "A. Tester"); } }, EXEC);
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/ERR_|Failed to load/.test(m.text()))
                           errs.push("CONSOLE " + m.text()); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForFunction(() => window.CMLube && ["none", "ready"].includes(CMLube.state().state), null, { timeout: 20000 });
  await p.click('#tabs [data-tab="lube"]');
  await p.evaluate(k => lubeGo(k), "master");
  await p.waitForTimeout(400);
  /* Wait for a save in the master panel to be confirmed by the server. */
  const saved = async () => {
    await p.waitForFunction(() => /revision \d+|Nothing changed/.test((document.querySelector('[data-lmx-msg="model"]') || {}).textContent || ""), null, { timeout: 15000 });
    const m = await p.textContent('[data-lmx-msg="model"]');
    await p.evaluate(() => { CMLube._ui.msg.model = ""; });
    return m;
  };
  const pick = k => p.evaluate(k => { CMLube._ui.model = k; CMLube.redraw(); }, k);

  console.log("── the editor is on screen and offers every model");
  const shape = await p.evaluate(() => ({
    fleet: document.querySelectorAll("#lmMaster .lmx-mrow").length,
    rows: document.querySelectorAll("#lmMaster .lmx-tbl tbody tr").length,
    nums: document.querySelectorAll('#lmMaster .lmx-tbl tbody input[data-f="cap"]').length,
  }));
  ok(shape.fleet > 40, "every model on the register is pickable: " + shape.fleet);
  await p.click('#lmMaster [data-lmxf="0"]');
  const all = await p.$$eval("#lmMaster .lmx-mrow", x => x.length);
  ok(all > shape.fleet, "and 'All models' adds the ones with no machine yet: " + all);
  await p.click('#lmMaster [data-lmxf="1"]');
  ok(shape.rows > 0 && shape.nums === shape.rows, `a capacity box on every compartment (${shape.rows} rows)`);

  console.log("── an edit reaches the numbers computed from it");
  const before = await p.evaluate(() => {
    const k = CMLube._ui.model, i = k.indexOf("|");
    const m = k.slice(i+1), cls = k.slice(0,i);
    const c = LUBE.comps(m, cls).find(x => x.cap != null) || LUBE.comps(m, cls)[0];
    return { key: k, m, cls, comp: c.k, cap: c.cap == null ? null : c.cap, sourced: lubeProgramme().refKnown };
  });
  const NEWCAP = (before.cap || 0) + 7;
  await p.fill(`#lmMaster tr[data-lmxk="${before.comp}"] input[data-f="cap"]`, String(NEWCAP));
  await p.click("#lmxSaveM");
  const said = await saved();
  const after = await p.evaluate(o => ({ inRef: (LUBE.comp(o.m, o.comp, o.cls) || {}).cap,
    stored: ((CMLube.doc() || {}).comps || {})[o.key] }), before);
  eq(after.inRef, NEWCAP, "the reference itself now returns the edited capacity");
  ok(after.stored && after.stored[before.comp] && after.stored[before.comp].cap === NEWCAP,
     "and it is stored as an edit in the shared master, not written over the workbook's figure");
  ok(/revision/.test(said), "the screen says it saved rather than leaving somebody guessing: " + said);

  console.log("── and it reaches the sheet a fitter would print");
  const csv = await p.evaluate(() => {
    let cap = null; const o = URL.createObjectURL;
    URL.createObjectURL = x => { cap = x; return "blob:x"; };
    const cl = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){};
    lubeCsv();
    HTMLAnchorElement.prototype.click = cl; URL.createObjectURL = o;
    return cap ? cap.text() : "";
  });
  ok(csv.split(/\r?\n/).some(l => l.includes(`"${NEWCAP}"`)), "the edited capacity is in the export the supplier gets");

  console.log("── an unsourced figure becomes sourced only with a document");
  const gapKey = await p.evaluate(() => {
    const offered = [...document.querySelectorAll("#lmMaster .lmx-mrow")].map(o => o.dataset.lmxm);
    return offered.find(kk => { const j = kk.indexOf("|");
      return LUBE.comps(kk.slice(j+1), kk.slice(0,j)).some(x => x.cap != null && x.verify); }) || null;
  });
  if (ok(gapKey, "a model on the register has a placeholder figure to confirm: " + gapKey)) {
    await pick(gapKey);
    const g = await p.evaluate(k => { const j = k.indexOf("|"), m = k.slice(j+1), cls = k.slice(0,j);
      const c = LUBE.comps(m, cls).find(x => x.cap != null && x.verify);
      return { m, cls, comp: c.k, was: lubeProgramme().refKnown }; }, gapKey);
    await p.fill(`#lmMaster tr[data-lmxk="${g.comp}"] input[data-s="doc"]`, "Komatsu TEST-123");
    await p.fill(`#lmMaster tr[data-lmxk="${g.comp}"] input[data-s="page"]`, "9-9");
    await p.click("#lmxSaveM"); await saved();
    const src = await p.evaluate(o => { const c = LUBE.comp(o.m, o.comp, o.cls);
      return { doc: (c.src||{}).doc, page: (c.src||{}).page, who: (c.src||{}).who, when: (c.src||{}).when,
               verify: !!c.verify, now: lubeProgramme().refKnown }; }, g);
    eq(src.doc, "Komatsu TEST-123", "the document is recorded against the figure");
    eq(src.page, "9-9", "with the page");
    eq(src.who, "A. Tester", "and who checked it — the name the desk saves under, not a box anybody fills");
    ok(/^\d{4}-\d{2}-\d{2}$/.test(src.when || ""), "and when — a figure with no provenance is a guess: " + src.when);
    ok(!src.verify, "the placeholder flag goes once a document is cited");
    console.log("── coverage moves when the reference does");
    eq(src.now, g.was + 1, `'reference sourced' went up by exactly one (${g.was} → ${src.now})`);
  }

  console.log("── undo really undoes");
  await pick(before.key);
  await p.click("#lmxRevM"); await saved();
  const undone = await p.evaluate(o => ({ cap: (LUBE.comp(o.m, o.comp, o.cls) || {}).cap,
    stored: ((CMLube.doc() || {}).comps || {})[o.key] }), before);
  eq(undone.cap, before.cap, "the original capacity is back — the edit did not destroy it");
  ok(!undone.stored, "and the edit is gone from the shared master");

  console.log("── typing the workbook's own figure back is not an edit");
  await p.fill(`#lmMaster tr[data-lmxk="${before.comp}"] input[data-f="cap"]`, String(NEWCAP));
  await p.click("#lmxSaveM"); await saved();
  await p.fill(`#lmMaster tr[data-lmxk="${before.comp}"] input[data-f="cap"]`, String(before.cap));
  await p.click("#lmxSaveM"); await saved();
  const back = await p.evaluate(o => ((CMLube.doc() || {}).comps || {})[o.key], before);
  ok(!back, "a value equal to the workbook's leaves no edit behind: " + JSON.stringify(back));

  console.log("── a form field looks like a form field on every row");
  /* The grid stripes even rows, and the original bug was that an input read as
     a box on half of them and as plain text on the other half. Measure how far
     the input's edge and fill stand off the row it is sitting on. */
  const edges = await p.evaluate(() => {
    const lum = c => {
      const m = (c || "").match(/[\d.]+/g);
      if (!m) return null;
      if (m.length >= 4 && Number(m[3]) === 0) return null;
      const [r, g, b] = m.slice(0, 3).map(Number).map(v => {
        v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const behind = el => {
      let n = el.parentElement;
      while (n) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        n = n.parentElement;
      }
      return "rgb(255,255,255)";
    };
    const ratio = (a, b) => {
      const A = lum(a), B = lum(b);
      if (A == null || B == null) return 1;
      return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
    };
    return [...document.querySelectorAll("#lmMaster .lmx-tbl input.lmx-in, #lmMaster .lmx-tbl select.lmx-in")].map(el => {
      const cs = getComputedStyle(el), bg = behind(el);
      return { border: +ratio(cs.borderTopColor, bg).toFixed(3), fill: +ratio(cs.backgroundColor, bg).toFixed(3) };
    });
  });
  const invisible = edges.filter(e => e.border < 1.15 && e.fill < 1.03);
  eq(invisible.length, 0,
     `every input stands off the row behind it (${edges.length} checked, worst edge ` +
     `${Math.min(...edges.map(e => e.border)).toFixed(2)}:1)`);

  console.log("── nothing scrolls sideways, no errors");
  for (const w of [1440, 1100]) {
    await p.setViewportSize({ width: w, height: 1000 });
    await p.waitForTimeout(250);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `${w}px does not scroll sideways (over by ${over})`);
  }
  ok(errs.length === 0, "no page or console errors: " + errs.slice(0, 2).join(" | "));

  await b.close();
  console.log(fail ? "\n" + fail + " FAILED" : "\nan edit reaches everything computed from it, and undoes");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
