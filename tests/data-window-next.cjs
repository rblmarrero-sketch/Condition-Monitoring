/* THE DEFAULT 90-DAY DATA WINDOW, ON /dashboard-next/ ONLY.

   The scale finding (CLAUDE.md / redesign brief §9): rebuilding every screen
   on every refresh cost ~16 s at ~2,100 rounds. Recommendation: window the
   dashboard to the last 90 days by default, with an explicit "all time"
   load — and "All time" has to answer exactly what an unwindowed read
   already does, or a reliability engineer loses trust in every number on
   the page the first time the two disagree.

   This suite proves, against the real filtered()/RECS the app already
   keeps (never a re-derived copy — CLAUDE.md: "Tests must ask the app, not
   keep their own copy"):

     · the window is ON by default and set to 90 days;
     · it actually narrows what filtered()/the KPIs count, on a fixture
       whose dates span further back than 90 days from "today";
     · "All time" reproduces the exact unwindowed count — RECS.length under
       the default (no other) filters, which is what dashboard/index.html
       (no window feature at all) would show for the same data;
     · the choice survives a reload, the way cm_pa_cmonly/cm_dash_rlang do.

   Self-contained, same harness as tests/tablekit-next.cjs.
   Run: node tests/data-window-next.cjs */
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
const dates = FLEET.map(r => r.date).sort();
console.log(`fixture: ${FLEET.length} records, ${dates[0]} .. ${dates[dates.length - 1]}`);

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  /* No addInitScript clearing localStorage here — it would run again on the
     reload further down and silently wipe the very persistence it is meant
     to prove. A fresh browser context already starts with empty storage. */
  await p.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);

  /* ── on by default, at 90 days, with no reload yet ─────────────────────── */
  const boot = await p.evaluate(() => ({
    days: dataWindowDays(), recsN: RECS.length, filteredN: filtered().length,
    on90: document.querySelector('#winTog button[data-win="90"]').classList.contains('on'),
    onAll: document.querySelector('#winTog button[data-win="0"]').classList.contains('on'),
  }));
  ok('window defaults to 90 days, never chosen before', boot.days === 90, JSON.stringify(boot));
  ok('the 90-day toggle button reads as active by default', boot.on90 && !boot.onAll, JSON.stringify(boot));
  ok('the window actually narrows what filtered() counts on this fixture',
     boot.filteredN > 0 && boot.filteredN < boot.recsN, JSON.stringify(boot));

  /* ── switching to All time reproduces the exact unwindowed count ───────── */
  await p.click('#winTog button[data-win="0"]');
  await p.waitForTimeout(500);
  const all = await p.evaluate(() => ({
    days: dataWindowDays(), recsN: RECS.length, filteredN: filtered().length,
    kpiRecs: renderKpis.last ? renderKpis.last.recs : null,
    onAll: document.querySelector('#winTog button[data-win="0"]').classList.contains('on'),
  }));
  ok('All time turns the window off', all.days === 0 && all.onAll, JSON.stringify(all));
  ok('All time reproduces the unwindowed count exactly (RECS.length, no other filter set)',
     all.filteredN === all.recsN, JSON.stringify(all));
  ok('the KPI strip itself was built from the same, unwindowed count',
     all.kpiRecs === all.recsN, JSON.stringify(all));

  /* ── switching back narrows it again, by the same amount as boot ───────── */
  await p.click('#winTog button[data-win="90"]');
  await p.waitForTimeout(500);
  const back = await p.evaluate(() => ({ filteredN: filtered().length }));
  ok('switching back to 90 days narrows the count again, identically to boot',
     back.filteredN === boot.filteredN, JSON.stringify({ back, boot }));

  /* ── the choice persists across a reload, the cm_pa_cmonly/cm_dash_rlang way ─ */
  await p.click('#winTog button[data-win="0"]');
  await p.waitForTimeout(400);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);
  const persisted = await p.evaluate(() => ({ days: dataWindowDays(), filteredN: filtered().length, recsN: RECS.length,
    stored: (() => { try { return localStorage.getItem('cm_dash_window'); } catch (e) { return null; } })() }));
  ok('the All-time choice survives a reload (localStorage, like cm_pa_cmonly)',
     persisted.days === 0 && persisted.stored === '0' && persisted.filteredN === persisted.recsN,
     JSON.stringify(persisted));

  /* ── other tabs are painted under the same cutoff: the fleet table on
        Overview, which reads filtered()/findings() directly, is a real proxy ─ */
  await p.click('#winTog button[data-win="90"]');
  await p.waitForTimeout(500);
  const fleetRows90 = await p.$$eval('#fleetTbl tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length);
  await p.click('#winTog button[data-win="0"]');
  await p.waitForTimeout(500);
  const fleetRowsAll = await p.$$eval('#fleetTbl tbody tr', rs => rs.filter(r => !r.querySelector('td.empty')).length);
  ok('the attention table itself repaints under the window (90d <= all-time rows)',
     fleetRows90 <= fleetRowsAll, JSON.stringify({ fleetRows90, fleetRowsAll }));

  console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '');
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
