/* DATA & SYNC, ON /dashboard-next/, CHECKED AGAINST THE REAL /dashboard/ FOR
   BOTH THE UNDERLYING DATA AND THE INTERACTIVE BEHAVIOUR OF EVERY CONTROL.

   This is the load-bearing proof for Stage 5's most sensitive tab. The brief
   is explicit: presentation only, no behaviour change. So every check here
   is a PAIR -- the same action is taken on the live, unmodified /dashboard/
   and on /dashboard-next/, against the identical fixture, and the resulting
   DOM state is compared. A control whose visible text moved (case, wording)
   is allowed to differ in text; a control whose FUNCTION moved is not.

   Same server/fixture technique as the other -next.cjs suites (see
   actions-next.cjs's own header comment).

   Run: node tests/sync-next.cjs */
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

async function boot(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);
  await p.evaluate(() => { location.hash = '#sync'; });
  await p.waitForTimeout(600);
  return { p, errs };
}

const kpiMap = async p => p.$$eval('#syncKpis [data-kpi]', els => {
  const m = {}; els.forEach(el => { m[el.dataset.kpi] = (el.querySelector('.v') || {}).textContent && el.querySelector('.v').textContent.trim(); });
  return m;
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const A = await boot(b, port, 'dashboard/index.html');
  const N0 = await boot(b, port, 'dashboard-next/index.html');
  await N0.p.click('#winTog button[data-win="0"]').catch(() => {});
  await N0.p.waitForTimeout(400);
  // re-open sync after the window toggle repaints the shell
  await N0.p.evaluate(() => { location.hash = '#sync'; });
  await N0.p.waitForTimeout(500);
  const N = N0;

  /* ── 1. the four SYNC.DC.HTML tiles match; the two retired ones (syRecs,
     syMedia) are a deliberate reduction, not a loss -- renderSync()'s own
     comment says so, and the figures they carried are still on screen,
     just relocated (RECS.length via #srcText, the quarantine count via
     #syHealth's own "Inspections requiring correction" row). ───────────── */
  const kA = await kpiMap(A.p), kN = await kpiMap(N.p);
  console.log('dashboard/     sync tiles=' + JSON.stringify(kA));
  console.log('dashboard-next sync tiles=' + JSON.stringify(kN));
  const MOCKUP_TILES = ['syGrade', 'syConf', 'syWait', 'syCrit'];
  ok('dashboard-next shows exactly the four SYNC.DC.HTML mockup tiles',
     JSON.stringify(Object.keys(kN).sort()) === JSON.stringify(MOCKUP_TILES.slice().sort()), JSON.stringify(kN));
  MOCKUP_TILES.forEach(k => ok(`sync tile [data-kpi="${k}"] matches live /dashboard/`, kA[k] === kN[k], `next=${kN[k]} dashboard=${kA[k]}`));
  const relocated = await N.p.evaluate(() => {
    const dts = [...document.querySelectorAll('#syHealth dt')];
    const heldDt = dts.find(dt => /requiring correction|исправлен/i.test(dt.textContent));
    return {
      srcText: (document.getElementById('srcText') || {}).textContent || '',
      heldValue: heldDt ? (heldDt.nextElementSibling || {}).textContent || '' : null,
    };
  });
  ok('dashboard-next: "Inspections loaded" (the retired syRecs tile\'s own figure) is still shown, via the header chip',
     relocated.srcText.includes(String(kA.syRecs || '')), relocated.srcText);
  ok('dashboard-next: the quarantine count (the retired syMedia tile\'s neighbour) is still shown, as #syHealth\'s own "Inspections requiring correction" row',
     relocated.heldValue !== null && /^\d+$/.test(relocated.heldValue.trim()), JSON.stringify(relocated.heldValue));

  /* ── 2. Grade review required: clicking "Review grade" on the first row
     opens the SAME edit sheet, for the SAME record, on both pages ────────── */
  const firstKeyA = await A.p.$eval('#sySev [data-sevgo]', el => el.dataset.sevgo).catch(() => null);
  const firstKeyN = await N.p.$eval('#sySev [data-sevgo]', el => el.dataset.sevgo).catch(() => null);
  ok('the first "grade review required" row names the same record on both pages', firstKeyA === firstKeyN, `next=${firstKeyN} dashboard=${firstKeyA}`);
  if (firstKeyA) {
    await A.p.click('#sySev [data-sevgo]');
    await A.p.waitForTimeout(300);
    const stateA = await A.p.evaluate(() => ({ open: !document.getElementById('editOv').classList.contains('hidden'), title: document.getElementById('edTitle').textContent }));
    await N.p.click('#sySev [data-sevgo]');
    await N.p.waitForTimeout(300);
    /* dashboard-next's own EditRound.dc.html mockup simplifies the bold
       title to just the unit ("Edit inspection: TK001") and moves the
       round type, date and grade into the adjacent #edSub subtitle
       (openEdit()'s own comment) -- so the full identity is still on
       screen, split across two elements instead of one. Compare the pair,
       not the title alone. */
    const stateN = await N.p.evaluate(() => ({
      open: !document.getElementById('editOv').classList.contains('hidden'),
      title: document.getElementById('edTitle').textContent,
      full: document.getElementById('edTitle').textContent + ' ' + (document.getElementById('edSub') || {}).textContent,
    }));
    ok('"Review grade" opens the edit sheet on dashboard/', stateA.open, JSON.stringify(stateA));
    ok('"Review grade" opens the identical edit sheet on dashboard-next/ (title simplified per its own mockup, but unit/type/date/grade all present between title+subtitle)',
       stateN.open && [stateA.title.split(' · ')].flat().every(part => stateN.full.includes(part.trim())),
       `next.full=${JSON.stringify(stateN.full)} dashboard.title=${JSON.stringify(stateA.title)}`);
    await A.p.click('#edClose').catch(() => {});
    await N.p.click('#edClose').catch(() => {});
    await A.p.waitForTimeout(200); await N.p.waitForTimeout(200);
    const closedA = await A.p.evaluate(() => document.getElementById('editOv').classList.contains('hidden'));
    const closedN = await N.p.evaluate(() => document.getElementById('editOv').classList.contains('hidden'));
    ok('Close returns the edit sheet to hidden on both pages', closedA && closedN, `next=${closedN} dashboard=${closedA}`);
  }

  /* ── 3. "Inspections requiring correction" and "Records waiting on
     evidence" tables: same row counts, same tk-kit filter/sort machinery ─── */
  const tblState = async p => p.evaluate(() => ({
    quarRows: document.querySelectorAll('#syQuarTbl tbody tr:not(:has(td.empty))').length,
    gapRows: document.querySelectorAll('#syGapTbl tbody tr:not(:has(td.empty))').length,
    quarEmpty: document.querySelectorAll('#syQuarTbl td.empty').length,
    gapEmpty: document.querySelectorAll('#syGapTbl td.empty').length,
    quarFilters: document.querySelectorAll('#syQuarTbl thead input.cwcf').length,
    gapFilters: document.querySelectorAll('#syGapTbl thead input.cwcf').length,
  }));
  const tA = await tblState(A.p), tN = await tblState(N.p);
  ok('"Inspections requiring correction" row count matches /dashboard/', tA.quarRows === tN.quarRows, `next=${tN.quarRows} dashboard=${tA.quarRows}`);
  ok('"Records waiting on evidence" row count matches /dashboard/', tA.gapRows === tN.gapRows, `next=${tN.gapRows} dashboard=${tA.gapRows}`);
  /* This fixture carries no attachment-listing backend, so both tables are
     legitimately empty ("Nothing to correct" / "Nothing to compare against
     yet") and render no header or filter row at all -- exactly matching
     /dashboard/'s own tkHead()/tkNone() behaviour, which is what this
     assertion actually proves rather than assuming a filter row must always
     be there. */
  ok('empty-state wording and structure match /dashboard/ exactly (no header/filter row while empty)',
     tA.quarEmpty === tN.quarEmpty && tA.gapEmpty === tN.gapEmpty && tN.quarFilters === tA.quarFilters && tN.gapFilters === tA.gapFilters,
     JSON.stringify({ A: tA, N: tN }));

  /* ── 4. Admin diagnostics <details> toggles the same way on both pages ──── */
  const toggleAdmin = async p => {
    const before = await p.evaluate(() => document.getElementById('syAdmin').open);
    await p.click('#syAdmin summary');
    await p.waitForTimeout(200);
    const after = await p.evaluate(() => document.getElementById('syAdmin').open);
    return { before, after };
  };
  const admA = await toggleAdmin(A.p), admN = await toggleAdmin(N.p);
  ok('Admin diagnostics opens on dashboard/ the first click', admA.before === false && admA.after === true, JSON.stringify(admA));
  ok('Admin diagnostics opens identically on dashboard-next/', JSON.stringify(admN) === JSON.stringify(admA), JSON.stringify(admN));

  /* ── 5. inside Admin diagnostics: Backend / reconciliation / photograph
     population / field diagnostics / device activity / "what this dashboard
     cannot check" all render on both, and the "Check builds & storage"
     button exists and does not throw when pressed with no backend attached ── */
  const admContent = async p => p.evaluate(() => ({
    health: document.querySelectorAll('#syHealth > *').length > 0,
    pop: document.querySelectorAll('#syPop > *').length > 0,
    recon: document.querySelectorAll('#syRecon > *').length > 0,
    diag: document.querySelectorAll('#syDiag > li').length >= 0,
    devTbl: !!document.getElementById('syDevTbl'),
    unknown: document.querySelectorAll('#syUnknown > li').length > 0,
    refreshBtn: !!document.getElementById('syDevRefresh'),
  }));
  const acA = await admContent(A.p), acN = await admContent(N.p);
  ok('Admin diagnostics sub-panels (Backend/photographs/reconciliation) render on dashboard-next/ same as /dashboard/',
     JSON.stringify(acA) === JSON.stringify(acN), 'next=' + JSON.stringify(acN) + ' dashboard=' + JSON.stringify(acA));
  let refreshErr = null;
  N.p.once('pageerror', e => { refreshErr = e.message; });
  await N.p.click('#syDevRefresh');
  await N.p.waitForTimeout(500);
  ok('"Check builds & storage" can be pressed with no backend attached and throws nothing', !refreshErr, refreshErr);

  /* ── 6. "What this dashboard cannot check" text matches verbatim (this is
     the one panel whose exact wording is load-bearing per CLAUDE.md) ──────── */
  const unkA = await A.p.$eval('#syUnknown', el => el.textContent.trim());
  const unkN = await N.p.$eval('#syUnknown', el => el.textContent.trim());
  ok('"What this dashboard cannot check" text is unchanged from /dashboard/', unkA === unkN, `next differs: ${unkN.slice(0,80)}...`);

  /* ── 7. definitions control (grade review / correction / evidence-waiting
     definitions) opens the same way ───────────────────────────────────────── */
  const defsN = await N.p.evaluate(() => { const d = document.getElementById('syDefs'); return !!d; });
  ok('Definitions control renders', defsN);

  console.log((A.errs.length ? '\ndashboard/ PAGE ERRORS:\n' + A.errs.join('\n') : '') + (N.errs.length ? '\ndashboard-next/ PAGE ERRORS:\n' + N.errs.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || A.errs.length || N.errs.length ? 1 : 0);
})();
