/* A BUILD THAT CANNOT FINISH DOWNLOADING NEVER HOLDS THE PHONE.

   Two field reports on the same shape. Build 257: a worker that installed one
   file short sat in "waiting" for ever, because the page's checks call
   reg.update(), which installs nothing when the bytes on the server have not
   changed. Build 260: a phone on 256 with signal sat under "Build v259 is
   downloading itself" for a whole shift — the worker's 15 s timeout covered
   the response HEADERS only, so one stalled stream held the install open
   indefinitely, and while an install is open every later check does nothing.

   The rule now: a download is bounded for the whole file; an install that
   cannot finish FAILS rather than lingering, so the next ordinary check —
   from any build of the page, every five minutes — starts it again, reusing
   what is already cached; and a complete install takes over at once.

   What has to be true, with nothing tapped and the OLD page's own actions:
     · a file that is refused leaves the phone on the old build, working, with
       no worker held in waiting and no install held open;
     · a file whose stream stalls does the same, within the deadline;
     · once the file can be fetched, a plain reg.update() — all an old page
       ever does — installs the build, without fetching again what it had,
       and the phone is on it;
     · a worker already in charge is not disturbed by the same check.

   Run: node tests/updheal.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

let BUMP = null, FAIL = null, STALL = null, refused = 0, stalled = 0, served = {};
const hung = [];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  const isNew = u.searchParams.get('v') === BUMP;
  if (isNew) served[p] = (served[p] || 0) + 1;
  if (FAIL && isNew && p.endsWith('/' + FAIL)) { refused++; res.writeHead(502); return res.end('bad gateway'); }
  if (STALL && isNew && p.endsWith('/' + STALL)) {
    /* Headers and a few bytes, then nothing: a stream that never ends. */
    stalled++; res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.write('/* …'); hung.push(res); return;
  }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html')))
    body = Buffer.from(String(body).replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"').replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"')
      /* The same deadline, on a test clock: three seconds instead of ninety. */
      .replace(/const FILE_WAIT = \d+;/, 'const FILE_WAIT = 3000;'));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
const buildOf = p => p.evaluate(() => (typeof BUILD !== 'undefined' ? BUILD : null)).catch(() => null);
async function evalSettled(p, fn) {
  try { return await p.evaluate(fn); }
  catch (e) { if (!/Execution context was destroyed|Target closed|navigation/i.test(String(e && e.message))) throw e;
    await p.waitForLoadState('load').catch(() => {}); await p.waitForTimeout(1500); return p.evaluate(fn); }
}
const regState = p => evalSettled(p, async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const ask = w => new Promise(res => { if (!w) return res(null); const ch = new MessageChannel(); const tm = setTimeout(() => res(null), 4000);
    ch.port1.onmessage = e => { clearTimeout(tm); res(e.data || null); }; try { w.postMessage({ type: 'sw-health' }, [ch.port2]); } catch (_) { clearTimeout(tm); res(null); } });
  return { page: BUILD, installing: !!(reg && reg.installing), waiting: reg && reg.waiting ? await ask(reg.waiting) : null,
           active: reg && reg.active ? await ask(reg.active) : null };
});
/* Wait until no install is in flight and nothing is waiting, or time is up.
   Polled by hand: waitForFunction takes an async predicate's Promise as true. */
async function settled(p, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const done = await evalSettled(p, async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r && !r.installing && !r.waiting; });
    if (done) return true;
    await p.waitForTimeout(1000);
  }
  return false;
}
const oldPageCheck = p => evalSettled(p, async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update().catch(() => {}); });

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(APP, { waitUntil: 'load' });
  await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
  await p.waitForTimeout(6000);
  const before = await buildOf(p);
  let s = await regState(p);
  ok('the phone is on a build, complete and in charge', !!before && s.active && s.active.ok, before);
  let reloads = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) reloads++; });

  console.log('\n  a new build ships and one of its files is refused');
  BUMP = '999'; FAIL = 'due.js';
  await evalSettled(p, () => checkForNewBuild());
  await p.waitForTimeout(2000);
  ok('an install started', (await regState(p)).installing || refused > 0);
  ok('and gave up within the deadline', await settled(p, 60000));
  s = await regState(p);
  ok('the file was asked for and refused, more than once', refused >= 2, refused + ' refusals');
  ok('the phone stays on the old build, which still works', s.page === before && !reloads && s.active && s.active.ok, s.page + ', ' + reloads + ' reloads');
  ok('no worker is held in waiting and no install is held open', !s.waiting && !s.installing, JSON.stringify({ waiting: !!s.waiting, installing: s.installing }));
  const idxBefore = served['/mobile/index.html'] || 0;

  console.log('\n  the link recovers; the old page\'s own check comes round — reg.update() and nothing else');
  FAIL = null;
  await oldPageCheck(p);
  await p.waitForFunction(() => typeof BUILD !== 'undefined' && BUILD === '999', null, { timeout: 60000 }).catch(() => {});
  const after = await buildOf(p);
  ok('the phone is on the new build, with nothing tapped', after === '999', before + ' → ' + after);
  ok('  it reloaded itself exactly once', reloads === 1, reloads + ' reloads');
  ok('  and did not fetch again what it already had', (served['/mobile/index.html'] || 0) === idxBefore, (served['/mobile/index.html'] || 0) + ' vs ' + idxBefore);
  s = await regState(p);
  ok('the worker in charge is 999 and complete, nothing waiting', s.active && s.active.ok && s.active.build === '999' && !s.waiting, JSON.stringify(s));

  console.log('\n  the next build ships and one of its files stalls mid-stream');
  BUMP = '1000'; STALL = 'hme.js'; reloads = 0; const wasIdx = served['/mobile/index.html'] || 0;
  await evalSettled(p, () => checkForNewBuild());
  await p.waitForTimeout(3000);
  ok('the stalled stream was opened', stalled >= 1, stalled + ' opened');
  ok('and the install gave up within the deadline instead of holding for ever', await settled(p, 60000));
  s = await regState(p);
  ok('the phone stays on 999, working, with nothing held', s.page === '999' && !reloads && !s.waiting && !s.installing && s.active && s.active.ok, JSON.stringify({ page: s.page, reloads, waiting: !!s.waiting, installing: s.installing }));
  ok('  the stream was retried, then abandoned', stalled >= 2, stalled + ' opens');
  hung.splice(0).forEach(r => { try { r.end(); } catch (_) {} });

  console.log('\n  the stream flows again; the old page\'s check comes round');
  STALL = null;
  await oldPageCheck(p);
  await p.waitForFunction(() => typeof BUILD !== 'undefined' && BUILD === '1000', null, { timeout: 60000 }).catch(() => {});
  ok('the phone is on 1000, with nothing tapped', (await buildOf(p)) === '1000', String(await buildOf(p)));
  ok('  reloaded once', reloads === 1, reloads + ' reloads');

  console.log('\n  the same check against a worker already in charge changes nothing');
  await evalSettled(p, () => checkForNewBuild());
  await p.waitForTimeout(3000);
  s = await regState(p);
  ok('still 1000, still in charge, no reload', s.page === '1000' && reloads === 1 && !s.waiting, s.page + ', ' + reloads + ' reloads');

  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
