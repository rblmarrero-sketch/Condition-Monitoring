/* A TEMPERATURE READING THAT PROPOSED A GRADE HAD NO MIRROR FOR TAKING IT
   AWAY, THE SECOND SUCH GAP AFTER THE DEFECT PICKER'S OWN.

   syncTempSev() writes p.grade/p.gradeAuto straight off the limit table when
   a reading crosses it — correct, and the ONLY thing that ever proposes a
   grade on a TEMP round, since a measured station's condition is its
   reading, not a pick. But clearing the reading back out, or correcting a
   mis-typed alarm value back inside the limit, left the auto grade standing:
   tempSeverity("","") returns "", g comes out null, and the `if(g && ...)`
   branch that WRITES a grade was the only branch that ever touched p.grade
   at all — nothing cleared it when g stopped being truthy. A Critical
   reading typed by mistake and then corrected left grade 5, its defect,
   action and target date all standing with no temperature behind any of
   them — the same shape CLAUDE.md documents for the defect picker's own
   fix, one field over.

   Run: node tests/tempgrade.cjs   (starts its own server) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8491);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof syncTempSev === 'function', null, { timeout: 30000 });

  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'TEMP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => { selectEquip('TK032'); goStep(2); });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const n = document.querySelector('#posnav [data-l7]'); if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const n = document.querySelector('#posnav [data-l8]'); if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.waitForTimeout(300);
  const k = await p.evaluate(() => curItem);
  ok('a leaf position exists to test against', !!k, k);

  console.log('\na reading past the limit proposes a grade');
  await p.fill('#tempV', '9999');
  await p.dispatchEvent('#tempV', 'input');
  await p.waitForTimeout(150);
  const after1 = await p.evaluate(k => {
    const pp = draft.positions[k] || {};
    return { grade: pp.grade, gradeAuto: pp.gradeAuto, sev: pp.sev };
  }, k);
  ok('grade 5 (Critical) is proposed', after1.grade === 5 && after1.gradeAuto === 1, JSON.stringify(after1));

  console.log('\nclearing the reading takes the proposed grade away with it');
  await p.fill('#tempV', '');
  await p.dispatchEvent('#tempV', 'input');
  await p.waitForTimeout(150);
  const after2 = await p.evaluate(k => {
    const pp = draft.positions[k] || {};
    return { grade: pp.grade, gradeAuto: pp.gradeAuto, sev: pp.sev, hasEntry: !!draft.positions[k] };
  }, k);
  ok('the stale grade is cleared, not left standing', !after2.grade && !after2.gradeAuto && !after2.sev, JSON.stringify(after2));

  console.log('\na grade the inspector confirmed by hand is never touched');
  await p.fill('#tempV', '9999');
  await p.dispatchEvent('#tempV', 'input');
  await p.waitForTimeout(150);
  await p.evaluate(k => { (draft.positions[k] || (draft.positions[k] = {})).gradeMan = 1; }, k);
  await p.fill('#tempV', '');
  await p.dispatchEvent('#tempV', 'input');
  await p.waitForTimeout(150);
  const after3 = await p.evaluate(k => {
    const pp = draft.positions[k] || {};
    return { grade: pp.grade, gradeMan: pp.gradeMan };
  }, k);
  ok('a hand-confirmed grade survives the reading being cleared', after3.grade === 5 && after3.gradeMan === 1, JSON.stringify(after3));

  ok('no page errors throughout', errs.length === 0, errs.join(' | '));
  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? `\nFAILED ${fails.length}: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
