/* WHICH VERSION STANDS — AND WHAT CHOOSING IT WOULD CHANGE.

   Two phones walk one machine and both send the round. The script keeps both
   on purpose, the dashboard notices, and the panel asks the office to pick.
   What it gave them to pick with was a device number, an inspector's name and
   a count of positions:

       Device A9F2 · By R. Marrero · 12 position(s)     [ Use this one ]
       Device 4C71 · By B. Ivanov  · 11 position(s)     [ Use this one ]

   One of those has a finding the other does not, and the panel would not say
   which. That is a blind choice on the one screen in the product where
   choosing wrong loses an inspection for good.

   It was not withholding the comparison. groupRivals() reduced every losing
   version to {dev, by, n, date} and dropped its items, so by the time the
   panel rendered, the findings it would have needed no longer existed.

   Two rules this suite exists to hold:

     · Compare by WHAT A FINDING IS, never by position. Two inspectors walk a
       machine in whatever order they reach the points, so index 3 on one phone
       is not index 3 on the other, and a positional diff would report every
       point as changed on two identical rounds.
     · Blank, null and absent all mean "not recorded". Treating them as three
       answers reports a disagreement on every point neither phone filled in,
       which buries the one real difference in forty false ones.

   Run: node tests/cfdiff.cjs [port]    (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const BUNDLED = require("./bundled.cjs");
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => { fail++; console.log("  FAIL  PAGEERROR " + e.message); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  /* The sixteen bundled rounds, supplied explicitly. The dashboard no longer
     merges data/magnetic_plug.js into its records — that file was a second
     source for rounds the folder now holds — so this suite states the
     fixture it has always depended on. */
  await p.evaluate(BUNDLED + "()");
  await p.waitForFunction(() => !!window.CMDash && typeof RECS !== "undefined" && RECS.length > 0,
    null, { timeout: 25000 });
  await p.waitForTimeout(400);

  console.log("\n  the arithmetic of a disagreement");
  const d = await p.evaluate(() => {
    const A = [
      { key: "1A", grade: "C", sev: "DEG", comment: "fine fuzz" },
      { key: "2B", grade: "A" },
      { key: "3C", grade: "B", comment: "" },
      { key: "4D", grade: "X", prio: "P1" },
    ];
    /* Deliberately in a DIFFERENT ORDER, which is what two inspectors walking
       one machine actually produce. */
    const B = [
      { key: "3C", grade: "B", comment: null },
      { key: "1A", grade: "X", sev: "CRI", comment: "fine fuzz" },
      { key: "2B", grade: "A" },
      { key: "5E", grade: "B" },
    ];
    const r = cfDiff(A, B);
    return { same: r.same, any: r.any,
             onlyMine: r.onlyMine.map(x => x.key),
             onlyOther: r.onlyOther.map(x => x.key),
             differ: r.differ.map(x => ({ k: x.key, f: x.fields.map(y => y.f) })) };
  });
  ok(d.differ.length === 1 && d.differ[0].k === "1A",
    "the point the two phones graded differently is found", JSON.stringify(d.differ));
  ok(d.differ[0].f.indexOf("grade") >= 0 && d.differ[0].f.indexOf("sev") >= 0,
    "and both fields that differ are named", d.differ[0].f.join(","));
  ok(d.differ[0].f.indexOf("comment") < 0,
    "while the field they agree on is not", d.differ[0].f.join(","));
  ok(d.onlyMine.join() === "4D", "a finding only the standing version has", d.onlyMine.join());
  ok(d.onlyOther.join() === "5E", "and one only the other has", d.onlyOther.join());
  /* The order rule. 3C sits first in one list and third in the other; a
     positional compare would call it changed. */
  ok(d.same === 2, "points that match are counted as matching, whatever order they came in",
    d.same + " same");
  /* The blank rule: 3C is "" on one phone and null on the other. */
  ok(!d.differ.some(x => x.k === "3C"),
    "an empty comment and a missing one are not a disagreement", JSON.stringify(d.differ));

  console.log("\n  two identical rounds disagree about nothing");
  const none = await p.evaluate(() => {
    const A = [{ key: "1A", grade: "C" }, { key: "2B", grade: "A" }];
    const B = [{ key: "2B", grade: "A" }, { key: "1A", grade: "C" }];
    const r = cfDiff(A, B);
    return { any: r.any, html: cfDiffHTML(r, "AAA", "BBB") };
  });
  ok(none.any === 0, "nothing is reported", String(none.any));
  ok(/match/i.test(none.html), "and it says so rather than showing an empty table",
    none.html.replace(/<[^>]*>/g, "").trim().slice(0, 60));

  console.log("\n  the losing version's findings survive the grouping");
  /* The root cause. groupRivals() kept a summary and threw the items away, so
     the panel could not have shown a comparison however it was written. */
  const carried = await p.evaluate(() => {
    const base = { equip: "ZC001", date: "2026-08-11", type: "MP", cls: "HT" };
    driveRecs = [
      Object.assign({}, base, { dev: "AAA", by: "R. Marrero", rev: 1,
        items: [{ key: "1A", grade: "C", sev: "DEG" }, { key: "2B", grade: "A", sev: "NOF" }] }),
      /* The disagreement that matters: one phone called this plug Deteriorated
         and the other called it Critical. Whichever version stands decides
         whether a truck keeps working tonight. */
      Object.assign({}, base, { dev: "BBB", by: "B. Ivanov", rev: 1,
        items: [{ key: "1A", grade: "X", sev: "CRI" }] }),
    ];
    rebuild();
    const r = RECS.find(x => x.equip === "ZC001");
    return r ? { rivals: (r._rivals || []).length,
                 rivalItems: ((r._rivals || [])[0] || {}).items ? (r._rivals[0].items || []).length : -1,
                 mineItems: ((r._mine || {}).items || []).length,
                 conflict: !!r._conflict } : null;
  });
  ok(!!carried && carried.conflict, "the clash is still detected");
  ok(carried.rivals === 1, "the other phone's version is kept", String(carried && carried.rivals));
  ok(carried.rivalItems > 0, "with its findings, not just a count of them",
    String(carried && carried.rivalItems));
  ok(carried.mineItems > 0, "and so are the standing version's", String(carried && carried.mineItems));

  console.log("\n  and the panel shows it");
  const panel = await p.evaluate(() => {
    const r = RECS.find(x => x.equip === "ZC001");
    openEdit(ekOf(r));
    const box = document.getElementById("edCfList");
    return { html: box.innerHTML,
             text: box.textContent.replace(/\s+/g, " ").trim(),
             diffs: box.querySelectorAll(".cfdiff").length,
             buttons: box.querySelectorAll("[data-keep]").length };
  });
  ok(panel.buttons >= 2, "both versions are still offered", String(panel.buttons));
  ok(panel.diffs >= 1, "and one of them carries the comparison", String(panel.diffs));
  ok(/1A/.test(panel.text), "the point they disagree about is named on screen",
    panel.text.slice(0, 110));
  ok(/only on device/i.test(panel.text),
    "and a finding one phone has and the other does not is called that",
    panel.text.slice(0, 140));
  /* Codes are what the record stores; words are what the office reads. A panel
     that says CRI while every other screen says Critical is a second
     vocabulary for one fact. */
  ok(!/\bCRI\b/.test(panel.text) && /critical/i.test(panel.text),
    "severities are shown in words, the same words as everywhere else",
    (panel.text.match(/Severity[^·]*/) || [""])[0].slice(0, 60));

  console.log("\n  it says it in Russian too");
  const ru = await p.evaluate(() => {
    lang = "ru"; applyLang();
    const r = RECS.find(x => x.equip === "ZC001");
    openEdit(ekOf(r));
    const txt = document.getElementById("edCfList").textContent.replace(/\s+/g, " ").trim();
    lang = "en"; applyLang();
    return txt;
  });
  ok(/[Ѐ-ӿ]/.test(ru), "the comparison is translated, not left in English",
    ru.slice(0, 90));
  ok(!/cf_f_|cf_only|cf_diff_n/.test(ru), "and no key leaked through untranslated", ru.slice(0, 90));

  console.log(fail ? "\nFAILED: " + fail : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + e.message); process.exit(1); });
