/* THE PHONE CANNOT BE ALLOWED TO SLEEP THROUGH ITS OWN WRITE.

   Read off two rounds on 2026-09-15, in the same slot on two different
   trucks: a photograph that read back fine at the moment it was captured,
   saved offline, carried for hours with the phone shut for the ride back,
   and only found unreadable once a signal let the first upload try. Tested
   with signal the whole time (BL011), the same phone never reproduces it —
   Save is followed within moments by an upload that reads the file back
   while the screen is still on. The difference is not the network; it is
   whether the phone got a chance to sleep before that read-back could
   happen even once.

   This cannot make an IndexedDB write durable on command — there is no API
   for that on this platform. What it can hold is the one thing under this
   page's control: whether the SCREEN goes to sleep on its own right after
   Save, for a technician who puts the phone down rather than pressing the
   power button. holdAwake() requests a screen wake lock for a bounded
   window and releases it itself.

   This suite proves: Save requests the lock, for the screen, before the
   round is put away; the lock is released on its own after the window,
   not left held; a phone without the API (older Android, some browsers)
   degrades to exactly today's behaviour — Save still completes, nothing
   throws; and a request the platform refuses (denied, or the tab already
   hidden) is swallowed the same way.

   Run: node tests/wakehold.cjs   (starts its own server on 8485) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8485);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    /* A mock screen wake lock: records what was asked for and when it was
       released, without touching the real OS — there is no real screen to
       hold awake in a headless browser. */
    window.__wl = { requests: [], released: false, releasedAt: 0 };
    class FakeLock { release() { window.__wl.released = true; window.__wl.releasedAt = Date.now(); return Promise.resolve(); } }
    /* A real Navigator may already carry `wakeLock` as a getter-only
       accessor, which a plain assignment silently drops. defineProperty
       replaces it outright, in this page and every later evaluate() in it. */
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true, writable: true,
      value: { request: (type) => { window.__wl.requests.push(type); return Promise.resolve(new FakeLock()); } },
    });
  });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof holdAwake === 'function' && typeof verifySavedRec === 'function',
                           null, { timeout: 20000 });
  await p.waitForTimeout(500);

  console.log('holdAwake(), called directly');
  const direct = await p.evaluate(async () => {
    window.__wl.requests = []; window.__wl.released = false;
    const wl = await holdAwake(50);
    const gotLock = !!wl;
    await new Promise(r => setTimeout(r, 150));
    return { requests: window.__wl.requests.slice(), gotLock, releasedAfter: window.__wl.released };
  });
  ok(direct.requests.length === 1 && direct.requests[0] === 'screen',
     'requests exactly one screen wake lock', JSON.stringify(direct.requests));
  ok(direct.gotLock, 'and gets one back when the platform grants it');
  ok(direct.releasedAfter, 'and releases it itself once the window has passed', JSON.stringify(direct));

  console.log('\na build with no navigator.wakeLock at all');
  const noApi = await p.evaluate(async () => {
    const saved = navigator.wakeLock;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, writable: true, value: undefined });
    let threw = false, result;
    try { result = await holdAwake(50); } catch (e) { threw = true; }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, writable: true, value: saved });
    return { threw, result };
  });
  ok(!noApi.threw, 'never throws when the API does not exist');
  ok(noApi.result === null, 'answers null rather than pretending to hold anything', JSON.stringify(noApi));

  console.log('\na platform that REFUSES the request (denied, or the tab already hidden)');
  const refused = await p.evaluate(async () => {
    const saved = navigator.wakeLock;
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, writable: true,
      value: { request: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } });
    let threw = false, result;
    try { result = await holdAwake(50); } catch (e) { threw = true; }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, writable: true, value: saved });
    return { threw, result };
  });
  ok(!refused.threw, 'a refusal never throws up into Save');
  ok(refused.result === null, 'and answers null the same way', JSON.stringify(refused));

  console.log('\nshowSaveGuard(), called directly — the same window, said out loud');
  const guard = await p.evaluate(async () => {
    showSaveGuard(50);
    const shown = { cls: document.getElementById('saveGuard').className,
                    text: document.getElementById('saveGuard').textContent };
    await new Promise(r => setTimeout(r, 150));
    const cleared = { cls: document.getElementById('saveGuard').className,
                       empty: document.getElementById('saveGuard').innerHTML === '' };
    return { shown, cleared };
  });
  ok(guard.shown.cls === 'ready busy' && guard.shown.text.length > 0,
     'shows a visible status the instant it is called', JSON.stringify(guard.shown));
  ok(guard.cleared.empty, 'and clears itself once the window passes, unprompted', JSON.stringify(guard.cleared));

  console.log('\nSave itself asks for the lock before the round is put away');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(200);
  await p.evaluate(() => openHdr());
  await p.waitForTimeout(200);
  await p.fill('#inspector', 'R. Marrero');
  await p.evaluate(() => {
    const pos = curP(); pos.photos ||= [];
    addPos(pos, attWrap(new File([new Uint8Array([1,2,3,4,5])], 'a.jpg', { type: 'image/jpeg' })), 'COMPONENT');
    pos.grade = 1;
  });
  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.evaluate(() => { window.__wl.requests = []; });
  await p.click('#saveBtn');
  await p.waitForTimeout(800);
  const onSave = await p.evaluate(() => ({
    requests: window.__wl.requests.slice(),
    guardText: document.getElementById('saveGuard').textContent,
    guardCls: document.getElementById('saveGuard').className,
  }));
  ok(onSave.requests.length >= 1 && onSave.requests[0] === 'screen', 'Save requested a screen wake lock', JSON.stringify(onSave.requests));
  ok(onSave.guardCls === 'ready busy' && onSave.guardText.length > 0,
     'and the on-screen guard is showing at the same moment', JSON.stringify(onSave));

  ok(errs.length === 0, 'no page errors throughout', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
