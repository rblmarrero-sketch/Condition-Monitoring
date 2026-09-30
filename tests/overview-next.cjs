/* THE OVERVIEW SCREEN, ON /dashboard-next/, CHECKED AGAINST THE REAL
   /dashboard/ FOR THE SAME UNDERLYING DATA.

   Brief §5 + the task's own instruction: "every KPI number computed in the
   new Overview must equal the same KPI in the live /dashboard/ for the same
   underlying data. Do not re-derive counts by hand." This suite does not
   keep its own copy of what a Critical machine is — it loads the IDENTICAL
   fixture into both the untouched /dashboard/index.html and
   /dashboard-next/index.html (with the new 90-day window explicitly set to
   All time, since /dashboard/ has no window at all — that is the whole
   point of the parity check: with the window off, dashboard-next must read
   exactly what dashboard/ reads) and compares the six tile numbers, the
   header count and the attention table's row count, tile by tile.

   It also proves, on dashboard-next alone: the six required tiles render
   (brief §5.3), the sev=4 chip, the attention table still filters/sorts
   through the shared tk* kit (not a new table component), and no pill
   background survives on the Priority/grade cell (CLAUDE.md "DASHBOARD
   REDESIGN, PHASE 2": grade prints as plain bold text, only grade 5 takes
   colour — reused, not re-litigated).

   Self-contained, same harness as tests/tablekit-next.cjs.
   Run: node tests/overview-next.cjs */
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
   /mobile/sw.js and reloads the page the moment it reads "newer" -- which,
   since dashboard-next's own tag lags the mainline's constantly-bumped BUILD
   by design, it almost always does. A document-level click (capture phase)
   schedules that reload 300ms later, and a plain click on a button or row
   holds no focus busy() recognises, so nothing here held it back -- a real
   navigation mid-test, discarding whatever in-memory state (setDriveRecords,
   a CMDrive stub, window.__writes) the test had just set up. Confirmed via
   tests/period-filter-next.cjs's own investigation: the reload only shows up
   once enough wall-clock time has passed for look()'s first 4-second timer to
   have already fired before a later click, so it is a genuine, if timing-
   dependent, race -- not a one-off flake -- and it can hit ANY -next.cjs
   suite that clicks around dashboard-next without this mock. Pinning it to
   the page's own real (lower) tag makes `newer` false for the length of this
   run, for both pages -- dashboard/'s own identical self-update check reads
   the same mocked file and never sees a build higher than its own. */
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

const TILES = ['kpiCrit', 'kpiSev', 'kpiDeg', 'kpiOver', 'kpiAct', 'kpiNoown'];
const tileVals = async p => {
  const out = {};
  for (const id of TILES) out[id] = await p.$eval('#' + id + ' .v', el => el.textContent.trim()).catch(() => null);
  return out;
};

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  /* ── page 1: the untouched /dashboard/ ─────────────────────────────────── */
  const ctxA = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const a = await ctxA.newPage();
  const errsA = []; a.on('pageerror', e => errsA.push(e.message));
  await a.goto(`http://127.0.0.1:${port}/dashboard/index.html`, { waitUntil: 'load' });
  await a.waitForTimeout(1500);
  await a.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await a.waitForTimeout(1200);
  const baseline = { tiles: await tileVals(a), insp: await a.$eval('#kpiInsp .v', el => el.textContent.trim()),
    fleetRows: await a.$$eval('#fleetTbl tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  /* ── page 2: /dashboard-next/, window explicitly set to All time ──────── */
  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]');
  await n.waitForTimeout(600);
  const next = { tiles: await tileVals(n), insp: await n.$eval('#kpiInsp .v', el => el.textContent.trim()),
    fleetRows: await n.$$eval('#fleetTbl tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  console.log('dashboard/     tiles: ' + JSON.stringify(baseline.tiles) + '  insp=' + baseline.insp + '  fleetRows=' + baseline.fleetRows);
  console.log('dashboard-next tiles: ' + JSON.stringify(next.tiles) + '  insp=' + next.insp + '  fleetRows=' + next.fleetRows);

  for (const id of TILES) ok(`KPI parity (All time): ${id} matches live /dashboard/`, next.tiles[id] === baseline.tiles[id],
     `next=${next.tiles[id]} dashboard=${baseline.tiles[id]}`);
  ok('KPI parity: header inspection count matches', next.insp === baseline.insp, `next=${next.insp} dashboard=${baseline.insp}`);
  ok('KPI parity: attention table row count matches', next.fleetRows === baseline.fleetRows, `next=${next.fleetRows} dashboard=${baseline.fleetRows}`);

  /* ── six tiles render, with a number, a label and a plain-language cue ─── */
  const tileShape = await n.evaluate(ids => ids.map(id => {
    const el = document.getElementById(id);
    if (!el) return null;
    return { k: el.querySelector('.k').textContent.trim(), v: el.querySelector('.v').textContent.trim(), s: el.querySelector('.s').textContent.trim() };
  }), TILES);
  ok('all six required tiles render with number + label + cue',
     tileShape.every(t => t && t.k && t.v !== '' && t.s !== ''), JSON.stringify(tileShape));

  /* ── sev=4 opens with a visible chip on Overview ───────────────────────── */
  await n.evaluate(() => { location.hash = '#overview?sev=4'; });
  await n.waitForTimeout(500);
  const chip = await n.$$eval('#chips .chip', els => els.map(e => e.textContent.trim()).join(' | '));
  ok('#overview?sev=4 shows a visible chip on the rebuilt Overview', /4/.test(chip), chip);
  await n.evaluate(() => { location.hash = '#overview'; });
  await n.waitForTimeout(400);

  /* ── the attention table still uses the shared tk* kit, not a new one ──── */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#fleetTbl thead input.cwcf').length > 0,
    hasSortableHeaders: document.querySelectorAll('#fleetTbl thead th.sortable').length > 0,
  }));
  ok('the attention table has the shared table-kit filter row', kit.hasFilterBoxes, JSON.stringify(kit));
  ok('the attention table has the shared table-kit sortable headers', kit.hasSortableHeaders, JSON.stringify(kit));

  /* ── no pill background on the grade/priority cell (Phase 2 rule reused) ── */
  const sevtxt = await n.evaluate(() => {
    const cells = [...document.querySelectorAll('#fleetTbl .sevtxt')];
    if (!cells.length) return { n: 0 };
    const cs = getComputedStyle(cells[0]);
    return { n: cells.length, bg: cs.backgroundColor, br: cs.borderRadius, pad: cs.padding };
  });
  ok('grade/priority cell carries no pill background, radius or padding',
     sevtxt.n === 0 || (/rgba\(0, 0, 0, 0\)|transparent/.test(sevtxt.bg) && sevtxt.br === '0px' && sevtxt.pad === '0px'),
     JSON.stringify(sevtxt));

  /* ── no sideways scroller on the whole Overview tab at 1366px ──────────── */
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-overview .tblwrap, #tab-overview table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Overview at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
