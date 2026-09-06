/* "TR60 is missing from the Lubrication tab."

   It was not missing. HT|NHL TR60 is in the reference with sixteen machines and
   ten compartments, and every one of them was on the sheet — a sheet the tab had
   filtered away before the engineer ever saw it. renderLubeTab opened with
   lubeShow = lubeBiggestClass(), and the biggest class on this site is GEN: 940
   of 1,128 machines, every light vehicle, genset, trailer and manlift. So the
   view a reliability engineer landed on was the one view with no mining
   equipment in it, and the haul trucks, dozers and excavators sat behind a chip
   nobody had been told to press.

   A filter the reader did not choose is a hidden state, and this one hid four
   fifths of the fleet. Three guards:
     1. the tab opens on every class, and the machine that was reported missing
        is on it;
     2. a narrowed sheet SAYS it is narrowed, in machines as well as models;
     3. the two populations the matrix can never draw — a machine whose model
        the reference has never heard of, and a reference that reaches no machine
        — are listed rather than left out. The import has always known about both
        and wrote them to a text file in the repository, which for an engineer at
        Baimskaya is the same as not writing them at all.

   Run: node tests/lubemtx.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

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
  await p.evaluate(k => lubeGo(k), 'matrix');
  await p.waitForTimeout(600);

  console.log("\n── the sheet the tab lands on");
  const land = await p.evaluate(() => ({
    show: lubeShow,
    rows: document.querySelectorAll("#lubeMtx tbody tr.clsrow").length,
    models: document.querySelectorAll("#lubeMtx tbody tr:not(.clsrow)").length,
    text: (document.getElementById("lubeMtx").textContent || ""),
  }));
  ok(land.show === "", "it opens on every class, not on one", JSON.stringify(land.show));
  ok(land.rows > 1, "more than one class heading is on the sheet", String(land.rows));

  /* The machine from the report, by name. Not "some HT model" — the one the
     engineer went looking for and could not find. */
  ok(/TR60/.test(land.text), "the model reported missing is on the sheet");
  const tr = await p.evaluate(() => {
    const r = LUBE.of("NHL TR60", "HT");
    return r ? { n: r.n, comps: r.comps.length } : null;
  });
  ok(tr && tr.n === 16 && tr.comps === 10,
     "and it was never missing from the data", JSON.stringify(tr));

  /* Discriminating: this must FAIL against the old default. GEN is the biggest
     class, so a sheet that opens filtered shows GEN and only GEN. */
  const gen = await p.evaluate(() => {
    const c = {};
    (window.ASSETS || []).forEach(a => { const r = LUBE.of(a.m || "", a.cls || "");
      if (r) c[r.cls] = (c[r.cls] || 0) + 1; });
    return Object.keys(c).sort((x, y) => c[y] - c[x])[0];
  });
  const classesShown = await p.evaluate(() =>
    [...document.querySelectorAll("#lubeMtx tbody tr.clsrow")].map(r => r.textContent.trim()));
  ok(classesShown.length > 1,
     `the sheet is not one class wide (biggest is ${gen})`, String(classesShown.length));

  console.log("\n── a narrowed sheet says so");
  /* Span by span. The two halves sit at opposite ends of a flex row, so reading
     the whole element's text runs "Machines 65" straight into "162 hidden" and
     yields a number that is on no screen anywhere. A guard that reads a lie is
     worse than no guard. */
  const spans = id => p.$$eval("#" + id + " > span",
    els => els.map(e => e.textContent.replace(/\s+/g, " ").trim()).filter(Boolean));
  const shownAll = await spans("lmShown");
  ok(shownAll.length === 1 && /\d/.test(shownAll[0]),
     "the shown line reports on load, with nothing hidden", JSON.stringify(shownAll));

  await p.evaluate((c) => { lubeShow = c; renderLubeTab(); }, gen);
  const narrowed = await spans("lmShown");
  ok(narrowed.length === 2, "narrowing adds the second half", JSON.stringify(narrowed));
  ok(narrowed[0] !== shownAll[0], "and the count changes with the filter", narrowed[0]);
  /* Machines, not just models. "23 of 63" and "65 machines" are different
     answers to "how much of the fleet am I looking at". */
  const nums = ((narrowed[0] || "").match(/\d+/g) || []).map(Number);
  ok(nums.length >= 3, "the line carries models AND machines", JSON.stringify(nums));
  ok(/\d/.test(narrowed[1] || ""), "and says how much is behind the filter", narrowed[1]);
  await p.evaluate(() => { lubeShow = ""; renderLubeTab(); });

  console.log("\n── what the matrix cannot draw is listed, not dropped");
  const gaps = await p.evaluate(() => {
    /* The "nothing to report" placeholder is the one row that spans the table;
       every other row is a real one. Filtering on .muted used to do this, and
       broke silently the day a column gained a muted dash for "no suggestion" —
       the guard then counted 4 of 162 while every other assertion still passed.
       A structural test, not a cosmetic one. */
    /* Both lists page at 25 now; this guard is about the WHOLE list, so
       ask each pager for all of it before counting. */
    /* There is no "show all" any more: walk the pages at a hundred a time and
       keep every row (a detached row still reads). */
    const rows = id => { const out = [];
      const sz = document.querySelector('[data-pg="' + id + ':size:100"]'); if (sz) sz.click();
      for (let g = 0; g < 40; g++) {
        out.push(...[...document.querySelectorAll("#" + id + " tbody tr")].filter(tr => !tr.querySelector("td[colspan]")));
        const nx = document.querySelector('[data-pg="' + id + ':next"]'); if (!nx || nx.disabled) break; nx.click();
      }
      const first = document.querySelector('[data-pg="' + id + ':size:25"]'); if (first) first.click();
      return out; };
    const noRef = rows("lgNoRef"), noMach = rows("lgNoMach");
    const unitsOf = trs => trs.reduce((a, tr) =>
      a + Number((tr.lastElementChild.textContent || "0").replace(/[^\d]/g, "") || 0), 0);
    /* The truth, computed here from the same two lists the panel draws from. */
    let missUnits = 0; const missModels = new Set();
    (window.ASSETS || []).forEach(a => {
      if (LUBE.of(a.m || "", a.cls || "")) return;
      missUnits++; missModels.add((a.cls || "") + "|" + (a.m || ""));
    });
    const dark = LUBE.models.filter(k => {
      const cls = k.slice(0, k.indexOf("|")), m = k.slice(cls.length + 1);
      const r = LUBE.of(m, cls); return !(r && r.n);
    });
    return { noRef: noRef.length, noMach: noMach.length, noRefUnits: unitsOf(noRef),
             missUnits, missModels: missModels.size, dark: dark.length,
             note: ((document.getElementById("lgNote") || {}).textContent || "").trim() };
  });
  ok(gaps.noRef === gaps.missModels,
     "every register model with no reference is listed",
     `${gaps.noRef} listed / ${gaps.missModels} real`);
  ok(gaps.noRefUnits === gaps.missUnits,
     "and the machine counts add up to the fleet's real gap",
     `${gaps.noRefUnits} / ${gaps.missUnits}`);
  ok(gaps.noMach === gaps.dark,
     "every reference that reaches no machine is listed",
     `${gaps.noMach} listed / ${gaps.dark} real`);
  ok(gaps.dark > 0 && gaps.missUnits > 0,
     "the guard is exercising a real gap, not an empty one",
     `${gaps.dark} dark refs, ${gaps.missUnits} uncovered machines`);
  ok(/\d/.test(gaps.note), "and a sentence says how big it is", gaps.note.slice(0, 120));

  console.log("\n── the gap list is a work list, not a complaint");
  /* Beside each uncovered machine, the reference we hold that resembles it —
     so 162 names become an afternoon for one person instead of a wall. It has
     to stay a QUESTION: the moment a resemblance reads as a decision, somebody
     puts a loader on a truck's compartments. */
  const sug = await p.evaluate(() => {
    const rows = (() => { const out = [];
      const sz = document.querySelector('[data-pg="lgNoRef:size:100"]'); if (sz) sz.click();
      for (let g = 0; g < 40; g++) {
        out.push(...[...document.querySelectorAll("#lgNoRef tbody tr")].filter(tr => !tr.querySelector("td[colspan]")));
        const nx = document.querySelector('[data-pg="lgNoRef:next"]'); if (!nx || nx.disabled) break; nx.click();
      }
      return out; })();
    const withOne = rows.filter(tr => tr.querySelector(".maybe"));
    return {
      rows: rows.length,
      offered: withOne.length,
      cells: rows[0] ? rows[0].children.length : 0,
      /* Every suggestion must name a reference that is genuinely unused —
         suggesting one already in service would be pointing at the wrong row. */
      allDark: withOne.every(tr => {
        const m = tr.querySelector(".maybe").textContent.trim();
        return LUBE.models.some(k => {
          const cls = k.slice(0, k.indexOf("|")), name = k.slice(cls.length + 1);
          const r = LUBE.of(name, cls);
          return name === m && !(r && r.n);
        });
      }),
      titled: withOne.every(tr => (tr.querySelector(".maybe").title || "").length > 20),
      /* Either kind of answer counts: a resemblance to confirm, or a reason it
         cannot be confirmed. What must never happen is the biggest fleet on the
         list carrying neither. */
      biggestDecided: rows.filter(tr => tr.querySelector(".maybe, .settled"))
        .map(tr => [tr.children[1].textContent.trim(),
          Number(tr.lastElementChild.textContent.replace(/[^0-9]/g, "") || 0)])
        .sort((a, b) => b[1] - a[1])[0] || null,
      /* The 70 Hilux are the case this exists for: the register cannot tell an
         automatic from a manual, so the panel must show the REASON and must not
         offer a reference to alias by eye. */
      hilux: (() => {
        const tr = rows.find(x => /HILUX/i.test(x.children[1].textContent));
        if (!tr) return null;
        return { settled: !!tr.querySelector(".settled"), maybe: !!tr.querySelector(".maybe"),
                 why: (tr.querySelector(".settled") || {}).title || "" };
      })(),
    };
  });
  ok(sug.cells === 4, "the table carries the suggestion column", String(sug.cells));
  ok(sug.offered > 0, "and offers at least one", `${sug.offered} of ${sug.rows}`);
  ok(sug.offered < sug.rows, "without pretending to answer them all",
     `${sug.offered} of ${sug.rows}`);
  ok(sug.allDark, "every suggestion names a reference nobody is using");
  ok(sug.titled, "and says on hover that it is a resemblance, not a decision");
  ok(sug.biggestDecided && sug.biggestDecided[1] >= 10,
     "the largest uncovered fleet carries an answer of some kind",
     JSON.stringify(sug.biggestDecided));
  ok(sug.hilux && sug.hilux.settled && !sug.hilux.maybe,
     "a question already settled shows its reason, not a resemblance",
     JSON.stringify(sug.hilux && { settled: sug.hilux.settled, maybe: sug.hilux.maybe }));
  ok(sug.hilux && /transmission/i.test(sug.hilux.why) && /register/i.test(sug.hilux.why),
     "and the reason says what would settle it", (sug.hilux && sug.hilux.why || "").slice(0, 90));

  /* The panel must not be a second, quieter copy of the coverage funnel. */
  const prog = await p.evaluate(() => lubeProgramme());
  ok(gaps.missUnits === prog.siteUnits - prog.covered,
     "the gap list and the coverage bar tell the same story",
     `${gaps.missUnits} vs ${prog.siteUnits - prog.covered}`);

  console.log("\n── both languages");
  await p.click('.lang button[data-lang="ru"]');
  await p.waitForTimeout(600);
  const ru = await p.evaluate(() => ({
    note: ((document.getElementById("lgNote") || {}).textContent || "").trim(),
    head: ((document.querySelector('[data-i18n="lg_title"]') || {}).textContent || "").trim(),
    shown: ((document.getElementById("lmShown") || {}).textContent || "").trim(),
  }));
  const cyr = /[А-Яа-я]/;
  ok(ru.note.length > 20 && cyr.test(ru.note), "the gap note is translated", ru.note.slice(0, 70));
  ok(cyr.test(ru.head), "so is its heading", ru.head);
  ok(cyr.test(ru.shown), "and the shown line", ru.shown);
  await p.click('.lang button[data-lang="en"]');
  await p.waitForTimeout(500);

  errs.forEach(e => ok(false, e));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
