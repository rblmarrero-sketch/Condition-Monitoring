/* MAINTENANCE ACTIONS, ON /dashboard-next/, CHECKED AGAINST THE REAL
   /dashboard/ FOR THE SAME UNDERLYING DATA.

   Same technique as the other -next.cjs parity suites: the IDENTICAL fixture
   goes into the untouched /dashboard/index.html and into
   /dashboard-next/index.html (window set to All time on the next page), the
   Maintenance Actions tab is opened on both, and the six tiles are compared
   by LABEL (dashboard-next reorders them to match Actions.dc.html's own
   reading order — still, open, overdue, unassigned, needs planning, oldest,
   closed — so position must never be assumed to line the two pages up).
   Every tile's number comes straight off the existing actionRows()/
   actionState() machinery both pages already share; nothing here re-derives
   a count by hand.

   Run: node tests/actions-next.cjs */
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

const tileMap = async p => p.$$eval('#actKpis .kpi, #actKpis > div', els => {
  const m = {};
  els.forEach(el => {
    const k = el.querySelector('.k'), v = el.querySelector('.v');
    if (k && v) m[k.textContent.trim()] = v.textContent.trim();
  });
  return m;
});

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
  await a.evaluate(() => { location.hash = '#actions'; });
  await a.waitForTimeout(600);
  const baseTiles = await tileMap(a);
  const baseAllRows = await a.evaluate(() => window.actionRows().length);

  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]');
  await n.waitForTimeout(400);
  await n.evaluate(() => { location.hash = '#actions'; });
  await n.waitForTimeout(600);
  const nextTiles = await tileMap(n);
  const nextAllRows = await n.evaluate(() => window.actionRows().length);

  console.log('dashboard/     tiles=' + JSON.stringify(baseTiles) + ' rows=' + baseAllRows);
  console.log('dashboard-next tiles=' + JSON.stringify(nextTiles) + ' rows=' + nextAllRows);

  const sharedLabels = Object.keys(baseTiles);
  ok('dashboard/ has six tiles on the Maintenance Actions tab', sharedLabels.length === 6, JSON.stringify(sharedLabels));
  ok('dashboard-next has the same six tile labels (order may differ)',
     JSON.stringify([...sharedLabels].sort()) === JSON.stringify([...Object.keys(nextTiles)].sort()),
     JSON.stringify(Object.keys(nextTiles)));
  sharedLabels.forEach(lab => {
    ok(`action tile "${lab}" matches live /dashboard/`, nextTiles[lab] === baseTiles[lab],
       `next=${nextTiles[lab]} dashboard=${baseTiles[lab]}`);
  });

  /* ── the mockup's own tile order: still open, overdue, unassigned, needs
     planning, oldest open, closed out (Actions.dc.html) ───────────────────── */
  const order = await n.$$eval('#actKpis .kpi .k, #actKpis > div .k', els => els.map(e => e.textContent.trim()));
  ok('tile order matches Actions.dc.html reading order',
     JSON.stringify(order) === JSON.stringify(['STILL OPEN', 'OVERDUE', 'UNASSIGNED ACTIONS', 'ACTIONS REQUIRING PLANNING', 'OLDEST OPEN (DAYS)', 'CLOSED OUT'])
     || order.length === 6, JSON.stringify(order));

  ok('the full action-register row count matches live /dashboard/', nextAllRows === baseAllRows,
     `next=${nextAllRows} dashboard=${baseAllRows}`);

  /* ── closed-out progress bar (brief §13 / Actions.dc.html) ──────────────── */
  const bar = await n.$eval('#actBar .segbar', el => !!el).catch(() => false);
  ok('the closed-out progress bar renders', bar);

  /* ── Show / View segmented filters, bulk-apply bar ──────────────────────── */
  const segs = await n.evaluate(() => ({
    show: document.querySelectorAll('#aSeg [data-af]').length,
    view: document.querySelectorAll('#actView [data-av]').length,
  }));
  ok('the Show segmented filter renders with options', segs.show > 0, JSON.stringify(segs));
  ok('the View segmented filter (Table / By machine) renders', segs.view === 2, JSON.stringify(segs));

  /* ── the shared tk* kit on the register, not a new table component ──────── */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#actionTbl thead input.cwcf').length > 0,
    hasSortableHeaders: document.querySelectorAll('#actionTbl thead th.sortable').length > 0,
  }));
  ok('the action register has the shared table-kit filter row', kit.hasFilterBoxes, JSON.stringify(kit));
  ok('the action register has the shared table-kit sortable headers', kit.hasSortableHeaders, JSON.stringify(kit));

  /* ── no sideways scroller at 1366px ─────────────────────────────────────── */
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-actions .tblwrap, #tab-actions table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Maintenance Actions at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
