/* THE EDIT INSPECTION DRAWER -- the single most complex write surface in the
   app (Stage 6 task's own words). Whatever a correction sets here must reach
   window.CMDrive.saveEdit() with the identical document /dashboard/ would
   send for the identical action.

   Technique: identical fixture record on both pages, stub CMDrive.saveEdit to
   capture its argument instead of hitting a network, lower a grade through
   the real UI (select[data-f="grade"][data-k], #edBy, #edReason -- exactly
   the selectors tests/edgrade.cjs already uses against the real app), click
   #edSave, and diff the captured document field by field.

   Run: node tests/editround-next.cjs */
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

const REC = { equip: 'TK901', date: '2026-09-11', type: 'MP', cls: 'HT', by: 'R. Marrero', dev: 'DZZZZ', smu: '9000',
  items: [{ key: '4C', label: 'LR Final Drive', grade: 'C', comment: 'trace only' }] };

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(rec => {
    window.__writes = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    try { localStorage.removeItem('cm_dash_who'); } catch (e) {}
    CMDash.setDriveRecords([rec], { replace: true });
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  }, REC);
  await p.waitForTimeout(700);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const key = 'TK901|2026-09-11|MP';
  await a.evaluate(k => window.openEdit(k), key);
  await n.evaluate(k => window.openEdit(k), key);
  await a.waitForTimeout(400); await n.waitForTimeout(400);

  ok('dashboard/: Edit inspection drawer opens', !(await a.evaluate(() => document.getElementById('editOv').classList.contains('hidden'))));
  ok('dashboard-next: Edit inspection drawer opens', !(await n.evaluate(() => document.getElementById('editOv').classList.contains('hidden'))));

  const sel = 'select[data-f="grade"][data-k="4C"]';
  const gA = await a.$eval(sel, e => e.value).catch(() => null);
  const gB = await n.$eval(sel, e => e.value).catch(() => null);
  ok('grade field shows the recorded grade (3) on both', gA === '3' && gB === '3', `A=${gA} B=${gB}`);

  /* Lower the grade from 3 to 1 -- this needs a reason (#edReason), exactly
     the flow tests/edgrade.cjs already proves against the real app. */
  await a.selectOption(sel, '1'); await n.selectOption(sel, '1');
  await a.fill('#edBy', 'V. Petrov').catch(() => {}); await n.fill('#edBy', 'V. Petrov').catch(() => {});
  await a.fill('#edReason', 'Re-read under light -- no ferrous debris').catch(() => {});
  await n.fill('#edReason', 'Re-read under light -- no ferrous debris').catch(() => {});
  await a.click('#edSave'); await n.click('#edSave');
  await a.waitForTimeout(500); await n.waitForTimeout(500);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.saveEdit was called exactly once on each page', writesA.length === 1 && writesB.length === 1,
     `A=${writesA.length} B=${writesB.length}`);
  if (writesA.length === 1 && writesB.length === 1) {
    /* `at` is a fresh timestamp on each page -- compare everything else
       byte-identically and the timestamps only to within a generous window,
       so a real (small) clock skew between two browser contexts cannot fail
       an otherwise-identical write. */
    /* Strip every ISO-timestamp-shaped string anywhere in the document
       (recursively -- gradeAt, and the ones nested inside gradeAudit[] too),
       since each page's Date.now() call happens a few milliseconds apart and
       that is not a behavior difference. Every OTHER field is compared
       byte-for-byte. */
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const stripTimes = v => {
      if (Array.isArray(v)) return v.map(stripTimes);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = stripTimes(v[k]); return o; }
      return (typeof v === 'string' && ISO_RE.test(v)) ? '<ts>' : v;
    };
    ok('the saved correction document is field-for-field identical (every timestamp anywhere in it excluded)',
       JSON.stringify(stripTimes(writesA[0])) === JSON.stringify(stripTimes(writesB[0])),
       `A=${JSON.stringify(stripTimes(writesA[0]))} B=${JSON.stringify(stripTimes(writesB[0]))}`);
    ok('both saved gradeAt stamps are real, recent, close-together ISO times',
       writesA[0].items['4C'].gradeAt && writesB[0].items['4C'].gradeAt &&
       Math.abs(new Date(writesA[0].items['4C'].gradeAt) - new Date(writesB[0].items['4C'].gradeAt)) < 60000);
    ok('the item 4C carries the new grade', writesA[0].items && writesA[0].items['4C'] &&
       String(writesA[0].items['4C'].grade) === '1', JSON.stringify(writesA[0].items));
  }

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
