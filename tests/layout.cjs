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

  console.log("\n── nothing meaningful is too small to read");
  /* 11px is the floor. The scale ran to 9.5 for KPI labels and filter labels,
     and table.grid th dressed every column heading at 8.5 — all of them words
     a person is meant to read. Decoration is exempt because it carries nothing:
     an arrow glyph, a swatch, an icon. */
  const tiny = [];
  for (const tab of TABS) {
    await p.evaluate(k => showTab(k), tab);
    await p.waitForTimeout(220);
    const found = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll("main *, header.app *, nav.tabs *").forEach(e => {
        const txt = [...e.childNodes].filter(n => n.nodeType === 3)
          .map(n => n.textContent.trim()).join("").trim();
        if (txt.length < 2) return;                       // a glyph is not a word
        if (e.offsetParent === null) return;              // not on screen
        const px = parseFloat(getComputedStyle(e).fontSize);
        if (px < 11) out.push(`${e.tagName}.${(typeof e.className === "string" ? e.className : "")
          .split(" ")[0]} ${px}px "${txt.slice(0, 18)}"`);
      });
      return [...new Set(out)];
    });
    found.forEach(f => tiny.push(tab + ": " + f));
  }
  ok(tiny.length === 0, "no readable text is under 11px", tiny.slice(0, 4).join(" | "));

  console.log("\n── the filter toolbar is one row, and the search fits");
  for (const w of [1280, 1366, 1920]) {
    await p.setViewportSize({ width: w, height: 800 });
    await p.waitForTimeout(250);
    const bar = await p.evaluate(() => {
      const q = document.getElementById("fQ");
      return { h: Math.round(document.querySelector(".controls").getBoundingClientRect().height),
               w: Math.round(q.getBoundingClientRect().width),
               clipped: q.scrollWidth > q.clientWidth + 1 };
    });
    ok(bar.h <= 70, `${w}px: the toolbar is one row`, bar.h + "px");
    ok(!bar.clipped && bar.w >= 260, `${w}px: the search field is not clipped`, bar.w + "px");
  }
  /* A query that is longer than the box must scroll the RESULTS, not the box. */
  await p.fill("#fQ", "TK146 ferrous debris heavy monitor");
  await p.waitForTimeout(700);
  const typed = await p.evaluate(() => {
    const q = document.getElementById("fQ");
    return { clipped: q.scrollWidth > q.clientWidth + 1,
             count: document.getElementById("fCount").textContent.trim(),
             clear: !!document.getElementById("chipClear") };
  });
  ok(!typed.clipped, "a long query is not clipped either");
  ok(/\d/.test(typed.count), "and the toolbar says how much survived", typed.count);
  ok(typed.clear, "with one control that clears everything");
  await p.evaluate(() => { const q = document.getElementById("fQ");
    q.value = ""; q.dispatchEvent(new Event("input")); });
  await p.waitForTimeout(500);

  console.log("\n── programme coverage is a scorecard, not a report");
  await p.evaluate(() => { showTab("lube"); lubeGo("cover"); });
  await p.waitForTimeout(600);
  const sc = await p.evaluate(() => {
    const sec = document.querySelector('#tab-lube .lsub[data-lsub="cover"] .section');
    const rows = [...document.querySelectorAll("#lubeProg tbody tr")];
    return { panel: Math.round(sec.getBoundingClientRect().height),
             rows: rows.length,
             rowH: rows.length ? Math.round(rows[0].getBoundingClientRect().height) : 0,
             cols: document.querySelectorAll("#lubeProg thead th").length,
             note: document.getElementById("lubeProgNote").textContent.trim(),
             facts: document.getElementById("lubeProgHd").textContent.replace(/\s+/g, " ").trim() };
  });
  ok(sc.rows === 7 && sc.cols === 5, "seven metrics, five columns",
     `${sc.rows} rows / ${sc.cols} cols`);
  ok(sc.rowH >= 30 && sc.rowH <= 44, "rows in the compact band", sc.rowH + "px");
  ok(sc.panel <= 400, "and the panel fits a screen", sc.panel + "px");
  ok(/\d/.test(sc.facts), "the denominators are on the title line", sc.facts.slice(0, 44));
  ok(sc.note.length > 20, "and one line says where the biggest gap is", sc.note.slice(0, 60));

  console.log("\n── the register opens as a work queue");
  await p.evaluate(() => { showTab("actions"); actView = "table"; renderActions(); });
  await p.waitForTimeout(600);
  /* Read the severity by its class, never by column index. This asked for
     children[0] and got the answer right until the register grew a select
     column in front of it — at which point it was reading an empty cell and
     reporting the queue unsorted. A column's position is a layout decision;
     what the cell IS is the contract. */
  const reg = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("#actionTbl tbody tr")];
    const none = rows.find(r => r.querySelector(".iown") && !r.querySelector(".iown").value);
    const ph = none ? none.querySelector(".iown") : null;
    return { sort: actSort.k, n: rows.length,
             firstSev: rows.length ? (rows[0].querySelector(".sevcell") || {}).textContent || "" : "",
             sel: rows.length ? !!rows[0].querySelector(".selcol .asel") : false,
             edits: rows.length ? ["iown", "idue", "ist"].filter(c => rows[0].querySelector("." + c)).length : 0,
             ownerInk: ph ? getComputedStyle(ph, "::placeholder").color : "",
             ownerText: ph ? ph.placeholder.trim() : "" };
  });
  ok(reg.sort === "queue", "sorted as a queue, not by one column", reg.sort);
  if (reg.n) ok(/crit/i.test(reg.firstSev.trim()), "critical work is at the top", reg.firstSev.trim());
  /* A register you can only read is a list. Owner, date and status are edited
     where they are read, and a tick-box column makes a week's planning one
     gesture instead of eighty-two. */
  if (reg.n) {
    ok(reg.sel, "every row can be selected");
    ok(reg.edits === 3, "owner, due date and status are editable in the row", reg.edits + " of 3");
  }
  /* An unassigned action has to say so in words, not only by being empty. */
  if (reg.ownerText) ok(reg.ownerText.length > 2, "an unassigned action says so in words", reg.ownerText);

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
