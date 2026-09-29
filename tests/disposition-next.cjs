/* "NO ACTION REQUIRED" (#dispBox/#dispScrim) -- the one status a person must
   explicitly justify, per REDESIGN-BRIEF.md's own reading of the dialog
   inventory. Write path: dispSave -> patchItems() -> window.CMDrive.saveEdit
   per record. Same stub-and-diff technique as the other Part B suites.

   Run: node tests/disposition-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});

const RECS = [{ equip: 'TK903', date: '2026-09-13', type: 'MP', cls: 'HT', by: 'R. Marrero',
  items: [{ key: '2B', label: 'RF Final Drive', grade: 'B', comment: 'trace fuzz only' }] }];

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.__writes = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    try { localStorage.removeItem('cm_dash_who'); } catch (e) {}
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
  }, RECS);
  await p.waitForTimeout(600);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const open = p => p.evaluate(() => window.askDisposition([{ rk: 'TK903|2026-09-13|MP', ik: '2B' }]));
  await open(a); await open(n);
  await a.waitForTimeout(300); await n.waitForTimeout(300);

  ok('dashboard/: No action required dialog opens', !(await a.evaluate(() => document.getElementById('dispBox').classList.contains('hidden'))));
  ok('dashboard-next: No action required dialog opens', !(await n.evaluate(() => document.getElementById('dispBox').classList.contains('hidden'))));

  /* Refused with no reason -- CLAUDE.md's own rule about a required reason
     and about a rejecting control looking like one. */
  await a.click('#dispSave'); await n.click('#dispSave');
  await a.waitForTimeout(200); await n.waitForTimeout(200);
  const msgA0 = await a.$eval('#dispMsg', el => el.textContent);
  const msgB0 = await n.$eval('#dispMsg', el => el.textContent);
  ok('dashboard/: refused with no reason/approver', !!msgA0.trim());
  ok('dashboard-next: refused with no reason/approver', !!msgB0.trim());
  ok('the refusal message matches', msgA0 === msgB0, `A="${msgA0}" B="${msgB0}"`);

  await a.fill('#dispReason', 'Within limit, monitored at the next round'); await n.fill('#dispReason', 'Within limit, monitored at the next round');
  await a.fill('#dispBy', 'V. Petrov'); await n.fill('#dispBy', 'V. Petrov');
  await a.click('#dispSave'); await n.click('#dispSave');
  await a.waitForTimeout(500); await n.waitForTimeout(500);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.saveEdit called exactly once on each page', writesA.length === 1 && writesB.length === 1, `A=${writesA.length} B=${writesB.length}`);
  if (writesA.length === 1 && writesB.length === 1) {
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const stripTimes = v => { if (Array.isArray(v)) return v.map(stripTimes);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = stripTimes(v[k]); return o; }
      return (typeof v === 'string' && ISO_RE.test(v)) ? '<ts>' : v; };
    ok('the saved disposition document is field-for-field identical (timestamps excluded)',
       JSON.stringify(stripTimes(writesA[0])) === JSON.stringify(stripTimes(writesB[0])),
       `A=${JSON.stringify(stripTimes(writesA[0]))} B=${JSON.stringify(stripTimes(writesB[0]))}`);
    ok('the item carries status NOACT and the reason/approver', writesA[0].items && writesA[0].items['2B'] &&
       writesA[0].items['2B'].status === 'NOACT' && writesA[0].items['2B'].dispBy === 'V. Petrov',
       JSON.stringify(writesA[0].items));
  }
  ok('dashboard/: dialog closes on save', await a.evaluate(() => document.getElementById('dispBox').classList.contains('hidden')));
  ok('dashboard-next: dialog closes on save', await n.evaluate(() => document.getElementById('dispBox').classList.contains('hidden')));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
