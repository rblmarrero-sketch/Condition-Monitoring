/* UPDATE MUST NEVER LEAVE A PHONE WITH NOTHING.
 *
 * Reported from an iPhone in the field on build 244, minutes after an inspector
 * was told to tap "Update":
 *
 *     Safari can't open the page because the network connection was lost.
 *
 * That is Safari's own page, which means there was no service worker and no
 * cache left to answer the navigation. The Update button had unregistered every
 * worker, deleted every cache, swallowed the refetches that failed on a flaky
 * link, and navigated. sw.js is written so a build cannot take over until it is
 * complete and the old cache survives until then; one handler in the page
 * defeated all of it from outside.
 *
 * What has to be true, and is asserted here by driving the real page against a
 * server that can ship a "new build" or refuse one of its files:
 *   · Update tapped with no signal leaves the worker, the cache and the app —
 *     it still opens offline afterwards, and says why nothing happened;
 *   · Update tapped when the new build cannot finish downloading leaves the
 *     phone on the build that works, offline-ready, and says so;
 *   · Update tapped when a new build IS available puts it on, with nothing
 *     unregistered and nothing deleted by the page;
 *   · and the page source contains no call that could do either.
 */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* The real app, with two levers a deploy has: ship a newer build number, or
   have one of its files fail to arrive. */
let BUMP = null, BLOCK = null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  if (BLOCK && p.indexOf(BLOCK) >= 0 && u.searchParams.get('v') === BUMP) { res.writeHead(503); return res.end('no'); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html'))) {
    body = Buffer.from(String(body)
      .replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"')
      .replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"')
      .replace(/\?v=\d+/g, '?v=' + BUMP));
  }
  /* Ten minutes, as GitHub Pages serves it — the registration must fetch sw.js
     past this or an update check answers with the build it already has. */
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  res.end(body);
});

const buildOf = p => p.evaluate(() => (typeof BUILD !== 'undefined' ? BUILD : null)).catch(() => null);
const label = p => p.evaluate(() => (document.getElementById('forceUpdate') || {}).textContent || '').catch(() => '');
const word = (p, k) => p.evaluate(k => t(k), k);
const tapUpdate = p => p.evaluate(() => { document.getElementById('forceUpdate').click(); });
const counters = p => p.evaluate(() => ({ unreg: +(localStorage.getItem('__unreg') || 0), cdel: +(localStorage.getItem('__cdel') || 0) }));
const footing = p => p.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const keys = (await caches.keys()).filter(k => /^plug-capture-v/.test(k));
  return { reg: !!reg, caches: keys.length, build: typeof BUILD !== 'undefined' ? BUILD : null,
           assets: (window.ASSETS || []).length, ready: (document.getElementById('readyBar') || {}).className || '' };
});
async function waitLabel(p, text, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if ((await label(p)).indexOf(text) >= 0) return true; await p.waitForTimeout(400); }
  return false;
}
async function phone(b) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  /* Count the two calls the page must never make. Kept in localStorage so the
     figure survives the reload an update causes. */
  await ctx.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    const bump = k => { try { localStorage.setItem(k, String((+localStorage.getItem(k) || 0) + 1)); } catch (e) {} };
    try { const U = ServiceWorkerRegistration.prototype.unregister;
      ServiceWorkerRegistration.prototype.unregister = function () { bump('__unreg'); return U.apply(this, arguments); }; } catch (e) {}
    try { const D = CacheStorage.prototype.delete;
      CacheStorage.prototype.delete = function () { bump('__cdel'); return D.apply(this, arguments); }; } catch (e) {}
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  return { ctx, p };
}
async function installed(p, APP) {
  await p.goto(APP, { waitUntil: 'load' });
  await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
  await p.waitForFunction(() => /good/.test((document.getElementById('readyBar') || {}).className || ''), null, { timeout: 30000 }).catch(() => {});
  await p.goto(APP, { waitUntil: 'load' });            // so the worker controls the page
  await p.waitForTimeout(1500);
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();

  console.log('the page cannot do it: no unregister, no cache delete in the source');
  {
    const src = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
    ok('mobile/index.html never calls unregister()', !/\.unregister\(\)/.test(src));
    ok('mobile/index.html never deletes a cache', !/caches\.delete\(/.test(src));
    ok('the registration fetches sw.js past the HTTP cache', /register\("sw\.js",\{updateViaCache:"none"\}\)/.test(src));
    ok('the Update button goes through updateNow()', /fu\.onclick=\(e\)=>\{ e\.preventDefault\(\); updateNow\(\); \}/.test(src));
  }

  console.log('\nUpdate tapped with no signal');
  {
    BUMP = null; BLOCK = null;
    const { ctx, p } = await phone(b);
    await installed(p, APP);
    const before = await footing(p);
    ok('installed and offline-ready to begin with', before.reg && before.caches >= 1 && /good/.test(before.ready), JSON.stringify(before));
    await ctx.setOffline(true);
    await tapUpdate(p);
    ok('it says there is no signal, and that the app is kept', await waitLabel(p, await word(p, 'upd_nosig'), 5000), await label(p));
    await p.waitForTimeout(1500);
    const after = await footing(p);
    ok('the worker and the cache are still there', after.reg && after.caches >= 1, JSON.stringify(after));
    /* The thing the field saw: open the app again with no signal. */
    let opened = false;
    try { await p.goto(APP, { waitUntil: 'load' }); opened = true; } catch (e) { opened = false; }
    const cold = opened ? await footing(p) : null;
    ok('the app still opens offline afterwards', opened && cold && cold.build === before.build && cold.assets > 1000, JSON.stringify(cold));
    ok('and the label came back to normal', /Update/i.test(await label(p)), await label(p));
    const c = await counters(p);
    ok('nothing was unregistered and nothing deleted', c.unreg === 0 && c.cdel === 0, JSON.stringify(c));
    await ctx.setOffline(false);
    await ctx.close();
  }

  console.log('\nUpdate tapped when the new build cannot finish downloading');
  {
    BUMP = null; BLOCK = null;
    const { ctx, p } = await phone(b);
    await installed(p, APP);
    const before = await footing(p);
    BUMP = '996'; BLOCK = 'assets.js';                 // a newer build, one file of which never arrives
    await tapUpdate(p);
    ok('it says the download could not finish and nothing changed', await waitLabel(p, await word(p, 'upd_fail'), 60000), await label(p));
    const after = await footing(p);
    ok('the phone is still on the build that works', after.build === before.build, before.build + ' → ' + after.build);
    ok('the worker and its cache are still there', after.reg && after.caches >= 1, JSON.stringify(after));
    await ctx.setOffline(true);
    let opened = false;
    try { await p.goto(APP, { waitUntil: 'load' }); opened = true; } catch (e) { opened = false; }
    const cold = opened ? await footing(p) : null;
    ok('and it still opens offline', opened && cold && cold.build === before.build && cold.assets > 1000, JSON.stringify(cold));
    const c = await counters(p);
    ok('nothing was unregistered and nothing deleted', c.unreg === 0 && c.cdel === 0, JSON.stringify(c));
    await ctx.setOffline(false);
    BUMP = null; BLOCK = null;
    await ctx.close();
  }

  console.log('\nUpdate tapped when a new build is there');
  {
    BUMP = null; BLOCK = null;
    const { ctx, p } = await phone(b);
    await installed(p, APP);
    const before = await footing(p);
    BUMP = '997';
    await tapUpdate(p);
    await p.waitForFunction(() => typeof BUILD !== 'undefined' && BUILD === '997', null, { timeout: 60000 }).catch(() => {});
    const after = await footing(p).catch(() => null);
    ok('the phone is on the new build', after && after.build === '997', before.build + ' → ' + (after && after.build));
    ok('with a worker and a cache in charge', after && after.reg && after.caches >= 1, JSON.stringify(after));
    const ready = await p.waitForFunction(() => /good/.test((document.getElementById('readyBar') || {}).className || ''), null, { timeout: 30000 }).then(() => true).catch(() => false);
    ok('and offline-ready on it', ready, await p.evaluate(() => (document.getElementById('readyBar') || {}).className));
    const c = await counters(p);
    ok('nothing was unregistered and nothing deleted on the way', c.unreg === 0 && c.cdel === 0, JSON.stringify(c));
    BUMP = null;
    await ctx.close();
  }

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
