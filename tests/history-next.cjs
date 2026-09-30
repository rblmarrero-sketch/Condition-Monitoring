/* EQUIPMENT HISTORY, ON /dashboard-next/, CHECKED AGAINST THE REAL /dashboard/
   FOR THE SAME UNDERLYING DATA.

   Same technique as the other -next.cjs parity suites (see actions-next.cjs's
   own header comment): the identical fixture goes into the untouched
   /dashboard/index.html and into /dashboard-next/index.html, the Equipment
   History tab is opened on both for the same unit, and the row count, the
   round-by-round tk*-kit table, and the List/Photos toggle are compared.
   Nothing here recomputes a count by hand -- every figure comes straight off
   histRecs()/renderHistList(), which both pages share unmodified.

   Run: node tests/history-next.cjs */
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
const UNIT = 'TK001';

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
  await a.evaluate(() => { location.hash = '#equipment'; });
  await a.waitForTimeout(400);
  await a.evaluate(u => { const s = document.getElementById('equipSel'); s.value = u; s.dispatchEvent(new Event('change')); }, UNIT);
  await a.waitForTimeout(600);
  const baseCount = await a.evaluate(u => window.histRecs ? window.histRecs(u).length : -1, UNIT);
  const baseRows = await a.$$eval('#history table.grid tbody tr', els => els.length).catch(() => -1);

  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]').catch(() => {});
  await n.waitForTimeout(300);
  await n.evaluate(() => { location.hash = '#equipment'; });
  await n.waitForTimeout(400);
  await n.evaluate(u => { const s = document.getElementById('equipSel'); s.value = u; s.dispatchEvent(new Event('change')); }, UNIT);
  await n.waitForTimeout(600);
  const nextCount = await n.evaluate(u => window.histRecs ? window.histRecs(u).length : -1, UNIT);
  const nextRows = await n.$$eval('#history table.grid tbody tr', els => els.length).catch(() => -1);

  console.log(`dashboard/     ${UNIT}: histRecs=${baseCount} rows=${baseRows}`);
  console.log(`dashboard-next ${UNIT}: histRecs=${nextCount} rows=${nextRows}`);

  ok('dashboard-next shows the same number of inspections for the unit as /dashboard/',
     nextCount === baseCount && nextCount > 0, `next=${nextCount} dashboard=${baseCount}`);
  ok('dashboard-next lists the same number of round rows in the tk-kit table',
     nextRows === baseRows && nextRows > 0, `next=${nextRows} dashboard=${baseRows}`);

  /* ── page shell (brief §4/§5): page header, filter/picker field ─────────── */
  const shell = await n.evaluate(() => ({
    hasPagehd: !!document.querySelector('#tab-equipment .pagehd h1'),
    hasCombobox: !!document.getElementById('equipSel'),
    hasFilterInput: !!document.getElementById('equipQ'),
  }));
  ok('page header renders (.pagehd h1)', shell.hasPagehd);
  ok('equipment combobox renders', shell.hasCombobox);
  ok('machine filter box renders', shell.hasFilterInput);

  /* ── the tk* kit on the round-by-round table, not a bespoke component ───── */
  const kit = await n.evaluate(() => ({
    hasSortableHeaders: document.querySelectorAll('#history table.grid thead th.sortable').length > 0,
  }));
  ok('the history table has the shared table-kit sortable headers', kit.hasSortableHeaders);

  /* ── List/Photos view toggle switches views (brief: "machine-search
     combobox, List/Photos view toggle" documented in CLAUDE.md) ──────────── */
  await n.click('#histView button[data-hv="photo"]');
  await n.waitForTimeout(400);
  const photoView = await n.evaluate(() => ({
    photoOn: document.querySelector('#histView button[data-hv="photo"]').classList.contains('on'),
    hasPosGrid: !!document.querySelector('#history .insp, #history .pos-grid, #history .pos'),
  }));
  ok('Photos view toggle switches the active button', photoView.photoOn, JSON.stringify(photoView));
  await n.click('#histView button[data-hv="list"]');
  await n.waitForTimeout(300);
  const listView = await n.evaluate(() => document.querySelector('#histView button[data-hv="list"]').classList.contains('on'));
  ok('switching back to List restores the tk-kit table view', listView);

  /* ── CLAUDE.md: "Equipment History was investigated and deliberately left
     out" of the CROSS-TABLE cwColQ pattern -- renderHistList() builds one
     <table class="grid"> PER VISIT (one per inspection), each with its own
     independent tk-kit filter row scoped to that one round's own positions.
     There is no page-wide search box narrowing every visit's table at once;
     the count of independent per-visit tables must equal the inspection
     count. ─────────────────────────────────────────────────────────────── */
  const perVisit = await n.evaluate(() => ({
    tables: document.querySelectorAll('#history table.grid').length,
    pageWideSearch: !!document.getElementById('cwColQ'),
  }));
  ok('one independent tk-kit table per visit (no single cross-table search box)',
     perVisit.tables === nextCount && !perVisit.pageWideSearch, JSON.stringify(perVisit));

  /* ── report button on the machine card ───────────────────────────────── */
  const rptBtn = await n.evaluate(() => !!document.getElementById('histRpt'));
  ok('"Report on this machine" button renders', rptBtn);

  /* ── no sideways scroller at 1366px ─────────────────────────────────────── */
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-equipment .tblwrap, #tab-equipment table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Equipment History at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
