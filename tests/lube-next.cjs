/* LUBRICATION, ON /dashboard-next/, CHECKED AGAINST THE REAL /dashboard/ FOR
   THE SAME UNDERLYING DATA.

   Same technique as the other -next.cjs parity suites (see actions-next.cjs's
   own header comment). CLAUDE.md documents this tab keeps seven subtabs
   (Programme coverage, Deciding the standard, Recommendations, Machine
   reference, Fleet matrix, Exceptions, Shop posters) rather than the
   mockup's separate-page layout -- so this suite proves the seven subtabs
   still work AND that every number they show equals lubeProgramme()'s own
   output, which both pages share unmodified. It also proves the new KPI
   tile row (Tile.dc.html's four tiles, added this stage) reads the same
   lubeProgramme() figures rather than a second, hand-kept copy.

   Run: node tests/lube-next.cjs */
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
  const baseP = await a.evaluate(() => window.lubeProgramme ? window.lubeProgramme() : null);

  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]').catch(() => {});
  await n.waitForTimeout(300);
  const nextP = await n.evaluate(() => window.lubeProgramme ? window.lubeProgramme() : null);

  console.log('dashboard/     lubeProgramme=' + JSON.stringify(baseP));
  console.log('dashboard-next lubeProgramme=' + JSON.stringify(nextP));
  ok('lubeProgramme() is identical between /dashboard/ and /dashboard-next/ for the same fixture',
     JSON.stringify(baseP) === JSON.stringify(nextP));

  await n.evaluate(() => { location.hash = '#lube'; });
  await n.waitForTimeout(500);

  /* ── the four KPI tiles, added this stage, read lubeProgramme() directly ─ */
  const tiles = await n.$$eval('#lubeKpis .kpi', els => els.map(el => ({
    k: (el.querySelector('.k') || {}).textContent && el.querySelector('.k').textContent.trim(),
    v: (el.querySelector('.v') || {}).textContent && el.querySelector('.v').textContent.trim(),
  })));
  ok('four KPI tiles render at the top of Lubrication (Tile.dc.html)', tiles.length === 4, JSON.stringify(tiles));
  const covTile = tiles.find(x => x.v === String(nextP.covered));
  ok('"Metrics covered" tile value equals lubeProgramme().covered', !!covTile, JSON.stringify(tiles) + ' expected ' + nextP.covered);
  const srcTile = tiles.find(x => x.v === String(nextP.refKnown));
  ok('"Sourced references" tile value equals lubeProgramme().refKnown', !!srcTile, JSON.stringify(tiles) + ' expected ' + nextP.refKnown);

  /* ── seven subtabs, roving-tabindex tablist (CLAUDE.md: kept as tabs, not
     the mockup's separate pages -- scrolling past six other views to reach
     the fleet matrix was the thing this shape was built to fix) ──────────── */
  const subtabs = await n.$$eval('#lubeSub button[data-lsub]', els => els.map(e => e.dataset.lsub));
  /* nine since 2026-10-04: the lube master's four panels (master, decide, oils, sample) replaced Standards and Machine reference */
  ok('all nine Lubrication subtabs render',
     JSON.stringify(subtabs) === JSON.stringify(['cover', 'master', 'decide', 'oils', 'sample', 'rec', 'matrix', 'exc', 'shop']), JSON.stringify(subtabs));

  for (const key of ['matrix', 'master', 'cover']) {
    await n.click(`#lubeSub button[data-lsub="${key}"]`);
    await n.waitForTimeout(300);
    const state = await n.evaluate(k => {
      const panel = document.getElementById('lsub-' + k);
      return { shown: panel && !panel.classList.contains('hidden'), selected: document.querySelector(`#lubeSub button[data-lsub="${k}"]`).getAttribute('aria-selected') };
    }, key);
    ok(`clicking the "${key}" subtab opens its panel`, state.shown && state.selected === 'true', JSON.stringify(state));
  }

  /* ── fleet matrix table renders with real rows, pages at 25 like every
     other table (CLAUDE.md: "there is no show all") ──────────────────────── */
  await n.click('#lubeSub button[data-lsub="matrix"]');
  await n.waitForTimeout(400);
  const mtx = await n.evaluate(() => ({
    rows: document.querySelectorAll('#lubeMtx tbody tr').length,
    pager: !!document.getElementById('lubeMtxPg') && document.getElementById('lubeMtxPg').textContent.length > 0,
  }));
  ok('fleet matrix table renders rows', mtx.rows > 0, JSON.stringify(mtx));
  ok('fleet matrix has a pager (never "show all")', mtx.pager, JSON.stringify(mtx));

  /* ── the machine reference is the lube master now (2026-10-04): it keeps
     save, undo and export — Save, Discard, Back to workbook, Excel out and in. */
  await n.click('#lubeSub button[data-lsub="master"]');
  await n.waitForTimeout(300);
  const refBtns = await n.evaluate(() => ({
    save: !!document.getElementById('lmxSaveM'), undo: !!document.getElementById('lmxUndoM'), back: !!document.getElementById('lmxRevM'),
    exp: !!document.getElementById('lmxXlOut'), imp: !!document.getElementById('lmxXlIn'),
  }));
  ok('the lube master keeps Save, Discard, Back-to-workbook and Excel export/import', refBtns.save && refBtns.undo && refBtns.back && refBtns.exp && refBtns.imp, JSON.stringify(refBtns));

  /* ── no sideways scroller at 1366px on the coverage view ─────────────────── */
  await n.click('#lubeSub button[data-lsub="cover"]');
  await n.waitForTimeout(300);
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-lube .tblwrap, #tab-lube table')]
    .filter(el => el.id !== 'lubeMtx' && el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Lubrication coverage view at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
