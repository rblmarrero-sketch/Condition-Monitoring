/* THE INSPECTION SCHEDULE (DUE) TAB, ON /dashboard-next/, CHECKED AGAINST
   THE REAL /dashboard/ FOR THE SAME UNDERLYING DATA.

   Same technique as tests/overview-next.cjs and tests/history-next.cjs:
   load the IDENTICAL fixture into the untouched /dashboard/index.html and
   into /dashboard-next/index.html, and diff every KPI tile and the row
   count of every one of the six named views (Overdue, Due soon, Never
   inspected, Deferred, Completed, All) between the two pages. Both pages
   read the same live data/work_orders.js for 1C's own plan (see
   CLAUDE.md's "1C plan"/"Compare" scopes), so those two scopes are
   diffed too.

   Part A of Stage 6: this suite was reported written on the (separate,
   unmerged) Stage 4 branch/PR but never actually committed there, and does
   not exist on this branch's own lineage (Stage 3e -> Stage 5 -> Stage 6).
   Written fresh here, following overview-next.cjs's own pattern exactly.

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

const SCOPES = ['over', 'soon', 'never', 'plan', 'cmp', 'put', 'done', 'all'];

async function loadPage(b, port, url, vp) {
  const ctx = await b.newContext({ viewport: vp || { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);
  return { p, errs };
}

async function tilesOf(p) {
  return p.$$eval('#dueKpis .kpi', els => els.map(el => ({
    k: (el.querySelector('.k') || {}).textContent, v: (el.querySelector('.v') || {}).textContent,
  })));
}
async function rowsFor(p, scope) {
  await p.evaluate(s => {
    const sel = document.getElementById('ddScope'); if (sel) sel.value = s;
    const seg = document.getElementById('ddSeg');
    const b = seg && seg.querySelector('[data-dd="' + s + '"]'); if (b) b.click();
    if (window.renderDueTab) window.renderDueTab();
  }, scope);
  await p.waitForTimeout(250);
  return p.$$eval('#ddList table.grid tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length).catch(() => -1);
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadPage(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadPage(b, port, 'dashboard-next/index.html');

  await a.evaluate(() => { location.hash = '#due'; }); await a.waitForTimeout(500);
  await n.evaluate(() => { location.hash = '#due'; }); await n.waitForTimeout(500);

  const tilesA = await tilesOf(a), tilesB = await tilesOf(n);
  console.log('dashboard/     tiles: ' + JSON.stringify(tilesA));
  console.log('dashboard-next tiles: ' + JSON.stringify(tilesB));
  ok('Due tiles: same count of tiles', tilesA.length === tilesB.length, `${tilesA.length} vs ${tilesB.length}`);
  ok('Due tiles: same values in the same order', JSON.stringify(tilesA) === JSON.stringify(tilesB));

  for (const s of SCOPES) {
    const rA = await rowsFor(a, s), rB = await rowsFor(n, s);
    ok(`Due scope "${s}": row count matches live /dashboard/`, rA === rB, `next=${rB} dashboard=${rA}`);
  }

  /* Presentation-only checks on dashboard-next alone, matching the styled
     shape every other converted tab already has (CLAUDE.md "Phase 4",
     Stage 5's own pattern). */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#ddList thead input.cwcf').length >= 0, // filter row is optional per-scope shape
    hasKpis: document.querySelectorAll('#dueKpis .kpi').length >= 4,
    noPillOnGrade: [...document.querySelectorAll('#ddList .pill')].length === 0,
  }));
  ok('Due: at least four KPI tiles render', kit.hasKpis, JSON.stringify(kit));
  ok('Due: no pill-background chips left in the list (coloured text only)', kit.noPillOnGrade, JSON.stringify(kit));

  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-due .tblwrap, #tab-due table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Due at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
