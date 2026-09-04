/* A BUILD THAT DOWNLOADED SHORT FINISHES BY ITSELF.

   A phone on build 255 with signal, an hour after 256 was published. The
   worker for 256 had installed, one of its 28 files had failed twice on a
   thin link, and sw.js — correctly — refused to let an incomplete build take
   over. It sat in waiting. The five-minute check then called reg.update(),
   which does nothing for a worker whose bytes have not changed, and nothing
   ever asked the waiting worker to finish. The only thing that did was the
   Update button. An update that waits on a technician is the defect this
   app's standing rule exists to prevent.

   What has to be true, with nothing tapped:
     · a file that fails leaves the phone on the old build, still working,
       with the new worker held in waiting rather than in charge;
     · once the file can be fetched, the next ordinary check finishes the
       cache and the new build takes over and the page is on it;
     · a worker that is complete and already in charge is not disturbed by
       the same request.

   Run: node tests/updheal.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

let BUMP = null, FAIL = null, failed = 0;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  /* One essential file of the NEW build cannot be fetched while FAIL is set:
     the link dropped, the proxy answered 502, the tunnel closed. */
  if (FAIL && p.endsWith('/' + FAIL) && u.searchParams.get('v') === BUMP) { failed++; res.writeHead(502); return res.end('bad gateway'); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html')))
    body = Buffer.from(String(body).replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"').replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"'));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
const buildOf = p => p.evaluate(() => (typeof BUILD !== 'undefined' ? BUILD : null)).catch(() => null);
async function evalSettled(p, fn) {
  try { return await p.evaluate(fn); }
  catch (e) { if (!/Execution context was destroyed|Target closed|navigation/i.test(String(e && e.message))) throw e;
    await p.waitForLoadState('load').catch(() => {}); await p.waitForTimeout(1500); return p.evaluate(fn); }
}
/* What the registration holds: the build in charge and whether a worker is
   held in waiting, and that worker's own account of its cache. */
const regState = p => evalSettled(p, async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const ask = w => new Promise(res => { if (!w) return res(null); const ch = new MessageChannel(); const tm = setTimeout(() => res(null), 4000);
    ch.port1.onmessage = e => { clearTimeout(tm); res(e.data || null); }; try { w.postMessage({ type: 'sw-health' }, [ch.port2]); } catch (_) { clearTimeout(tm); res(null); } });
  return { page: BUILD, waiting: reg && reg.waiting ? await ask(reg.waiting) : null, active: reg && reg.active ? await ask(reg.active) : null,
           controller: !!navigator.serviceWorker.controller };
});

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
  ok('the phone is on a build, complete and in charge', !!before && (await regState(p)).active && (await regState(p)).active.ok, before);

  console.log('\n  a new build ships and one of its files cannot be fetched');
  BUMP = '999'; FAIL = 'due.js';
  let reloads = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) reloads++; });
  await evalSettled(p, () => checkForNewBuild());
  /* Two tries at 15 s each is the worker's patience for one file; give it that
     and a margin, then look at what it left behind. */
  await p.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.waiting); }, null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  let s = await regState(p);
  ok('the file was asked for and refused', failed >= 1, failed + ' refusals');
  ok('the phone stays on the old build, which still works', s.page === before && !reloads, s.page + ', ' + reloads + ' reloads');
  ok('the new worker is held in waiting, short of that one file', s.waiting && s.waiting.ok === false && s.waiting.build === '999' && (s.waiting.missing || []).some(m => /due\.js/.test(m)),
     JSON.stringify(s.waiting));
  ok('  and the build in charge is still complete', s.active && s.active.ok && s.active.build === before, JSON.stringify(s.active));

  console.log('\n  the link recovers, and the next five-minute check comes round');
  FAIL = null; const refusals = failed;
  await evalSettled(p, () => checkForNewBuild());
  await p.waitForFunction(() => typeof BUILD !== 'undefined' && BUILD === '999', null, { timeout: 45000 }).catch(() => {});
  const after = await buildOf(p);
  ok('the phone is on the new build, with nothing tapped', after === '999', before + ' → ' + after);
  ok('  it reloaded itself exactly once', reloads === 1, reloads + ' reloads');
  ok('  and no further refusal was needed to get there', failed === refusals, (failed - refusals) + ' more');
  s = await regState(p);
  ok('the worker in charge is 999 and complete, and nothing is left waiting', s.active && s.active.ok && s.active.build === '999' && !s.waiting, JSON.stringify(s));
  const ready = await p.waitForFunction(() => /good/.test(document.getElementById('readyBar').className), null, { timeout: 20000 }).then(() => true).catch(() => false);
  ok('  and it is ready for offline on the new build', ready);

  console.log('\n  the same request to a worker already in charge changes nothing');
  await evalSettled(p, () => checkForNewBuild());
  await p.waitForTimeout(3000);
  s = await regState(p);
  ok('still 999, still in charge, no reload', s.page === '999' && reloads === 1 && !s.waiting, s.page + ', ' + reloads + ' reloads');

  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
