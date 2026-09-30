/* The table kit at a year's volume, run against /dashboard-next/ instead of the
   live /dashboard/. Same suite as tests/tablekit-scale.cjs, retargeted only in
   its .goto() call. Self-contained. Run: node tests/tablekit-scale-next.cjs

   /mobile/sw.js is served here as a STATIC MOCK, pinned to dashboard-next's
   own live ?v= tag (read off the real file below, never a copied-in number --
   this file drifted forward once already between sessions). Without it this
   suite hits the exact gap docs/dashboard-next-parity.md logs under
   tablekit-scale-next: dashboard-next's own tag is a snapshot that lags the
   mainline's constantly-bumped BUILD by design, so the real /mobile/sw.js
   almost always reports "newer", and this suite's own filter typing and
   sort-header clicks hold no element focus busy() recognises -- so the
   self-update reload can fire mid-run and destroy the page's JS context
   ("Execution context was destroyed, most likely because of a navigation").
   That reload risk is real on a live, long-idle dashboard-next session (see
   the parity doc's own "shared pre-existing weakness" entry) -- it is simply
   not what THIS suite exists to exercise (that is equipment-panel-next.cjs's
   job, which mocks the opposite way, forcing dashWaiting on purpose). Pinning
   the mock to the page's own real tag makes `newer` false for the length of
   this run, the same way dashboard/'s own tests never see it because its tag
   IS the live BUILD by the bump.cjs discipline. */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const nextHtml = fs.readFileSync(path.join(ROOT, 'dashboard-next', 'index.html'), 'utf8');
const pinnedBuild = (nextHtml.match(/magnetic_plug\.js\?v=([^"&]+)/) || [])[1];
if (!pinnedBuild) throw new Error('could not read dashboard-next\'s own ?v= tag to pin the mobile/sw.js mock to');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(`const BUILD = "${pinnedBuild}";`); return; }
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(d); } }); });
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fleet-fixture.json'), 'utf8'));
const recs = []; const day0 = Date.parse('2026-07-30');
for (let d = 0; d < (+process.env.DAYS || 60); d++) for (let k = 0; k < 70; k++) {
  const b = JSON.parse(JSON.stringify(base[(d * 70 + k) % base.length]));
  const n = d * 70 + k;
  b.id = 'sc' + n; b.equip = b.equip.replace(/\d+$/, '') + String(1 + (n * 7) % 1128).padStart(4, '0');
  b.date = new Date(day0 + d * 864e5).toISOString().slice(0, 10);
  (b.items || []).forEach((it, i) => { if ((n + i) % 3 === 0) it.grade = 3 + ((n + i) % 3); });
  recs.push(b);
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`); await p.waitForTimeout(1500);
  const t0 = Date.now();
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, recs);
  await p.waitForTimeout(500);
  console.log('  load ' + recs.length + ' rounds: ' + (Date.now() - t0) + ' ms');
  const go = tab => p.evaluate(t => document.querySelector(`nav.tabs button[data-tab="${t}"]`).click(), tab).then(() => p.waitForTimeout(600));
  const time = async (label, fn, arg, budget) => { const t = await p.evaluate(fn, arg); ok(label + ' within ' + budget + ' ms', t < budget, Math.round(t) + ' ms'); };
  for (const [tab, id] of [['failure', 'failAffTbl'], ['wear', 'wearTbl'], ['overview', 'fleetTbl'], ['actions', 'actionTbl']]) {
    await go(tab);
    const rows = await p.evaluate(id => document.querySelectorAll('#' + id + ' tbody tr').length, id);
    ok(id + ' draws one page, not the history', rows > 0 && rows <= 110, rows + ' rows');
    await time(id + ': filter keystroke', id => { const i = document.querySelector('#' + id + ' input.cwcf'); const t = performance.now(); i.value = 'TK0'; i.dispatchEvent(new Event('input', { bubbles: true })); return performance.now() - t; }, id, 1500);
    await time(id + ': sort click', id => { const h = document.querySelector('#' + id + ' th.sortable'); const t = performance.now(); h.click(); return performance.now() - t; }, id, 1500);
  }
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close(); srv.close(); console.log(fails.length ? fails.length + ' FAILED' : 'all pass'); process.exit(fails.length ? 1 : 0);
})();
