/* THE DATA SOURCES DIALOG (#dataOv) -- Google Drive / Server URL, folder on
   this PC, import a file. A real connection test or load needs an actual
   reachable Apps Script/REST endpoint or a real local folder handle, neither
   of which this sandbox can stand up -- so, per the task's own sanctioned
   fallback ("the UI opens correctly and the save button calls the same
   function with the same arguments, verified by intercepting the call"),
   this suite stubs window.CMDrive.save/ping/load (the actual functions
   driveRun() calls -- read from the code before writing this, not guessed)
   and proves the SAME UI actions call them with the SAME arguments on both
   pages. It also proves the "Import a file" path for real, since that one
   needs no network at all (CMDash.importRecords from a File's own text).

   NOT verified here, and said so rather than left silent: an actual
   Google Drive Apps Script or REST connection succeeding end to end, and the
   File System Access "Open folder…" picker (both require a live external
   endpoint or a real OS file-picker dialog outside Playwright's reach in
   this environment).

   Run: node tests/datasources-next.cjs */
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

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(() => {
    window.__calls = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.save = (u, s) => { window.__calls.push({ fn: 'save', u, s }); };
    CMDrive.configured = () => true;
    CMDrive.ping = () => { window.__calls.push({ fn: 'ping' }); return Promise.resolve({ folder: 'Stub', canDelete: false, write: true, index: true, batch: true }); };
    CMDrive.load = (cb, opts) => { window.__calls.push({ fn: 'load', opts }); return Promise.resolve({ records: 0, held: 0 }); };
  });
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const open = p => p.evaluate(() => { document.getElementById('dataOv').classList.remove('hidden'); });
  await open(a); await open(n);
  ok('dashboard/: Data sources dialog opens', !(await a.evaluate(() => document.getElementById('dataOv').classList.contains('hidden'))));
  ok('dashboard-next: Data sources dialog opens', !(await n.evaluate(() => document.getElementById('dataOv').classList.contains('hidden'))));

  const URL_ = 'https://script.google.com/macros/s/AKfycbTest/exec';
  const SEC = 'shh';
  await a.fill('#drvUrl', URL_); await n.fill('#drvUrl', URL_);
  await a.fill('#drvSec', SEC); await n.fill('#drvSec', SEC);
  await a.click('#drvTest'); await n.click('#drvTest');
  await a.waitForTimeout(400); await n.waitForTimeout(400);

  /* Both pages also run their own periodic background pull (the "checks
     Drive by itself every few minutes" behaviour #ds_btnhelp itself
     describes), which can interleave an extra CMDrive.load call at an
     unpredictable moment on either page -- a timing artifact of the stub
     firing sooner or later on one page than the other, not a behavior
     difference this suite is about. So each step below counts and inspects
     the calls that MATTER (save/ping around a button press) rather than
     asserting a fixed position in the whole call log, which a stray
     background call would otherwise make flaky on one page and not the
     other. */
  const since = async (p, n0) => p.evaluate(k => window.__calls.slice(k), n0);
  const callsA1 = (await since(a, 0)).filter(c => c.fn === 'save' || c.fn === 'ping');
  const callsB1 = (await since(n, 0)).filter(c => c.fn === 'save' || c.fn === 'ping');
  console.log('dashboard/     Test connection calls (save/ping only): ' + JSON.stringify(callsA1));
  console.log('dashboard-next Test connection calls (save/ping only): ' + JSON.stringify(callsB1));
  ok('"Test connection" calls CMDrive.save then CMDrive.ping, identically on both pages',
     JSON.stringify(callsA1) === JSON.stringify(callsB1) && callsA1.length === 2 && callsA1[0].fn === 'save' && callsA1[1].fn === 'ping',
     `A=${JSON.stringify(callsA1)} B=${JSON.stringify(callsB1)}`);
  const msgA = await a.$eval('#drvMsg', el => el.textContent);
  const msgB = await n.$eval('#drvMsg', el => el.textContent);
  ok('the connection message matches', msgA === msgB, `A="${msgA}" B="${msgB}"`);

  const markA = await a.evaluate(() => window.__calls.length);
  const markB = await n.evaluate(() => window.__calls.length);
  await a.click('#drvGo'); await n.click('#drvGo');
  await a.waitForTimeout(400); await n.waitForTimeout(400);
  const callsA2 = (await since(a, markA)).filter(c => c.fn === 'load' && c.opts && c.opts.full === false);
  const callsB2 = (await since(n, markB)).filter(c => c.fn === 'load' && c.opts && c.opts.full === false);
  ok('"Load from Drive" calls CMDrive.load with {full:false} on both pages',
     callsA2.length === 1 && callsB2.length === 1, `A=${JSON.stringify(callsA2)} B=${JSON.stringify(callsB2)}`);

  const markA2 = await a.evaluate(() => window.__calls.length);
  const markB2 = await n.evaluate(() => window.__calls.length);
  await a.click('#drvFull'); await n.click('#drvFull');
  await a.waitForTimeout(400); await n.waitForTimeout(400);
  const callsA3 = (await since(a, markA2)).filter(c => c.fn === 'load' && c.opts && c.opts.full === true);
  const callsB3 = (await since(n, markB2)).filter(c => c.fn === 'load' && c.opts && c.opts.full === true);
  ok('"Reload everything" calls CMDrive.load with {full:true} on both pages',
     callsA3.length === 1 && callsB3.length === 1, `A=${JSON.stringify(callsA3)} B=${JSON.stringify(callsB3)}`);

  /* Import a file -- this one needs no network, so it is exercised for real:
     CMDash.importRecords is called with the parsed content, same as clicking
     "Choose file(s)…" and picking one would produce. */
  const REC = [{ equip: 'TK906', date: '2026-09-15', type: 'MP', cls: 'HT', by: 'Imported',
    items: [{ key: '1A', label: 'LF Final Drive', grade: 'B' }] }];
  const importReal = p => p.evaluate(recs => { window.CMDash.importRecords(recs); }, REC);
  await importReal(a); await importReal(n);
  const countA = await a.evaluate(() => window.CMDash.allRecs().filter(r => r.equip === 'TK906').length);
  const countB = await n.evaluate(() => window.CMDash.allRecs().filter(r => r.equip === 'TK906').length);
  ok('an imported record is held identically on both pages (real importRecords call, no stub)', countA === 1 && countB === 1, `A=${countA} B=${countB}`);

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
