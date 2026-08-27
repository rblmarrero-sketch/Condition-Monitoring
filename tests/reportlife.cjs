/* A REPORT IS A STATEMENT ABOUT A MACHINE, ISSUED TO SOMEBODY.

   Three things follow, and none of them were true before.

   It has a STATUS. A report printed while two of its photographs are still
   uploading is not the same document as one printed after they arrived, and
   calling both "the report" is how a purchasing decision ends up resting on
   evidence nobody had seen.

   It has a REVISION, and the revision is of the CONTENT, not of the clock. Two
   reports of a record nobody has touched are the same report; if reprinting
   invented a new revision, "superseded" would stop meaning anything inside a
   week. One printed before an engineer re-graded a plug and one printed after
   are different documents, and the earlier is superseded the moment that grade
   moves — not when somebody remembers to reprint.

   And the log of what was issued travels with the record. This caught a real
   data-loss bug in the building: every writer replaced the whole sidecar
   document, so setting an owner on a finding silently discarded every photo
   recipe and every issued report on that record. It merges now, in one place,
   so no future writer has to remember.

   Run: node tests/reportlife.cjs [port]   (needs tests/ed-srv.cjs on 8093)
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
  const setup = await p.evaluate(() => {
    window.__w = [];
    CMDrive.saveEdit = d => { window.__w.push(JSON.parse(JSON.stringify(d))); return Promise.resolve({ ok: true }); };
    CMDrive.configured = () => true;
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
    const rec = RECS.find(r => (r.items || []).some(i => mediaOf(i, r).length));
    if (!rec) return null;
    const all = []; RECS.forEach(r => (r.items || []).forEach(i => mediaOf(i, r).forEach(m => m.name && all.push(m.name))));
    const mine = []; (rec.items || []).forEach(i => mediaOf(i, rec).forEach(m => m.name && mine.push(m.name)));
    window.__all = all; window.__mine = mine; window.__rk = recKey(rec);
    return { rk: recKey(rec), unit: rec.equip, media: mine.length };
  });
  if (!setup) { console.log("  SKIP  the fixture has no record with media"); await b.close(); process.exit(0); }

  console.log("\n── status follows the evidence, not the clock");
  const st = await p.evaluate(() => {
    const rec = RECS.find(r => recKey(r) === window.__rk);
    CMDrive.names = () => window.__all.filter(n => n !== window.__mine[0]);
    const prov = reportStatus(rec);
    CMDrive.names = () => window.__all;
    const fin = reportStatus(rec);
    return { prov, fin };
  });
  ok(st.prov.status === "provisional", "one attachment short and it is provisional",
     `${st.prov.have}/${st.prov.need}`);
  ok(st.prov.need - st.prov.have === 1, "and it says how many are outstanding",
     `${st.prov.need - st.prov.have} outstanding`);
  ok(st.fin.status === "final", "every attachment present and it is a controlled final",
     `${st.fin.have}/${st.fin.need}`);

  console.log("\n── the revision is of the content");
  const rev = await p.evaluate(async () => {
    const rec = RECS.find(r => recKey(r) === window.__rk);
    const a = recRevision(rec), b2 = recRevision(rec);
    await patchItems([{ rk: window.__rk, ik: (rec.items || [])[0].key }], { owner: "Petrov" }, null);
    const rec2 = RECS.find(r => recKey(r) === window.__rk);
    const c = recRevision(rec2);
    await patchItems([{ rk: window.__rk, ik: (rec2.items || [])[0].key }], { owner: "" }, null);
    const rec3 = RECS.find(r => recKey(r) === window.__rk);
    return { a, b: b2, c, back: recRevision(rec3) };
  });
  /* Reprinting an untouched record must not invent a new revision, or every
     report supersedes itself and the word stops carrying information. */
  ok(rev.a === rev.b, "asking twice about an untouched record gives one answer", rev.a);
  ok(rev.c !== rev.a, "changing a finding changes it", `${rev.a} → ${rev.c}`);
  ok(rev.back === rev.a, "and putting the change back restores it", rev.back);

  console.log("\n── issuing one records what it said and what it was");
  const issued = await p.evaluate(() => {
    const rec = RECS.find(r => recKey(r) === window.__rk);
    const s = reportStatus(rec);
    logReport(window.__rk, 3, s.status, s.rev);
    const log = reportLog(window.__rk);
    return { n: log.length, last: log[log.length - 1], current: !!reportCurrent(rec),
             superseded: reportsSuperseded(rec).length };
  });
  ok(issued.n === 1, "the issue is on the record", issued.n + " logged");
  ok(!!issued.last.by && !!issued.last.at, "with who issued it and when",
     `${issued.last.by} @ ${issued.last.at}`);
  ok(issued.last.status === "final" && !!issued.last.rev,
     "its status and the content revision it describes",
     `${issued.last.status} / ${issued.last.rev}`);
  ok(issued.current, "and it is the current report");
  ok(issued.superseded === 0, "with nothing superseded yet", issued.superseded + "");

  console.log("\n── a material change supersedes it the moment it happens");
  const sup = await p.evaluate(async () => {
    await patchItems([{ rk: window.__rk, ik: (RECS.find(r => recKey(r) === window.__rk).items || [])[0].key }],
                     { action: "REP", actionLabel: "Repair now" }, null);
    const rec = RECS.find(r => recKey(r) === window.__rk);
    return { superseded: reportsSuperseded(rec).length, current: !!reportCurrent(rec),
             log: reportLog(window.__rk).length };
  });
  ok(sup.superseded === 1, "the earlier issue is superseded", sup.superseded + "");
  ok(!sup.current, "there is no current report any more", String(sup.current));
  /* The bug this replaces: patchItems rebuilt the whole sidecar document, so an
     unrelated edit discarded the report log and every photo recipe with it. */
  ok(sup.log === 1, "and the earlier issue is still on the record, not discarded",
     sup.log + " kept");

  console.log("\n── an unrelated edit does not eat the photo recipes either");
  const media = await p.evaluate(async () => {
    const rec = RECS.find(r => recKey(r) === window.__rk);
    const name = window.__mine[0];
    /* Store a recipe the way the editor does. */
    const keep = edits[window.__rk] || {};
    CMDash.setEdits([Object.assign({}, keep, { key: window.__rk, at: new Date().toISOString(),
      media: { [name]: { rot: 90, caption: "x", by: "R", at: new Date().toISOString() } } })]);
    const before = Object.keys(CMDash.mediaEdits(window.__rk)).length;
    await patchItems([{ rk: window.__rk, ik: (rec.items || [])[0].key }], { prio: "P2" }, null);
    return { before, after: Object.keys(CMDash.mediaEdits(window.__rk)).length,
             reports: reportLog(window.__rk).length };
  });
  ok(media.before === 1, "a recipe is stored", media.before + "");
  ok(media.after === 1, "and survives an edit that never mentions it", media.after + "");
  ok(media.reports === 1, "as does the report log", media.reports + "");

  console.log("\n── a writer that DOES mention a block still wins");
  const explicit = await p.evaluate(() => {
    const keep = edits[window.__rk] || {};
    CMDash.setEdits([Object.assign({}, keep, { key: window.__rk,
      at: new Date().toISOString(), media: {} })]);
    return Object.keys(CMDash.mediaEdits(window.__rk)).length;
  });
  /* Otherwise "reset to original" could never remove a recipe. */
  ok(explicit === 0, "an explicit empty media block clears it", explicit + "");

  console.log("\n── the machine drawer says all this where the reader is");
  const drw = await p.evaluate(() => {
    const rec = RECS.find(r => recKey(r) === window.__rk);
    showTab("overview"); openUnit(rec.equip);
    const body = document.getElementById("drwBody");
    return { text: body.innerText.replace(/\s+/g, " "),
             badges: [...body.querySelectorAll(".rst")].map(x => x.textContent.trim()) };
  });
  ok(drw.badges.length > 0, "there is a report status on the machine", drw.badges.join(" / "));
  ok(drw.badges.some(x => /superseded|устарел/i.test(x)),
     "and it says the issued one no longer stands", drw.badges.join(" / "));

  ok(errs.length === 0, "nothing threw throughout", errs.slice(0, 2).join(" | "));
  await b.close();
  console.log(fail ? `\n${fail} FAILED` : "\nall passed");
  process.exit(fail ? 1 : 0);
})();
