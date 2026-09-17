/* A PLUG CARD WITH NOTHING ON IT IS NOT A CLEAN PLUG — IT IS ONE NOBODY WALKED TO.

   Reported from the field on a printed TK150 report: two of four cards in
   "Equipment and component evidence" carried only a work-order tag, no
   grade, no photograph, no defect, nothing — the same area on the page as a
   real finding and none of its information. loadPos() stamps the round's
   own work order onto whatever position happens to be on screen the
   instant it opens, so a plug merely navigated past on the way to the one
   actually being checked picks up a WO number and nothing else.

   "remove [it] in the report if no photo or comments... or just maybe a
   note that 1 and 4 not taken" — mpEvidence() now drops a position with no
   grade, no photograph, no defect and no comment from the board, and names
   whatever it dropped in one quiet line, so the reader still knows the
   round has more plugs than the ones printed. A position with a GRADE —
   even Normal, even with nothing else — is a real reading and keeps its
   card exactly as before; this is not a "hide anything imperfect" filter.

   Run: node tests/mpskip.cjs [port]   (needs tests/ed-srv.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

const SEED = `(function(){
  window.CMDash.importRecords([
    { equip:"TK150", date:"2026-09-17", type:"MP", cls:"HT", by:"Rayanov", smu:7638,
      items:[
        { key:"1", label:"Engine", wo:"WO-016592" },              // navigated past — nothing recorded
        { key:"4", label:"Differential", wo:"WO-016592" },        // navigated past — nothing recorded
        { key:"4E", label:"Left Rear Final Drive", grade:1, action:"Monitor / re-inspect next PM",
          photos:[{name:"e.jpg"}] },
        { key:"4F", label:"Right Rear Final Drive", grade:1, action:"Monitor / re-inspect next PM",
          photos:[{name:"f.jpg"}] } ] },
    /* A round with an ungraded, evidence-free position on EVERY plug — the
       skip must not leave the section printing an empty board. */
    { equip:"TK151", date:"2026-09-17", type:"MP", cls:"HT", by:"Rayanov", smu:100,
      items:[ { key:"1", label:"Engine", wo:"WO-1" }, { key:"4", label:"Differential", wo:"WO-2" } ] },
  ]);
  return {};
})()`;

const textOf = (p, key, lang) => p.evaluate(({ key, lang }) => {
  const secs = CMReport.sectionsFor("one", key, { lang });
  const div = document.createElement("div"); div.innerHTML = secs.map(s => s.html || "").join("\n");
  return div.innerText.replace(/\s+/g, " ").trim();
}, { key, lang });
const cardCount = (p, key) => p.evaluate((key) => {
  const secs = CMReport.sectionsFor("one", key, { lang: "en" });
  const div = document.createElement("div"); div.innerHTML = secs.map(s => s.html || "").join("\n");
  return div.querySelectorAll(".cel").length;
}, key);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1600);
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(300);
  await p.evaluate(() => { CMDrive.saveEdit = () => Promise.resolve({ ok: true }); });
  await p.evaluate(SEED);
  const k = (e, d, t) => `${e}|${d}|${t}`;

  console.log('a position with nothing recorded is dropped from the board');
  const tk150 = await textOf(p, k('TK150', '2026-09-17', 'MP'), 'en');
  const n150 = await cardCount(p, k('TK150', '2026-09-17', 'MP'));
  ok(n150 === 2, 'only the two walked plugs print as cards', n150 + ' cards');
  ok(/4E/.test(tk150) && /4F/.test(tk150), '  4E and 4F are printed', tk150.slice(0, 40));
  ok(!/>\s*1\s*<\/div>/.test((await p.evaluate((key) => {
    const secs = CMReport.sectionsFor("one", key, { lang: "en" });
    const div = document.createElement("div"); div.innerHTML = secs.map(s => s.html || "").join("\n");
    return Array.from(div.querySelectorAll(".cel .pk")).map(e => e.textContent.trim()).join("|");
  }, k('TK150', '2026-09-17', 'MP')))), '  position "1" is not one of the printed cards');

  console.log('\nwhat was skipped is named, once, in one line');
  ok(/not inspected/i.test(tk150), 'the skip note is on the sheet', tk150.match(/not inspected[^.]*/i));
  ok(/\b1\b/.test(tk150.match(/not inspected[^.]*/i)[0]) && /\b4\b/.test(tk150.match(/not inspected[^.]*/i)[0]),
     '  both skipped positions are named', tk150.match(/not inspected[^.]*/i)[0]);

  console.log('\na graded position — even Normal, even bare — is a real reading and keeps its card');
  const ru150 = await textOf(p, k('TK150', '2026-09-17', 'MP'), 'ru');
  ok(/не проверено/.test(ru150), 'the skip note translates', ru150.match(/не проверено[^.]*/));

  console.log('\na round where EVERY position was skipped prints no empty board');
  const tk151 = await textOf(p, k('TK151', '2026-09-17', 'MP'), 'en');
  const n151 = await cardCount(p, k('TK151', '2026-09-17', 'MP'));
  ok(n151 === 0, 'no cards at all', n151 + ' cards');
  ok(!/Equipment and component evidence/.test(tk151), '  and no empty section heading either', tk151.slice(0, 60));

  console.log('\nthe earlier MP fixture is unaffected — a Normal plug with nothing else still earns its card');
  const seedOld = `(function(){ window.CMDash.importRecords([
    { equip:"TK900OLD", date:"2026-08-10", type:"MP", cls:"HT", by:"Ivanov", smu:9100,
      items:[ { key:"4E", label:"Left Rear Final Drive", grade:1, particle:"", comp:"", oil:"", photos:[] } ] } ]);
    return {}; })()`;
  await p.evaluate(seedOld);
  const old = await textOf(p, k('TK900OLD', '2026-08-10', 'MP'), 'en');
  ok(/4E/.test(old), 'the clean, ungraded-otherwise plug still prints', old.slice(0, 60));

  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
