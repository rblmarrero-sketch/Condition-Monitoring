/* THE PLAN VS ACTUAL TAB, ON /dashboard-next/, CHECKED AGAINST THE REAL
   /dashboard/ FOR THE SAME UNDERLYING DATA (RECS from the fixture, 1C's
   own plan from the live data/work_orders.js both pages load identically).

   Same technique as tests/overview-next.cjs, tests/due-next.cjs: identical
   fixture into both pages, diff the six KPI tiles, the three named views
   (Open/Completed/All), the CM-coverage toggle and the fortnight-grid
   presence, row by row.

   Part A of Stage 6 — see tests/due-next.cjs's own header for why this file
   exists fresh here rather than being inherited from an earlier stage.

   Run: node tests/plan-next.cjs */
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

async function loadPage(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);
  await p.evaluate(() => { location.hash = '#planact'; });
  await p.waitForTimeout(600);
  return { p, errs };
}

const tilesOf = p => p.$$eval('#paKpis .kpi', els => els.map(el => ({
  k: (el.querySelector('.k') || {}).textContent, v: (el.querySelector('.v') || {}).textContent,
})));

async function rowsFor(p, scope) {
  await p.evaluate(s => {
    const seg = document.getElementById('paSeg');
    const b = seg && seg.querySelector('[data-pa="' + s + '"]');
    if (b) b.click(); else if (window.paGo) window.paGo(s);
  }, scope);
  await p.waitForTimeout(250);
  return p.$$eval('#paList table.grid tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length).catch(() => -1);
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadPage(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadPage(b, port, 'dashboard-next/index.html');

  const tilesA = await tilesOf(a), tilesB = await tilesOf(n);
  console.log('dashboard/     tiles: ' + JSON.stringify(tilesA));
  console.log('dashboard-next tiles: ' + JSON.stringify(tilesB));
  ok('Plan vs Actual tiles: same count', tilesA.length === tilesB.length, `${tilesA.length} vs ${tilesB.length}`);
  ok('Plan vs Actual tiles: same values in the same order', JSON.stringify(tilesA) === JSON.stringify(tilesB));

  for (const s of ['open', 'done', 'all']) {
    const rA = await rowsFor(a, s), rB = await rowsFor(n, s);
    ok(`Plan vs Actual scope "${s}": row count matches live /dashboard/`, rA === rB, `next=${rB} dashboard=${rA}`);
  }

  /* CM coverage percentage line -- reads the same computed set on both pages. */
  const covA = await a.$eval('#paCoverage', el => el.textContent.trim()).catch(() => '');
  const covB = await n.$eval('#paCoverage', el => el.textContent.trim()).catch(() => '');
  ok('Plan vs Actual: CM coverage line matches', covA === covB, `next="${covB}" dashboard="${covA}"`);

  /* Fortnight grid (paWeek) presence/row-count -- same underlying rows. */
  const gridA = await a.$eval('#paWeek', el => el.children.length).catch(() => -1);
  const gridB = await n.$eval('#paWeek', el => el.children.length).catch(() => -1);
  ok('Plan vs Actual: fortnight grid renders the same number of day columns', gridA === gridB, `next=${gridB} dashboard=${gridA}`);

  /* Note: the Plan vs Actual status chip (stChip/svcCell) still uses the
     legacy .pill CSS class and the table still uses a horizontal
     scrollbox at 1366px on BOTH /dashboard/ and /dashboard-next/ — this is
     unchanged, pre-existing behavior inherited identically by this tab (not
     yet converted by any prior stage), confirmed by running the identical
     check against the untouched /dashboard/ before writing it here. It is
     reported as a Part A finding rather than asserted as a regression this
     suite should fail on. */
  const kit = await n.evaluate(() => ({ hasKpis: document.querySelectorAll('#paKpis .kpi').length === 6 }));
  ok('Plan vs Actual: six KPI tiles render (brief §13)', kit.hasKpis, JSON.stringify(kit));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
