/* The lubrication round, driven the way a thumb drives it.

   Not "call renderLube and check the HTML" — that passes happily while nothing
   on the screen can reach it. This picks the type from the real selector, picks
   a real machine, walks the compartments the app itself offers, and presses the
   controls. If a fitter cannot get to it, this fails.

   Run: node tests/lubecap.cjs [port] */
const { chromium } = require(require("./pw.cjs"));
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "mobile");
const PORT = Number(process.argv[2] || 8107);

const TYPES = { ".html":"text/html", ".js":"application/javascript",
                ".json":"application/json", ".png":"image/png",
                ".webmanifest":"application/manifest+json" };
const srv = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split("?")[0]);
  const f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    rs.writeHead(404); return rs.end("no");
  }
  rs.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "text/plain" });
  fs.createReadStream(f).pipe(rs);
});

let fail = 0;
let pass = 0;
const ok = (c, what) => {
  if (!c) { fail++; console.log("  FAIL  " + what); } else { pass++; console.log("  PASS  " + what); }
  return c;
};
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w),
  what + "  (got " + JSON.stringify(g) + ", wanted " + JSON.stringify(w) + ")");

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  const TRANSPORT = /ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to load resource/;
  p.on("console", m => {
    if (m.type() !== "error") return;
    /* The sandbox has no route to the internet, so the app's sync probe fails
       in transport. That is this harness, not the page. Script errors are
       never filtered. */
    if (TRANSPORT.test(m.text())) return;
    errs.push("CONSOLE " + m.text());
  });
  await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);

  console.log("── the round can be reached at all");
  const inSel = await p.$eval("#typeSel", el =>
    [...el.options].map(o => o.value).includes("LUBE"));
  ok(inSel, "LUBE is in the type selector a thumb actually taps");

  /* Pick a machine that HAS a reference, the way the app resolves it. */
  const unit = await p.evaluate(() => {
    const A = (window.ASSETS || []).find(a =>
      window.LUBE && a.m && LUBE.of(a.m, a.cls) && LUBE.comps(a.m, a.cls).length);
    return A ? A.n : null;
  });
  ok(unit, "the register has a machine with a compartment list: " + unit);

  await p.selectOption("#typeSel", "LUBE");
  await p.waitForTimeout(150);
  await p.evaluate(u => selectEquip(u), unit);
  await p.waitForTimeout(250);

  console.log("── the panel is on screen, and the wrong ones are not");
  const vis = await p.evaluate(() => ({
    lube: !document.getElementById("lubeFields").classList.contains("hidden"),
    get:  !document.getElementById("getFields").classList.contains("hidden"),
    temp: !document.getElementById("tempFields").classList.contains("hidden"),
  }));
  ok(vis.lube, "the lube panel is shown for a lube round");
  ok(!vis.get && !vis.temp, "and no other round's panel is left on screen");

  console.log("── the compartments come from the reference, not from thin air");
  const walk = await p.evaluate(() => {
    const its = window.items ? items() : [];
    return { n: its.length, ks: its.map(i => i.k) };
  });
  ok(walk.n > 0, "the walk has compartments: " + JSON.stringify(walk.ks));
  const fromRef = await p.evaluate(u => {
    const a = (window.ASSETS || []).find(x => x.n === u);
    return LUBE.comps(a.m, a.cls).map(c => c.k);
  }, unit);
  eq(walk.ks, fromRef, "and they are exactly what lube.js says this model has");

  /* Everything below this line calls pickComponent() directly, which is how a
     dead control went unnoticed for as long as it did: the fields, the verdict,
     the evidence and the save were all verified while NOTHING ON SCREEN COULD
     REACH THEM. The lubrication tree is flat, and the top level of the cascade
     descended into every card instead of picking it — nine compartments, nine
     empty screens, curItem never set. So the walk is driven by tapping first,
     and only then by calling. */
  console.log("── a thumb can reach a compartment at all");
  const tap = async () => p.evaluate(() => ({
    cur: curItem || "",
    cards: document.querySelectorAll("#posnav .cards button").length,
    fields: (document.getElementById("captureBox") || {}).style.display !== "none",
  }));
  const before = await tap();
  ok(before.cards > 0, "the cascade offers cards to tap: " + before.cards);
  await p.locator("#posnav .cards button").first().click();
  await p.waitForTimeout(200);
  const after = await tap();
  ok(after.cur !== "", "ONE tap selects a compartment: " + JSON.stringify(after.cur));
  ok(after.fields, "and the fields to fill in are on screen");
  ok(after.cards > 0, "and the other compartments are still one tap away: " + after.cards);
  /* The card you are on has to look like the card you are on. */
  ok(await p.evaluate(() => !!document.querySelector("#posnav .cards button.on")),
     "the selected card is marked as selected");
  /* Every compartment, not just the first: a flat tree that works for one card
     and traps the rest is the same bug with a smaller blast radius. */
  const reach = await (async () => {
    const n = await p.locator("#posnav .cards button").count();
    const got = [];
    for (let i = 0; i < n; i++) {
      await p.locator("#posnav .cards button").nth(i).click();
      await p.waitForTimeout(90);
      got.push(await p.evaluate(() => curItem || ""));
    }
    return got;
  })();
  eq(reach.filter(x => x === "").length, 0,
     "every compartment on the machine is reachable by tapping it");
  eq(new Set(reach).size, reach.length,
     "and each card selects a different one");

  console.log("── recording a product actually survives");
  const first = walk.ks[0];
  await p.evaluate(k => pickComponent(k), first);
  await p.waitForTimeout(150);

  const opts = await p.$eval("#lubeProd", el => [...el.options].map(o => o.value));
  ok(opts.length > 2, "the picker offers products: " + (opts.length - 2));
  ok(opts.includes("__other"),
     "and an escape hatch — the audit must be able to record a product nobody stocks");

  const pick = opts.find(o => o && o !== "__other");
  await p.selectOption("#lubeProd", pick);
  await p.waitForTimeout(200);

  /* The bug this exists for: hasData() did not know p.prod, so saveCur deleted
     the position and the answer vanished on the way to the next compartment. */
  const survived = await p.evaluate(k => {
    saveCur();
    const q = draft.positions[k];
    return q ? { prod: q.prod } : null;
  }, first);
  eq(survived, { prod: pick }, "the product is still there after saveCur — it is not thrown away");

  console.log("── moving away and back does not lose it");
  if (walk.ks[1]) {
    await p.evaluate(k => pickComponent(k), walk.ks[1]);
    await p.waitForTimeout(120);
    await p.evaluate(k => pickComponent(k), first);
    await p.waitForTimeout(120);
    const back = await p.$eval("#lubeProd", el => el.value);
    eq(back, pick, "the picker reads back what was recorded");
  }

  console.log("── evidence is a real control and toggles off");
  const nEvid = await p.$$eval("#lubeEvid button", bs => bs.length);
  ok(nEvid >= 3, "the evidence choices are rendered: " + nEvid);
  await p.click("#lubeEvid button[data-e='label']");
  await p.waitForTimeout(120);
  eq(await p.evaluate(k => (draft.positions[k] || {}).evid, first), "label", "tapping records it");
  await p.click("#lubeEvid button[data-e='label']");
  await p.waitForTimeout(120);
  eq(await p.evaluate(k => (draft.positions[k] || {}).evid, first), undefined,
     "tapping the chosen one again clears it");

  console.log("── the verdict is computed, and it is not always the same answer");
  /* Has to run on a SOURCED compartment. On an unsourced one every product
     correctly returns "no specification to judge it against", which would make
     this check pass for the wrong reason and then never fail again. */
  const sourced = await p.evaluate(() => {
    const A = (window.ASSETS || []).find(a =>
      a.m && LUBE.of(a.m, a.cls) &&
      LUBE.comps(a.m, a.cls).some(c => LUBE.forComp(a.m, c.k, a.cls)));
    if (!A) return null;
    return { unit: A.n,
             k: LUBE.comps(A.m, A.cls).find(c => LUBE.forComp(A.m, c.k, A.cls)).k };
  });
  ok(sourced, "there is a compartment with a site product to judge against: " + JSON.stringify(sourced));
  await p.evaluate(o => { selectEquip(o.unit); pickComponent(o.k); }, sourced);
  await p.waitForTimeout(200);
  const verdicts = await p.evaluate(k => {
    const out = {};
    const set = n => { draft.positions[k] = Object.assign(draft.positions[k] || {}, { prod: n }); };
    const c = lubeComp(k);
    out.spec = c && c.t || null;
    LUBE.catalog.forEach(pr => { set(pr.p); out[pr.p] = lubeVerdict(k).k; });
    delete draft.positions[k].prod;
    out.__empty = lubeVerdict(k).k;
    draft.positions[k] = Object.assign(draft.positions[k] || {},
      { prod: "__other", other: "Some drum from the back of the shed" });
    out.__typed = lubeVerdict(k).k;
    return out;
  }, sourced.k);
  eq(verdicts.__empty, "lube_v_none", "nothing recorded says so");
  eq(verdicts.__typed, "lube_v_unknown",
     "a product nobody stocks is neither a pass nor a failure — it needs checking");
  const distinct = new Set(Object.entries(verdicts)
    .filter(([k]) => k !== "spec" && !k.startsWith("__")).map(([, v]) => v));
  ok(distinct.size > 1,
     "the catalogue does not all get one answer: " + JSON.stringify([...distinct]));

  console.log("── an unsourced compartment still works");
  const unsourced = await p.evaluate(() => {
    const A = (window.ASSETS || []).find(a =>
      a.m && LUBE.of(a.m, a.cls) &&
      LUBE.comps(a.m, a.cls).some(c => c.cap == null || c.verify));
    if (!A) return null;
    const c = LUBE.comps(A.m, A.cls).find(x => x.cap == null || x.verify);
    return { unit: A.n, k: c.k };
  });
  if (ok(unsourced, "there is a compartment nobody has sourced yet")) {
    await p.evaluate(o => { selectEquip(o.unit); pickComponent(o.k); }, unsourced);
    await p.waitForTimeout(200);
    const said = await p.$eval("#lubeRef", el => el.textContent.trim());
    ok(said.length > 0, "the panel says so rather than showing an empty box: " + JSON.stringify(said));
    const stillWalkable = await p.$eval("#lubeProd", el => !el.disabled);
    ok(stillWalkable, "and the product can still be recorded — the audit is not blocked on a manual");
  }

  console.log("── a machine with no lube reference does not take the screen out");
  /* 940 units on the register are support equipment with no lube reference at
     all. Arming a lube round on one has to say so, not throw — items() used to
     fall through to the component table, which has no column for this round,
     and the exception took the whole capture screen down. */
  const noRef = await p.evaluate(() =>
    (window.ASSETS || []).filter(a => !window.LUBE || !LUBE.of(a.m, a.cls)).map(a => a.n)[0]);
  if (ok(noRef, "the register has a machine outside the lube reference: " + noRef)) {
    const before = errs.length;
    /* selectEquip() is INSIDE the try: it calls applyForm(), which calls
       items(), which is where this used to throw. Leaving it outside meant the
       exception escaped as a harness crash instead of a reported failure — the
       check looked green because it never ran. */
    const walked = await p.evaluate(u => {
      try {
        selectEquip(u);
        return { n: items().length, threw: null };
      } catch (e) { return { n: null, threw: String(e && e.message || e) }; }
    }, noRef);
    await p.waitForTimeout(200);
    eq(walked.threw, null, "walking it does not throw");
    eq(walked.n, 0, "it offers no compartments rather than the wrong ones");
    eq(errs.length, before, "and nothing lands in the console");
    const alive = await p.evaluate(() => !!document.querySelector("#typeSel"));
    ok(alive, "the capture screen is still standing");
  }

  console.log("── nothing scrolls sideways, in either language");
  for (const lg of ["en", "ru"]) {
    await p.evaluate(l => { window.lang = l; if (window.applyLang) applyLang(); if (window.loadPos) loadPos(); }, lg);
    await p.waitForTimeout(200);
    for (const w of [320, 412]) {
      await p.setViewportSize({ width: w, height: 900 });
      await p.waitForTimeout(150);
      const over = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(over <= 0, `${lg} at ${w}px does not scroll sideways (over by ${over})`);
      /* A tap target smaller than a gloved thumb is not a tap target. */
      const small = await p.$$eval("#lubeEvid button", bs =>
        bs.filter(x => x.getBoundingClientRect().height < 40).length);
      eq(small, 0, `${lg} at ${w}px: every evidence button is still tappable`);
    }
  }
  await p.setViewportSize({ width: 412, height: 900 });

  console.log("── the console stayed quiet");
  ok(errs.length === 0, "no console or page errors: " + errs.slice(0, 3).join(" | "));

  await b.close();
  srv.close();
  console.log(fail ? "\n" + fail + " FAILED" : "\nthe lube round can be walked with a thumb");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
