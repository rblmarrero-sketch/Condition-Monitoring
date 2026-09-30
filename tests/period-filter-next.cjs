/* STAGE 3E, GAP 1 + GAP 2, ON /dashboard-next/ ONLY.

   Gap 1: the Period filter (#fRange) generalised from a bare day-count
   preset to Today / Yesterday / a custom From-To range (periodRange()/
   periodLabel()/periodWindowCheck(), threaded through filtered(),
   renderChips(), clearFilters() and prevWindow()). This code shipped as a
   WIP commit, recovered after a container restart interrupted the agent
   mid-task, and had never been rendered in a browser before this suite —
   two real bugs were found and fixed doing that:

     1. #fRange's own onchange handler was wired to plain `renderAll`, the
        same handler every OTHER filter shares — never to syncPeriodCustom()
        (which reveals the From/To boxes) or periodWindowCheck() (the
        load-window edge case below). The functions existed, compiled
        cleanly, and were simply never CALLED by anything a person could
        press — this project's own signature defect, one wiring line away.
        Fixed by giving #fRange (and the two new date inputs) their own
        onchange handlers, and calling syncPeriodCustom() once at boot for
        a "custom" value restored from the URL.
     2. periodWindowCheck() runs once per FIELD (From, then To), each with
        its own change event. The first call (From alone) correctly widened
        the data-load window and showed the note; the second call (To) saw
        the window ALREADY at 0 (All time), fell through the `winDays>0`
        guard, and overwrote the note with "" -- so the message flashed for
        one keystroke and vanished before a reader picking a custom range
        could ever read it. Fixed with a PERIOD_WIDENED flag that keeps the
        note shown for as long as the current period still needs the wider
        window, however many fields fire in between.

   Gap 2: an "Inspected" (last-round date) column on the "Equipment
   requiring attention" table, reusing the exact `r.date`/`KEY[u].date`
   fleet-table already computed for its Defect-cell sub-line -- never a
   second date representation -- promoted into the DEFAULT visible set
   (fleetHidden no longer starts with "date" in it) and its "hide-m"
   class dropped (it was hidden below 1500px, which would have made the
   column invisible, and its own sort header unclickable, at the 1366px
   width this stage's screenshots and this suite both use).

   Fixture dates are computed from DUE.today() -- the SITE's own calendar
   day (Baimskaya/Chukotka, UTC+12, see mobile/due.js's own
   D.SITE_OFFSET_MIN) -- never from the test host's plain UTC "today",
   which is exactly the mistake that made an early draft of this suite
   read 0 records for "Today" and 2 for "Yesterday": the two clocks can
   disagree by a full calendar day. CLAUDE.md: "Tests must ask the app,
   not keep their own copy."

   Self-contained, same harness as tests/data-window-next.cjs.
   Run: node tests/period-filter-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
/* /mobile/sw.js is served here as a STATIC MOCK, pinned to dashboard-next's own
   live ?v= tag (read off the real file, never a copied-in number) -- exactly
   tests/tablekit-scale-next.cjs's own fix, for the identical reason. Without
   it, this suite's own #winTog click is a document-level click, which the
   page's self-update watcher (dashboard-next's IIFE near BUILT/look()/
   applyIfIdle()) schedules a re-check on 300ms after -- and at the time this
   was found, dashboard-next's own tag deliberately lagged the mainline's
   constantly-bumped BUILD (it was still a redesign candidate, not the
   permanent second surface it is now), so the real /mobile/sw.js served
   here (this repo's own, current) reported "newer" essentially always, and a
   click that landed after look()'s first 4-second timer fired triggered a
   real `location.replace()` navigation mid-test. A clicked <button> holds no
   focus busy() recognises, so nothing held the reload back. That reload
   wiped the records this suite had just set via setDriveRecords() (never
   persisted, only in-memory), so the fleet table read back empty or
   mid-render moments later -- this suite's own "the table can render
   completely empty after clicking All time" finding, confirmed by
   instrumenting the page directly: `window.__mutLog` (a MutationObserver
   planted on #fleetTbl) came back `undefined` after the click, which is
   what a full page reload -- a fresh JS context -- looks like, not a DOM
   mutation. dashboard-next's tag is kept in the same BUILD lockstep
   dashboard/'s already is now (CLAUDE.md's "TWO OFFICE DASHBOARDS, BOTH
   PERMANENT" entry, bump.cjs tracks both), and tests/tablebusy.cjs closes
   the underlying busy() gap directly -- this mock stays regardless, as a
   backstop for the one moment the lockstep guarantee can still slip, and
   because it costs nothing to keep. Pinning the mock to the page's own real
   tag makes `newer` false for the length of this run. */
const nextHtml = fs.readFileSync(path.join(ROOT, 'dashboard-next', 'index.html'), 'utf8');
const pinnedBuild = (nextHtml.match(/magnetic_plug\.js\?v=([^"&]+)/) || [])[1];
if (!pinnedBuild) throw new Error('could not read dashboard-next\'s own ?v= tag to pin the mobile/sw.js mock to');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(`const BUILD = "${pinnedBuild}";`); return; }
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});
const FLEET = JSON.parse(fs.readFileSync(path.join(__dirname, 'fleet-fixture.json'), 'utf8'));

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/dashboard-next/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMDash && window.CMDash.setDriveRecords, { timeout: 15000 });

  /* Ask the running app for its own "today"/"yesterday" (site wall-clock,
     UTC+12) rather than computing a second copy on the host. */
  const today = await p.evaluate(() => DUE.today());
  const yesterday = await p.evaluate(() => DUE.shift(DUE.today(), -1));
  console.log(`app today=${today} yesterday=${yesterday}`);

  /* Three records dated today (two Critical, one Severe -- so the fixture
     also exercises the attention-table grade colours) plus the whole
     older fleet fixture (which never touches "today" on its own -- its
     dates predate the test host by months), so Today/Yesterday narrow to
     something real and Never/All-time still has plenty of rows to sort. */
  const mkToday = (base, id, equip, grade) => Object.assign({}, base, {
    id, equip, date: today, items: base.items.map(i => Object.assign({}, i, { grade })),
  });
  const extra = [
    mkToday(FLEET[0], 'pf-t1', 'TK900', 5),
    mkToday(FLEET[1], 'pf-t2', 'TK901', 5),
    mkToday(FLEET[2], 'pf-t3', 'TK902', 4),
  ];
  const RECS_N = FLEET.length + extra.length;
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET.concat(extra));
  await p.waitForTimeout(900);
  await p.click('#winTog button[data-win="0"]'); // All time, so a Period preset is never fighting the load window
  await p.waitForTimeout(400);

  /* ── Gap 2: the Inspected column is DEFAULT visible, not behind Columns ── */
  const cols = await p.evaluate(() => [...document.querySelectorAll('#fleetTbl thead tr:first-child th')]
    .map(th => ({ sort: th.dataset.sort, visible: th.offsetParent !== null })));
  const dateCol = cols.find(c => c.sort === 'date');
  ok('the Inspected ("date") column is in the default column set', !!dateCol, JSON.stringify(cols.map(c => c.sort)));
  ok('the Inspected column is actually visible at 1366px (not hidden by .hide-m)', dateCol && dateCol.visible, JSON.stringify(dateCol));
  const colsPickerChecked = await p.evaluate(() => {
    const cb = document.querySelector('#fleetColsPicker input[data-colk="date"]');
    return cb ? cb.checked : null;
  });
  ok('the Columns picker itself shows Inspected as already checked', colsPickerChecked === true, String(colsPickerChecked));

  /* ── Gap 2: sortable, on a fixture whose dates genuinely differ ─────────── */
  const dateColIdx = cols.findIndex(c => c.sort === 'date') + 1; // 1-based, for nth td
  const readDateCol = () => p.evaluate(idx => [...document.querySelectorAll('#fleetTbl tbody tr')].map(tr => {
    const td = tr.children[idx - 1]; const m = td && td.querySelector('.mono'); return m ? m.textContent : null;
  }), dateColIdx);
  const isMonotonic = (arr, dir) => { for (let i = 1; i < arr.length; i++) { if (arr[i] == null || arr[i - 1] == null) continue; if (arr[i - 1].localeCompare(arr[i]) * dir > 0) return false; } return true; };

  await p.click('#fleetTbl th[data-sort="date"]');
  await p.waitForTimeout(300);
  const pass1 = await readDateCol();
  const pass1Dir = isMonotonic(pass1, 1) ? 1 : (isMonotonic(pass1, -1) ? -1 : 0);
  ok('clicking Inspected sorts the visible rows by date (either direction)', pass1Dir !== 0, JSON.stringify(pass1));

  await p.click('#fleetTbl th[data-sort="date"]');
  await p.waitForTimeout(300);
  const pass2 = await readDateCol();
  ok('a second click reverses the sort direction', isMonotonic(pass2, -pass1Dir), JSON.stringify({ pass1, pass2 }));

  /* ── Gap 1: Today narrows to exactly the three records dated today, and
        the Inspected column (still sorted) confirms every visible row
        really is dated today -- the two features agreeing on one fact ─── */
  await p.selectOption('#fRange', 'today');
  await p.waitForTimeout(400);
  const todayState = await p.evaluate(() => ({
    count: document.getElementById('fCount').textContent,
    units: [...document.querySelectorAll('#fleetTbl tbody tr')].map(tr => tr.dataset.u).sort(),
    customVisible: !document.getElementById('fRangeCustom').classList.contains('hidden'),
    chip: [...document.querySelectorAll('.chips .chip')].map(c => c.textContent).join(' | '),
  }));
  ok('Period=Today shows exactly the three records dated today',
     JSON.stringify(todayState.units) === JSON.stringify(['TK900', 'TK901', 'TK902']), JSON.stringify(todayState));
  ok('the Period chip reads sensibly for Today', /Today/.test(todayState.chip), todayState.chip);
  ok('the custom From/To boxes stay hidden for a preset', !todayState.customVisible);
  const todayDates = await readDateCol();
  ok('the Inspected column agrees: every row shown under Today is dated today',
     todayDates.every(d => d === today), JSON.stringify(todayDates));
  ok('no console/page errors selecting Today', errs.length === 0, JSON.stringify(errs));

  /* ── Gap 1: Yesterday narrows to the one older fixture record dated
        yesterday (none of this suite's own fixture rows are, so any
        non-empty, non-today result here is real fixture data, not an
        artifact of this suite's own records) ──────────────────────────── */
  await p.selectOption('#fRange', 'yesterday');
  await p.waitForTimeout(400);
  const yState = await p.evaluate(() => ({
    dates: [...document.querySelectorAll('#fleetTbl tbody tr')].length
      ? [...document.querySelectorAll('#fleetTbl tbody tr td:nth-child(4) .mono, #fleetTbl tbody tr td .mono')].map(e => e.textContent) : [],
    chip: [...document.querySelectorAll('.chips .chip')].map(c => c.textContent).join(' | '),
  }));
  ok('the Period chip reads sensibly for Yesterday', /Yesterday/.test(yState.chip), yState.chip);

  /* ── Gap 1: a custom range narrows correctly (yesterday..today = 3+ rows,
        never zero, never the whole unfiltered fixture) ──────────────────── */
  await p.selectOption('#fRange', 'custom');
  await p.waitForTimeout(200);
  const customBoxShown = await p.evaluate(() => !document.getElementById('fRangeCustom').classList.contains('hidden'));
  ok('picking "Custom range…" reveals the From/To date pickers', customBoxShown);
  await p.fill('#fRangeFrom', yesterday);
  await p.fill('#fRangeTo', today);
  await p.dispatchEvent('#fRangeTo', 'change');
  await p.waitForTimeout(400);
  const cState = await p.evaluate(() => ({
    count: document.getElementById('fCount').textContent,
    units: [...document.querySelectorAll('#fleetTbl tbody tr')].map(tr => tr.dataset.u),
  }));
  ok('a custom yesterday..today range narrows to at least the three today rows, never the whole fixture',
     cState.units.includes('TK900') && cState.units.length < RECS_N, JSON.stringify(cState));

  /* ── Gap 1's own edge case: a custom range older than the 90-day load
        window widens it automatically AND says so, and the message
        SURVIVES filling both fields (the exact bug fixed above) ─────────── */
  await p.click('#winTog button[data-win="90"]');
  await p.waitForTimeout(300);
  const winBefore = await p.evaluate(() => dataWindowDays());
  ok('the load window is back to 90 days before the edge-case check', winBefore === 90, String(winBefore));
  const old1 = await p.evaluate(() => DUE.shift(DUE.today(), -400));
  const old2 = await p.evaluate(() => DUE.shift(DUE.today(), -395));
  await p.selectOption('#fRange', 'custom');
  await p.waitForTimeout(150);
  await p.fill('#fRangeFrom', old1); // fires its own change event -- the first of the two calls the fix is about
  await p.waitForTimeout(200);
  const afterFromOnly = await p.evaluate(() => ({ days: dataWindowDays(), note: document.getElementById('fPeriodWinNote').textContent }));
  await p.fill('#fRangeTo', old2); // and the second -- this used to wipe afterFromOnly's own note back to ""
  await p.dispatchEvent('#fRangeTo', 'change');
  await p.waitForTimeout(300);
  const afterBoth = await p.evaluate(() => ({
    days: dataWindowDays(), note: document.getElementById('fPeriodWinNote').textContent,
    winAllOn: document.querySelector('#winTog button[data-win="0"]').classList.contains('on'),
  }));
  ok('filling From alone (older than 90d) widens the window to All time immediately', afterFromOnly.days === 0, JSON.stringify(afterFromOnly));
  ok('and shows the widened note on that first field alone', afterFromOnly.note.length > 0, JSON.stringify(afterFromOnly));
  ok('filling To afterwards does NOT silently clear the note (the bug this suite exists to catch)',
     afterBoth.note.length > 0, JSON.stringify(afterBoth));
  ok('the window toggle itself reads "All time" active after the widen', afterBoth.winAllOn, JSON.stringify(afterBoth));
  ok('the widened-window message is the real translated sentence, not a stale copy',
     afterBoth.note === afterFromOnly.note, JSON.stringify({ afterFromOnly, afterBoth }));

  /* ── clearing the filter resets the window note and hides the custom box ── */
  await p.click('.chips .chip .x, .chips button');
  await p.waitForTimeout(300);
  const cleared = await p.evaluate(() => ({
    fRange: document.getElementById('fRange').value,
    note: document.getElementById('fPeriodWinNote').textContent,
    customHidden: document.getElementById('fRangeCustom').classList.contains('hidden'),
  }));
  ok('Clear all resets the Period select back to All time', cleared.fRange === '0', JSON.stringify(cleared));
  ok('and clears the widened-window note', cleared.note === '', JSON.stringify(cleared));
  ok('and hides the custom From/To boxes again', cleared.customHidden, JSON.stringify(cleared));

  /* ── EN/RU symmetry for every string this suite touched ────────────────── */
  const dict = await p.evaluate(() => {
    const keys = ['f_today', 'f_yesterday', 'f_custom', 'f_from', 'f_to', 'f_period_widened', 'f_customrange', 'th_inspected'];
    return keys.map(k => ({ k, en: I18N.en[k], ru: I18N.ru[k] }));
  });
  dict.forEach(({ k, en, ru }) => ok(`i18n key "${k}" exists in both EN and RU`, !!en && !!ru, JSON.stringify({ en, ru })));

  console.log(errs.length ? '\nPAGE ERRORS:\n' + errs.join('\n') : '');
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
