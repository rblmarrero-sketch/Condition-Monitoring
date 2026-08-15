/* Reported from an iPhone in the field:
 *
 *     Safari can't open the page.
 *     The error was: "FetchEvent.respondWith received an error:
 *     TimeoutError: network too slow".
 *
 * That string was ours. The service worker timed out waiting for the network,
 * found nothing cached, and threw — and a rejected respondWith() is exactly
 * what puts a browser error page in front of an inspector who has no way to
 * clear website data and no second phone.
 *
 * The chain was three decisions that are each fine alone: install swallowed
 * precache failures and skipWaiting()'d anyway, activate deleted the previous
 * build's cache, and fetch threw when it found nothing. A flaky link during an
 * update was enough to brick the app.
 *
 * These are the conditions that produced it. Under every one of them the app
 * must open. */
const { chromium } = require(require('./pw.cjs'));
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* A server that can be told to misbehave the way a pit link does: hang for
 * ever, drop the connection, or serve only some files. */
let MODE = 'ok';                 // ok | hang | dead | flaky
let allow = null;                // when set, only these paths are served
let deny = null;                 // when set, these paths are refused
let served = [];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css' };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  served.push(p);

  if (MODE === 'dead') { req.socket.destroy(); return; }
  if (MODE === 'hang') { /* accept and never answer — the worst kind of link */ return; }
  if (allow && !allow.some(a => p.endsWith(a))) { req.socket.destroy(); return; }
  if (deny && deny.some(d => p.indexOf(d) >= 0)) { res.writeHead(503); return res.end('no'); }

  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('no');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                       'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(f));
});

const boot = async (ctx, url) => {
  const p = await ctx.newPage();
  p.on('pageerror', () => {});
  await p.goto(url, { waitUntil: 'load' }).catch(() => {});
  return p;
};
const swReady = (p) => p.evaluate(() => navigator.serviceWorker.ready.then(() => true)).catch(() => false);
const bodyText = (p) => p.evaluate(() => (document.body && document.body.innerText || '').slice(0, 400)).catch(() => '');

(async () => {
  await new Promise(r => srv.listen(0, r));
  const PORT = srv.address().port;
  const APP = 'http://127.0.0.1:' + PORT + '/mobile/index.html';
  const b = await chromium.launch();

  console.log('  a good first visit installs the offline copy');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await boot(ctx, APP);
    ok('the app loads', /Condition|Inspection|Осмотр/i.test(await bodyText(p)) || !!(await p.$('#saveBtn')));
    ok('a service worker takes over', await swReady(p));
    await p.waitForTimeout(2500);
    const health = await p.evaluate(() => new Promise(res => {
      const ch = new MessageChannel();
      ch.port1.onmessage = e => res(e.data);
      setTimeout(() => res(null), 4000);
      navigator.serviceWorker.controller.postMessage({ type: 'sw-health' }, [ch.port2]);
    })).catch(() => null);
    ok('and reports the copy as complete', health && health.ok === true,
      health ? health.have + '/' + health.need + (health.missing || []).join(' ') : 'no answer');

    console.log('\n  now the network dies completely — the pit');
    MODE = 'dead';
    const p2 = await boot(ctx, APP);
    const t2 = await bodyText(p2);
    ok('the app still opens', !!(await p2.$('#saveBtn')), t2.slice(0, 60));
    ok('and it is the app, not a browser error page', !/can.t open|FetchEvent|respondWith/i.test(t2));
    const data2 = await p2.evaluate(() => ({
      assets: (window.ASSETS || []).length, defects: Object.keys(window.HME || {}).length,
      wear: !!window.WEAR, report: !!window.CMR }));
    ok('the equipment register is there', data2.assets > 1000, String(data2.assets));
    ok('the defect reference is there', data2.defects > 0, String(data2.defects));
    ok('the wear limits are there', data2.wear);
    ok('and the report engine', data2.report);

    console.log('\n  and the worst link of all: connects, then never answers');
    MODE = 'hang';
    const t0 = Date.now();
    const p3 = await boot(ctx, APP);
    const ms = Date.now() - t0;
    ok('the app opens anyway', !!(await p3.$('#saveBtn')), ms + ' ms');
    ok('without waiting on the network', ms < 8000, ms + ' ms');
    ok('and no error page', !/can.t open|FetchEvent|too slow/i.test(await bodyText(p3)));
    await ctx.close();
  }

  console.log('\n  the case that caused the report: an update on a link that dies part-way');
  {
    MODE = 'ok'; allow = null;
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await boot(ctx, APP);
    await swReady(p);
    await p.waitForTimeout(2500);
    ok('a working install first', !!(await p.$('#saveBtn')));

    /* Now only the page itself is reachable — every data file fails, exactly
       what a link with one bar does. The old code would install this, throw
       away the previous cache, and be unable to serve anything. */
    allow = ['/index.html', '/'];
    served = [];
    const p4 = await boot(ctx, APP);
    await p4.waitForTimeout(3000);
    ok('the app still opens', !!(await p4.$('#saveBtn')));
    const data4 = await p4.evaluate(() => ({ assets: (window.ASSETS || []).length, wear: !!window.WEAR }));
    ok('and still has its register, from the copy it already had',
      data4.assets > 1000, String(data4.assets));
    ok('and its wear limits', data4.wear);

    console.log('\n  the link comes all the way back');
    allow = null; MODE = 'ok';
    const p5 = await boot(ctx, APP);
    await p5.waitForTimeout(3000);
    ok('everything is still there', (await p5.evaluate(() => (window.ASSETS || []).length)) > 1000);
    await ctx.close();
  }

  console.log('\n  a phone that has never had a complete copy is told so, kindly');
  {
    MODE = 'ok'; allow = ['/index.html', '/', '/sw.js'];      // page and worker only
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await boot(ctx, APP);
    await p.waitForTimeout(3000);
    ok('the page itself still renders', !!(await p.$('body')));

    // now nothing at all is reachable
    MODE = 'dead';
    const p6 = await boot(ctx, APP);
    const t6 = await bodyText(p6);
    ok('it never shows the browser error page',
      !/can.t open|FetchEvent|respondWith/i.test(t6), t6.slice(0, 80));
    /* Either the app opened from what it has, or our own page explains itself.
       Both are recoverable; Safari's is not. */
    const isApp = !!(await p6.$('#saveBtn'));
    const isOurs = /not finished downloading|Nothing you captured has been lost/i.test(t6);
    ok('it is either the app or our own offline page', isApp || isOurs,
      isApp ? 'the app' : t6.slice(0, 70));
    if (isOurs) {
      ok('which says the captured work is safe', /has been lost/i.test(t6));
      ok('and how to fix it', /signal once|bar or two|camp wifi/i.test(t6));
      ok('and offers to retry', !!(await p6.$('button')));
    }
    await ctx.close();
  }

  console.log('\n  an incomplete build never takes over from a working one');
  {
    /* The rule that breaks the chain. Read it out of the worker rather than
       trusting the comment: install must not skipWaiting when essentials are
       missing, and activate must not sweep the old caches. */
    const sw = fs.readFileSync(ROOT + '/mobile/sw.js', 'utf8');
    ok('install refuses to take over when essentials are missing',
      /if\s*\(missing\.length\)[\s\S]*?return;[\s\S]*?await self\.skipWaiting\(\)/.test(sw));
    ok('and "./" is not required, since not every host serves a directory index',
      !/const ESSENTIAL = \[\s*\n\s*"\.\/",/.test(sw));
    /* Sweeping is inside the "essentials all present" branch and nowhere else,
       so an incomplete build cannot destroy the copy that still works. */
    ok('activate only sweeps when this build is complete',
      /if\s*\(!missing\.length\)\s*\{[\s\S]*?caches\.delete[\s\S]*?\}\s*else\s*\{/.test(sw));
    ok('and the incomplete branch keeps them and repairs instead',
      /\}\s*else\s*\{[\s\S]{0,240}healSoon\(\)/.test(sw));
    ok('and nothing in fetch throws', !/^\s*throw err;/m.test(sw));
    ok('every branch answers with a Response',
      (sw.match(/return offlinePage\(\)|new Response\(/g) || []).length >= 3);
  }

  console.log('\n  the phone says whether it is safe to leave the office');
  {
    /* Settings was the wrong place for this. The failure it guards against is
       invisible until it is unrecoverable, and the last moment anybody can act
       on it is while they are still standing next to the wifi — so it has to be
       on the screen they are already looking at, not behind a gear icon nobody
       taps. */
    MODE = 'ok'; allow = null; deny = null;
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await boot(ctx, APP);
    await swReady(p);
    await p.waitForTimeout(6000);
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(5000);

    const good = await p.evaluate(() => {
      const el = document.getElementById('readyBar');
      return { cls: el.className, txt: (el.textContent || '').trim(),
               first: document.querySelector('#paneCapture > *').id };
    });
    ok('a complete phone says it is ready', /good/.test(good.cls) && /Ready to work offline/i.test(good.txt),
      good.txt);
    ok('and it is the first thing on the capture screen', good.first === 'readyBar', good.first);
    ok('the ready state stays small — one line, no button',
      !(await p.$('#readyBar button')));

    console.log('\n  and when it is not ready it is impossible to miss');
    deny = ['/wear-figs.js'];
    const ctx2 = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p2 = await boot(ctx2, APP);
    /* Sampling at a fixed 9s was a race this suite had been winning by luck.
       The app is DELIBERATELY silent while a worker might still be arriving —
       a first load with no controller yet says nothing for 12 seconds, because
       alarming somebody about a state that fixes itself a second later is
       worse than waiting. Whenever install was slow enough that the controller
       had not landed by 9s, the bar was legitimately still empty and five
       checks failed on the app being correct. Wait for the verdict, not for a
       stopwatch, and fail with a real message if it never comes. */
    const spoke = await p2.waitForFunction(() => {
      const el = document.getElementById('readyBar');
      return !!el && /good|bad/.test(el.className);
    }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    ok('the readiness check reaches a verdict at all', spoke,
       spoke ? '' : 'still silent after 30s');
    const bad = await p2.evaluate(() => {
      const el = document.getElementById('readyBar');
      const r = el.getBoundingClientRect();
      return { cls: el.className, txt: (el.textContent || '').replace(/\s+/g, ' ').trim(),
               h: Math.round(r.height), top: Math.round(r.top), y: Math.round(window.scrollY),
               btn: (el.querySelector('button') || {}).textContent || '' };
    });
    ok('it says so plainly', /bad/.test(bad.cls) && /Not ready to work offline/i.test(bad.txt),
      bad.txt.slice(0, 70));
    ok('and says how far short it is', /\d+ of \d+ files/.test(bad.txt), bad.txt.slice(0, 90));
    ok('and why it matters, in the pit', /may not open/i.test(bad.txt));
    ok('with the fix attached, not a description of it', /Finish downloading/i.test(bad.btn), bad.btn);
    /* The app reloads itself — when the worker first takes over, and again
       whenever an update lands — and the browser restores the scroll offset
       across a reload. That opened the phone about 150px down, with the
       readiness check and half the header already off screen, which defeats
       the one thing it has to do. history.scrollRestoration is manual now. */
    ok('the app opened at the top, not part-scrolled', bad.y === 0, 'scrollY ' + bad.y);
    ok('so the check is above the fold', bad.top >= 0 && bad.top < 400, 'top ' + bad.top + 'px');
    ok('and big enough to interrupt somebody', bad.h > 80, bad.h + 'px tall');
    /* Built in code, so the [data-i18n] sweep does not reach it. A go/no-go
       check left in the language somebody just switched away from is the wrong
       one to have on the screen. */
    await p2.click('button[data-lang="ru"]');
    await p2.waitForTimeout(1200);
    const ru = await p2.evaluate(() => (document.getElementById('readyBar').textContent || '').trim());
    ok('and it follows the language switch', /без связи/i.test(ru), ru.slice(0, 60));
    await p2.click('button[data-lang="en"]');
    await ctx2.close();
    deny = null;
    await ctx.close();
  }

  console.log('\n  an update never pulls the page out from under somebody');
  {
    /* The reload on controllerchange used to be unconditional. On a phone that
       is an inspector halfway through typing a measurement whose screen resets
       under their thumb, losing whatever was not yet committed. Rare, in the
       way that means it happens to somebody else and never in front of you. */
    const src = fs.readFileSync(ROOT + '/mobile/index.html', 'utf8');
    ok('the handler asks whether anyone is working first',
      /controllerchange[\s\S]{0,400}if\s*\(!busy\(\)\)/.test(src));
    ok('an open draft counts as working', /draft\.positions[\s\S]{0,60}length\) return true/.test(src));
    ok('so does an edit in progress', /if\s*\(typeof editing[\s\S]{0,40}return true/.test(src));
    ok('so does a cursor in a field', /INPUT\|TEXTAREA\|SELECT/.test(src));
    ok('and when it cannot tell, it assumes they are',
      /catch\(e\)\{ return true; \}/.test(src));
    ok('the banner offers the reload instead of taking it',
      /staleGo"\)\.onclick=\(\)=>location\.reload\(\)/.test(src));

    const sw = fs.readFileSync(ROOT + '/mobile/sw.js', 'utf8');
    ok('and the previous build stays cached for the page still running on it',
      /keys\.slice\(1\)\.map\(k => caches\.delete\(k\)\)/.test(sw));
  }

  console.log('\n  a data file that cannot be fetched is named, not silent');
  {
    /* The ?v= branch answers a miss with a 503 rather than rejecting. That is
       the difference between "the app loads and tells you assets.js is missing,
       here is the repair button" and "the whole page fails to load". */
    /* Refused at the server, not with a page route: a page route does not
       intercept the service worker's own fetch, so the worker would quietly
       fetch the real file and the test would prove nothing. */
    MODE = 'ok'; allow = null; deny = ['/assets.js'];
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(APP, { waitUntil: 'load' }).catch(() => {});
    await p.waitForTimeout(2500);
    ok('the page still loads', !!(await p.$('#saveBtn')));
    const warn = await p.evaluate(() => {
      const w = document.getElementById('dataWarn');
      const t = document.getElementById('dataWarnText');
      return { shown: w && !w.classList.contains('hidden'), txt: (t && t.textContent || '').slice(0, 140) };
    });
    ok('and names the file that did not arrive', warn.shown && /assets\.js/.test(warn.txt),
      warn.txt || 'no warning');
    deny = null;
    await ctx.close();
  }

  console.log('\n  and it never answers a live call from cache');
  {
    /* The mistake this guards against: "cache first, network as fallback" reads
       like a safe default, and the app shell is the only place it is. Applied to
       a same-origin API call it is silent poison — the app shows last week's
       answer with nothing on screen suggesting why. It cost five suites the
       moment it existed, and the Phase 3 backend can be same-origin. */
    MODE = 'ok'; allow = null;
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await boot(ctx, APP);
    await swReady(p);
    await p.waitForTimeout(2000);

    const read = () => p.evaluate(u => fetch(u).then(r => r.text()), '/live?x=1');
    let n = 0;
    srv.removeAllListeners('request');
    srv.on('request', (req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/live') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end('answer-' + (++n));
      }
      let pa = u.pathname === '/' ? '/index.html' : u.pathname;
      const f = path.join(ROOT, pa);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); return res.end('no');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      res.end(fs.readFileSync(f));
    });

    const a1 = await read(), a2 = await read(), a3 = await read();
    ok('a same-origin request is answered fresh every time',
      a1 !== a2 && a2 !== a3, [a1, a2, a3].join(' '));
    ok('and the worker never cached it',
      await p.evaluate(() => caches.keys()
        .then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.match('/live?x=1')))))
        .then(hits => hits.every(h => !h))));
    await ctx.close();
  }

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
