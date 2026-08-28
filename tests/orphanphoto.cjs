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
  await p.waitForTimeout(300);
  await p.waitForTimeout(400);

  console.log("\n  EXPECTED IS NOT RECEIVED");
  /* The panel showed six checkboxes over six "file has not reached this
     dashboard" messages and let an engineer assign all six anyway. A photograph
     nobody can see cannot be filed against a component — looking at it is the
     whole point — and an assignment made blind is worse than none, because it
     looks finished. */
  const missing = await p.evaluate(() => {
    const row = [...document.querySelectorAll("#syQuarTbl [data-quargo]")]
      .find(r => /TK115/.test(r.textContent));
    row.click();
    return { cards: document.querySelectorAll("#opGrid .opc").length,
             boxes: [...document.querySelectorAll("#opGrid input")].map(x => x.disabled),
             states: [...new Set([...document.querySelectorAll("#opGrid .st")]
               .map(x => x.textContent))],
             tally: $("opCount").textContent,
             assign: $("opAssign").disabled, general: $("opGeneral").disabled,
             retry: !$("opRetry").classList.contains("hidden") };
  });
  ok(missing.cards === 6, "six placeholders are shown, one per expected photograph",
     String(missing.cards));
  ok(missing.boxes.length === 6 && missing.boxes.every(Boolean),
     "every checkbox is DISABLED, because none of the files is here",
     missing.boxes.join(","));
  ok(missing.states.length === 1 && /not received/i.test(missing.states[0]),
     "and each says the file was not received", missing.states.join(" | "));
  ok(missing.assign && missing.general,
     "Assign and Keep-as-general are both disabled — no blind classification");
  ok(missing.retry, "a way to re-check synchronisation is offered instead");
  ok(/6 expected/.test(missing.tally) && /0 received/.test(missing.tally)
     && /6 file\(s\) missing/.test(missing.tally),
     "the four numbers are separate and honest", missing.tally);
  /* And the row says which problem it is, so the right person picks it up. */
  const rowWhy = await p.evaluate(() => {
    $("opClose").click();
    return [...document.querySelectorAll("#syQuarTbl [data-quargo]")]
      .find(r => /TK115/.test(r.textContent)).textContent.replace(/\s+/g, " ");
  });
  ok(/evidence incomplete|file missing/i.test(rowWhy),
     "the row calls it incomplete evidence, not a missing inspection point",
     rowWhy.slice(40, 130));
  ok(!/needs an inspection point/i.test(rowWhy),
     "and does not send a reliability engineer to a sync problem");

  console.log("\n  the panel says which problem it is looking at");
  /* It said "6 photograph(s) here arrived without a component reference" over
     six cards each saying the file had NOT arrived — the panel contradicting
     itself twice on one screen. "Arrived" belongs to a file somebody can see. */
  const words = await p.evaluate(() => ({
    title: $("opTitle").textContent,
    lead: $("opLead").textContent,
    pointHidden: $("opPoint").closest(".field").classList.contains("hidden"),
    assignHidden: $("opAssign").classList.contains("hidden"),
    last: $("opLast").textContent }));
  ok(/missing photo files/i.test(words.title),
     "the title names the real problem", words.title);
  ok(!/arrived without/i.test(words.lead),
     "nothing claims these photographs arrived", words.lead.slice(0, 60));
  ok(/have not reached the dashboard/i.test(words.lead)
     && /remain available/i.test(words.lead),
     "it says the files are missing AND the inspection is still usable",
     words.lead.slice(0, 90));
  ok(words.pointHidden && words.assignHidden,
     "the assignment controls are out of the way, not merely disabled");
  ok(/last checked/i.test(words.last), "and the last check is shown", words.last);

  console.log("\n  four populations, not one number");
  /* "Evidence arrived: 0 of 63" counted photographs bundled with the app as
     missing field uploads. Their files live beside the app and were never in
     the sync folder. */
  const pop = await p.evaluate(() => {
    const P = mediaPopulations();
    const tile = [...document.querySelectorAll("#syncKpis .kpi")]
      .map(k => k.textContent.replace(/\s+/g, " ").trim())
      .find(x => /field photos/i.test(x)) || "";
    return { P, tile, block: $("syPop").textContent.replace(/\s+/g, " ") };
  });
  ok(pop.P.historical > 0,
     "the bundled photographs are counted as their own population",
     String(pop.P.historical));
  /* Ten: TK115's six and DZ007's four. Both fixtures are loaded by now, and
     the point is that NONE of the bundled photographs joins them. */
  ok(pop.P.mobExpected === 10 && pop.P.mobReceived === 0 && pop.P.mobMissing === 10,
     "field photographs are counted separately from them",
     `${pop.P.mobExpected} expected / ${pop.P.mobReceived} received / ${pop.P.mobMissing} missing`);
  ok(pop.P.historical !== pop.P.mobExpected,
     "the two populations are genuinely different numbers",
     `${pop.P.historical} bundled vs ${pop.P.mobExpected} field`);
  ok(!/evidence arrived/i.test(pop.tile), "the tile no longer says 'Evidence arrived'", pop.tile);
  ok(/field photos received/i.test(pop.tile), "it says what it measures", pop.tile);
  /* And it refuses a percentage it cannot honestly compute. */
  ok(!/\b0 of 6[0-9]\b/.test(pop.tile),
     "and never reports the bundled history as missing uploads", pop.tile);
  ok(/expected/i.test(pop.block) && /bundled/i.test(pop.block),
     "the four numbers are on the page", pop.block.slice(0, 90));

  console.log("\n  the workload is counted in photographs, not records");
  const hint = await p.evaluate(() => $("syQuarHint").textContent);
  /* Never "10 need assignment" while ten files have not arrived — that is a
     workload nobody can start. Missing is counted as missing. */
  ok(/10\b/.test(hint) && /missing/i.test(hint),
     "ten photo FILES are reported missing, not ten assignments waiting", hint);
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

  console.log("\n  when the files arrive, the placeholders become photographs");
  /* A REAL IMAGE, not a numeric placeholder. The audit was right that assignment
     had never been proven against a file anybody could see — every earlier test
     drove counts. This lands actual bytes through the same door drive.js uses,
     which is what turns "expected" into "viewable". */
  const PX = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  const arrived = await p.evaluate(px => {
    /* Six files, named the way the folder names this record's photographs. */
    const rec = RECS.find(r => r.equip === "TK115");
    const base = CMDash.photoBase(rec.items.find(i => i._needsPoint), rec);
    for (let n = 1; n <= 6; n++) CMDash.addPhoto(base + "_" + n + ".jpg", px);
    rebuild(); renderSync();
    const row = [...document.querySelectorAll("#syQuarTbl [data-quargo]")]
      .find(r => /TK115/.test(r.textContent));
    if (row) row.click();
    return { imgs: document.querySelectorAll("#opGrid img.th").length,
             boxes: [...document.querySelectorAll("#opGrid input")].map(x => x.disabled),
             tally: $("opCount").textContent };
  }, PX);
  if (arrived.imgs === 6) {
    ok(true, "six thumbnails render once the files are here", String(arrived.imgs));
    ok(arrived.boxes.every(x => !x), "and every checkbox is now enabled",
       arrived.boxes.join(","));
    ok(/6 received/.test(arrived.tally), "the tally moves from missing to received",
       arrived.tally);
  } else {
    /* The folder names photographs from the point key, and this point has none —
       so the dashboard cannot match a file to it by name. Say so plainly rather
       than passing: it is the next thing to fix, and it is Phase 2's stable
       attachment id. */
    ok(false, "six thumbnails render once the files are here",
       arrived.imgs + " rendered — a keyless point has no name to match files by; "
       + "needs the stable attachment id from the mobile manifest");
  }

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
    const q = syncScan().quar.find(x => x.r.equip === "TK115");
    const tl = photoTally(rec);
    return { left: unresolvedPhotos(rec).length,
             photos: orphanPhotos(rec).length,
             heldForAssignment: tl.needs > 0,
             why: q ? (tl.missing + " file(s) missing") : "" };
  });
  if (persisted.gone) {
    ok(false, "TK115 survived the reload", "record not present — imports are not persisted here");
  } else {
    ok(persisted.left === 0, "no photograph is waiting on a human again",
       String(persisted.left));
    ok(persisted.photos === 6, "every photograph is still accounted for",
       String(persisted.photos));
    /* The record MAY still be listed after a reload, and correctly so: the
       thumbnails were landed into this page's media index, which a reload
       clears, so the six files are "missing" again. That is a sync problem, not
       an unfinished correction — and the distinction is the whole point of this
       build, so the test asserts WHICH reason rather than that there is none. */
    ok(!persisted.heldForAssignment,
       "and if it is listed, it is for missing files — not for an assignment "
       + "somebody already made", persisted.why || "not listed");
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
