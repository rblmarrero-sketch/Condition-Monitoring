/* The machine reference editor.

   The point of this screen is not that it saves. It is that an edit reaches
   everything computed from it — the matrix, the coverage bars, the verdict —
   without any of those needing to know overrides exist. So the checks follow a
   figure from the box somebody typed it into all the way to the number a
   manager reads.

   And it has to be undoable. Editing the loaded table in place makes the
   original unrecoverable, so "I typed 380 instead of 38" becomes permanent the
   moment somebody reloads.

   Run: node tests/luberef.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0, pass = 0;
const ok = (c, w) => { if (!c) { fail++; console.log("  FAIL  " + w); }
                       else { pass++; console.log("  PASS  " + w); } return c; };
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w),
  what + "  (got " + JSON.stringify(g) + ", wanted " + JSON.stringify(w) + ")");

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/ERR_|Failed to load/.test(m.text()))
                           errs.push("CONSOLE " + m.text()); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(2200);
  await p.click('#tabs [data-tab="lube"]');
  /* Lubrication is seven panels behind sub-tabs now — as one page it ran to
     several thousand pixels and you scrolled past four subjects to reach the
     fifth. A test has to ask for the panel it is testing, the same way a
     reader clicks for it. lubeGo() is the one way in. */
  await p.evaluate(k => lubeGo(k), 'ref');
  await p.waitForTimeout(500);

  console.log("── the editor is on screen and offers every model");
  const shape = await p.evaluate(() => ({
    models: document.querySelectorAll("#lrModel option").length,
    rows:   document.querySelectorAll("#lrTbl tbody tr").length,
    inputs: document.querySelectorAll("#lrTbl input.lrin").length,
  }));
  ok(shape.models > 40, "every model the reference covers is pickable: " + shape.models);
  ok(shape.rows > 0 && shape.inputs === shape.rows * 6,
     `six editable fields per compartment (${shape.rows} rows, ${shape.inputs} inputs)`);

  console.log("── an edit reaches the numbers computed from it");
  /* Pick a compartment that HAS a capacity, change it, and follow it through. */
  const before = await p.evaluate(() => {
    const k = $("lrModel").value, i = k.indexOf("|");
    const m = k.slice(i+1), cls = k.slice(0,i);
    const c = LUBE.comps(m, cls).find(x => x.cap != null) || LUBE.comps(m, cls)[0];
    return { key: k, m, cls, comp: c.k, cap: c.cap == null ? null : c.cap,
             sourced: lubeProgramme().refKnown };
  });
  const NEWCAP = (before.cap || 0) + 7;
  await p.evaluate(([comp, v]) => {
    const el = document.querySelector(`#lrTbl input.lrin[data-k="${comp}"][data-f="cap"]`);
    el.value = String(v);
  }, [before.comp, NEWCAP]);
  await p.click("#lrSave");
  await p.waitForTimeout(400);

  const after = await p.evaluate(o => ({
    inRef: (LUBE.comp(o.m, o.comp, o.cls) || {}).cap,
    stored: JSON.parse(localStorage.getItem("cm_lube_ref") || "{}")[o.key],
    saidSo: $("lrSaved").textContent.trim().length > 0,
  }), before);
  eq(after.inRef, NEWCAP, "the reference itself now returns the edited capacity");
  ok(after.stored && after.stored[before.comp],
     "and it is stored as an override, not written over the original");
  ok(after.saidSo, "the screen says it saved rather than leaving somebody guessing");

  console.log("── and it reaches the sheet a fitter would print");
  const inMatrix = await p.evaluate(o => {
    lubeShow = o.cls; renderLubeTab();
    return [...document.querySelectorAll("#lubeMtx td.cell i.num")]
      .map(el => el.textContent).join(" | ");
  }, before);
  /* Only meaningful if that compartment happens to be audited; the capacity is
     still in the CSV either way, which every compartment reaches. */
  const csv = await p.evaluate(() => {
    let cap = null; const o = URL.createObjectURL;
    URL.createObjectURL = x => { cap = x; return "blob:x"; };
    const cl = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){};
    lubeCsv();
    HTMLAnchorElement.prototype.click = cl; URL.createObjectURL = o;
    return cap ? cap.text() : "";
  });
  ok(csv.split(/\r?\n/).some(l => l.includes(`"${NEWCAP}"`)),
     "the edited capacity is in the export the supplier gets");

  console.log("── an unsourced figure becomes sourced only with a document");
  const src = await p.evaluate(o => {
    const set = (f, v) => {
      const el = document.querySelector(`#lrTbl input.lrin[data-k="${o.comp}"][data-f="${f}"]`);
      el.value = v;
    };
    set("doc", "Komatsu TEST-123"); set("page", "9-9"); set("who", "A. Tester");
    lubeRefSave();
    const c = LUBE.comp(o.m, o.comp, o.cls);
    return { doc: (c.src||{}).doc, who: (c.src||{}).who, when: (c.src||{}).when };
  }, before);
  eq(src.doc, "Komatsu TEST-123", "the document is recorded against the figure");
  eq(src.who, "A. Tester", "with who checked it");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(src.when || ""),
     "and when — a figure with no provenance is a guess: " + src.when);

  console.log("── coverage moves when the reference does");
  /* Has to be an UNSOURCED compartment. Adding a document to one that already
     had a capacity leaves the count where it was, and a check that compares a
     number to itself with >= passes for ever without ever meaning anything. */
  const cov = await p.evaluate(() => {
    /* Switch to a model that ACTUALLY has a gap rather than assuming the one
       the screen opened on does. The default is the biggest class, and after
       the masterlist import that happens to be fully sourced — a check that
       depended on it would fail for a reason that has nothing to do with the
       editor. */
    /* From the models the EDITOR OFFERS, not from every model in the
       reference. Sixty-odd masterlist models have no machine on the register
       yet; the picker leaves them out, so setting lrModel to one of those
       silently keeps the previous model on screen and the edit lands on the
       wrong machine. */
    const offered = [...document.querySelectorAll("#lrModel option")].map(o => o.value);
    const withGap = offered.find(kk => {
      const j = kk.indexOf("|");
      return LUBE.comps(kk.slice(j+1), kk.slice(0,j))
                 .some(x => x.cap == null || x.verify);
    });
    if(!withGap) return { skipped: true };
    lrModel = withGap; renderLubeRef();
    const k = withGap, i = k.indexOf("|");
    const m = k.slice(i+1), cls = k.slice(0,i);
    const gap = LUBE.comps(m, cls).find(x => x.cap == null || x.verify);
    const was = lubeProgramme().refKnown;
    document.querySelector(`#lrTbl input.lrin[data-k="${gap.k}"][data-f="cap"]`).value = "123";
    lubeRefSave();
    const now = lubeProgramme().refKnown;
    return { comp: gap.k, was, now, cap: (LUBE.comp(m, gap.k, cls)||{}).cap };
  });
  if (ok(!cov.skipped, "this model has an unsourced compartment to fill in: " + cov.comp)) {
    eq(cov.cap, 123, "the new capacity is in the reference");
    eq(cov.now, cov.was + 1,
       `and 'reference sourced' went up by exactly one (${cov.was} → ${cov.now})`);
  }

  /* The coverage step switched the picker to a model that had a gap. Put it
     back, or undo and export run against a different machine than the one the
     edit was made on. */
  await p.evaluate(k => { lrModel = k; renderLubeRef(); }, before.key);
  await p.waitForTimeout(200);

  console.log("── undo really undoes");
  /* The reason overrides sit on top of the reference rather than in it. */
  await p.click("#lrReset");
  await p.waitForTimeout(400);
  const undone = await p.evaluate(o => ({
    cap: (LUBE.comp(o.m, o.comp, o.cls) || {}).cap,
    stored: JSON.parse(localStorage.getItem("cm_lube_ref") || "{}")[o.key],
  }), before);
  eq(undone.cap, before.cap, "the original capacity is back — the edit did not destroy it");
  ok(!undone.stored, "and the override is gone from storage");

  console.log("── the export is the file that reaches the phones");
  await p.evaluate(o => {
    document.querySelector(`#lrTbl input.lrin[data-k="${o.comp}"][data-f="cap"]`).value = "99";
    lubeRefSave();
  }, before);
  const exported = await p.evaluate(() => {
    let cap = null; const o = URL.createObjectURL;
    URL.createObjectURL = x => { cap = x; return "blob:x"; };
    const cl = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){};
    lubeRefExport();
    HTMLAnchorElement.prototype.click = cl; URL.createObjectURL = o;
    return cap ? cap.text() : "";
  });
  let parsed = null;
  try { parsed = JSON.parse(exported); } catch (e) { /* reported below */ }
  ok(parsed, "the export is valid JSON a build script can read");
  ok(parsed && parsed[before.key] && parsed[before.key][before.comp],
     "and carries the edit, keyed by class|model so a loader cannot take a truck's figure");

  console.log("── a form field looks like a form field on every row");
  /* The grid stripes even rows, and the original bug was that an input read as
     a box on half of them and as plain text on the other half.

     Comparing the inputs' own computed styles CANNOT see that — they were
     always identical; the difference came from the row behind. So measure the
     thing that actually varies: how far the input's edge and fill stand off
     the row it is sitting on. A field nobody can see the edge of is a field
     people stop trusting they have typed into. */
  const edges = await p.evaluate(() => {
    const lum = c => {
      const m = (c || "").match(/[\d.]+/g);
      if (!m) return null;
      if (m.length >= 4 && Number(m[3]) === 0) return null;      /* transparent */
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
      if (A == null || B == null) return 1;                       /* invisible */
      return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05);
    };
    return [...document.querySelectorAll("#lrTbl input.lrin")].map(el => {
      const cs = getComputedStyle(el), bg = behind(el);
      return { border: +ratio(cs.borderTopColor, bg).toFixed(3),
               fill:   +ratio(cs.backgroundColor, bg).toFixed(3) };
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
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `${w}px does not scroll sideways (over by ${over})`);
  }
  await p.evaluate(() => localStorage.removeItem("cm_lube_ref"));
  ok(errs.length === 0, "no page or console errors: " + errs.slice(0, 2).join(" | "));

  await b.close();
  console.log(fail ? "\n" + fail + " FAILED" : "\nan edit reaches everything computed from it, and undoes");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
