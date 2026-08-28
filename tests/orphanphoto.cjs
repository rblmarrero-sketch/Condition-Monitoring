/* TEN PHOTOGRAPHS THAT NOBODY CAN FILE.

   TK115 carries six and DZ007 four, all attached to a position that never got
   a key. They are real field evidence: nothing about them is wrong except that
   nobody can say which component they show. Three earlier builds tried to make
   this problem disappear by deleting the row — which would have destroyed ten
   photographs to silence a warning.

   The right answer is a human decision, made once, on a screen built for it.
   What this suite holds:

     · nothing is guessed and nothing is deleted
     · a photograph is either given a point or called general evidence
     · the hold clears when the LAST one is resolved, not the first
     · a partly-finished job keeps exactly the unfinished photographs flagged
     · the decision survives a reload and a re-read of the folder

   Run: node tests/orphanphoto.cjs [port]     (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require("./pw.cjs"));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log("  FAIL  " + w + (d !== undefined ? "   " + d : "")); }
                          else console.log("  PASS  " + w + (d !== undefined ? "   " + d : "")); return c; };

/* The deployed shapes: real photo counts on a keyless position. */
const RECS = [
  { equip: "TK115", date: "2026-08-05", type: "TB", cls: "AT", by: "R. Marrero",
    items: [{ key: "FLOOR.1", label: "Floor plate 1", grade: "C", mm: 18 },
            { key: "SIDE.L", label: "Left side sheet", grade: "B" },
            { key: "", label: "", photos: 6, detection: "DM-02", seq: 3 }] },
  { equip: "DZ007", date: "2026-08-02", type: "UC", cls: "DOZ", by: "B. Ivanov",
    items: [{ key: "ROLLER.L1", label: "Roller L1", mm: 213 },
            { key: "", label: "", photos: 4, detection: "DM-02", seq: 4 }] },
];

const setup = async p => p.evaluate(recs => {
  CMDrive.configured = () => true;
  window.__saved = [];
  CMDrive.saveEdit = d => { window.__saved.push(d); return Promise.resolve({ ok: true }); };
  localStorage.setItem("cm_dash_who", "R. Marrero");
  CMDash.importRecords(recs);
  showTab("sync");
  return true;
}, recs => recs);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => { fail++; console.log("  FAIL  PAGEERROR " + e.message); });
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForFunction(() => typeof RECS !== "undefined", null, { timeout: 25000 });
  await p.evaluate(recs => {
    CMDrive.configured = () => true;
    window.__saved = [];
    CMDrive.saveEdit = d => { window.__saved.push(d); return Promise.resolve({ ok: true }); };
    localStorage.setItem("cm_dash_who", "R. Marrero");
    CMDash.importRecords(recs);
    showTab("sync");
  }, RECS);
  await p.waitForTimeout(400);

  console.log("\n  the workload is counted in photographs, not records");
  const hint = await p.evaluate(() => $("syQuarHint").textContent);
  ok(/10\b/.test(hint), "ten photographs need assignment", hint);
  ok(!/held back/i.test(await p.evaluate(() => document.body.innerText)),
     "and the words 'held back' appear nowhere on the page");

  console.log("\n  TK115 opens a focused panel, not the whole inspection form");
  const open = await p.evaluate(() => {
    const row = [...document.querySelectorAll("#syQuarTbl [data-quargo]")]
      .find(r => /TK115/.test(r.textContent));
    row.click();
    return { panel: !$("opOv").classList.contains("hidden"),
             bigForm: !$("editOv").classList.contains("hidden"),
             cards: document.querySelectorAll("#opGrid .opc").length,
             sub: $("opSub").textContent };
  });
  ok(open.panel, "the photo panel opens");
  ok(!open.bigForm, "and the full correction form does not");
  ok(open.cards === 6, "six orphan photographs are shown", String(open.cards));
  ok(/TK115/.test(open.sub) && /2026-08-05/.test(open.sub),
     "with the unit, date and round named", open.sub);

  console.log("\n  the point list is this round's, and nothing is preselected");
  const pts = await p.evaluate(() => ({
    opts: [...$("opPoint").options].map(o => o.value).filter(Boolean),
    chosen: $("opPoint").value }));
  ok(pts.opts.includes("FLOOR.1") && pts.opts.includes("SIDE.L"),
     "the points this inspection walked are offered", pts.opts.join(","));
  ok(pts.chosen === "", "and nothing is chosen for the engineer", pts.chosen || "(none)");

  console.log("\n  assigning some, not all, leaves the rest flagged");
  const partial = await p.evaluate(() => {
    const cards = [...document.querySelectorAll("#opGrid .opc")];
    cards.slice(0, 4).forEach(c => c.click());          // four of six
    $("opPoint").value = "FLOOR.1";
    $("opAssign").click();
    return true;
  });
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => {
    const rec = RECS.find(r => r.equip === "TK115");
    return { left: unresolvedPhotos(rec).length,
             done: orphanPhotos(rec).filter(x => x.a).length,
             stillHeld: syncScan().quar.some(q => q.r.equip === "TK115"),
             saved: (window.__saved || []).length };
  });
  ok(after.done === 4, "four are assigned", String(after.done));
  ok(after.left === 2, "two still need a point", String(after.left));
  ok(after.stillHeld, "so TK115 is still on the correction list");
  ok(after.saved >= 1, "and the decision went to the sidecar", String(after.saved));

  console.log("\n  the last two become general evidence, and the hold clears");
  const cleared = await p.evaluate(() => {
    const cards = [...document.querySelectorAll("#opGrid .opc")];
    cards.forEach(c => { if (/needs a point/i.test(c.textContent)) c.click(); });
    $("opGeneral").click();
    return true;
  });
  await p.waitForTimeout(300);
  const done = await p.evaluate(() => {
    const rec = RECS.find(r => r.equip === "TK115");
    renderSync();
    return { left: unresolvedPhotos(rec).length,
             held: syncScan().quar.some(q => q.r.equip === "TK115"),
             photos: orphanPhotos(rec).length,
             items: rec.items.length,
             hint: $("syQuarHint").textContent };
  });
  ok(done.left === 0, "nothing is unresolved", String(done.left));
  ok(!done.held, "TK115 has left the correction list");
  /* THE THING THAT MUST NEVER HAPPEN. */
  ok(done.photos === 6, "and all six photographs still exist", String(done.photos));
  ok(done.items === 3, "with the record's points intact", String(done.items));
  ok(/4\b/.test(done.hint), "only DZ007's four remain to do", done.hint);

  console.log("\n  the correction survives a reload");
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => typeof RECS !== "undefined", null, { timeout: 25000 });
  await p.waitForTimeout(400);
  const persisted = await p.evaluate(() => {
    const rec = RECS.find(r => r.equip === "TK115");
    if (!rec) return { gone: true };
    return { left: unresolvedPhotos(rec).length,
             held: syncScan().quar.some(q => q.r.equip === "TK115"),
             photos: orphanPhotos(rec).length };
  });
  if (persisted.gone) {
    ok(false, "TK115 survived the reload", "record not present — imports are not persisted here");
  } else {
    ok(persisted.left === 0, "the assignments are still there", String(persisted.left));
    ok(!persisted.held, "and the record has not come back onto the list");
    ok(persisted.photos === 6, "with every photograph intact", String(persisted.photos));
  }

  console.log("\n  nothing was deleted, and the audit trail names who and when");
  const audit = await p.evaluate(() => {
    const rk = Object.keys(edits)[0];
    const a = (edits[rk] || {}).assign || {};
    const one = a[Object.keys(a)[0]] || {};
    return { n: Object.keys(a).length, by: one.by || "", at: one.at || "",
             kinds: [...new Set(Object.values(a).map(x => x.general ? "general" : "point"))] };
  });
  ok(audit.n === 6, "all six decisions are recorded", String(audit.n));
  ok(!!audit.by && !!audit.at, "with the engineer and the time",
     audit.by + " " + audit.at.slice(0, 16));
  ok(audit.kinds.includes("point") && audit.kinds.includes("general"),
     "both kinds of decision are represented", audit.kinds.join(","));

  console.log(fail ? "\nFAILED: " + fail : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + e.message); process.exit(1); });
