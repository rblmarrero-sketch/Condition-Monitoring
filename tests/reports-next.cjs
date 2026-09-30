/* REPORTS, ON /dashboard-next/, CHECKED AGAINST THE REAL /dashboard/ FOR THE
   SAME UNDERLYING DATA, PLUS THE OVERVIEW "GENERATE REPORT" BUTTON'S OWN
   NAVIGATION -- CLICKED, NOT READ OFF THE ONCLICK ATTRIBUTE.

   Stage 3e's own lesson (see this session's brief): a wired-looking control
   can do nothing at all. So every claim here is proven by an actual click in
   a live page, never by reading the JS and assuming it runs.

   Same server/fixture technique as the other -next.cjs suites (see
   actions-next.cjs's own header comment).

   Run: node tests/reports-next.cjs */
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

async function boot(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); }, FLEET);
  await p.waitForTimeout(1200);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const A = await boot(b, port, 'dashboard/index.html');
  const N = await boot(b, port, 'dashboard-next/index.html');
  await N.p.click('#winTog button[data-win="0"]').catch(() => {});
  await N.p.waitForTimeout(400);

  /* ── 1. the Overview "Generate report" button actually navigates here,
     clicked live, not inferred from markup (this exact failure mode is why
     Stage 3e's brief calls this out by name) ──────────────────────────────── */
  await N.p.evaluate(() => { location.hash = '#overview'; });
  await N.p.waitForTimeout(400);
  const before = await N.p.evaluate(() => location.hash);
  await N.p.click('#ovGenRpt');
  await N.p.waitForTimeout(500);
  const after = await N.p.evaluate(() => ({
    hash: location.hash,
    tabActive: document.querySelector('nav.tabs button[data-tab="reports"]').classList.contains('active'),
    panelShown: !document.getElementById('tab-reports').classList.contains('hidden'),
  }));
  ok('"Generate report" on Overview actually navigates to the Reports tab when clicked',
     after.tabActive && after.panelShown, `before=${before} after=${JSON.stringify(after)}`);

  /* ── 2. scope/target/language/photos/quality selections build the same
     preview text on both pages, off the same runReport/renderReportPreview
     machinery -- nothing here recomputes an estimate by hand ─────────────── */
  const setAndRead = async p => {
    await p.evaluate(() => { location.hash = '#reports'; });
    await p.waitForTimeout(300);
    await p.selectOption('#rScope', 'one');
    await p.waitForTimeout(200);
    /* #rTarget's own <select> is populated by cmbAttach off RECS, in
       reportTargetOpts()'s own most-recent-first order -- both pages boot
       it to the same default (the first real option), and both re-derive
       that same order fresh from the identical fixture, so there is no
       stale-previous-run value to guard against here and no need to reset
       to "" and rediscover it: doing that round-trip was the bug -- cmbSet
       inserts its own placeholder <option value=""> as the FIRST child of
       the select, so ~rTarget option~ (the DOM's actual first option) then
       reads back that manufactured placeholder instead of a real target,
       and the test silently asserted the page's own "nothing chosen" text
       against itself. Read the first REAL option directly and select it
       explicitly, so both pages compare the identical target regardless of
       whatever the control already happened to have picked. */
    const firstVal = await p.$eval('#rTarget option[value]:not([value=""])', el => el.value).catch(() => '');
    if (firstVal) { await p.evaluate(v => { window.cmbSet('rTarget', v); }, firstVal); await p.waitForTimeout(300); }
    return p.$eval('#rPreview', el => el.textContent.trim());
  };
  const prevA = await setAndRead(A.p);
  const prevN = await setAndRead(N.p);
  console.log('dashboard/     preview="' + prevA + '"');
  console.log('dashboard-next preview="' + prevN + '"');
  ok('report preview text for "This inspection" + the first target matches /dashboard/', prevA === prevN, `next="${prevN}" dashboard="${prevA}"`);

  /* ── 3. every option group from the brief renders (scope, language,
     photos, quality, appendix, generate) ─────────────────────────────────── */
  const opts = await N.p.evaluate(() => ({
    scope: [...document.getElementById('rScope').options].map(o => o.value),
    lang: [...document.getElementById('rLang').options].map(o => o.value),
    photos: [...document.getElementById('rPhotos').options].map(o => o.value),
    scale: [...document.getElementById('rScale').options].map(o => o.value),
    goBtn: !!document.getElementById('rGo'),
  }));
  ok('scope options render (one/unit/summary/round/month)',
     JSON.stringify(opts.scope) === JSON.stringify(['one', 'unit', 'summary', 'round', 'month']), JSON.stringify(opts.scope));
  ok('language options render (en/ru/both)', JSON.stringify(opts.lang) === JSON.stringify(['en', 'ru', 'both']), JSON.stringify(opts.lang));
  ok('photos options render', opts.photos.length === 2, JSON.stringify(opts.photos));
  ok('quality options render (small-file option deliberately absent per CLAUDE.md)',
     JSON.stringify(opts.scale) === JSON.stringify(['2.4', '3']), JSON.stringify(opts.scale));
  ok('"Generate PDF" button renders', opts.goBtn);

  /* ── 4. Recent reports list renders on both (empty in a fresh fixture) ────
     dashboard/'s "Recent reports" is a plain <ul id="rRecent">; dashboard-
     next's own redesign is a sortable <table class="grid" id="rRecentTbl">
     (the same column-header-click sort every other Stage-6 table carries) --
     a real id rename, not a loss, so each page is read off its own real
     container rather than a shared selector neither page still fully owns. */
  const recentA = await A.p.$eval('#rRecent', el => el.textContent.trim());
  const recentN = await N.p.$eval('#rRecentTbl', el => el.textContent.trim());
  ok('"Recent reports" panel renders the same empty-state text as /dashboard/', recentA === recentN, `next="${recentN}" dashboard="${recentA}"`);

  /* ── 5. the numbered "1 / 2 / 3" wizard is a DELIBERATE removal, per
     dashboard-next's own header comment on #tab-reports: Reports.dc.html
     shows Scope, Which, Language, Photos, Quality and Status as a flat set
     of control groups (button-row "seg" toggles, not a numbered wizard) --
     not a parity gap. Check the flat structure survives instead: every
     control group renders, each with a visible label and its own button
     row (segFromSelect's own markup) wired to the real backing <select>. */
  const groups = await N.p.evaluate(() => [...document.querySelectorAll('#tab-reports .field')]
    .filter(f => f.querySelector('.seg'))
    .map(f => ({
      label: (f.querySelector('label') || {}).textContent || '',
      buttons: f.querySelectorAll('.seg button').length,
    })));
  ok('every control group (scope/language/photos/quality) renders as a labelled button row, not a numbered step',
     groups.length >= 4 && groups.every(g => g.label && g.buttons > 0), JSON.stringify(groups));

  /* ── no sideways scroller at 1366px ──────────────────────────────────────── */
  const scrollers = await N.p.evaluate(() => [...document.querySelectorAll('#tab-reports .tblwrap, #tab-reports table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Reports at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((A.errs.length ? '\ndashboard/ PAGE ERRORS:\n' + A.errs.join('\n') : '') + (N.errs.length ? '\ndashboard-next/ PAGE ERRORS:\n' + N.errs.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || A.errs.length || N.errs.length ? 1 : 0);
})();
