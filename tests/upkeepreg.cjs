/* A CLOSED ANDROID APP IS STILL WOKEN, ON A BACKEND THAT CANNOT PUSH.

   Periodic Background Sync ('cm-upkeep') needs no push server: sw.js's wake()
   reads sw.js and the folder index. It was registered only at the end of
   pushSetupNow, after the step that returns 'nobackend' when the backend has
   no VAPID key, and Google never has one, so from build 534 no phone set up
   since was ever woken while closed (deep scan, 2026-10-27, build 566).

   The worker's registration object is stood in for, because a headless
   browser offers no periodicSync of its own; the backend is a tiny server
   that answers action=vapid exactly as google-upload.gs does.

   Run: node tests/upkeepreg.cjs   (needs the app on 8093, as tests/runall.sh starts it) */
const http = require('http');
const { chromium } = require(require('./pw.cjs'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const APP = 'http://127.0.0.1:8093/mobile/index.html';
const PORT = 8486;
let asked = 0;
const srv = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = new URL(req.url, 'http://x');
  if (u.searchParams.get('action') === 'vapid') asked++;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(u.searchParams.get('action') === 'vapid'
    ? { ok: false, error: 'No VAPID keys on this endpoint' } : { ok: true }));
}).listen(PORT);

(async () => {
  const b = await chromium.launch();
  for (const [label, url] of [['Google (no VAPID key)', `http://127.0.0.1:${PORT}/macros/s/X/exec`],
                              ['backend unreachable', 'http://127.0.0.1:9/exec']]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.addInitScript(u => {
      localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', name: 'Main', url: u, on: true }]));
      window.__ps = [];
      const fake = { periodicSync: { register: (tag, o) => { window.__ps.push([tag, o && o.minInterval]); return Promise.resolve(); } },
                     pushManager: { getSubscription: () => Promise.resolve(null) } };
      try { Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => Promise.resolve(fake) }); } catch (e) {}
    }, url);
    await p.goto(APP);
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?');
    const r = await p.evaluate(async () => { const k = await window.__pushSetup(); await new Promise(r => setTimeout(r, 300)); return { k: k && k.k, ps: window.__ps }; });
    ok(label + ': the push side reports why it is off', r.k === 'nobackend' || r.k === 'unreach', r.k);
    ok(label + ': the periodic wake is registered anyway', r.ps.some(x => x[0] === 'cm-upkeep' && x[1] === 3600000), JSON.stringify(r.ps));
    await ctx.close();
  }
  ok('the backend was asked for its key (the case is real, not skipped)', asked > 0, asked + ' ask(s)');
  await b.close(); srv.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
