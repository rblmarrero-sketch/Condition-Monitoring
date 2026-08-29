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
const BUNDLED = require("./bundled.cjs");
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
  /* The sixteen bundled rounds, supplied explicitly. The dashboard no longer
     merges data/magnetic_plug.js into its records — that file was a second
     source for rounds the folder now holds — so this suite states the
     fixture it has always depended on. */
  await p.evaluate(BUNDLED + "()");
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

  console.log("\n  a keyless point's files cannot be found by name — so they are found by hand");
  /* A REAL IMAGE, not a numeric placeholder. The audit was right that
     assignment had never been proven against a file anybody could see — every
     earlier test drove counts. This lands actual bytes through the same door
     drive.js uses, which is what turns "expected" into "viewable".

     But it cannot land them under a PREDICTED name any more, and that is the
     point. The folder names a photograph from its inspection point; this point
     has none, so there is no name to predict. This block used to add six files
     under CMDash.photoBase(...) — which, for a keyless point, was the string
     "TK115.undefined_05.08.2026_TB". The suite matched an invented name against
     itself and passed. photoBase() now returns nothing for a keyless point,
     because nothing is the honest answer.

     So the route is the one a person actually has: the files are in the folder
     under whatever the phone called them, the engineer searches for them, looks
     at one, and says where it belongs. */
  const PX = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  /* AN EMPTY KEY IS NOT A MISSING ONE, and the folder settles it.

     photoBase() built the name with String(it.key), which on an undefined key
     is the literal text "undefined" — "TK115.undefined_05.08.2026_TB". This
     block first asserted the opposite fix: that a keyless point has no
     predictable name at all. It was wrong, and the live folder said so —

         TB/TK115/2026-08-05/TK115._05.08.2026_TB_1.jpg

     unit, dot, nothing, date, round. The phone builds the same name with an
     empty segment, so these six were predictable the whole time. Ten
     photographs were called unmatchable for a month because one undefined was
     rendered as four letters instead of none. */
  const noname = await p.evaluate(() => {
    const rec = RECS.find(r => r.equip === "TK115");
    const it = rec.items.find(i => i._needsPoint);
    return { base: CMDash.photoBase(it, rec), bases: photoBases(it, rec).length,
             expected: expectedNames(it, rec, 6) };
  });
  ok(/^TK115\._/.test(noname.base || ""),
     "a keyless point's name is the unit, a dot, and nothing", noname.base);
  ok(!/undefined/.test(noname.base || ""), "never the word undefined", noname.base);
  ok(noname.expected.length === 6 && noname.expected.every(n => /^TK115\._/.test(n)),
     "and the files it is waiting for are named, all six",
     noname.expected.slice(0, 2).join(" "));

  /* The six files, in the folder, under the names the phone really wrote. */
  const FOUND = ["TK115_TRAY.L_05.08.2026_TB_1.jpg", "TK115_TRAY.L_05.08.2026_TB_2.jpg",
                 "TK115_TRAY.L_05.08.2026_TB_3.jpg", "TK115_TRAY.L_05.08.2026_TB_4.jpg",
                 "TK115_TRAY.L_05.08.2026_TB_5.jpg", "TK115_TRAY.L_05.08.2026_TB_6.jpg"];
  const found = await p.evaluate(a => {
    const [px, names] = a;
    CMDrive.names = () => names;
    CMDrive.hasName = n => names.indexOf(n) >= 0;
    CMDrive.fetchByName = n => { CMDash.addPhoto(n, px); return Promise.resolve(px); };
    $("opFindQ").value = "TK115 05.08";
    $("opFindGo").click();
    return { rows: document.querySelectorAll("#opFindOut li").length,
             takeDisabled: [...document.querySelectorAll("#opFindOut [data-take]")].map(b => b.disabled) };
  }, [PX, FOUND]);
  ok(found.rows === 6, "searching the folder finds all six", found.rows + " row(s)");
  ok(found.takeDisabled.every(Boolean),
     "and none of them can be filed before somebody has looked at it",
     found.takeDisabled.join(","));

  const looked = await p.evaluate(async () => {
    const btn = document.querySelector("#opFindOut [data-look]");
    btn.click();
    await new Promise(r => setTimeout(r, 200));
    const li = document.querySelector("#opFindOut li");
    return { img: !!li.querySelector("img.th"),
             take: !!li.querySelector("[data-take]") && !li.querySelector("[data-take]").disabled };
  });
  ok(looked.img, "looking at one puts the photograph on screen");
  ok(looked.take, "and only then can it be filed");

  const filed = await p.evaluate(n => {
    const before = window.__saved.length;
    $("opPoint").value = [...$("opPoint").options].map(o => o.value).filter(Boolean)[0] || "";
    document.querySelector("#opFindOut [data-take]").click();
    return { pt: $("opPoint").value, wrote: window.__saved.length - before };
  }, FOUND[0]);
  await p.waitForTimeout(300);
  const rec2 = await p.evaluate(n => {
    const doc = window.__saved[window.__saved.length - 1] || {};
    const asg = doc[Object.keys(doc).find(k => /assign|photo/i.test(k)) || ""] || {};
    return { entry: asg[n] || null };
  }, FOUND[0]);
  ok(!!rec2.entry, "filing it writes one correction", JSON.stringify(rec2.entry));
  ok(!!(rec2.entry && rec2.entry.point === filed.pt),
     "against the point the engineer chose", `${(rec2.entry||{}).point} vs ${filed.pt}`);
  ok(!!(rec2.entry && rec2.entry.found),
     "marked as a file found in the folder rather than one the round named");
  ok(!!(rec2.entry && rec2.entry.by && rec2.entry.at),
     "with who filed it and when", `${(rec2.entry||{}).by} ${(rec2.entry||{}).at}`);

  /* AND THEN IT IS ACTUALLY THERE. A correction nothing reads is a real action
     rendered as nothing, which is the failure this whole project keeps
     producing — so the check is not that the write happened but that the
     photograph is now on the point, in the record, where a report would find
     it. */
  const landed = await p.evaluate(a => {
    const [n, pt] = a;
    const rec = RECS.find(r => r.equip === "TK115");
    const it = (rec.items || []).find(i => i && i.key === pt);
    const m = it ? mediaOf(it, rec).find(x => x.name === n) : null;
    return { onPoint: !!m, hasBytes: !!(m && m.src), found: !!(m && m.found) };
  }, [FOUND[0], filed.pt]);
  ok(landed.onPoint, "and the photograph is now ON that point", JSON.stringify(landed));
  ok(landed.hasBytes, "with the picture, not just its name");

  console.log("\n  the point list is this round's, and the choice is the engineer's");
  const pts = await p.evaluate(() => ({
    opts: [...$("opPoint").options].map(o => o.value).filter(Boolean),
    chosen: $("opPoint").value }));
  ok(pts.opts.includes("FLOOR.1") && pts.opts.includes("SIDE.L"),
     "the points this inspection walked are offered", pts.opts.join(","));
  /* Deliberately not "nothing is chosen" any more: the block above set a point
     on purpose before filing a found photograph against it, and asserting the
     selector is still blank would be asserting that the previous action did not
     happen. What matters is that the app never picks one BY ITSELF. */
  ok(!/^\s*$/.test(pts.opts.join("")), "and the engineer picks from them");

  console.log("\n  filing the rest, and the hold clears");
  /* Four to a point and two as general evidence — through the folder route,
     because a keyless point's photographs are only reachable that way until
     every file carries a stable attachment id. */
  const rest = await p.evaluate(async a2 => {
    const [names, pt] = a2;
    for (let i = 1; i < names.length; i++) {
      const n = names[i];
      await CMDrive.fetchByName(n);
      const patch = {};
      patch[n] = i < 4 ? { point: pt, found: 1 } : { general: 1, found: 1 };
      saveAssign(patch, null, { allowFound: true });
      await new Promise(r => setTimeout(r, 60));
    }
    return true;
  }, [FOUND, filed.pt]);
  await p.waitForTimeout(500);
  const done = await p.evaluate(a2 => {
    const [names, pt] = a2;
    const rec = RECS.find(r => r.equip === "TK115");
    renderSync();
    const onPoint = (() => { const it = (rec.items || []).find(i => i && i.key === pt);
      return it ? mediaOf(it, rec).filter(m => names.indexOf(m.name) >= 0).length : 0; })();
    return { onPoint, general: generalMedia(rec).filter(m => names.indexOf(m.name) >= 0).length,
             items: rec.items.length,
             held: syncScan().quar.some(q => q.r.equip === "TK115") };
  }, [FOUND, filed.pt]);
  ok(done.onPoint === 4, "four are on the point the engineer chose", String(done.onPoint));
  ok(done.general === 2, "and two are general evidence for the whole inspection", String(done.general));
  /* THE THING THAT MUST NEVER HAPPEN. */
  ok(done.onPoint + done.general === FOUND.length,
     "and all six photographs still exist", String(done.onPoint + done.general));
  ok(done.items === 3, "with the record's points intact", String(done.items));
  /* TK115 stays held, and correctly so: its keyless point is still keyless.
     Filing photographs answers the evidence question, not the identity one —
     saying the hold had cleared would be the panel claiming to have fixed
     something it has not touched. */
  ok(done.held, "the round is still held, because its point still has no name");

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
