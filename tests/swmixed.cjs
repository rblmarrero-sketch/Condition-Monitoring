/* THE PAGE IN A BUILD'S CACHE IS THAT BUILD'S PAGE.

   revalidate() fetched index.html on every open and put whatever came back
   into the CURRENT worker's cache, unread. With a newer build on the server
   and its install not finished — one file refused, a stream stalled, or
   simply not asked for yet — the next open wrote the NEW page into the OLD
   build's cache. The old worker then served a page whose scripts ask for
   ?v=<new> against a cache holding ?v=<old>: online, a mixture of two
   releases; offline, the previous build's modules or a 503. Nothing threw.

   What has to hold, with the server ahead and the install unable to finish:
     · the old build's cache still holds the OLD page after an open;
     · the page that opens is the old build, whole;
     · the new page was not thrown away either — the install path was
       started for it, and once the refused file flows the phone lands on
       the new build by the ordinary route, with nothing tapped.

   Run: node tests/swmixed.cjs */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

let BUMP = null, FAIL = null, refused = 0;
const served = {};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  served[p] = (served[p] || 0) + 1;
  if (FAIL && BUMP && u.searchParams.get('v') === BUMP && p.endsWith('/' + FAIL)) { refused++; res.writeHead(502); return res.end('bad gateway'); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html')))
    body = Buffer.from(String(body).replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"').replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"')
      .replace(/const FILE_WAIT = \d+;/, 'const FILE_WAIT = 3000;'));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
async function evalSettled(p, fn, arg) {
  try { return await p.evaluate(fn, arg); }
  catch (e) { if (!/Execution context was destroyed|Target closed|navigation/i.test(String(e && e.message))) throw e;
    await p.waitForLoadState('load').catch(() => {}); await p.waitForTimeout(1500); return p.evaluate(fn, arg); }
}
const cachedPageBuild = (p, build) => evalSettled(p, async b => {
  const c = await caches.open('plug-capture-v' + b);
  const r = await c.match('./index.html');
  if (!r) return null;
  const m = (await r.text()).match(/const BUILD\s*=\s*"([^"]+)"/);
  return m ? m[1] : '?';
}, build);
async function settled(p, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const done = await evalSettled(p, async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r && !r.installing && !r.waiting; });
    if (done) return true;
    await p.waitForTimeout(1000);
  }
  return false;
}

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
  const old = await evalSettled(p, () => BUILD);
  ok('the phone is on a build with a worker in charge', !!old && await evalSettled(p, () => !!navigator.serviceWorker.controller), old);
  ok('  and that build\'s cache holds that build\'s page', (await cachedPageBuild(p, old)) === old, await cachedPageBuild(p, old));

  console.log('\n  a new build ships; one of its files is refused, so its install cannot finish');
  BUMP = '999'; FAIL = 'due.js';
  await evalSettled(p, () => checkForNewBuild());
  await p.waitForTimeout(2500);
  ok('the install was attempted and failed on the refused file', await settled(p, 60000) && refused >= 1, refused + ' refusals');

  console.log('\n  the app is opened again — the old worker serves it and revalidates the page behind the reader');
  const idxBefore = served['/mobile/index.html'] || 0;
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(4000);
  ok('the page that opened is the old build, whole', (await evalSettled(p, () => BUILD)) === old, await evalSettled(p, () => BUILD));
  ok('  the revalidation did fetch the server\'s page', (served['/mobile/index.html'] || 0) > idxBefore, (served['/mobile/index.html'] || 0) - idxBefore + ' fetch(es)');
  ok('  and the old build\'s cache STILL holds the old page — the newer one was refused', (await cachedPageBuild(p, old)) === old, 'cache ' + old + ' holds page ' + await cachedPageBuild(p, old));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(2500);
  ok('  a second open is the same: still ' + old, (await evalSettled(p, () => BUILD)) === old && (await cachedPageBuild(p, old)) === old, await evalSettled(p, () => BUILD));
  ok('  every script the page runs is its own build\'s', await evalSettled(p, b => [...document.querySelectorAll('script[src]')].every(s => !/[?&]v=/.test(s.src) || s.src.includes('v=' + b)), old));

  console.log('\n  the refused file flows again; the ordinary check comes round');
  FAIL = null;
  await evalSettled(p, async () => { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update().catch(() => {}); });
  await p.waitForFunction(() => typeof BUILD !== 'undefined' && BUILD === '999', null, { timeout: 60000 }).catch(() => {});
  ok('the phone lands on the new build with nothing tapped', (await evalSettled(p, () => BUILD)) === '999', String(await evalSettled(p, () => BUILD)));
  ok('  and the new build\'s cache holds the new page', (await cachedPageBuild(p, '999')) === '999', String(await cachedPageBuild(p, '999')));

  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
