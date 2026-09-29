/* PLAN VS ACTUAL, ON /dashboard-next/, CHECKED AGAINST THE REAL /dashboard/
   FOR THE SAME UNDERLYING DATA.

   Same technique as tests/due-next.cjs. Plan vs Actual reads two sources:
   the fixture RECS (via window.CMDash.setDriveRecords, same as every other
   *-next.cjs suite) AND window.CM_WO_DATA, which both /dashboard/index.html
   and /dashboard-next/index.html load from the SAME real, generated
   data/work_orders.js file at the same relative path -- so no separate 1C
   fixture is needed for parity: both pages see the identical live export.

   Compares all six tiles Plan.dc.html asks for (Open work orders / General
   Inspection due soon / On time / Late or early / No CM round / Held off),
   by label, against the untouched /dashboard/'s own tiles, plus the table's
   default row count. Also proves, on dashboard-next alone: six tiles render,
   the CM-coverage checkbox and its standing percentage line, the Open /
   Completed / All segmented control, the two-week grid, and the shared
   tk*-style table kit.

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

const tileMap = async p => p.$$eval('#paKpis .kpi, #paKpis .tile', els => {
  const m = {};
  els.forEach(el => {
    const k = el.querySelector('.k'), v = el.querySelector('.v');
    if (k && v) m[k.textContent.trim().toLowerCase()] = v.textContent.trim();
  });
  return m;
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch({ args: ['--ignore-certificate-errors'] });

  const ctxA = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const a = await ctxA.newPage();
  const errsA = []; a.on('pageerror', e => errsA.push(e.message));
  await a.goto(`http://127.0.0.1:${port}/dashboard/index.html`, { waitUntil: 'load' });
  await a.waitForTimeout(1500);
  await a.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await a.waitForTimeout(1200);
  await a.evaluate(() => { location.hash = '#planact'; });
  await a.waitForTimeout(800);
  const baseline = { tiles: await tileMap(a),
    rows: await a.$$eval('#paList tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]').catch(() => {});
  await n.waitForTimeout(400);
  await n.evaluate(() => { location.hash = '#planact'; });
  await n.waitForTimeout(800);
  const next = { tiles: await tileMap(n),
    rows: await n.$$eval('#paList tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  console.log('dashboard/     tiles: ' + JSON.stringify(baseline.tiles) + '  rows=' + baseline.rows);
  console.log('dashboard-next tiles: ' + JSON.stringify(next.tiles) + '  rows=' + next.rows);

  for (const label of Object.keys(next.tiles)) {
    ok(`KPI parity: "${label}" matches live /dashboard/`,
      baseline.tiles[label] !== undefined && next.tiles[label] === baseline.tiles[label],
      `next=${next.tiles[label]} dashboard=${baseline.tiles[label]}`);
  }
  ok('KPI parity: dashboard-next renders exactly 6 tiles (Plan.dc.html)', Object.keys(next.tiles).length === 6, JSON.stringify(next.tiles));
  ok('KPI parity: default table row count matches', next.rows === baseline.rows, `next=${next.rows} dashboard=${baseline.rows}`);

  /* ── CM-coverage checkbox, the standing percentage, Open/Completed/All ─── */
  const controls = await n.evaluate(() => ({
    cmOnly: !!document.getElementById('paCmOnly'),
    coverageText: (document.getElementById('paCoverage') || {}).textContent || '',
    segViews: [...document.querySelectorAll('#paSeg [role="tab"]')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    hasWeekGrid: !!document.getElementById('paWeek') && document.getElementById('paWeek').children.length > 0,
  }));
  ok('CM-coverage checkbox present', controls.cmOnly, JSON.stringify(controls));
  ok('coverage percentage line is stated', /%/.test(controls.coverageText), controls.coverageText);
  ok('Open / Completed / All segmented control has 3 views', controls.segViews.length === 3, JSON.stringify(controls.segViews));
  ok('the two-week grid renders', controls.hasWeekGrid, JSON.stringify(controls));

  /* ── the table still uses the shared tk*-style column filter/sort kit ──── */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#paList thead input').length > 0,
    hasSortableHeaders: document.querySelectorAll('#paList thead th.sortable').length > 0,
  }));
  ok('the plan-vs-actual table has a filter row', kit.hasFilterBoxes, JSON.stringify(kit));
  ok('the plan-vs-actual table has sortable headers', kit.hasSortableHeaders, JSON.stringify(kit));

  /* ── no pill background on the status cell (CLAUDE.md: status is text) ─── */
  const pill = await n.evaluate(() => {
    const cells = [...document.querySelectorAll('#paList td b')];
    if (!cells.length) return { n: 0 };
    const cs = getComputedStyle(cells[0]);
    return { n: cells.length, bg: cs.backgroundColor, br: cs.borderRadius };
  });
  ok('status cell carries no pill background', pill.n === 0 || /rgba\(0, 0, 0, 0\)|transparent/.test(pill.bg), JSON.stringify(pill));

  /* ── no sideways scroller on the whole Plan vs Actual tab at 1366px ────── */
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-planact .tblwrap, #tab-planact table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Plan vs Actual at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
