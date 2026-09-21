/* A MEASURED ROUND TYPE'S WORST RATING IS ITS WORST WEAR, NOT ITS WORST
   MANUAL GRADE — AND THE PAGE-ONE PROGRAMME TABLE NEVER ASKED.

   Read off a real round-scope report (CM_round_2026-09-21_2026-09-21.pdf):
   two Undercarriage rounds, DZ001 and EX006, both with carrier rollers at
   140-160% of condemn — CRITICAL on the cover's own per-unit tally
   (unitVerdictCounts, which the ROUND SUMMARY strip and the MACHINE BY
   MACHINE table both agree on, both in red) — while the page-one
   "Inspection programme" table's Undercarriage row printed WORST RATING
   "—" and MAIN ISSUE "—", as if nothing had been found. Two tables on one
   page, disagreeing about the same two rounds, and the reassuring one is
   the one printed first.

   Root cause: progRows() (report-core.js) read a point's grade with
   gnum(it.grade) alone. A measured station's grade lives in it.w.pct via
   GR.fromWorn() — roundRating() (the single-round rating bar) already
   carries this exact fallback, added for the identical reason its own
   comment states ("a controlling point past its limit rated nothing").
   progRows() was a second, never-patched copy of the same computation.

   The fix also carries the MAIN ISSUE column's own gap: a wear point has
   no free-text it.defect (the detail table's DEFECT column is empty for
   it — see DZ001's "Grouser height — Left" row) so even with the grade
   fixed, the issue text would stay blank for a whole class of rounds.
   it.defect || it.name || it.key is the same fallback the per-unit glance
   table already uses, so the worst finding can still be NAMED.

   Called through window.CMR.sections() directly, with items already
   shaped the way report-core.js itself reads them (it.w.pct) — the same
   isolation mpcard3.cjs/galshort.cjs use for report-core's own logic,
   bypassing the dashboard's wearOf()/normalise() reference-table lookup,
   which needs a registered model and reference limits report-core.js
   itself has no part in and this fix does not touch.

   Run: node tests/progwear.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d !== undefined ? "   " + d : "")); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  p.on("pageerror", e => fails.push("PAGEERROR " + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem("lang", "en"); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForFunction(() => window.CMR, { timeout: 20000 });

  const t = await p.evaluate(() => {
    /* DZ001-shaped: an Undercarriage round with every point measured, none
       carrying a manual grade — only w.pct, the way a real wear round
       reaches report-core.js after the dashboard's own wearOf() has run.
       The worst point (160%) is well past condemn. A second round type
       (MP, graded normally) is the control: the fix must not touch a type
       that already carries its own grade. */
    const recs = [
      { equip: "DZ001", clsLabel: "DOZ", model: "X", type: "UC", typeLabel: "Undercarriage",
        date: "2026-09-21", by: "Rayanov", smu: "28824", items: [
          { key: "CARRIER.L-OUT", name: "Carrier roller — Left · outer", w: { mm: 181, newMM: 220, condemnMM: 170, pct: 47 } },
          { key: "CARRIER.R-OUT", name: "Carrier roller — Right · outer", w: { mm: 156, newMM: 220, condemnMM: 150, pct: 160 } },
          { key: "GROUSER.L", name: "Grouser height — Left", w: { mm: 30, newMM: 60, condemnMM: 30, pct: 100 } },
        ] },
      { equip: "TK112", clsLabel: "HT", model: "X", type: "MP", typeLabel: "Magnetic Plug",
        date: "2026-09-21", by: "Nurbol", smu: "8047", items: [
          { key: "4", name: "Differential", grade: 1 },
        ] },
    ];
    const secs = window.CMR.sections({ lang: "en", bi: false, mode: "round", title: "x", titleAlt: "y", stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs });
    return secs.map(s => s.html || "").join("\n");
  });

  const div = t; // raw HTML — easier to pin the exact table row than flattened text
  const progRow = (div.match(/Undercarriage<[\s\S]{0,400}?<\/tr>/) || [""])[0];
  console.log("Undercarriage round, every point measured (w.pct), none manually graded");
  ok("the programme table is present", /Inspection programme/.test(div));
  ok("THE FIX: Undercarriage's worst rating is 5 — Critical, derived from its worst point's wear (160%)",
     /5\s*[–-]\s*Critical/.test(progRow),
     progRow.replace(/\s+/g, " ").slice(0, 200));
  ok("  the worst-rating cell is no longer a blank em-dash",
     !/<span class="muted">—<\/span>/.test(progRow.split("</td>")[2] || ""),
     (progRow.split("</td>")[2] || "").slice(0, 80));
  ok("  THE FIX: the main issue names the worst point itself (no free-text defect on a wear round)",
     /Carrier roller — Right · outer/.test(progRow),
     progRow.replace(/\s+/g, " ").slice(0, 260));

  console.log("\n(control: a manually-graded round type is unaffected)");
  const mpRow = (div.match(/Magnetic Plug<[\s\S]{0,300}?<\/tr>/) || [""])[0];
  ok("Magnetic Plug still reads its own direct grade, untouched by the wear fallback",
     /1\s*[–-]\s*Normal/.test(mpRow),
     mpRow.replace(/\s+/g, " ").slice(0, 200));

  ok("no page errors throughout", fails.filter(f => f.startsWith("PAGEERROR")).length === 0);
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(" | ") : "\nall passed");
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
