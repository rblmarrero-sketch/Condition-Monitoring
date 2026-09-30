/* THE DEFER DIALOG (#dfBox/#dfScrim) -- put this round off, with a reason,
   review date and who deferred it. Write path: dfSave() -> a plain document
   ({type:"cm-round-deferred", ...}) through window.CMDrive.putDoc(name, doc).

   Run: node tests/defer-next.cjs */
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

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(() => {
    window.__writes = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.putDoc = (name, doc) => { window.__writes.push({ name, doc }); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    try { localStorage.removeItem('cm_dash_who'); } catch (e) {}
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  });
  await p.waitForTimeout(500);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const key = 'MP|TK904';
  await a.evaluate(k => window.askDefer(k), key);
  await n.evaluate(k => window.askDefer(k), key);
  await a.waitForTimeout(300); await n.waitForTimeout(300);

  ok('dashboard/: Defer dialog opens', !(await a.evaluate(() => document.getElementById('dfBox').classList.contains('hidden'))));
  ok('dashboard-next: Defer dialog opens', !(await n.evaluate(() => document.getElementById('dfBox').classList.contains('hidden'))));
  ok('the "what" line names the same unit and round on both', (await a.$eval('#dfWhat', e => e.textContent)) === (await n.$eval('#dfWhat', e => e.textContent)));

  /* Refused with no reason/no name. */
  await a.click('#dfSave'); await n.click('#dfSave');
  await a.waitForTimeout(200); await n.waitForTimeout(200);
  const msgA0 = await a.$eval('#dfMsg', el => el.textContent);
  const msgB0 = await n.$eval('#dfMsg', el => el.textContent);
  ok('refused with no reason/name, and the refusal message matches', !!msgA0.trim() && msgA0 === msgB0, `A="${msgA0}" B="${msgB0}"`);

  const until = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const fill = async p => {
    await p.fill('#dfWhy', 'Machine is down for an unrelated repair');
    await p.fill('#dfUntil', until);
    await p.fill('#dfBy', 'V. Petrov');
  };
  await fill(a); await fill(n);
  await a.click('#dfSave'); await n.click('#dfSave');
  await a.waitForTimeout(500); await n.waitForTimeout(500);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.putDoc called exactly once on each page', writesA.length === 1 && writesB.length === 1, `A=${writesA.length} B=${writesB.length}`);
  if (writesA.length === 1 && writesB.length === 1) {
    ok('the same file name is written on both', writesA[0].name === writesB[0].name, `A=${writesA[0].name} B=${writesB[0].name}`);
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const stripTimes = v => { if (Array.isArray(v)) return v.map(stripTimes);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = stripTimes(v[k]); return o; }
      return (typeof v === 'string' && ISO_RE.test(v)) ? '<ts>' : v; };
    ok('the saved deferral document is field-for-field identical (timestamps excluded)',
       JSON.stringify(stripTimes(writesA[0].doc)) === JSON.stringify(stripTimes(writesB[0].doc)),
       `A=${JSON.stringify(stripTimes(writesA[0].doc))} B=${JSON.stringify(stripTimes(writesB[0].doc))}`);
    ok('the document carries the right type, unit, round and until date', writesA[0].doc.type === 'cm-round-deferred' &&
       writesA[0].doc.u === 'TK904' && writesA[0].doc.t === 'MP' && writesA[0].doc.until === until,
       JSON.stringify(writesA[0].doc));
  }

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
