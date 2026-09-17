/* THE EQUIPMENT HISTORY GALLERY IS ANOTHER READER OF THE SAME RECORDS,
   AND IT WAS NEVER ASKED THE SAME QUESTION.

   report-core.js's mpEvidence() drops a plug position from the PRINTED
   report when it carries no grade, no photograph, no defect and no
   comment — build 396's fix for "remove it in the report if no photo or
   comments". The very next field report, still on build 396: "still there
   1 and 4, no photo and comments" — from the dashboard's own Equipment
   History screen, not the PDF. renderHistory()'s gallery view has its own
   filter (`i=>!isWearType(rec.type)||photoSrc(i,rec)||i.comment||i.defect`)
   that only ever excluded anything on a MEASURED round; on every other
   type — MP included — it kept every position, so the same navigated-past,
   nothing-recorded card `mpEvidence` now hides in the PDF went on printing
   here. `histShown()` is the one rule both call sites in renderHistory now
   share, extended to also count a real GRADE as evidence on a non-measured
   round (report-core's `walked` rule, in the dashboard's own vocabulary),
   and a skipped position is named in one line under the grid — never just
   dropped silently.

   Run: node tests/histskip.cjs [port]   (needs tests/ed-srv.cjs on the port) */
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
        { key:"1", label:"Engine", wo:"WO-016592" },
        { key:"4", label:"Differential", wo:"WO-016592" },
        { key:"4E", label:"Left Rear Final Drive", grade:1, action:"Monitor / re-inspect next PM",
          photos:[{name:"e.jpg"}] },
        { key:"4F", label:"Right Rear Final Drive", grade:1, action:"Monitor / re-inspect next PM",
          photos:[{name:"f.jpg"}] } ] },
  ]);
  return {};
})()`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('cm_dash_histview', 'photo'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(BUNDLED + '()');
  await p.waitForTimeout(300);
  await p.evaluate(SEED);
  await p.evaluate(() => { showTab('equipment'); cmbSet('equipSel', 'TK150'); renderHistory(); });
  await p.waitForTimeout(300);

  console.log('a position with nothing recorded is dropped from the gallery card grid');
  const keys = await p.evaluate(() =>
    Array.from(document.querySelectorAll('#history .pos .pk')).map(e => e.textContent.trim()));
  ok(keys.some(k => /^4E\b/.test(k)) && keys.some(k => /^4F\b/.test(k)), '4E and 4F are printed', keys.join(' | '));
  ok(!keys.some(k => /^1\b/.test(k)) && !keys.some(k => /^4\b/.test(k)), 'positions 1 and 4 are not', keys.join(' | '));

  console.log('\nwhat was skipped is named, once, in one line');
  const histText = await p.evaluate(() => document.getElementById('history').innerText.replace(/\s+/g, ' '));
  ok(/not inspected/i.test(histText), 'the skip note is on the screen', (histText.match(/not inspected[^.]*/i) || [''])[0]);
  const note = (histText.match(/not inspected[^.]*/i) || [''])[0];
  ok(/\b1\b/.test(note) && /\b4\b/.test(note), '  both skipped positions are named', note);

  console.log('\na measured round is unaffected — its own rule is untouched');
  const SEED_UC = `(function(){ window.CMDash.importRecords([
    { equip:"DZ900HS", date:"2026-09-17", type:"UC", cls:"DOZ", by:"Rayanov", smu:100,
      items:[
        { key:"L.LINK", label:"Track link L", mm:52, newMM:78, condemnMM:50, wearPct:93 },
        { key:"R.LINK", label:"Track link R", mm:70, newMM:78, condemnMM:50, wearPct:29, photos:[{name:"r.jpg"}] } ] } ]);
    return {}; })()`;
  await p.evaluate(SEED_UC);
  await p.evaluate(() => { cmbSet('equipSel', 'DZ900HS'); renderHistory(); });
  await p.waitForTimeout(300);
  const ucKeys = await p.evaluate(() =>
    Array.from(document.querySelectorAll('#history .pos .pk')).map(e => e.textContent.trim()));
  ok(ucKeys.some(k => /R\.LINK/.test(k)), 'a measured station with a photo prints', ucKeys.join(' | '));
  ok(!ucKeys.some(k => /L\.LINK/.test(k)), '  a measured station with no photo/comment/defect still does not (unchanged rule)', ucKeys.join(' | '));

  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
