/* "NO ACTION REQUIRED" (#dispBox/#dispScrim) -- the one status a person must
   explicitly justify, per REDESIGN-BRIEF.md's own reading of the dialog
   inventory. Write path: dispSave -> patchItems() -> window.CMDrive.saveEdit
   per record. Same stub-and-diff technique as the other Part B suites.

   Run: node tests/disposition-next.cjs */
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

const RECS = [{ equip: 'TK903', date: '2026-09-13', type: 'MP', cls: 'HT', by: 'R. Marrero',
  items: [{ key: '2B', label: 'RF Final Drive', grade: 'B', comment: 'trace fuzz only' }] }];

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.__writes = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    try { localStorage.removeItem('cm_dash_who'); } catch (e) {}
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
  }, RECS);
  await p.waitForTimeout(600);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const open = p => p.evaluate(() => window.askDisposition([{ rk: 'TK903|2026-09-13|MP', ik: '2B' }]));
  await open(a); await open(n);
  await a.waitForTimeout(300); await n.waitForTimeout(300);

  ok('dashboard/: No action required dialog opens', !(await a.evaluate(() => document.getElementById('dispBox').classList.contains('hidden'))));
  ok('dashboard-next: No action required dialog opens', !(await n.evaluate(() => document.getElementById('dispBox').classList.contains('hidden'))));

  /* Refused with no reason -- CLAUDE.md's own rule about a required reason
     and about a rejecting control looking like one. */
  await a.click('#dispSave'); await n.click('#dispSave');
  await a.waitForTimeout(200); await n.waitForTimeout(200);
  const msgA0 = await a.$eval('#dispMsg', el => el.textContent);
  const msgB0 = await n.$eval('#dispMsg', el => el.textContent);
  ok('dashboard/: refused with no reason/approver', !!msgA0.trim());
  ok('dashboard-next: refused with no reason/approver', !!msgB0.trim());
  ok('the refusal message matches', msgA0 === msgB0, `A="${msgA0}" B="${msgB0}"`);

  /* dashboard-next adds a preset-reason dropdown (#dispReasonSel, defaulting
     to "checked_ok") that /dashboard/ does not have at all -- a real,
     additive feature, not a gap. #dispReason/#dispReasonOwnWrap only becomes
     visible and live once "other" is picked from it, so a page that has the
     select must be told to pick "other" before the literal reason text below
     is typed into #dispReason, or the fill hangs waiting on a hidden input
     and, on dashboard-next, the saved reason would be the preset's own label
     instead of what was actually typed. */
  const pickOtherIfPresent = async p => { if (await p.$('#dispReasonSel')) await p.selectOption('#dispReasonSel', 'other'); };
  await pickOtherIfPresent(a); await pickOtherIfPresent(n);
  await a.fill('#dispReason', 'Within limit, monitored at the next round'); await n.fill('#dispReason', 'Within limit, monitored at the next round');
  await a.fill('#dispBy', 'V. Petrov'); await n.fill('#dispBy', 'V. Petrov');
  await a.click('#dispSave'); await n.click('#dispSave');
  await a.waitForTimeout(500); await n.waitForTimeout(500);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.saveEdit called exactly once on each page', writesA.length === 1 && writesB.length === 1, `A=${writesA.length} B=${writesB.length}`);
  if (writesA.length === 1 && writesB.length === 1) {
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const stripTimes = v => { if (Array.isArray(v)) return v.map(stripTimes);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = stripTimes(v[k]); return o; }
      return (typeof v === 'string' && ISO_RE.test(v)) ? '<ts>' : v; };
    ok('the saved disposition document is field-for-field identical (timestamps excluded)',
       JSON.stringify(stripTimes(writesA[0])) === JSON.stringify(stripTimes(writesB[0])),
       `A=${JSON.stringify(stripTimes(writesA[0]))} B=${JSON.stringify(stripTimes(writesB[0]))}`);
    ok('the item carries status NOACT and the reason/approver', writesA[0].items && writesA[0].items['2B'] &&
       writesA[0].items['2B'].status === 'NOACT' && writesA[0].items['2B'].dispBy === 'V. Petrov',
       JSON.stringify(writesA[0].items));
  }
  ok('dashboard/: dialog closes on save', await a.evaluate(() => document.getElementById('dispBox').classList.contains('hidden')));
  ok('dashboard-next: dialog closes on save', await n.evaluate(() => document.getElementById('dispBox').classList.contains('hidden')));

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
