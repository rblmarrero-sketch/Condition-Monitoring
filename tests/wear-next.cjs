/* WEAR AND REMAINING LIFE, ON /dashboard-next/, CHECKED AGAINST THE REAL
   /dashboard/ FOR THE SAME UNDERLYING DATA.

   Same technique as tests/overview-next.cjs and tests/failure-next.cjs: the
   IDENTICAL fixture goes into the untouched /dashboard/index.html and into
   /dashboard-next/index.html (window set to All time on the next page), the
   Wear tab is opened on both, and the five tiles /dashboard/ already has are
   compared by their LABEL (never re-derived by hand) rather than by
   position, because dashboard-next adds a sixth tile ("Measured positions")
   ahead of them (brief §13 / Wear.dc.html: six tiles). The "all" table view
   row count is also compared.

   Run: node tests/wear-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
/* /mobile/sw.js is served here as a STATIC MOCK, pinned to dashboard-next's own
   live ?v= tag (read off the real file, never a copied-in number) -- the same
   fix tests/tablekit-scale-next.cjs and tests/period-filter-next.cjs already
   carry, for the identical reason: dashboard-next's own self-update watcher
   (BUILT/look()/applyIfIdle() near the end of the file) fetches the real
   /mobile/sw.js and reloads the page the moment it reads "newer". dashboard-
   next's own tag is now kept in the same BUILD lockstep dashboard/'s already
   is -- bump.cjs tracks both files, see CLAUDE.md's "TWO OFFICE DASHBOARDS,
   BOTH PERMANENT" entry -- but this mock stays as a backstop for the one
   moment that guarantee can still slip: between a mainline bump landing and
   dashboard-next's own tag catching up in the same commit, which is exactly
   the gap that produced this incident once already. A document-level click
   (capture phase)
   schedules that reload 300ms later, and a plain click on a button or row
   holds no focus busy() recognises, so nothing here held it back -- a real
   navigation mid-test, discarding whatever in-memory state (setDriveRecords,
   a CMDrive stub, window.__writes) the test had just set up. Confirmed via
   tests/period-filter-next.cjs's own investigation: the reload only shows up
   once enough wall-clock time has passed for look()'s first 4-second timer to
   have already fired before a later click, so it is a genuine, if timing-
   dependent, race -- not a one-off flake -- and it can hit ANY -next.cjs
   suite that clicks around dashboard-next without this mock. Pinning it to
   the page's own real tag (now always equal to BUILD, not lower by design)
   makes `newer` false for the length of this run, for both pages --
   dashboard/'s own identical self-update check reads the same mocked file
   and never sees a build higher than its own. */
const nextHtmlForSw = fs.readFileSync(path.join(ROOT, 'dashboard-next', 'index.html'), 'utf8');
const pinnedSwBuild = (nextHtmlForSw.match(/magnetic_plug\.js\?v=([^"&]+)/) || [])[1];
if (!pinnedSwBuild) throw new Error('could not read dashboard-next\'s own ?v= tag to pin the mobile/sw.js mock to');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(`const BUILD = "${pinnedSwBuild}";`); return; }
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});
const FLEET = JSON.parse(fs.readFileSync(path.join(__dirname, 'fleet-fixture.json'), 'utf8'));

/* Keyed lower-case: dashboard-next's stage 3b visual pass changed these
   labels from shouting caps ("AT OR PAST CONDEMN") to sentence case ("At or
   past condemn") to match Tile.dc.html -- a presentation change, not a
   meaning change, so the parity check below compares case-insensitively
   rather than by the exact string. The untouched /dashboard/ still renders
   upper case; this is the one place that difference is expected. */
const tileMap = async p => p.$$eval('#wearKpis .kpi, #wearKpis .tile', els => {
  const m = {};
  els.forEach(el => {
    const k = el.querySelector('.k'), v = el.querySelector('.v');
    if (k && v) m[k.textContent.trim().toLowerCase()] = v.textContent.trim();
  });
  return m;
});

const openAll = async (p, mode) => {
  await p.evaluate(() => { location.hash = '#wear'; });
  await p.waitForTimeout(500);
  if (mode) { await p.evaluate(m => { const el = document.getElementById('wBand'); if (el) el.value = m; }, mode); }
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
  await openAll(a);
  const baseTiles = await tileMap(a);
  await a.evaluate(() => { const el = document.getElementById('wBand'); if (el) { el.value = 'all'; window.renderWearTab && window.renderWearTab(); } });
  await a.waitForTimeout(300);
  /* The table is paginated (25 a page, like every other operational table on
     this dashboard — CLAUDE.md "Tests" §), so the row count that actually
     compares apples to apples is the full filtered set, not one page of it. */
  const baseAllRows = await a.evaluate(() => window.wearRows(window.filtered()).length);

  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]');
  await n.waitForTimeout(400);
  await openAll(n);
  const nextTiles = await tileMap(n);
  await n.click('#wearKpis [data-wgo="all"]');
  await n.waitForTimeout(300);
  const nextAllRows = await n.evaluate(() => window.wearRows(window.filtered()).length);
  const measuredTileVal = nextTiles['measured positions'];

  console.log('dashboard/     tiles=' + JSON.stringify(baseTiles) + ' allRows=' + baseAllRows);
  console.log('dashboard-next tiles=' + JSON.stringify(nextTiles) + ' allRows=' + nextAllRows);

  const sharedLabels = Object.keys(baseTiles);
  ok('dashboard/ has the five wear tiles this fixture always had', sharedLabels.length >= 5, JSON.stringify(sharedLabels));
  sharedLabels.forEach(lab => {
    ok(`wear tile "${lab}" matches live /dashboard/`, nextTiles[lab] === baseTiles[lab],
       `next=${nextTiles[lab]} dashboard=${baseTiles[lab]}`);
  });

  /* ── the sixth tile, brief §13 / Wear.dc.html ───────────────────────────── */
  ok('dashboard-next has a sixth "Measured positions" tile', measuredTileVal !== undefined, JSON.stringify(nextTiles));
  ok('"Measured positions" tile equals the All-mode row count', measuredTileVal === String(nextAllRows),
     `tile=${measuredTileVal} allRows=${nextAllRows}`);

  /* ── every measured position, all-time, matches /dashboard/ exactly ─────── */
  ok('the full measured-positions row count matches live /dashboard/', nextAllRows === baseAllRows,
     `next=${nextAllRows} dashboard=${baseAllRows}`);

  /* ── the shared tk* kit, not a new table component ──────────────────────── */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#wearTbl thead input.cwcf').length > 0,
    hasSortableHeaders: document.querySelectorAll('#wearTbl thead th.sortable').length > 0,
  }));
  ok('the measured-positions table has the shared table-kit filter row', kit.hasFilterBoxes, JSON.stringify(kit));
  ok('the measured-positions table has the shared table-kit sortable headers', kit.hasSortableHeaders, JSON.stringify(kit));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
