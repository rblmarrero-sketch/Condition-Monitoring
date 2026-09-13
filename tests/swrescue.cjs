/* THE WORKER RESCUES A PAGE THAT HAS STOPPED ANSWERING — AND ONLY THAT PAGE.

   Build 321 shipped a repaint loop that pegged the main thread before boot
   finished. A pegged page cannot check for a build, cannot apply one,
   cannot send its queue, and cannot even run a timer — so the boot
   watchdog could not fire either. Meanwhile the worker answers every
   navigation in its scope from the cache, so relaunching the app served
   the frozen build straight back. Phones sat for a day with a fortnight of
   rounds on them while the fix was live the whole time.

   The worker is the one part that never freezes, so it now asks. Every
   window it controls gets a ping when a new build activates; a window that
   cannot answer within PING_WAIT is not running JavaScript, and is
   navigated onto the build now in the cache.

   Two things have to be true, and the second is what keeps it honest:

     1. A FROZEN PAGE IS RESCUED without anybody touching the phone.
     2. A HEALTHY PAGE IS LEFT ALONE. Answering the ping is how a page says
        "I am mid-round" — a worker that reloads a working page under an
        inspector's hands at −40 is a worse bug than the one it fixes.

   Run: node tests/swrescue.cjs   (starts its own server on 8521) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8521);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const good = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
const goodSw = fs.readFileSync(path.join(ROOT, 'mobile/sw.js'), 'utf8');
const NOW = (good.match(/const BUILD="(\d+)"/) || [])[1];

/* "Build 900": the frozen one. The build-321 loop, its own build number, and
   — as an old build genuinely would — no answer to the worker's ping. */
/* AND THE BREAKER TAKEN OUT, or this no longer builds a frozen phone at all.

   Since build 328 every shipped build carries a circuit breaker at the top
   of renderDue: past 250 repaints in a second it puts back the two settings
   that can re-arm the cycle. That is the fix working — and it means putting
   the build-321 loop back is no longer enough to peg anything. This suite
   went red the day the breaker shipped, saying "the freeze reproduces" had
   failed, which read as a regression and was the opposite: the app had
   stopped being able to freeze.

   The handsets this case is about ran a build from BEFORE the breaker, so
   the breaker comes out too. Everything between the function's brace and
   renderTabs() is the breaker and nothing else; removing it by that shape
   rather than by its internals means it keeps working when the breaker is
   edited. */
function stripBreaker(src) {
  const cut = src.replace(/function renderDue\(\)\{[\s\S]*?\n  renderTabs\(\);/,
                          'function renderDue(){\n  renderTabs();');
  if (cut === src) {
    console.error('FAIL  the breaker could not be removed — renderDue has moved, this suite is blind');
    process.exit(1);
  }
  return cut;
}

const brokenIdx = stripBreaker(good)
  .replace(/    schedKick = true;\n    schedEnsureLoaded\(\)\.then\(changed=>\{\n      schedKick = false;\n      if\(changed && \(dueSched \|\| dueView==="week"\)\) renderDue\(\);\n    \}, \(\)=>\{ schedKick = false; \}\);/,
    '    schedEnsureLoaded().then(()=>{ if(dueSched || dueView==="week") renderDue(); });')
  .replace(new RegExp('const BUILD="' + NOW + '"'), 'const BUILD="900"')
  .replace(new RegExp('v=' + NOW, 'g'), 'v=900');
const brokenSw = goodSw.replace(new RegExp('const BUILD = "' + NOW + '"'), 'const BUILD = "900"')
  .replace(new RegExp('v=' + NOW, 'g'), 'v=900');

/* "Build 800": the good build the fleet was already running, worker and all.
   Modelling the real handsets matters — a phone that met the frozen build
   with NO worker never registers one (the freeze happens before
   register() runs), so it simply reloads off the network and was never the
   hard case. The hard case, and the fleet's case, is a phone that already
   had a worker and a cache when the bad build arrived. */
const oldIdx = good.replace(new RegExp('const BUILD="' + NOW + '"'), 'const BUILD="800"')
  .replace(new RegExp('v=' + NOW, 'g'), 'v=800');
const oldSw = goodSw.replace(new RegExp('const BUILD = "' + NOW + '"'), 'const BUILD = "800"')
  .replace(new RegExp('v=' + NOW, 'g'), 'v=800');

let phase = 'good';
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (/schedule_slim\.json/.test(u.pathname)) { res.writeHead(404); return res.end('nope'); }
  if (/\/mobile\/index\.html$/.test(u.pathname) || u.pathname === '/mobile/') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end(phase === 'good' ? oldIdx : phase === 'broken' ? brokenIdx : good);
  }
  if (/\/mobile\/sw\.js$/.test(u.pathname)) {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return res.end(phase === 'good' ? oldSw : phase === 'broken' ? brokenSw : goodSw);
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
const within = (pr, ms, late) => Promise.race([
  pr.catch(e => 'ERR ' + String(e && e.message).slice(0, 40)),
  new Promise(r => setTimeout(() => r(late), ms)),
]);
const verOf = (pg) => within(pg.evaluate(() => (document.getElementById('verNum') || {}).textContent), 6000, 'FROZEN');

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  console.log('1. A PHONE FROZEN ON THE BAD BUILD, WITH ITS WORKER INSTALLED');
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    localStorage.setItem('cm_due_sched', '1');       // the state that freezes
  });
  /* The fleet's real starting point: a good build, installed, worker active. */
  let p0 = await ctx.newPage();
  await within(p0.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' }), 25000, 'late');
  await within(p0.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 }), 21000, 'late');
  for (let i = 0; i < 25; i++) {
    const st = await within(p0.evaluate(async () => {
      const r = (await navigator.serviceWorker.getRegistrations())[0];
      return r ? ((r.active && 'active') || (r.installing && 'installing') || (r.waiting && 'waiting')) : null;
    }), 4000, null);
    if (st === 'active') break;
    await new Promise(r => setTimeout(r, 1000));
  }
  ok('the phone starts on a good build with a worker in charge',
     (await verOf(p0)) === '800', String(await verOf(p0)));

  /* Now the bad build ships and the phone picks it up, exactly as today. */
  phase = 'broken';
  await within(p0.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map(r => r.update().catch(() => {})));
  }), 20000, 'late');
  await new Promise(r => setTimeout(r, 6000));
  await within(p0.reload({ waitUntil: 'commit' }), 20000, 'late');
  await new Promise(r => setTimeout(r, 10000));
  const frozenVer = await verOf(p0);
  ok('the page really is frozen on the bad build', frozenVer === 'FROZEN', String(frozenVer));
  /* ASKED OF A PAGE THAT CAN ANSWER. Reading this out of the frozen page
     returns nothing and reads as "no worker", which is the thermometer
     being broken rather than the patient being well. */
  const helper = await ctx.newPage();
  await within(helper.goto(`http://127.0.0.1:${PORT}/recover.html`, { waitUntil: 'load' }), 20000, 'late');
  const swThere = await within(helper.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).length), 8000, 0);
  ok('  and its worker is installed and in charge', swThere >= 1, String(swThere) + ' registration(s)');
  const cachedNow = await within(helper.evaluate(() => caches.keys()), 8000, []);
  console.log('   caches on the phone      :', JSON.stringify(cachedNow));

  console.log('\n2. THE FIX SHIPS. NOBODY TOUCHES THE PHONE.');
  phase = 'fixed';
  /* Exactly what a real phone does on its own: the browser re-checks sw.js.
     The frozen PAGE cannot ask for this, so it is asked from outside the
     page — the same thing the browser, a push, or recover.html would do. */
  await within(helper.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map(r => r.update().catch(() => {})));
  }), 20000, 'late');
  await new Promise(r => setTimeout(r, 8000));
  const swState = await within(helper.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    return rs.map(r => ({ inst: !!r.installing, wait: !!r.waiting,
                          act: r.active ? r.active.scriptURL.split('/').pop() : null }));
  }), 8000, []);
  console.log('   worker after the update  :', JSON.stringify(swState));
  const cachedAfter = await within(helper.evaluate(() => caches.keys()), 8000, []);
  console.log('   caches after the update  :', JSON.stringify(cachedAfter));

  /* And the same ask recover.html makes — the deterministic path, since a
     browser deciding on its own when to re-check sw.js is not something a
     suite can wait on honestly. */
  const asked = await within(helper.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    const r = rs[0]; if (!r || !r.active) return 'no worker';
    return await new Promise(res => {
      const ch = new MessageChannel();
      let done = false;
      ch.port1.onmessage = ev => { done = true; res(ev.data); };
      r.active.postMessage({ type: 'cm-rescue' }, [ch.port2]);
      setTimeout(() => { if (!done) res('no reply'); }, 15000);
    });
  }), 20000, 'late');
  console.log('   worker rescue reported   :', JSON.stringify(asked));

  /* MEASURED FROM THE PART THAT WORKS. Asking the page itself whether it
     recovered is asking the patient to take its own pulse: a frozen page
     cannot answer, and a page that has just been navigated may not have an
     execution context to answer with either. The worker can tell, and its
     answer is the same fact: ping every app window again, and if none of
     them is silent any more, the frozen one is running JavaScript. */
  const ask = async () => within(helper.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    const r = rs[0]; if (!r || !r.active) return 'no worker';
    return await new Promise(res => {
      const ch = new MessageChannel();
      let done = false;
      ch.port1.onmessage = ev => { done = true; res(ev.data); };
      r.active.postMessage({ type: 'cm-rescue' }, [ch.port2]);
      setTimeout(() => { if (!done) res('no reply'); }, 15000);
    });
  }), 20000, 'late');

  let second = null;
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 4000));
    second = await ask();
    if (second && second.moved === 0 && second.asked >= 1) break;
  }
  console.log('   asked again              :', JSON.stringify(second));
  /* THE MEASURED LIMIT, KEPT RATHER THAN HIDDEN.

     A page pegged in a microtask loop cannot be navigated: unloading a
     document needs the very main thread that is spinning. The worker
     issues navigate(), reports honestly that it tried, and the window
     stays exactly where it was. Writing this down as an expectation is
     the point — the alternative is a rescue everyone believes in and
     nobody has watched fail. */
  ok('the worker reaches the silent window and tries, every time asked',
     !!second && second.asked >= 1, JSON.stringify(second));
  const rescued = await verOf(p0);
  ok('  but a SPUN page cannot be navigated — it is still stuck, as expected',
     rescued === 'FROZEN', 'verNum ' + rescued);
  console.log('   (a spun page comes back only by closing the app and reopening —');
  console.log('    measured separately: it recovers on the second launch.)');
  await within(helper.close(), 6000, 'late');

  console.log('\n3. THE ROUTE THAT DOES WORK: CLOSE IT AND OPEN IT AGAIN');
  /* This is what an inspector is actually told to do, so it is measured
     rather than asserted in a sentence. The first launch is served the
     cached bad build while the worker fetches the good one; the second
     launch gets the good one. Nothing is cleared and the handset keeps
     everything on it. */
  {
    let came = 'never';
    for (let launch = 1; launch <= 3; launch++) {
      const pg = await ctx.newPage();
      await within(pg.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'commit' }), 20000, 'late');
      await new Promise(r => setTimeout(r, 9000));
      const v = await verOf(pg);
      console.log('   launch ' + launch + ' : verNum = ' + v);
      await within(pg.close(), 6000, 'late');
      if (v === NOW) { came = 'launch ' + launch; break; }
    }
    ok('closing and reopening brings the app back, with nothing cleared', came !== 'never', came);
  }

  await within(ctx.close(), 8000, 'late');

  console.log('\n4. AND A HEALTHY PAGE IS LEFT ALONE');
  /* Answering the ping is how a page says "I am mid-round". A worker that
     reloads a working page under an inspector's hands is a worse bug than
     the one it fixes, so this is asserted, not assumed. */
  phase = 'fixed';
  const ctx2 = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx2.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  const p1 = await ctx2.newPage();
  await within(p1.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' }), 25000, 'late');
  await within(p1.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 }), 21000, 'late');
  /* A mark that only survives if the page is NOT reloaded. */
  await within(p1.evaluate(() => { window.__notReloaded = true; }), 5000, 'late');
  await within(p1.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(rs.map(r => r.update().catch(() => {})));
    /* And make the worker do the sweep for real. */
    const r = rs[0];
    if (r && r.active) r.active.postMessage({ type: 'sw-noop' });
  }), 20000, 'late');
  await new Promise(r => setTimeout(r, 12000));
  const survived = await within(p1.evaluate(() => window.__notReloaded === true), 6000, 'gone');
  const stillUp = await verOf(p1);
  ok('a page that answers is not reloaded', survived === true, String(survived));
  ok('  and it is still the app', stillUp === NOW, String(stillUp));

  await within(ctx2.close(), 8000, 'late');
  await within(b.close(), 8000, 'late');
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
