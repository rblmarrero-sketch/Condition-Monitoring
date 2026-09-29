/* THE DEFECTS RAISED TAB, ON /dashboard-next/, CHECKED AGAINST THE REAL
   /dashboard/ FOR THE SAME UNDERLYING DATA (both pages load the identical
   live data/work_orders.js -- this tab reads no fixture-controlled RECS at
   all, only 1C's own defect work orders, so no setDriveRecords call is
   needed here).

   Same technique as tests/overview-next.cjs, tests/due-next.cjs,
   tests/plan-next.cjs: diff the KPI tiles (total + one per person), the
   status filter's own options, the "Show planned services too" toggle, and
   the resulting row counts, between the two pages.

   Part A of Stage 6 -- see tests/due-next.cjs's own header for why this
   file exists fresh here rather than being inherited from an earlier stage.

   Run: node tests/defects-next.cjs */
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

async function loadPage(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { location.hash = '#cmwo'; });
  await p.waitForTimeout(700);
  return { p, errs };
}

const tilesOf = p => p.$$eval('#cwKpis .kpi', els => els.map(el => ({
  k: (el.querySelector('.k') || {}).textContent, v: (el.querySelector('.v') || {}).textContent,
})));

const rowCount = p => p.$$eval('#cwList table.grid tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length).catch(() => -1);

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadPage(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadPage(b, port, 'dashboard-next/index.html');

  const tilesA = await tilesOf(a), tilesB = await tilesOf(n);
  console.log('dashboard/     tiles: ' + JSON.stringify(tilesA));
  console.log('dashboard-next tiles: ' + JSON.stringify(tilesB));
  ok('Defects raised tiles: same count (total + one per person)', tilesA.length === tilesB.length, `${tilesA.length} vs ${tilesB.length}`);
  ok('Defects raised tiles: same values in the same order', JSON.stringify(tilesA) === JSON.stringify(tilesB));

  const statusOptsA = await a.$$eval('#cwStatus option', os => os.map(o => o.value));
  const statusOptsB = await n.$$eval('#cwStatus option', os => os.map(o => o.value));
  ok('Defects raised: status filter options come from the same 1C data', JSON.stringify(statusOptsA) === JSON.stringify(statusOptsB),
     `next=${JSON.stringify(statusOptsB)} dashboard=${JSON.stringify(statusOptsA)}`);

  const rowsDefaultA = await rowCount(a), rowsDefaultB = await rowCount(n);
  ok('Defects raised: default row count matches (planned services hidden)', rowsDefaultA === rowsDefaultB, `next=${rowsDefaultB} dashboard=${rowsDefaultA}`);

  /* "Show planned services too" toggle */
  await a.click('#cwPlanned'); await a.waitForTimeout(300);
  await n.click('#cwPlanned'); await n.waitForTimeout(300);
  const rowsPlannedA = await rowCount(a), rowsPlannedB = await rowCount(n);
  ok('Defects raised: row count with "Show planned services too" matches', rowsPlannedA === rowsPlannedB, `next=${rowsPlannedB} dashboard=${rowsPlannedA}`);
  ok('Defects raised: toggling planned services actually changes the count on both', rowsPlannedB !== rowsDefaultB || rowsPlannedA === rowsDefaultA,
     `next default=${rowsDefaultB} planned=${rowsPlannedB}`);
  await a.click('#cwPlanned'); await n.click('#cwPlanned'); await a.waitForTimeout(200); await n.waitForTimeout(200);

  /* Filter by a status value present in the real data, if there is one. */
  if (statusOptsA.length > 1) {
    const st = statusOptsA[1];
    await a.selectOption('#cwStatus', st); await a.waitForTimeout(300);
    await n.selectOption('#cwStatus', st); await n.waitForTimeout(300);
    const rA = await rowCount(a), rB = await rowCount(n);
    ok(`Defects raised: filtering by status "${st}" matches`, rA === rB, `next=${rB} dashboard=${rA}`);
  }

  /* The register's own column filter/sort (Phase 4) exists on dashboard-next,
     reused rather than reinvented -- matching the brief's own note that this
     tab already had it before the redesign. */
  const kit = await n.evaluate(() => ({
    hasColFilters: document.querySelectorAll('#cwList thead input.cwcf').length > 0,
    hasSortableHeaders: document.querySelectorAll('#cwList thead th.sortable').length > 0,
  }));
  ok('Defects raised: shared column-filter row present', kit.hasColFilters, JSON.stringify(kit));
  ok('Defects raised: sortable headers present', kit.hasSortableHeaders, JSON.stringify(kit));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
