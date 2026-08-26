/* The Lubrication tab: the programme panel and the fleet matrix.

   The failure this exists to prevent is a confident wrong number. This panel
   reports how much of a 1,128-unit fleet is audited, and somebody will make a
   staffing decision on it. So the checks are mostly about DENOMINATORS: that
   coverage is counted against the register rather than against the handful of
   machines somebody visited, and that a colour on the matrix keeps meaning one
   product however the view is filtered.

   Run: node tests/lubetab.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0, pass = 0;
const ok = (c, w) => { if (!c) { fail++; console.log("  FAIL  " + w); }
                       else { pass++; console.log("  PASS  " + w); } return c; };
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w),
  what + "  (got " + JSON.stringify(g) + ", wanted " + JSON.stringify(w) + ")");

/* Seed rounds into what the tab actually lands on, so the assertions are about
   what a person sees rather than about a view nobody opens. That used to mean
   one class — the biggest — because the tab opened filtered to it. It opens on
   every class now (a filter the reader did not choose hid four fifths of the
   fleet, and an engineer reported a truck as missing from the reference because
   of it), so the seed spreads across classes too. */
const SEED = (n) => {
  const pick = [];
  for (const a of ASSETS) {
    const r = LUBE.of(a.m || "", a.cls || "");
    if (!r || pick.some(x => x.m === r.m)) continue;
    pick.push({ u: a.n, m: r.m, cls: r.cls, comps: r.comps });
    if (pick.length >= n) break;
  }
  /* Two compartments per machine and DIFFERENT evidence on each: one
     photographed label, one reported. A seed that gives every compartment the
     same evidence cannot tell whether the panel discriminates, and a check
     that cannot discriminate is one that will never fail. A product that does
     not fit is fine and deliberate — the audit records what is really in
     there, and counting does not depend on the verdict. */
  pick.forEach((x, i) => {
    const items = [];
    x.comps.slice(0, 2).forEach((c, j) => {
      const fit = LUBE.forComp(x.m, c.k, x.cls);
      const prod = (fit || LUBE.catalog[(i + j) % LUBE.catalog.length]).p;
      items.push({ key: c.k, lubeProduct: prod,
                   lubeEvidence: j === 0 ? "label" : "told",
                   lubeSampled: j === 0 ? 1 : 0 });
    });
    RECS.push({ id: "seed" + i, equip: x.u, type: "LUBE",
                date: "2026-08-18", by: "Test", items });
  });
  renderAll(); showTab("lube"); lubeGo("matrix");
  return pick;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  p.on("pageerror", e => errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/ERR_|Failed to load/.test(m.text()))
                           errs.push("CONSOLE " + m.text()); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(2200);

  console.log("── the tab is reachable");
  ok(await p.$eval("#tabs", el => !!el.querySelector('[data-tab="lube"]')),
     "there is a Lubrication tab a person can click");
  await p.click('#tabs [data-tab="lube"]');
  /* Lubrication is seven panels behind sub-tabs now — as one page it ran to
     several thousand pixels and you scrolled past four subjects to reach the
     fifth. A test has to ask for the panel it is testing, the same way a
     reader clicks for it. lubeGo() is the one way in. */
  await p.evaluate(k => lubeGo(k), 'matrix');
  await p.waitForTimeout(400);
  ok(await p.$eval("#tab-lube", el => !el.classList.contains("hidden")),
     "clicking it shows the panel");

  const seeded = await p.evaluate(SEED, 4);
  await p.waitForTimeout(400);
  ok(seeded.length > 0, "seeded rounds on the sheet the tab lands on: " + seeded.length);

  console.log("── the programme counts THE FLEET, not the rounds");
  const P = await p.evaluate(() => lubeProgramme());
  ok(P.instances > P.audited * 10,
     `the denominator is the register (${P.instances} compartments), not what was walked (${P.audited})`);
  ok(P.covered > 0 && P.covered <= P.siteUnits,
     `units covered (${P.covered}) is a subset of the site register (${P.siteUnits})`);
  ok(P.instances > P.covered,
     "there are more compartments than units — a machine has several");
  /* Each state is counted against its own denominator and they are not one
     ladder, but these three ARE nested and must stay so. */
  ok(P.current <= P.audited, "an audit cannot be current without having happened");
  ok(P.verified <= P.current, "verified is a subset of current");
  ok(P.conformant <= P.verified, "conformant on EVIDENCE is a subset of verified");

  console.log("── evidence actually gates 'verified'");
  /* Seeded one round with a photographed label and the rest reported. If this
     ever stops discriminating, the panel reports full verification for a fleet
     nobody photographed. */
  ok(P.audited >= 2, "the seed produced more than one audited compartment: " + P.audited);
  ok(P.verified > 0 && P.verified < P.audited,
     `hearsay does not count as verified (${P.verified} verified of ${P.audited} audited)`);

  console.log("── a round outside its drain interval stops being current");
  const aged = await p.evaluate(() => {
    RECS.filter(r => r.type === "LUBE").forEach(r => r.date = "2020-01-01");
    renderAll();
    const q = lubeProgramme();
    RECS.filter(r => r.type === "LUBE").forEach(r => r.date = "2026-08-18");
    renderAll();
    return q;
  });
  ok(aged.audited > 0, "a six-year-old round is still counted as ever audited");
  eq(aged.current, 0, "but not as current — it describes oil drained long ago");

  console.log("── the matrix draws what was audited, and says so where nothing was");
  const M = await p.evaluate(() => ({
    rows:  document.querySelectorAll("#lubeMtx tbody tr").length,
    cells: document.querySelectorAll("#lubeMtx td.cell").length,
    unset: document.querySelectorAll("#lubeMtx td.unset").length,
    heads: document.querySelectorAll("#lubeMtx thead th").length,
    legend:document.querySelectorAll("#lubeLegend .lg").length,
  }));
  ok(M.cells > 0, "audited compartments are drawn as cells: " + M.cells);
  ok(M.unset > 0, "unaudited ones say so rather than sitting blank: " + M.unset);
  ok(M.legend >= 3, "the legend names the products plus the two non-answers");
  ok(M.heads >= 2, "there are compartment columns: " + M.heads);

  console.log("── an unaudited cell is never mistaken for an absent compartment");
  const distinct = await p.evaluate(() => {
    const u = document.querySelector("#lubeMtx td.unset");
    const n = document.querySelector("#lubeMtx td.na");
    return { unsetText: u ? u.textContent.trim() : null,
             naText: n ? n.textContent.trim() : null,
             same: !!(u && n) && u.textContent.trim() === n.textContent.trim() };
  });
  ok(distinct.unsetText, "the unaudited cell carries words: " + JSON.stringify(distinct.unsetText));
  ok(!distinct.same, "and they are not the same words as 'no such compartment'");

  console.log("── colour follows the product, not the row it lands on");
  /* The rule that makes the sheet readable: filtering the view must not
     repaint the survivors, or the colour stops being an identity. */
  const hues = await p.evaluate((cls) => {
    const grab = () => [...document.querySelectorAll("#lubeMtx td.cell")]
      /* The product name is only PRINTED where a column carries more than one,
         so identity is read off the cell's data attribute - which is there
         precisely so that dropping the caption did not drop the fact. */
      .map(td => (td.dataset.p || "") + "=" + td.style.getPropertyValue("--h"));
    /* NARROW first, then widen. The tab now opens on every class, so widening
       from where it lands changes nothing and the check would pass without ever
       having exercised a filter — a guard that cannot fail. */
    lubeShow = cls; renderLubeTab();
    const before = grab();
    lubeShow = "";            /* widen to every class */
    renderLubeTab();
    const after = grab();
    return { before, after };
  }, seeded[0].cls);
  const map = {};
  hues.before.concat(hues.after).forEach(x => {
    const [n, h] = x.split("="); (map[n] = map[n] || new Set()).add(h);
  });
  const drifted = Object.entries(map).filter(([, set]) => set.size > 1).map(([n]) => n);
  eq(drifted, [], "no product changed colour when the filter widened");

  /* A matrix exists to show VARIATION. "EXSOIL HD TRUCK ARCTIC 0W-40" printed
     twenty times down the engine column is wallpaper, and it was set in the
     loudest type on the sheet while the capacity and the interval - the only
     things that differ machine to machine - sat under it in small grey. */
  console.log("── the name appears where it varies, and the numbers everywhere");
  const emph = await p.evaluate(() => {
    const cols = {}, out = { named: [], quiet: [], numbers: 0, cells: 0 };
    [...document.querySelectorAll("#lubeMtx tbody tr")].forEach(tr => {
      [...tr.querySelectorAll("td.cell")].forEach((td, i) => {
        out.cells++;
        if (td.querySelector("i.num")) out.numbers++;
        (cols[i] || (cols[i] = { named: 0, n: 0 })).n++;
        if (td.querySelector("b")) cols[i].named++;
      });
    });
    Object.keys(cols).forEach(i => {
      (cols[i].named ? out.named : out.quiet).push(Number(i));
    });
    /* and the column has to say its product SOMEWHERE, or the colour is a
       riddle - the heading carries it when every cell agrees. */
    out.captions = document.querySelectorAll("#lubeMtx thead .colp").length;
    return out;
  });
  ok(emph.numbers === emph.cells,
     "every cell carries its capacity and interval: " + emph.numbers + "/" + emph.cells);
  ok(emph.quiet.length > 0,
     "a column where one product serves every machine does not repeat its name: "
     + emph.quiet.length + " of " + (emph.quiet.length + emph.named.length));
  ok(emph.captions > 0,
     "it is named once at the top of the column instead: " + emph.captions);

  console.log("── the wide view does not take the page sideways");
  /* 25 columns across twelve asset classes is a real state, reachable in one
     click, and it used to push the whole document 1,260px wide. */
  for (const w of [1440, 1100, 820]) {
    await p.setViewportSize({ width: w, height: 1000 });
    await p.waitForTimeout(250);
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `all-classes at ${w}px does not scroll the page sideways (over by ${over})`);
    const scrolls = await p.evaluate(() => {
      const w = document.querySelector("#lubeMtx").closest(".tblwrap");
      return !!w && w.scrollWidth > w.clientWidth + 1;
    });
    if (w === 820) ok(scrolls, "  the table scrolls inside its own box instead");
  }
  await p.setViewportSize({ width: 1440, height: 1000 });

  console.log("── the export carries the gaps, not just the answers");
  const csv = await p.evaluate(() => {
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = b => { captured = b; return "blob:x"; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){};
    lubeCsv();
    HTMLAnchorElement.prototype.click = click;
    URL.createObjectURL = orig;
    return captured ? captured.text() : null;
  });
  ok(csv, "the CSV button produces a file");
  if (csv) {
    const lines = csv.trim().split(/\r?\n/);
    ok(lines.length > 100, "one row per model x compartment, gaps included: " + (lines.length - 1));
    ok(/Refill L/.test(lines[0]) && /Product in service/.test(lines[0]),
       "with both the reference and what was found");
    const blanks = lines.slice(1).filter(l => /,"","","",""$/.test(l)).length;
    ok(lines.length - 1 > M.cells,
       "unaudited compartments are in the export — the gaps are the actionable half");
  }

  console.log("── both themes, no errors");
  for (const th of ["light", "dark"]) {
    await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), th);
    await p.waitForTimeout(250);
    const bad = await p.evaluate(() => {
      /* A hatch that only shows on alternate rows reads as a difference in the
         data. It was exactly that, because the grid stripes even rows. */
      const u = [...document.querySelectorAll("#lubeMtx td.unset")]
        .map(td => getComputedStyle(td).backgroundImage);
      return { kinds: [...new Set(u)].length, n: u.length };
    });
    ok(bad.kinds <= 1, `${th}: every unaudited cell is hatched the same way (${bad.kinds} variants over ${bad.n} cells)`);
  }
  ok(errs.length === 0, "no page or console errors: " + errs.slice(0, 2).join(" | "));

  await b.close();
  console.log(fail ? "\n" + fail + " FAILED" : "\nthe lubrication tab reports the fleet, not the sample");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
