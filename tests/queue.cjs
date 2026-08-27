/* The register as a work queue, and the cross-filters that reach it.

   Every assertion here was a complaint before it was a rule. The register
   listed eighty-two findings and let you edit them one drawer at a time, so
   nobody assigned any; the machine row said what was wrong and nothing about
   who was fixing it; and the two axes a planning meeting actually argues along
   — whose work is this, and which month did it come from — were readable on
   the page and filterable nowhere.

   The one bug in here that would have shipped silently is the selection key.
   It was carried through a data attribute joined by a NUL, and HTML attribute
   parsing substitutes U+FFFD for a literal NUL — so the separator did not
   survive the DOM, the split found nothing, and every bulk edit was addressed
   to a record key one character short of a real one. Nothing threw. It simply
   patched nothing, which is this project's worst defect class wearing a
   different hat: a real action that does nothing.

   Run: node tests/queue.cjs [port]   (needs tests/ed-srv.cjs on 8093)
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

  /* Writes go to a stub, exactly as follow.cjs does it: what is under test is
     what the register ASKS for, not whether the network is up. */
  await p.evaluate(() => {
    window.__writes = [];
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
    showTab("actions"); actView = "table"; renderActions();
  });
  await p.waitForTimeout(400);

  console.log("\n── the row is editable where it is read");
  const shape = await p.evaluate(() => {
    const r = document.querySelector("#actionTbl tbody tr");
    return { rows: document.querySelectorAll("#actionTbl tbody tr").length,
             sel: !!r.querySelector(".selcol .asel"), head: !!document.getElementById("aAll"),
             own: !!r.querySelector(".iown"), due: !!r.querySelector(".idue"),
             st: !!r.querySelector(".ist"),
             names: document.querySelectorAll("#ownerNames option").length >= 0 };
  });
  ok(shape.rows > 0, "the register has rows to plan", shape.rows + " rows");
  ok(shape.sel && shape.head, "every row ticks, and so does the header");
  ok(shape.own && shape.due && shape.st, "owner, due date and status are fields, not read-outs");

  console.log("\n── one field, one write");
  await p.evaluate(() => { const s = document.querySelector("#actionTbl .ist");
    s.value = "WIP"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.waitForTimeout(800);
  const one = await p.evaluate(() => ({
    writes: window.__writes.length,
    wip: [...document.querySelectorAll("#actionTbl .ist")].filter(x => x.value === "WIP").length }));
  ok(one.writes === 1, "changing a status writes once", one.writes + " write(s)");
  ok(one.wip === 1, "and the row shows it without a reload", one.wip);

  console.log("\n── a week's planning is one gesture");
  await p.evaluate(() => { window.__writes = [];
    [...document.querySelectorAll("#actionTbl .asel")].slice(0, 5)
      .forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true })); }); });
  await p.waitForTimeout(300);
  const barUp = await p.evaluate(() => ({
    hidden: document.getElementById("selBar").hidden,
    cnt: (document.querySelector("#selBar .cnt") || {}).textContent || "",
    picked: document.querySelectorAll("tr.picked").length }));
  ok(!barUp.hidden, "ticking a row raises the bar");
  ok(/5/.test(barUp.cnt) && barUp.picked === 5, "which says how many, and the rows show it",
     barUp.cnt + " / " + barUp.picked + " marked");

  /* Nothing set must do nothing. An empty status is "leave it alone", not the
     first option in the list, which is a real state. */
  await p.click("#bkApply"); await p.waitForTimeout(300);
  const refused = await p.evaluate(() => ({ msg: $("bkMsg").textContent, writes: window.__writes.length }));
  ok(refused.writes === 0, "applying nothing writes nothing", refused.writes + " write(s)");
  ok(refused.msg.length > 10, "and says what to set first", refused.msg.slice(0, 44));

  await p.fill("#bkOwner", "Petrov");
  await p.fill("#bkDue", "2026-09-04");
  await p.click("#bkApply"); await p.waitForTimeout(1200);
  const bulk = await p.evaluate(() => ({
    writes: window.__writes.length,
    items: window.__writes.reduce((a, d) => a + Object.keys(d.items).length, 0),
    owns: [...document.querySelectorAll("#actionTbl .iown")].filter(x => x.value === "Petrov").length,
    dues: [...document.querySelectorAll("#actionTbl .idue")].filter(x => x.value === "2026-09-04").length,
    hidden: document.getElementById("selBar").hidden }));
  /* The proof the separator survives: five findings actually carry the owner.
     With the NUL key they carried nothing and nothing threw. */
  ok(bulk.owns === 5, "five findings get the owner", bulk.owns + " of 5");
  ok(bulk.dues === 5, "and the date", bulk.dues + " of 5");
  ok(bulk.writes < 5 && bulk.items === 5,
     "grouped by record, so it is fewer writes than findings",
     bulk.writes + " write(s) carrying " + bulk.items + " findings");
  ok(bulk.hidden, "and the selection clears when it is done");

  console.log("\n── the machine row carries the response, not only the finding");
  await p.evaluate(() => showTab("overview")); await p.waitForTimeout(500);
  const cols = await p.evaluate(() => [...document.querySelectorAll("#fleetTbl th")]
    .map(x => x.getAttribute("data-sort")));
  ["cls", "open", "owner", "due"].forEach(k =>
    ok(cols.includes(k), `the fleet table has a ${k} column`, cols.join(",")));

  console.log("\n── a cell that names a thing you can filter by IS that filter");
  const xf = await p.evaluate(() => {
    const c = document.querySelector("#fleetTbl [data-xcls]");
    if (!c) return { skip: true };
    const want = c.dataset.xcls; c.click();
    return { want, got: $("fClass").value,
             chips: [...document.querySelectorAll("#chips .chip")].map(x => x.textContent.trim()) };
  });
  if (!xf.skip) {
    ok(xf.got === xf.want, "pressing a class filters by it", xf.got);
    ok(xf.chips.some(c => c.includes(xf.want)), "and it appears as a removable chip", xf.chips.join(" / "));
  }
  const reset = await p.evaluate(() => {
    const before = $("fReset").disabled;
    $("fReset").click();
    return { before, after: $("fReset").disabled, cls: $("fClass").value };
  });
  ok(reset.before === false, "Reset is live while something is filtered");
  ok(reset.after === true && reset.cls === "", "and clears everything, then dims itself");

  console.log("\n── a chart you filter from stays whole");
  const trend = await p.evaluate(() => {
    /* Four months, so there is a trend to press. */
    const ms = ["2026-04-", "2026-05-", "2026-06-", "2026-07-"];
    RECS.forEach((r, ix) => { r.date = ms[ix % 4] + String(10 + (ix % 18)).padStart(2, "0"); });
    renderAll();
    const before = document.querySelectorAll("#trendChart .tmon").length;
    const rowsBefore = document.querySelectorAll("#fleetTbl tbody tr").length;
    document.querySelector("#trendChart .tmon").click();
    return { before, rowsBefore, after: document.querySelectorAll("#trendChart .tmon").length,
             on: document.querySelectorAll("#trendChart .tmon.on").length,
             month: drill.month, rowsAfter: document.querySelectorAll("#fleetTbl tbody tr").length };
  });
  ok(trend.before === 4, "the trend draws every month it has", trend.before + " months");
  ok(trend.month === "2026-04", "pressing one filters by it", trend.month);
  ok(trend.after === trend.before && trend.on === 1,
     "the chart keeps every month and marks the chosen one",
     trend.after + " months, " + trend.on + " marked");
  ok(trend.rowsAfter < trend.rowsBefore, "while the rest of the page narrows",
     trend.rowsBefore + " → " + trend.rowsAfter + " machines");

  console.log("\n── the machine opens where the reader is standing");
  await p.evaluate(() => { clearDrill(); });
  await p.waitForTimeout(400);
  await p.click("#fleetTbl tbody tr"); await p.waitForTimeout(400);
  const drw = await p.evaluate(() => ({
    open: !document.getElementById("drw").classList.contains("hidden"),
    title: document.getElementById("drwTitle").textContent.trim(),
    edit: document.getElementById("drwEdit").hidden,
    facts: [...document.querySelectorAll("#drwBody dl.kv dt")].length,
    doors: document.querySelectorAll("#drwBody .urow").length,
    tab: (document.querySelector("section:not(.hidden)") || {}).id }));
  ok(drw.open, "a machine row opens the drawer");
  ok(drw.tab === "tab-overview", "without leaving the page", drw.tab);
  ok(drw.title.length > 1, "titled with the unit", drw.title);
  ok(drw.facts >= 4, "carrying class, next round, visits and open work", drw.facts + " facts");
  ok(drw.doors > 0, "and every line in it is a door", drw.doors + " rows");
  ok(drw.edit, "the record-level Edit is not offered for a whole machine");

  const jump = await p.evaluate(() => { document.getElementById("uActs").click();
    return { tab: (document.querySelector("section:not(.hidden)") || {}).id, unit: drill.unit }; });
  ok(jump.tab === "tab-actions" && !!jump.unit,
     "and it can hand the machine to the register", jump.tab + " / " + jump.unit);

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
