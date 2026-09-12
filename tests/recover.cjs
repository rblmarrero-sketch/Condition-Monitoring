/* THE WAY BACK IN, WHEN THE APP ITSELF CANNOT BE REACHED.

   Build 321's repaint loop pegged the phone's main thread before the app
   finished starting. A frozen page is not merely unusable: every path
   that would rescue it runs ON that thread — the build check, applying an
   update, sending the queue. And the worker answers EVERY navigation
   inside its scope from the cache, so reloading the app serves the frozen
   build straight back. Phones sat there with a fortnight of rounds on
   them and no way in from the outside.

   /Condition-Monitoring/recover.html sits one directory ABOVE the
   worker's scope (/Condition-Monitoring/mobile/), so it is never
   intercepted, always comes from the network, and runs whatever state the
   app is in. It asks the worker to look for a new build —
   registration.update() — which is the one thing the frozen page cannot
   do for itself.

   What has to hold:
     · it loads when the app cannot, with a worker installed and in charge;
     · it reads the truth: the build on the server, the builds cached here,
       and HOW MANY ROUNDS ARE WAITING — the number that tells the person
       holding the phone their work is still there;
     · IT NEVER UNREGISTERS A WORKER AND NEVER DELETES A CACHE. Build 246
       did that and left phones with no app and no queue at all; a page
       called "recover" gets no exemption. Asserted on the source, because
       a passing click cannot prove what the code did not do;
     · the rounds are still on the handset afterwards.

   Run: node tests/recover.cjs   (starts its own server on 8514) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8514);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (/schedule_slim\.json/.test(u.pathname)) { res.writeHead(404); return res.end('nope'); }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

const within = (pr, ms, late) => Promise.race([
  pr.catch(e => 'ERR ' + String(e && e.message).slice(0, 40)),
  new Promise(r => setTimeout(() => r(late), ms)),
]);

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  /* A real worker, not a blocked one: the whole point is a page that works
     while a worker is installed and answering for the app's own scope. */
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const app = await ctx.newPage();
  await app.addInitScript(() => localStorage.setItem('up_dests', '[]'));

  console.log('1. AN APP WITH A WORKER IN CHARGE AND WORK ON THE HANDSET');
  await within(app.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' }), 30000, 'late');
  await within(app.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 }), 21000, 'late');
  for (let i = 0; i < 25; i++) {
    const s = await app.evaluate(async () => {
      const r = (await navigator.serviceWorker.getRegistrations())[0];
      return r ? ((r.active && 'active') || (r.installing && 'installing') || (r.waiting && 'waiting')) : null;
    }).catch(() => null);
    if (s === 'active') break;
    await app.waitForTimeout(1000);
  }
  /* Two rounds left unsent, so the count this page prints is a real one. */
  await app.evaluate(async () => {
    const put = rec => new Promise((res, rej) => {
      const rq = indexedDB.open('plug_capture', 1);
      rq.onsuccess = () => { const db = rq.result;
        const t = db.transaction('inspections', 'readwrite');
        t.objectStore('inspections').put(rec); t.oncomplete = res; t.onerror = () => rej(t.error); };
      rq.onerror = () => rej(rq.error);
    });
    await put({ id: 'r-stuck-1', equip: 'TK900', type: 'MP', date: '2026-09-12', up: 0, positions: {} });
    await put({ id: 'r-stuck-2', equip: 'TK901', type: 'FC', date: '2026-09-12', up: 0, positions: {} });
  });
  const swActive = await app.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    return rs.length ? 'yes' : 'no';
  });
  ok('the app is installed with a worker in charge', swActive === 'yes', swActive);
  await app.close();

  console.log('\n2. THE RECOVERY PAGE LOADS AND TELLS THE TRUTH');
  const rec = await ctx.newPage();
  const errs = [];
  rec.on('pageerror', e => errs.push(e.message));
  await within(rec.goto(`http://127.0.0.1:${PORT}/recover.html`, { waitUntil: 'load' }), 25000, 'late');
  await rec.waitForTimeout(2500);
  const shown = await rec.evaluate(() => ({
    srv: (document.getElementById('srv') || {}).textContent,
    loc: (document.getElementById('loc') || {}).textContent,
    q: (document.getElementById('q') || {}).textContent,
    sw: (document.getElementById('sw') || {}).textContent,
  }));
  ok('it opens at all, outside the app\'s scope', !!shown.srv, JSON.stringify(shown));
  ok('  and names the build on the server', /^\d+$/.test(String(shown.srv || '').trim()), String(shown.srv));
  ok('  and the build cached on this phone', /\d/.test(String(shown.loc || '')), String(shown.loc));
  ok('  and it COUNTS the rounds still waiting, so they can be seen to be safe',
     /2 of/.test(String(shown.q || '')), String(shown.q));
  ok('  and reports the worker as in charge', /active/.test(String(shown.sw || '')), String(shown.sw));

  console.log('\n3. THE BUTTON ASKS THE WORKER TO LOOK FOR A NEW BUILD');
  await within(rec.click('#go'), 8000, 'late');
  await rec.waitForTimeout(6000);
  const after = await rec.evaluate(() => ({
    log: (document.getElementById('log') || {}).textContent,
    sw: (document.getElementById('sw') || {}).textContent,
  }));
  ok('it reports what it did rather than going quiet', /\S/.test(String(after.log || '')), String(after.log || '').split('\n')[0]);
  ok('  and the worker is still there afterwards — not unregistered',
     /active|installing|waiting/.test(String(after.sw || '')), String(after.sw));

  console.log('\n4. AND IT TOOK NOTHING AWAY');
  const kept = await rec.evaluate(async () => {
    const caches0 = (await caches.keys()).filter(k => /^plug-capture-v/.test(k));
    const rows = await new Promise(res => {
      const rq = indexedDB.open('plug_capture', 1);
      rq.onsuccess = () => { const db = rq.result;
        const g = db.transaction('inspections', 'readonly').objectStore('inspections').getAll();
        g.onsuccess = () => res(g.result || []); g.onerror = () => res([]); };
      rq.onerror = () => res([]);
    });
    return { caches: caches0.length, stuck: rows.filter(r => /^r-stuck-/.test(r.id || '')).length };
  });
  ok('the offline cache is still on the phone', kept.caches >= 1, kept.caches + ' cache(s)');
  ok('  and both unsent rounds are still on it', kept.stuck === 2, kept.stuck + ' round(s)');

  /* The rule, read off the source — a click that happened to leave things
     alone does not prove the code cannot take them away. */
  const src = fs.readFileSync(path.join(ROOT, 'recover.html'), 'utf8');
  const code = src.slice(src.indexOf('<script>'));
  ok('  and the page cannot unregister a worker', !/\.unregister\s*\(/.test(code));
  ok('  nor delete a cache', !/caches\s*\.\s*delete/.test(code));
  ok('  it only ever asks it to update', /\.update\s*\(/.test(code));

  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');

  await within(ctx.close(), 8000, 'late');
  await within(b.close(), 8000, 'late');
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
