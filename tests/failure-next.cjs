/* FAILURE ANALYSIS, ON /dashboard-next/, CHECKED AGAINST THE REAL /dashboard/
   FOR THE SAME UNDERLYING DATA.

   Same technique as tests/overview-next.cjs: load the IDENTICAL fixture into
   the untouched /dashboard/index.html and into /dashboard-next/index.html
   (window explicitly set to All time on the next page, since /dashboard/ has
   no window at all), open the Failure Analysis tab on both, and diff the
   numbers a reader would actually use — never re-derive them.

   Also proves, on dashboard-next alone: the Pareto carries the cumulative-
   share column the brief asks for (§13's "top failure modes Pareto chart
   with cumulative-share column"), the Affected Equipment table still runs
   through the shared tk* kit, and no sideways scroller appears at 1366px.

   Run: node tests/failure-next.cjs */
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
const FLEET = JSON.parse(fs.readFileSync(path.join(__dirname, 'fleet-fixture.json'), 'utf8'));

const readFailure = async p => {
  await p.evaluate(() => { location.hash = '#failure'; });
  await p.waitForTimeout(600);
  const defectRows = await p.$$eval('#paretoDefect .prow, #paretoDefect .n', () => 0).catch(() => 0);
  const paretoCounts = async sel => p.$$eval(sel + ' .n', els => els.map(e => e.textContent.trim())).catch(() => []);
  const defectN = await paretoCounts('#paretoDefect');
  const causeN = await paretoCounts('#paretoCause');
  const isoN = await paretoCounts('#paretoIso');
  const affRows = await p.$$eval('#failAffTbl tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length).catch(() => 0);
  return { defectN, causeN, isoN, affRows };
};

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const ctxA = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const a = await ctxA.newPage();
  const errsA = []; a.on('pageerror', e => errsA.push(e.message));
  await a.goto(`http://127.0.0.1:${port}/dashboard/index.html`, { waitUntil: 'load' });
  await a.waitForTimeout(1500);
  await a.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await a.waitForTimeout(1200);
  const baseline = await readFailure(a);

  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]');
  await n.waitForTimeout(400);
  const next = await readFailure(n);

  console.log('dashboard/     ' + JSON.stringify(baseline));
  console.log('dashboard-next ' + JSON.stringify(next));

  ok('Pareto (failure modes) counts match, bar for bar', JSON.stringify(next.defectN) === JSON.stringify(baseline.defectN),
     `next=${JSON.stringify(next.defectN)} dashboard=${JSON.stringify(baseline.defectN)}`);
  ok('Pareto (direct causes) counts match', JSON.stringify(next.causeN) === JSON.stringify(baseline.causeN),
     `next=${JSON.stringify(next.causeN)} dashboard=${JSON.stringify(baseline.causeN)}`);
  ok('Pareto (ISO 14224 mechanism) counts match', JSON.stringify(next.isoN) === JSON.stringify(baseline.isoN),
     `next=${JSON.stringify(next.isoN)} dashboard=${JSON.stringify(baseline.isoN)}`);
  ok('Affected equipment row count matches', next.affRows === baseline.affRows,
     `next=${next.affRows} dashboard=${baseline.affRows}`);

  /* ── the Pareto carries a cumulative-share column (brief §13) ──────────── */
  const cum = await n.$$eval('#paretoDefect .cum', els => els.map(e => e.textContent.trim()));
  ok('the top-failure-modes Pareto has a cumulative-share column', cum.length > 0 && cum.every(t => /%$/.test(t)),
     JSON.stringify(cum));

  /* ── the affected-equipment table uses the shared tk* kit ──────────────── */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#failAffTbl thead input.cwcf').length > 0,
    hasSortableHeaders: document.querySelectorAll('#failAffTbl thead th.sortable').length > 0,
  }));
  ok('affected equipment has the shared table-kit filter row', kit.hasFilterBoxes, JSON.stringify(kit));
  ok('affected equipment has the shared table-kit sortable headers', kit.hasSortableHeaders, JSON.stringify(kit));

  /* ── no sideways scroller at 1366px ─────────────────────────────────────── */
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-failure .tblwrap, #tab-failure table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Failure Analysis at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
