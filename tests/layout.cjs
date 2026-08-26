/* The redesign, as assertions.

   Every number in here was a measured defect before it was a rule. The
   dashboard opened with 138px of chrome above the first fact; the coverage
   table and the severity tile each had a horizontal slider inside their own
   card; four final drives rendered three-across with the fourth alone on a row
   of its own; the lubrication tab was 7,136px of seven subjects; and every
   panel carried two lines of prose explaining a table its reader had
   understood the first morning.

   A layout has no compiler. Without this file the next person to add a column
   or a paragraph gets all of it back, one card at a time, and nobody notices
   until somebody sends a screenshot.

   Run: node tests/layout.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const fs = require("fs"), path = require("path");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const TABS = ["overview","failure","wear","actions","due","equipment","lube","reports"];

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* Structural, not visual — read off the source, so it holds at every width and
   in both languages at once. A title followed by a paragraph is the pattern
   that made this an eleven-thousand-pixel report; methodology belongs behind a
   disclosure, and the disclosure is what this looks for. */
function proseUnderTitles() {
  const src = fs.readFileSync(path.join(__dirname, "..", "dashboard", "index.html"), "utf8");
  const re = /<h2[^>]*>[\s\S]*?<\/h2>\s*\n\s*<div class="sub" data-i18n="([a-z_0-9]+)">([\s\S]*?)<\/div>/g;
  const out = []; let m;
  while ((m = re.exec(src))) if (m[2].length > 120) out.push(`${m[1]} (${m[2].length} chars)`);
  return out;
}

(async () => {
  const b = await chromium.launch();

  console.log("\n── no page ever scrolls sideways");
  for (const [w, h] of [[1280,720],[1366,768],[1920,1080],[834,1112],[390,844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = [];
    p.on("pageerror", e => errs.push(e.message));
    p.on("console", m2 => { if (m2.type() === "error" && !/ERR_|Failed to load/.test(m2.text())) errs.push("C " + m2.text()); });
    await p.goto(URL, { waitUntil: "load" });
    await p.waitForTimeout(1800);
    const bad = [];
    for (const tab of TABS) {
      await p.evaluate(k => showTab(k), tab);
      await p.waitForTimeout(220);
      const over = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 0) bad.push(`${tab} +${over}px`);
    }
    ok(bad.length === 0, `${w}x${h}: no tab scrolls the page sideways`, bad.join(", "));
    ok(errs.length === 0, `${w}x${h}: and nothing throws`, errs.slice(0, 2).join(" | "));
    await p.close();
  }

  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(2200);

  console.log("\n── no card is a horizontal slider");
  /* A table container may overflow — an engineering table with fifteen columns
     genuinely cannot fit a phone, and the rule there is "scroll the TABLE, keep
     its first column, never the page". Anything else that overflows sideways is
     a card the reader has to drag, which is the thing being removed. */
  const sliders = [];
  for (const tab of TABS) {
    await p.evaluate(k => showTab(k), tab);
    await p.waitForTimeout(250);
    const found = await p.evaluate(() => [...document.querySelectorAll("main *")]
      .filter(e => e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0)
      /* A SLIDER is something the reader can drag. An element with
         overflow:hidden cannot be dragged — that is how the visually-hidden
         label works, one pixel wide with its text clipped — and one with
         overflow:visible paints outside its box without scrolling at all.
         Neither is the defect this is looking for, and counting them made the
         guard report the accessible name of the search field as a carousel. */
      .filter(e => /auto|scroll/.test(getComputedStyle(e).overflowX))
      .filter(e => !(typeof e.className === "string" && /tblwrap|scrollbox|subtabs/.test(e.className)))
      .map(e => (typeof e.className === "string" ? e.className : e.tagName) +
                " " + e.scrollWidth + ">" + e.clientWidth));
    found.forEach(f => sliders.push(tab + ": " + f));
  }
  ok(sliders.length === 0, "nothing but a table container overflows sideways", sliders.slice(0, 4).join(" | "));

  console.log("\n── the chrome does not own the screen");
  const chrome = await p.evaluate(() =>
    Math.round(document.querySelector("header.app").getBoundingClientRect().height) +
    Math.round(document.querySelector(".controls").getBoundingClientRect().height));
  ok(chrome <= 110, "header plus filter bar fits 110px", chrome + "px");
  const rail = await p.evaluate(() => Math.round(document.querySelector("nav.tabs").getBoundingClientRect().width));
  ok(rail <= 200, "the rail fits 200px", rail + "px");
  await p.click("#railTog"); await p.waitForTimeout(300);
  const shut = await p.evaluate(() => ({
    w: Math.round(document.querySelector("nav.tabs").getBoundingClientRect().width),
    titled: [...document.querySelectorAll("nav.tabs button[data-tab]")].every(x => (x.title || "").length > 1),
    counts: !!document.querySelector("nav.tabs .nb"),
  }));
  ok(shut.w <= 60, "it folds to an icon rail", shut.w + "px");
  ok(shut.titled, "and every icon still says what it opens");
  await p.click("#railTog"); await p.waitForTimeout(300);

  console.log("\n── the overview answers before it scrolls");
  await p.evaluate(() => showTab("overview")); await p.waitForTimeout(400);
  const fold = await p.evaluate(() => {
    const r = document.querySelector("#fleetTbl tbody tr");
    return { row: r ? Math.round(r.getBoundingClientRect().top) : null, h: innerHeight,
             kpis: Math.round(document.getElementById("kpis").getBoundingClientRect().height) };
  });
  ok(fold.kpis <= 120, "the KPI strip fits 120px", fold.kpis + "px");
  ok(fold.row !== null && fold.row < fold.h,
     "and the first row of the fleet table is in view", fold.row + " of " + fold.h);

  console.log("\n── four photographs, one row");
  await p.evaluate(() => showTab("equipment")); await p.waitForTimeout(600);
  ok(await p.evaluate(() => histView === "list"), "history opens on the list, not on photographs");
  const rowN = await p.evaluate(() => document.querySelectorAll("#history tr.hrow").length);
  if (rowN) {
    await p.click("#history tr.hrow"); await p.waitForTimeout(350);
    ok(await p.evaluate(() => !document.getElementById("drw").classList.contains("hidden")),
       "a row opens the detail drawer");
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    ok(await p.evaluate(() => document.getElementById("drw").classList.contains("hidden")),
       "and Escape closes it");
  } else ok(false, "the fixture has a history row to open");
  await p.evaluate(() => document.querySelector('#histView button[data-hv="photo"]').click());
  await p.waitForTimeout(500);
  for (const [w, want] of [[1920,4],[1366,4],[834,2],[390,1]]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.waitForTimeout(250);
    const cols = await p.evaluate(() => { const g = document.querySelector(".pos-grid");
      return g ? getComputedStyle(g).gridTemplateColumns.split(" ").filter(Boolean).length : 0; });
    ok(cols === want, `at ${w}px the photo grid is ${want} across`, String(cols));
  }
  await p.setViewportSize({ width: 1366, height: 768 }); await p.waitForTimeout(250);
  await p.evaluate(() => document.querySelector('#histView button[data-hv="list"]').click());

  console.log("\n── lubrication is seven views, not one page");
  await p.evaluate(() => showTab("lube")); await p.waitForTimeout(600);
  const lube = await p.evaluate(() => ({
    panels: document.querySelectorAll("#tab-lube .lsub").length,
    showing: [...document.querySelectorAll("#tab-lube .lsub")].filter(d => !d.classList.contains("hidden")).length,
    tabs: document.querySelectorAll("#lubeSub button").length,
    h: Math.round(document.getElementById("tab-lube").getBoundingClientRect().height),
  }));
  ok(lube.panels === 7 && lube.tabs === 7, "seven panels, seven tabs",
     `${lube.panels} / ${lube.tabs}`);
  ok(lube.showing === 1, "one of them on screen at a time", String(lube.showing));
  ok(lube.h < 2000, "so the tab is not a report", lube.h + "px");

  console.log("\n── methodology is available, not compulsory");
  const meth = await p.evaluate(() => {
    const d = [...document.querySelectorAll("details.method")];
    return { n: d.length, open: d.filter(x => x.open).length };
  });
  ok(meth.n >= 8, "every long explanation is behind a disclosure", meth.n + " of them");
  ok(meth.open === 0, "and none of them opens by default");
  const prose = proseUnderTitles();
  ok(prose.length === 0, "no title is followed by a paragraph", prose.join(" | "));

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
