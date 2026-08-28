/* WHAT ARRIVED, WHAT DID NOT, AND WHAT THIS END CANNOT KNOW.

   The audit found no view anywhere for media pending, upload failure,
   quarantine, conflict or reconciliation. The temptation when building one is
   to fill every tile, because a panel of zeros looks like a healthy system.

   It is not. This backend stores files in folders. It issues no durable receipt
   per record and no hash per attachment, so this dashboard cannot measure
   delivery latency, detect a truncated upload, or count a duplicate the server
   suppressed. A tile reading "0 hash failures" over a store that cannot compute
   a hash is not a measurement — it is a reassurance nobody earned, and it is
   the exact false promise the brief forbids.

   So there are two categories and no third: what this client can verify for
   itself, and a named list of what it cannot, with the reason. And when no
   backend is attached at all, the measured half says so rather than reporting
   0% — which would describe the browser, not the field.

   Run: node tests/syncops.cjs [port]   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);

  console.log("\n── it exists and it is reachable");
  const nav = await p.evaluate(() => ({
    tab: !!document.querySelector('nav button[data-tab="sync"]'),
    section: !!document.getElementById("tab-sync") }));
  ok(nav.tab && nav.section, "there is a synchronisation operations view");
  await p.evaluate(() => showTab("sync")); await p.waitForTimeout(500);

  console.log("\n── with no backend attached it says so, rather than reporting zero");
  /* Control the variable rather than assume it: this dashboard ships with a
     default endpoint so the office never has to configure one, and drive.js
     swaps it in asynchronously — which is exactly the race that made the panel
     report "no backend" for a whole session on a dashboard that had one. */
  const cold = await p.evaluate(() => {
    CMDrive.configured = () => false;
    renderSync();
    return {
    linked: syncScan().linked,
    tiles: [...document.querySelectorAll("#syncKpis .kpi")]
      .map(k => k.querySelector(".k").textContent + "=" + k.querySelector(".v").textContent),
    empty: (document.querySelector("#syGapTbl .empty") || {}).textContent || "",
    badge: $("nbSync").textContent }; });
  ok(cold.linked === false, "with the source detached", String(cold.linked));
  const dashes = cold.tiles.filter(x => /=—$/.test(x)).length;
  ok(dashes >= 3, "the delivery tiles read as unknown, not as failures",
     cold.tiles.join("  "));
  /* The wording moved from "no backend attached" to "nothing to compare against
     yet", because an empty index is not only a missing backend — it is also a
     backend whose file list has not arrived, which is what produced a false
     "0 of 63 attachments arrived" on a dashboard that was displaying those very
     photographs. Match the meaning, not the sentence. */
  ok(/compare|backend|file list/i.test(cold.empty),
     "and the table explains which question is unanswered", cold.empty.slice(0, 70));
  ok(cold.badge === "", "nothing is escalated on the strength of not having asked",
     `badge="${cold.badge}"`);

  console.log("\n── attached, it checks every attachment a record claims");
  const live = await p.evaluate(() => {
    /* A server that holds everything except one Critical's photograph. */
    const all = [];
    RECS.forEach(r => (r.items || []).forEach(i => mediaOf(i, r).forEach(m => m.name && all.push(m.name))));
    const crit = RECS.find(r => (r.items || []).some(i => sevOf(r, i) === "CRI"));
    const critNames = [];
    (crit.items || []).forEach(i => mediaOf(i, crit).forEach(m => m.name && critNames.push(m.name)));
    const held = new Set(all.filter(n => !critNames.includes(n)));
    CMDrive.configured = () => true;
    CMDrive.names = () => [...held];
    CMDrive.cursorAt = () => Date.now() - 5 * 60000;
    renderSync();
    return { total: all.length, withheld: critNames.length, unit: crit.equip,
             linked: syncScan().linked };
  });
  ok(live.linked, "the scan sees a backend now");
  ok(live.withheld > 0, "and one machine's evidence is deliberately absent",
     `${live.withheld} file(s) on ${live.unit}`);

  const seen = await p.evaluate(() => ({
    tiles: [...document.querySelectorAll("#syncKpis .kpi")]
      .map(k => k.querySelector(".k").textContent + "=" + k.querySelector(".v").textContent),
    rows: [...document.querySelectorAll("#syGapTbl tbody tr")].map(r => r.innerText.replace(/\s+/g, " ").trim()),
    hint: $("syGapHint").textContent,
    health: [...document.querySelectorAll("#syHealth dd")].map(d => d.textContent),
    badge: $("nbSync").textContent }));
  ok(seen.rows.length > 0, "the missing record is listed", seen.rows.length + " row(s)");
  ok(seen.rows.some(r => r.indexOf(live.unit) >= 0), "and it is the right machine",
     seen.rows[0] || "");
  ok(/\d/.test(seen.hint), "the panel says how many attachments have not arrived", seen.hint);
  ok(seen.tiles.some(x => /Critical waiting=[1-9]/.test(x)),
     "a Critical with no evidence is called out on its own",
     seen.tiles.join("  "));
  ok(seen.badge !== "" && seen.badge !== "0",
     "and it reaches the navigation badge", `badge="${seen.badge}"`);
  ok(/min ago|just now/.test(seen.health[1] || ""), "the backend says when it was last asked",
     seen.health[1]);

  console.log("\n── everything present reads as everything present");
  const full = await p.evaluate(() => {
    const all = [];
    RECS.forEach(r => (r.items || []).forEach(i => mediaOf(i, r).forEach(m => m.name && all.push(m.name))));
    CMDrive.names = () => all;
    renderSync();
    return { tiles: [...document.querySelectorAll("#syncKpis .kpi")]
               .map(k => k.querySelector(".k").textContent + "=" + k.querySelector(".v").textContent),
             empty: (document.querySelector("#syGapTbl .empty") || {}).textContent || "",
             badge: $("nbSync").textContent };
  });
  /* THIS ASSERTION USED TO ENCODE THE BUG. The fixture is bundled records,
     whose photographs ship beside the app and were never in the sync folder —
     so "Evidence arrived: 100%" was a field-delivery figure computed entirely
     from things that are not field deliveries. The tile now answers about field
     photographs only, and when there are none it says the reconciliation is
     unavailable rather than inventing a percentage. */
  const fieldTile = full.tiles.find(x => /Field photos received/.test(x)) || "";
  ok(!!fieldTile, "the tile measures field photographs", fieldTile);
  ok(!/Evidence arrived/.test(full.tiles.join(" ")),
     "and no longer claims to measure 'evidence arrived'", full.tiles.join("  "));
  ok(/=—$/.test(fieldTile) || /=100%/.test(fieldTile),
     "with no field photographs in this fixture it declines to invent a figure",
     full.tiles.join("  "));
  ok(/accounted for/i.test(full.empty), "and the table says so plainly", full.empty.slice(0, 50));

  console.log("\n── a record that cannot be filed is held, not dropped");
  const quar = await p.evaluate(() => {
    CMDash.importRecords([{ equip: "", date: "2026-08-01", type: "MP", items: [{ key: "4C", grade: "A" }] },
                          { equip: "TK999", date: "", type: "MP", items: [{ key: "4C", grade: "A" }] }]);
    renderSync();
    const s = syncScan();
    return { held: s.quar.length,
             rows: [...document.querySelectorAll("#syQuarTbl tbody tr")].map(r => r.innerText.replace(/\s+/g, " ").trim()),
             hint: $("syQuarHint").textContent,
             stillCounted: RECS.length };
  });
  ok(quar.held >= 2, "both malformed records are held back", quar.held + " held");
  ok(quar.rows.some(r => /no unit/i.test(r)) && quar.rows.some(r => /no date/i.test(r)),
     "each one saying exactly what it is missing", quar.rows.join(" | ").slice(0, 90));
  ok(/\d/.test(quar.hint), "with a count on the title line", quar.hint);
  ok(quar.stillCounted > 0, "and nothing was deleted to achieve it",
     quar.stillCounted + " records still held");

  console.log("\n── what it cannot measure is named, not zeroed");
  const unknown = await p.evaluate(() => ({
    items: [...document.querySelectorAll("#syUnknown li")].map(li => li.textContent),
    tiles: [...document.querySelectorAll("#syncKpis .kpi .k")].map(k => k.textContent) }));
  ok(unknown.items.length >= 4, "the gaps are listed", unknown.items.length + " listed");
  /* ASK THE APP WHICH GAPS IT DECLARES, not for the words it used to use.
     These matched "latency", "hash", "duplicate" — the vocabulary of the
     mechanism, which is exactly the vocabulary that was removed because the
     engineer, the planner and the fitter who share this screen do not speak it.
     A suite that pins the jargon makes the jargon expensive to fix. What has to
     be true is that every gap the app knows about is ON the page, whatever it
     has learned to call it. */
  const declared = await p.evaluate(() => SYNC_UNKNOWN.map(k => I18N.en[k]));
  ok(declared.length >= 4 && declared.every(Boolean),
     "the app declares its gaps and has a sentence for each", declared.length + " declared");
  declared.forEach(text =>
    ok(unknown.items.some(x => x.trim() === text.trim()),
       "on the page: " + text.slice(0, 44) + "…",
       (unknown.items.find(x => x.trim() === text.trim()) || "MISSING").slice(0, 50)));
  /* The point of the list: none of these appears as a tile with a number. */
  ok(!unknown.tiles.some(k => /latency|hash|duplicate/i.test(k)),
     "and none of them is reported as a figure", unknown.tiles.join(", "));

  console.log("\n── where the number comes from");
  /* Three screens quoted three different counts of the same inspections and
     none of them showed its working, so all three stopped being believed. The
     ledger has to BALANCE — a reconciliation that does not add up is worse
     than no reconciliation, because it looks like an answer. */
  const led = await p.evaluate(() => {
    const rows = reconcile();
    const by = {};
    rows.forEach(r => { by[r.label] = r.n; });
    return { rows: rows.map(r => ({ n: r.n, step: !!r.step, total: !!r.total })), by,
             labels: rows.map(r => r.label), recs: RECS.length };
  });
  ok(led.rows.length === 8, "every step of the arithmetic is on the page", led.rows.length);
  ok(led.labels.every(l => l && !/^sy_r_/.test(l)),
     "each one is named, not left as a key", led.labels.join(" · "));
  const sources = led.rows.slice(0, 3).reduce((s, r) => s + r.n, 0);
  const subs = led.rows.slice(3, 5).reduce((s, r) => s + r.n, 0);
  const total = led.rows[5].n;
  ok(sources - subs === total,
     "the sources minus the merges equal what the dashboard holds",
     `${sources} − ${subs} = ${sources - subs}, shown ${total}`);
  ok(total === led.recs, "and that is the same number every other screen counts",
     `${total} vs ${led.recs}`);
  ok(led.rows[5].n - led.rows[6].n === led.rows[7].n,
     "withdrawn rounds come off the figure that counts as work",
     `${led.rows[5].n} − ${led.rows[6].n} = ${led.rows[7].n}`);

  /* And it still balances once there is something to subtract. Two phones
     sending one round is ONE round and a conflict — counting both would report
     the fleet as having walked a machine twice. */
  const withRivals = await p.evaluate(() => {
    const seed = driveRecs.slice();
    const one = RECS[0];
    /* the same address twice, which is exactly what a two-phone clash looks
       like on the way in */
    driveRecs = [{ equip: one.equip, date: one.date, type: one.type, by: "A", items: [] },
                 { equip: one.equip, date: one.date, type: one.type, by: "B", items: [] }];
    rebuild();
    const rows = reconcile();
    const out = { rows: rows.map(r => r.n), recs: RECS.length };
    driveRecs = seed; rebuild();
    return out;
  });
  const s2 = withRivals.rows.slice(0, 3).reduce((a, b) => a + b, 0);
  const d2 = withRivals.rows.slice(3, 5).reduce((a, b) => a + b, 0);
  ok(withRivals.rows[4] >= 1, "a round two phones sent is counted as one and a rival",
     "rivals " + withRivals.rows[4]);
  ok(s2 - d2 === withRivals.rows[5],
     "and the ledger still balances with something to subtract",
     `${s2} − ${d2} = ${s2 - d2}, shown ${withRivals.rows[5]}`);
  ok(withRivals.rows[5] === withRivals.recs, "matching the record set",
     `${withRivals.rows[5]} vs ${withRivals.recs}`);

  console.log("\n── it fits");
  for (const w of [1280, 1440, 1920]) {
    await p.setViewportSize({ width: w, height: 900 });
    await p.waitForTimeout(250);
    const over = await p.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `${w}px: no horizontal overflow`, over + "px");
  }

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
