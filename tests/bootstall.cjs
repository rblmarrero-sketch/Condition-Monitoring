/* A PAGE THAT NEVER FINISHES LOADING MUST NOT SIT THERE SAYING NOTHING.

   Reported from the field on three browsers in one afternoon: "it just keeps
   circling" in Chrome, slow in Safari, fine in Edge — same machine, same
   link, same URL. Everything below the markup in mobile/index.html is a
   blocking <script src>, and a single request that CONNECTS AND THEN
   DELIVERS NOTHING blocks the parser before one line of the app's own code
   runs. The markup paints, the version reads "v?", the pickers are empty and
   the tab spins for ever — with no error, nothing on screen, and no way for
   the person holding the phone to tell it from a dead app.

   Reproduced exactly by hanging one script request, which is what this suite
   does. The page now watches its own boot: if the app has not come up inside
   BOOT_WAIT it says so in both languages, NAMES the files that never
   arrived, records them for afterwards, and offers to try again.

   Three things have to hold, and the third is the one that would do damage:
     · a stalled boot is SAID, and says which file it is waiting for;
     · a healthy boot never sees it — a watchdog that fires on a good load is
       worse than none, because people learn to ignore it;
     · the retry is a PLAIN RELOAD. It must never unregister the worker or
       delete a cache. Build 246 did exactly that from the Update button and
       left phones on a flaky link with no app at all and no way back;
       tests/updatesafe.cjs guards the same rule for that button, and this is
       the second place in the page that could make the same mistake.

   Run: node tests/bootstall.cjs   (starts its own server on 8498) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8498);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

/* The one file this server will accept and then never answer. */
const HANG = 'hme-cascade.js';
let hangOn = true;

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (hangOn && u.pathname.endsWith('/' + HANG)) {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return;                       // headers, then silence: the pit link
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  console.log('1. A SCRIPT THAT CONNECTS AND THEN SENDS NOTHING');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'commit' }).catch(() => {});
    /* Long enough to be past BOOT_WAIT (30 s), which is deliberately
       generous — a slow boot is not a broken one. Waiting exactly BOOT_WAIT
       here raced it and reported working code as broken. */
    await p.waitForFunction(() => !!document.getElementById('bootStall'), null, { timeout: 50000 })
      .catch(() => {});
    const r = await p.evaluate(() => {
      const el = document.getElementById('bootStall');
      let rec = null; try { rec = JSON.parse(localStorage.getItem('cm_boot_stall') || 'null'); } catch (e) {}
      return { shown: !!el, text: el ? el.innerText.replace(/\s+/g, ' ') : '',
               btn: !!document.getElementById('bootRetry'),
               ver: (document.getElementById('verNum') || {}).textContent, rec };
    });
    ok('the page says it is not opening, rather than spinning in silence', r.shown, r.text.slice(0, 70));
    ok('  in both languages', /Not opening/.test(r.text) && /Не открывается/.test(r.text));
    ok('  and it NAMES the file it is still waiting for', new RegExp(HANG).test(r.text), r.text.slice(0, 160));
    ok('  there is something to press', r.btn);
    ok('  the app really had not booted (so this is not a false alarm)', r.ver === '?', String(r.ver));
    ok('  and the reason is recorded, not only shown',
       !!r.rec && Array.isArray(r.rec.pending) && r.rec.pending.indexOf(HANG) >= 0 && r.rec.seen === false,
       JSON.stringify(r.rec && r.rec.pending));

    console.log('\n2. AND PRESSING IT DOES NOT DESTROY THE OFFLINE APP');
    /* The rule build 246 broke, in the one other place in the page that
       could break it again. Asserted on the SOURCE, because a reload in the
       harness cannot prove what the handler did not do. */
    const src = fs.readFileSync(path.join(ROOT, 'mobile', 'index.html'), 'utf8');
    const guard = src.slice(src.indexOf('THE BOOT WATCHDOG'), src.indexOf('<script src="native.js'));
    ok('the watchdog never unregisters a worker', !/\.unregister\s*\(/.test(guard));
    ok('  and never deletes a cache', !/caches\s*\.\s*delete/.test(guard));
    ok('  it reloads, and that is all', /location\.reload\(\)/.test(guard));
    await ctx.close();
  }

  console.log('\n3. A BOOT THAT ARRIVES LATE TAKES THE MESSAGE BACK DOWN');
  /* THE FAILURE THIS NEARLY CAUSED. The message covers the whole screen so
     it can be read, which means that left standing over an app that did in
     the end open, it swallows every touch: the app is running, the
     inspector can see it, and nothing they press does anything. A SLOW boot
     — an older handset parsing 3.5 MB on a pit link — produces exactly
     that, and "slow" is the normal state of the link this app is for.
     Simulated here by firing the watchdog by hand on a page that then
     finishes booting, which is the same order of events. */
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    hangOn = false;
    await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
    const r = await p.evaluate(() => {
      /* Put the message up as a late watchdog would, then let the app
         signal the paint it has already done. */
      const box = document.createElement('div');
      box.id = 'bootStall';
      box.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:#141413');
      document.body.appendChild(box);
      const before = !!document.getElementById('bootStall');
      window.__bootOK();
      const after = !!document.getElementById('bootStall');
      /* And the screen is genuinely reachable again, not merely un-parented:
         whatever is under the finger at the middle of the screen must not be
         the overlay. */
      const mid = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return { before, after, blocking: !!(mid && mid.id === 'bootStall'),
               rec: localStorage.getItem('cm_boot_stall') };
    });
    ok('the message was up', r.before);
    ok('  and the app arriving takes it down', !r.after);
    ok('  so the screen can be touched again', !r.blocking);
    ok('  and the stall is no longer recorded against a load that worked', !r.rec, String(r.rec));
    await ctx.close();
  }

  console.log('\n4. A HEALTHY LOAD NEVER SEES IT');
  hangOn = false;
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
    /* Well past BOOT_WAIT (30 s): a watchdog that fires late on a good load
       is a watchdog people learn to ignore. */
    await p.waitForTimeout(34000);
    const r = await p.evaluate(() => ({ shown: !!document.getElementById('bootStall'),
      ver: (document.getElementById('verNum') || {}).textContent,
      rec: localStorage.getItem('cm_boot_stall') }));
    ok('nothing is shown on a load that worked', !r.shown);
    ok('  the app is up', r.ver && r.ver !== '?', String(r.ver));
    ok('  and nothing was recorded against it', !r.rec, String(r.rec));
    ok('  no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await ctx.close();
  }

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
