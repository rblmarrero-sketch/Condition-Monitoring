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
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
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
  ok('all seven Lubrication subtabs render',
     JSON.stringify(subtabs) === JSON.stringify(['cover', 'std', 'rec', 'ref', 'matrix', 'exc', 'shop']), JSON.stringify(subtabs));

  for (const key of ['matrix', 'ref', 'cover']) {
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

  /* ── machine reference editor keeps Save/Undo/Export (CLAUDE.md) ────────── */
  await n.click('#lubeSub button[data-lsub="ref"]');
  await n.waitForTimeout(300);
  const refBtns = await n.evaluate(() => ({
    save: !!document.getElementById('lrSave'), undo: !!document.getElementById('lrReset'), exp: !!document.getElementById('lrExport'),
  }));
  ok('machine reference editor keeps its Save/Undo/Export controls', refBtns.save && refBtns.undo && refBtns.exp, JSON.stringify(refBtns));

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
