/* DEFECTS RAISED, ON /dashboard-next/, CHECKED AGAINST THE REAL /dashboard/
   FOR THE SAME UNDERLYING DATA.

   Same technique as tests/plan-next.cjs: this tab reads window.CM_WO_DATA,
   which both pages load from the SAME real, generated data/work_orders.js
   file, so the total and per-person counts are compared directly against
   the untouched /dashboard/'s own numbers with no separate 1C fixture.

   Compares the "Defects raised" total tile and every by-person count
   (Defects.dc.html: one hero tile + a "By person" panel of pill buttons,
   not six identical cards) against /dashboard/'s own numbers, plus the
   table's default row count. Also proves, on dashboard-next alone: the
   by-person panel sits beside the tile (not six equal cards), the Status
   filter, search box and "show planned services too" checkbox are present,
   clicking a person's name narrows the table, and the shared tk*-style
   table kit (filter row + sortable headers).

   Run: node tests/defects-next.cjs */
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

/* dashboard/ renders every person as an equal .kpi card, same as the total;
   dashboard-next renders one hero .kpi (total) + a .cwpeople panel of
   .cwpbtn pills. Read both shapes into one {name: count} map so the SAME
   comparison works against either page. */
const peopleMap = async p => p.evaluate(() => {
  const m = {};
  document.querySelectorAll('#cwKpis .kpi[data-cwwho], #cwKpis .cwpbtn[data-cwwho]').forEach(el => {
    m[el.dataset.cwwho] = (el.querySelector('.v, .n') || {}).textContent.trim();
  });
  return m;
});
const totalOf = p => p.$eval('#cwKpis .kpi .v, #cwKpis .v', el => el.textContent.trim()).catch(() => null);

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
  await a.evaluate(() => { location.hash = '#cmwo'; });
  await a.waitForTimeout(800);
  const baseline = { total: await totalOf(a), people: await peopleMap(a),
    rows: await a.$$eval('#cwList tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  const ctxB = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const n = await ctxB.newPage();
  const errsB = []; n.on('pageerror', e => errsB.push(e.message));
  await n.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await n.waitForTimeout(1500);
  await n.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await n.waitForTimeout(1200);
  await n.click('#winTog button[data-win="0"]').catch(() => {});
  await n.waitForTimeout(400);
  await n.evaluate(() => { location.hash = '#cmwo'; });
  await n.waitForTimeout(800);
  const next = { total: await totalOf(n), people: await peopleMap(n),
    rows: await n.$$eval('#cwList tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length) };

  console.log('dashboard/     total=' + baseline.total + ' people=' + JSON.stringify(baseline.people) + ' rows=' + baseline.rows);
  console.log('dashboard-next total=' + next.total + ' people=' + JSON.stringify(next.people) + ' rows=' + next.rows);

  ok('KPI parity: "Defects raised" total matches live /dashboard/', next.total === baseline.total, `next=${next.total} dashboard=${baseline.total}`);
  for (const person of Object.keys(next.people)) {
    ok(`KPI parity: "${person}"'s count matches live /dashboard/`,
      baseline.people[person] !== undefined && next.people[person] === baseline.people[person],
      `next=${next.people[person]} dashboard=${baseline.people[person]}`);
  }
  ok('KPI parity: same set of people shown', Object.keys(next.people).sort().join(',') === Object.keys(baseline.people).sort().join(','),
    `next=${Object.keys(next.people)} dashboard=${Object.keys(baseline.people)}`);
  ok('KPI parity: default table row count matches', next.rows === baseline.rows, `next=${next.rows} dashboard=${baseline.rows}`);

  /* ── Defects.dc.html's own shape: one hero tile + a by-person panel ────── */
  const shape = await n.evaluate(() => {
    const kids = [...document.getElementById('cwKpis').children];
    return { n: kids.length, classes: kids.map(k => k.className) };
  });
  ok('cwKpis is a 2-cell grid (hero tile + by-person panel), not one card per person',
    shape.n === 2 && /kpi/.test(shape.classes[0]) && /cwpeople/.test(shape.classes[1]), JSON.stringify(shape));

  /* ── Status filter, search box, "show planned services too" checkbox ──── */
  const controls = await n.evaluate(() => ({
    hasStatus: !!document.getElementById('cwStatus'),
    hasSearch: !!document.getElementById('cwQ'),
    hasPlanned: !!document.getElementById('cwPlanned'),
    hasCsv: !!document.getElementById('cwCsv'),
  }));
  ok('Status filter, search, "show planned services too" and Export CSV all present',
    controls.hasStatus && controls.hasSearch && controls.hasPlanned && controls.hasCsv, JSON.stringify(controls));

  /* ── clicking a person's name narrows the table ────────────────────────── */
  const firstPerson = Object.keys(next.people).find(p => parseInt(next.people[p], 10) > 0);
  if (firstPerson) {
    await n.click(`#cwKpis [data-cwwho="${firstPerson}"]`);
    await n.waitForTimeout(400);
    const narrowedRows = await n.$$eval('#cwList tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length);
    const expected = parseInt(next.people[firstPerson], 10);
    ok(`pressing "${firstPerson}" narrows the table to their own defects`,
      narrowedRows <= next.rows && narrowedRows > 0, `narrowed=${narrowedRows} of ${next.rows}, person total=${expected}`);
    await n.click(`#cwKpis [data-cwwho="${firstPerson}"]`);
    await n.waitForTimeout(300);
  }

  /* ── the table still uses the shared tk*-style column filter/sort kit ──── */
  const kit = await n.evaluate(() => ({
    hasFilterBoxes: document.querySelectorAll('#cwList thead input').length > 0,
    hasSortableHeaders: document.querySelectorAll('#cwList thead th.sortable').length > 0,
  }));
  ok('the defect work-orders table has a filter row', kit.hasFilterBoxes, JSON.stringify(kit));
  ok('the defect work-orders table has sortable headers', kit.hasSortableHeaders, JSON.stringify(kit));

  /* ── no pill background on the status cell (CLAUDE.md: status is text) ─── */
  const pill = await n.evaluate(() => {
    const cells = [...document.querySelectorAll('#cwList td b')];
    if (!cells.length) return { n: 0 };
    const cs = getComputedStyle(cells[0]);
    return { n: cells.length, bg: cs.backgroundColor, br: cs.borderRadius };
  });
  ok('status cell carries no pill background', pill.n === 0 || /rgba\(0, 0, 0, 0\)|transparent/.test(pill.bg), JSON.stringify(pill));

  /* ── no sideways scroller on the whole Defects tab at 1366px ───────────── */
  const scrollers = await n.evaluate(() => [...document.querySelectorAll('#tab-cmwo .tblwrap, #tab-cmwo table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Defects raised at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
