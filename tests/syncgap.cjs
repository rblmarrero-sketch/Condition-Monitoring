/* WITHDRAWN IS NOT MISSING.

   The audit of build 253 found Data & Sync reporting 12 field photographs
   missing, 11 of them on TK156's plug round of 14 August. The folder held all
   sixteen of that round's files. The office had withdrawn eleven of them from
   the record — a thumb over the lens, duplicates — and the evidence count was
   taken from what is still SHOWN, so a photograph deliberately taken off the
   record counted as one that never arrived. A false alarm about evidence that
   had arrived, standing for three weeks.

   What has to be true:
     · a round whose files are all in the folder reads complete, however many
       the office has withdrawn;
     · the withdrawn ones are counted separately, not as missing;
     · a file that really is absent still reads missing;
     · the sync panel's gap table does not list a round with nothing missing.

   Run: node tests/syncgap.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
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
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1800);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(600);
  const target = await p.evaluate(() => {
    const rec = RECS.find(r => r.type === "MP" && (r.items || []).some(i => !i.general && i.key));
    const it = rec.items.find(i => !i.general && i.key);
    /* The phone claimed three photographs on this point and none anywhere
       else on the round; the folder holds them under the names the phone
       gives them. */
    rec.items.forEach(x => { if (x !== it) { ['photos','photo','video','attachments','media'].forEach(f => delete x[f]); x.att = []; } });
    ['photo','video','attachments','media'].forEach(f => delete it[f]); it.photos = 3; it.att = [];
    const base = photoBases(it, rec)[0];
    const names = [1, 2, 3].map(n => `${base}_${n}.jpg`);
    /* The round is a field record whose files live in the folder — not one
       that ships with the app, which the sync scan rightly never counts. */
    rec.src = "folder";
    window.__folder = new Set(names);
    CMDrive.hasName = n => window.__folder.has(n);
    CMDrive.names = () => [...window.__folder];
    CMDrive.configured = () => true;
    CMDrive.saveEdit = d => Promise.resolve({ ok: true });
    try { localStorage.setItem("cm_dash_who", "R. Marrero"); } catch (e) {}
    assignEpoch++; rebuild();
    return { rk: ekOf(rec), ik: it.key, equip: rec.equip, date: rec.date, names };
  });
  const gap = () => p.evaluate(({ rk }) => { const r = RECS.find(x => ekOf(x) === rk); return evidenceGap(r); }, target);

  console.log("── all three files in the folder");
  let g = await gap();
  ok(g.expected === 3 && g.received === 3 && g.missing === 0 && g.withdrawn === 0, "the round reads complete", JSON.stringify(g));

  console.log("\n── the office withdraws two of them");
  await p.evaluate(({ rk, ik, names }) => {
    window.CMDash.setEdits([{ key: rk, by: "R. Marrero", at: new Date().toISOString(), items: { [ik]: { hidden: [names[1], names[2]] } } }]);
  }, target);
  await p.waitForTimeout(300);
  g = await gap();
  ok(g.received === 3 && g.missing === 0, "the round still reads complete — the files are in the folder", JSON.stringify(g));
  ok(g.withdrawn === 2, "and the withdrawn ones are counted as withdrawn, not missing", String(g.withdrawn));
  const shown = await p.evaluate(({ rk, ik }) => { const r = RECS.find(x => ekOf(x) === rk); const it = r.items.find(i => i.key === ik); return serverMediaOf(it, r).length; }, target);
  ok(shown === 1, "while the screens list only the one that is still on the record", shown + " listed");
  const listed = await p.evaluate(({ equip, date }) => { showTab("sync", true); renderSync();
    const rows = [...document.querySelectorAll("#syGapTbl tbody tr")].map(tr => tr.innerText.replace(/\s+/g, " "));
    return rows.filter(t => t.indexOf(equip) >= 0 && t.indexOf(date) >= 0); }, target);
  ok(listed.length === 0, "and the sync panel's gap table does not list it", listed.join(" | ") || "not listed");

  console.log("\n── one file really is absent");
  await p.evaluate(({ names }) => { window.__folder.delete(names[0]); assignEpoch++; rebuild(); }, target);
  g = await gap();
  ok(g.expected === 3 && g.received === 2 && g.missing === 1 && g.withdrawn === 2, "it reads one missing, two withdrawn", JSON.stringify(g));
  const listed2 = await p.evaluate(({ equip, date }) => { renderSync();
    const rows = [...document.querySelectorAll("#syGapTbl tbody tr")].map(tr => tr.innerText.replace(/\s+/g, " "));
    return rows.filter(t => t.indexOf(equip) >= 0 && t.indexOf(date) >= 0); }, target);
  ok(listed2.length === 1, "and now the gap table lists it", listed2[0] ? listed2[0].slice(0, 80) : "not listed");

  ok(errs.length === 0, "no page errors", errs.join(" | ") || "none");
  console.log(fail ? `\nFAILED ${fail}` : "\nall passed");
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log("FAIL harness: " + (e && e.stack || e)); process.exit(1); });
