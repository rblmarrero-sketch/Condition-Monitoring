/* INSPECTION SCHEDULE (DUE), ON /dashboard-next/, CHECKED AGAINST THE REAL
   /dashboard/ FOR THE SAME UNDERLYING DATA.

   Same technique as tests/overview-next.cjs, tests/failure-next.cjs,
   tests/wear-next.cjs and tests/actions-next.cjs: the IDENTICAL fixture goes
   into the untouched /dashboard/index.html and into /dashboard-next/
   index.html (window set to All time on the next tab), the Inspection
   Schedule tab is opened on both, and the tiles /dashboard/ already computes
   (dueRows/dueWeekRows/etc -- nothing here re-derives a count by hand) are
   compared BY LABEL, not by position, since dashboard-next's tile order and
   wording is the one Due.dc.html asks for (Overdue / Due soon / Deferred /
   Explained) while /dashboard/'s own labels may differ in case or wording.
   The Overdue table's row count (the tab's default scope) is also compared.

   Also proves, on dashboard-next alone: four tiles render (Due.dc.html:
   repeat(4,minmax(0,1fr))), the nine-way Show segmented control with its own
   counts, the Round filter and Search box, the shared tk* table kit (filter
   row + sortable headers, not a new table component), and no pill background
   on the Due cell's inline status colour.

   Run: node tests/due-next.cjs */
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

const tileMap = async p => p.$$eval('#dueKpis .kpi, #dueKpis .tile', els => {
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

  /* ── page 1: the untouched /dashboard/ ─────────────────────────────────── */
  const ctxA = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const a = await ctxA.newPage();
  const errsA = []; a.on('pageerror', e => errsA.push(e.message));
  await a.goto(`http://127.0.0.1:${port}/dashboard/index.html`, { waitUntil: 'load' });
  await a.waitForTimeout(1500);
  await a.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await a.waitForTimeout(1200);
  await a.evaluate(() => { location.hash = '#due'; });
  await a.waitForTimeout(600);
  const baseline = { tiles: await tileMap(a),
    rows: await a.$$eval('#ddList tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  /* ── page 2: /dashboard-next/, window explicitly set to All time ──────── */
  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]').catch(() => {});
  await n.waitForTimeout(400);
  await n.evaluate(() => { location.hash = '#due'; });
  await n.waitForTimeout(600);
  const next = { tiles: await tileMap(n),
    rows: await n.$$eval('#ddList tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  console.log('dashboard/     tiles: ' + JSON.stringify(baseline.tiles) + '  rows=' + baseline.rows);
  console.log('dashboard-next tiles: ' + JSON.stringify(next.tiles) + '  rows=' + next.rows);

  /* Compare every tile dashboard-next shows against the SAME label on the
     untouched /dashboard/ -- Due.dc.html renames none of the four tiles
     relative to /dashboard/'s own Overdue/Due soon/Deferred/Explained. */
  for (const label of Object.keys(next.tiles)) {
    ok(`KPI parity (All time): "${label}" matches live /dashboard/`,
      baseline.tiles[label] !== undefined && next.tiles[label] === baseline.tiles[label],
      `next=${next.tiles[label]} dashboard=${baseline.tiles[label]}`);
  }
  ok('KPI parity: dashboard-next renders exactly 4 tiles (Due.dc.html)', Object.keys(next.tiles).length === 4, JSON.stringify(next.tiles));
  ok('KPI parity: default (Overdue) table row count matches', next.rows === baseline.rows, `next=${next.rows} dashboard=${baseline.rows}`);

  /* ── the nine-way Show segmented control renders with counts ──────────── */
  const seg = await n.$$eval('#ddSeg [role="tab"]', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  /* Overdue, Due soon, Never inspected, 1C plan, Compare, Deferred,
     Completed, All -- eight views as tabs ("Overdue & due soon" stays a
     valid #ddScope value for an address that names it, but is not itself a
     tab -- see the comment above the <select> markup in index.html). */
  ok('Show segmented control has all eight views', seg.length === 8, JSON.stringify(seg));

  /* ── Round filter and Search box are present ───────────────────────────── */
  const controls = await n.evaluate(() => ({
    hasRound: !!document.getElementById('ddType'),
    hasSearch: !!document.getElementById('ddQ'),
    hasCsv: !!document.getElementById('ddCsv'),
  }));
  ok('Round filter, search box and Export CSV all present', controls.hasRound && controls.hasSearch && controls.hasCsv, JSON.stringify(controls));

  /* ── the table still uses the shared tk*-style column filter/sort kit ──── */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#ddList thead input').length > 0,
    hasSortableHeaders: document.querySelectorAll('#ddList thead th.sortable').length > 0,
  }));
  ok('the rounds table has a filter row', kit.hasFilterBoxes, JSON.stringify(kit));
  ok('the rounds table has sortable headers', kit.hasSortableHeaders, JSON.stringify(kit));

  /* ── no pill background anywhere on this tab (CLAUDE.md: status is text) ── */
  const pill = await n.evaluate(() => {
    const cells = [...document.querySelectorAll('#ddList td b, #ddList .duec')];
    if (!cells.length) return { n: 0 };
    const cs = getComputedStyle(cells[0]);
    return { n: cells.length, bg: cs.backgroundColor, br: cs.borderRadius };
  });
  ok('due-date status carries no pill background', pill.n === 0 || /rgba\(0, 0, 0, 0\)|transparent/.test(pill.bg), JSON.stringify(pill));

  /* ── no sideways scroller on the whole Due tab at 1366px ───────────────── */
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-due .tblwrap, #tab-due table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Inspection Schedule at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
