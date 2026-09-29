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
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
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
    await p.evaluate(() => window.cmbSet && window.cmbSet('rTarget', ''));
    await p.waitForTimeout(200);
    // pick the first available target (rTarget's own <select> is populated
    // by cmbAttach off RECS; read its first real option rather than assume
    // a value the fixture may not carry for "one inspection" scope).
    const firstVal = await p.$eval('#rTarget option', el => el.value).catch(() => '');
    if (firstVal) await p.evaluate(v => { window.cmbSet('rTarget', v); }, firstVal);
    await p.waitForTimeout(300);
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

  /* ── 4. Recent reports list renders on both (empty in a fresh fixture) ──── */
  const recentA = await A.p.$eval('#rRecent', el => el.textContent.trim());
  const recentN = await N.p.$eval('#rRecent', el => el.textContent.trim());
  ok('"Recent reports" panel renders the same empty-state text as /dashboard/', recentA === recentN, `next="${recentN}" dashboard="${recentA}"`);

  /* ── 5. numbered-step layout (1 scope, 2 which, 3 options) preserved ─────── */
  const steps = await N.p.$$eval('#tab-reports .rstep .rnum', els => els.map(e => e.textContent.trim()));
  ok('the three numbered steps render', JSON.stringify(steps) === JSON.stringify(['1', '2', '3']), JSON.stringify(steps));

  /* ── no sideways scroller at 1366px ──────────────────────────────────────── */
  const scrollers = await N.p.evaluate(() => [...document.querySelectorAll('#tab-reports .tblwrap, #tab-reports table')]
    .filter(el => el.scrollWidth > el.clientWidth + 2).map(el => el.id || el.className));
  ok('no sideways scroller on Reports at 1366px', scrollers.length === 0, JSON.stringify(scrollers));

  console.log((A.errs.length ? '\ndashboard/ PAGE ERRORS:\n' + A.errs.join('\n') : '') + (N.errs.length ? '\ndashboard-next/ PAGE ERRORS:\n' + N.errs.join('\n') : ''));
  b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || A.errs.length || N.errs.length ? 1 : 0);
})();
