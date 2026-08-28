/* THE NORMALIZER IS LOADED. THAT IS NOT THE SAME AS THE NORMALIZER RUNNING.

   The public dashboard served v165, loaded mobile/normalize.js, and still held
   TK115 and DZ007 back with the exact advice the audit had already shown to be
   wrong. A file being fetched proves nothing about whether the collection that
   Sync Operations reads ever passed through it.

   Two failures produced that, and this suite exists to keep both shut:

     1. HOUSEKEEPING READ AS CONTENT. The blank row is not empty in the JSON
        sense — it carries a temporary id, a sequence number, a timestamp, a
        sync flag. The first rule treated any unrecognised field as evidence, so
        every blank row looked real. Covered by emptypoint.cjs.

     2. THE WRONG COLLECTION. Bundled history, folder records and hand-imported
        files arrive by three different paths and are merged into one map. It is
        the MERGED set that every count reads, so it is the merged set that has
        to be normalised — not whichever source happened to be normalised on the
        way in.

   So this asks the running dashboard the only question that matters: after each
   ingestion path, does the collection Sync Operations actually reads still hold
   a false exception?

   Run: node tests/normwire.cjs [port]      (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* The production shape: real points plus one blank row carrying housekeeping. */
/* Exactly what recToExport emits for an untouched position, INCLUDING the two
   fields the phone writes from a default on every item. Those two are what kept
   TK115 and DZ007 on hold through v165 and v166 while a hand-written fixture
   passed locally. */
const BLANK = { key: "", label: "", grade: "", sev: "", sevIso: "", mm: "", unit: "",
  defect: "", defectCode: "", cause: "", causeCode: "", recommendation: "",
  prio: "", wo: "", comment: "", particle: "", comp: "", oil: "",
  tempC: "", ambC: "", tempMethod: "", photos: 0, video: 0,
  detection: "DM-02", detectionLabel: "Visual inspection",
  id: "tmp_8812", seq: 3, createdAt: "2026-08-05T04:11:02.881Z", src: "phone",
  syncState: "sent" };
const TK115 = { equip: "TK115", date: "2026-08-05", type: "TB", cls: "AT", by: "R. Marrero",
  items: [{ key: "FLOOR.1", label: "Floor plate 1", grade: "C", mm: 18, defect: "Cracking" },
          { key: "SIDE.L", label: "Left side sheet", grade: "B" },
          Object.assign({}, BLANK)] };
const DZ007 = { equip: "DZ007", date: "2026-08-02", type: "UC", cls: "DOZ", by: "B. Ivanov",
  items: [{ key: "ROLLER.L1", label: "Roller L1", mm: 213 },
          { key: "IDLER.L-OUT", label: "Idler L outer", mm: 29 },
          Object.assign({}, BLANK)] };
/* One genuine orphan, so proving the blank rows are gone cannot accidentally
   prove the correction workflow was switched off with them. */
const REAL = { equip: "EX099", date: "2026-08-06", type: "UC", cls: "EXC", by: "R. Marrero",
  items: [{ key: "ROLLER.R1", label: "Roller R1", mm: 220 },
          Object.assign({}, BLANK, { grade: "X", comment: "cracked, no idea which roller" })] };

const probe = async (p) => p.evaluate(() => {
  const rec = u => RECS.find(r => r.equip === u);
  const scan = syncScan();
  return {
    tk115: (rec("TK115") || {}).items ? rec("TK115").items.length : -1,
    dz007: (rec("DZ007") || {}).items ? rec("DZ007").items.length : -1,
    ex099: (rec("EX099") || {}).items ? rec("EX099").items.length : -1,
    /* the collection Sync Operations reads, not a parallel one */
    quar: scan.quar.map(q => q.r.equip + ":" + q.why.join("+")),
    removed: normStats.removed,
    unknown: (normStats.unknown || []).length,
    flagged: RECS.flatMap(r => (r.items || []).filter(i => i && i._needsPoint)
      .map(i => r.equip)),
  };
});

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => { fail++; console.log("  FAIL  PAGEERROR " + e.message); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForFunction(() => !!window.CMDash && typeof RECS !== "undefined", null, { timeout: 25000 });
  await p.waitForTimeout(300);

  ok(await p.evaluate(() => !!window.CMNorm), "the dashboard actually has the normalizer");

  console.log("\n  path 1 — a hand-imported file");
  await p.evaluate(r => CMDash.importRecords(r), [TK115, DZ007, REAL]);
  let s = await probe(p);
  ok(s.tk115 === 2, "TK115 keeps both real points", String(s.tk115));
  ok(s.dz007 === 2, "DZ007 keeps both real points", String(s.dz007));
  /* TWO, not three. EX099's keyless row carries a grade and a comment, so it is
     an orphan for a human to identify — it is not a blank row and must not be
     counted as one. Getting this number wrong in the suite would have hidden
     the very distinction the whole phase is about. */
  ok(s.removed === 2, "exactly the two blank rows were removed", s.removed + " removed");
  ok(!s.quar.some(q => /^TK115|^DZ007/.test(q)),
     "and neither shows a false exception", s.quar.join(", ") || "none");

  console.log("\n  the real orphan is untouched by all of this");
  ok(s.ex099 === 2, "EX099 keeps its finding", String(s.ex099));
  ok(s.flagged.includes("EX099"), "flagged for identification", s.flagged.join(","));
  ok(s.quar.some(q => q.startsWith("EX099")),
     "and it IS an exception, because a human must name that point", s.quar.join(", "));

  console.log("\n  path 2 — records arriving from the folder");
  /* The path the production records actually came in on. Normalising only the
     bundled history would leave this one untouched. */
  await p.evaluate(recs => { CMDash.setDriveRecords(recs, { replace: true }); },
    [Object.assign({}, TK115, { equip: "TK777", dev: "AAA" }),
     Object.assign({}, DZ007, { equip: "DZ777", dev: "AAA" })]);
  s = await probe(p);
  const drive = await p.evaluate(() => ({
    tk: (RECS.find(r => r.equip === "TK777") || {}).items.length,
    dz: (RECS.find(r => r.equip === "DZ777") || {}).items.length }));
  ok(drive.tk === 2 && drive.dz === 2,
     "folder records are normalised too", JSON.stringify(drive));
  ok(!s.quar.some(q => /^TK777|^DZ777/.test(q)),
     "no false exception from the folder path", s.quar.join(", ") || "none");

  console.log("\n  path 3 — a v163 cache reloaded by a v165 build");
  /* The migration case. A phone or desk that already held records from before
     the normalizer existed must not carry the fault across the upgrade. */
  const migrated = await p.evaluate(async recs => {
    localStorage.setItem("cm_dash_drive", JSON.stringify(recs));
    location.reload();
    return true;
  }, [Object.assign({}, TK115, { equip: "TK888", dev: "BBB" })]).catch(() => true);
  await p.waitForFunction(() => !!window.CMDash && typeof RECS !== "undefined", null, { timeout: 25000 });
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => {
    const r = RECS.find(x => x.equip === "TK888");
    return { present: !!r, items: r ? r.items.length : -1,
             quar: syncScan().quar.map(q => q.r.equip) };
  });
  if (after.present) {
    ok(after.items === 2, "a cached pre-normalizer record is repaired on load",
       String(after.items));
    ok(!after.quar.includes("TK888"), "and raises no false exception",
       after.quar.join(",") || "none");
  } else {
    /* The cache key is not what this suite assumed. Say so rather than passing:
       an unasked question is not an answered one. */
    ok(false, "the cached-record path could not be exercised — cache key unknown",
       "cm_dash_drive did not restore");
  }

  console.log("\n  the final-collection check, on the page's own functions");
  /* Not a unit test of the rule. This drives syncScan() — the exact function
     renderSync() calls — over the collection RECS, and asserts on the numbers
     the deployed page would print. Three builds passed a lower-level test and
     failed here, so this is the one that decides.

     The blank rows carry every field that was on the old wide operational list
     and is NOT a finding: a unit, a limit, a baseline, a reference source, an
     ISO code, a status, a particle count, a detection method. Any one of them
     kept a good inspection on hold. */
  const WIDE = { unit: "mm", limit: 30, baseline: 40, refSrc: "tray:HM400",
    status: "", iso: "", isoMode: "", particle: "", hours: 0, f: "",
    detection: "DM-02", detectionLabel: "Visual inspection",
    owner: "", due: "", stood: 0, reason: "", reasonLabel: "", reasonRu: "",
    newMM: "", condemnMM: "", wearPct: "", band: "", zone: "", zoneLabel: "" };
  const final = await p.evaluate(w => {
    const blank = Object.assign({ key: "", label: "", grade: "", sev: "", mm: "",
      defect: "", cause: "", recommendation: "", prio: "", wo: "", comment: "",
      photos: 0, video: 0, id: "tmp_1", seq: 9, createdAt: "2026-08-05T04:11:02Z" }, w);
    CMDash.importRecords([
      { equip: "TK115", date: "2026-08-05", type: "TB", cls: "AT", by: "R. Marrero",
        items: [{ key: "FLOOR.1", label: "Floor plate 1", grade: "C", mm: 18 },
                { key: "SIDE.L", label: "Left side sheet", grade: "B" },
                Object.assign({}, blank)] },
      { equip: "DZ007", date: "2026-08-02", type: "UC", cls: "DOZ", by: "B. Ivanov",
        items: [{ key: "ROLLER.L1", label: "Roller L1", mm: 213 },
                { key: "IDLER.L-OUT", label: "Idler L outer", mm: 29 },
                Object.assign({}, blank)] },
    ]);
    showTab("sync");
    const scan = syncScan();
    const hist = u => { const r = RECS.find(x => x.equip === u); return r ? r.items.length : -1; };
    return {
      hold: scan.quar.map(q => q.r.equip),
      holdCount: scan.quar.length,
      tk: hist("TK115"), dz: hist("DZ007"),
      removed: normStats.removed,
      diag: (document.getElementById("syDiag") || {}).textContent || "",
      table: (document.getElementById("syQuarTbl") || {}).textContent || "",
    };
  }, WIDE);

  ok(final.tk === 2, "TK115 remains in Equipment History with both real points", String(final.tk));
  ok(final.dz === 2, "DZ007 remains in Equipment History with both real points", String(final.dz));
  ok(!final.hold.includes("TK115"), "TK115 is absent from the hold list", final.hold.join(",") || "empty");
  ok(!final.hold.includes("DZ007"), "DZ007 is absent from the hold list", final.hold.join(",") || "empty");
  ok(final.removed >= 2, "two blank rows removed", String(final.removed));
  ok(/Removed \d+ completely empty/.test(final.diag),
     "Admin Diagnostics reports the cleanup", final.diag.slice(0, 80));
  /* The sentence that sends somebody to a truck. It was written for a case
     that no longer exists: an empty row is removed, so anything still on this
     page carries a real finding, and the answer to a real finding is to name
     its component — not to walk the machine again. Asserted across the whole
     table, including the genuine orphan, because it is wrong advice there too. */
  ok(!/re-walk|re-inspect|withdraw the inspection/i.test(final.table),
     "no re-walk instruction anywhere on the page",
     (final.table.match(/re-walk[^.]*/) || ["none"])[0]);
  ok(/needs identification|select the correct component/i.test(
       await p.evaluate(() => I18N.en.sy_fix_point)),
     "and the guidance says what to do instead",
     await p.evaluate(() => I18N.en.sy_fix_point));

  console.log("\n  and a populated keyless point is still held and actionable");
  const orphan = await p.evaluate(w => {
    const carrying = Object.assign({ key: "", label: "", grade: "X",
      comment: "cracked, could not tell which plate" }, w);
    CMDash.importRecords([{ equip: "TK999", date: "2026-08-07", type: "TB", cls: "AT",
      by: "R. Marrero", items: [{ key: "FLOOR.2", grade: "B" }, carrying] }]);
    showTab("sync");
    const scan = syncScan();
    return { hold: scan.quar.map(q => q.r.equip),
             items: (RECS.find(r => r.equip === "TK999") || {}).items.length,
             clickable: document.querySelectorAll("#syQuarTbl [data-quargo]").length };
  }, WIDE);
  ok(orphan.hold.includes("TK999"), "a real finding with no point is still held",
     orphan.hold.join(","));
  ok(orphan.items === 2, "and its finding is preserved, not deleted", String(orphan.items));
  ok(orphan.clickable >= 1, "with a row that opens the correction", String(orphan.clickable));

  console.log(fail ? "\nFAILED: " + fail : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + e.message); process.exit(1); });
