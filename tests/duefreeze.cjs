/* THE DUE SCREEN MUST NOT BE ABLE TO SPIN THE MAIN THREAD.

   Build 321 shipped this, in renderDue():

     if (needSched && (!SCHED || cache is stale))
       schedEnsureLoaded().then(() => renderDue());

   schedEnsureLoaded() is allowed to decide to do nothing — the copy in
   hand is fresh, a fetch is already in flight, or the last attempt failed
   inside SCHED_RETRY_GAP — and in each of those it resolves IMMEDIATELY.
   Repainting on resolution rather than on change therefore repaints at
   once, finds the same reason to ask again, and asks again, round the
   microtask queue, for ever. The tab does not crash. It stops: the
   spinner turns, nothing answers a finger, and no upload, no team pull
   and no build check can run either, because there is no thread left.

   It reached the field as "works in Edge, just circles in Chrome, Safari
   won't respond" — one build, three verdicts — because the trigger is
   remembered PER DEVICE: cm_due_sched (the "Show 1C schedule" toggle) and
   cm_due_view. A browser that had never switched the toggle on never
   entered the branch, so the same build on the same machine at the same
   minute was fine in one browser and dead in the next. Nothing about it
   was a browser difference, and a day went into treating it as one.

   The rule this fixes in place: a repaint may be triggered only by
   something having CHANGED, never merely by an async call having
   returned. The suite holds the Due screen responsive in all three
   remembered states while the schedule file is unavailable — which is
   both the pit's normal condition and what any phone sees one hour after
   its last good fetch.

   Run: node tests/duefreeze.cjs   (starts its own server on 8511) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8511);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

/* The schedule is not available. In the pit that is the normal state; on a
   healthy link it is what every phone sees once its cached copy passes
   SCHED_STALE_MS and the retry gap starts suppressing the refetch. */
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (/schedule_slim\.json/.test(u.pathname)) { res.writeHead(404); return res.end('nope'); }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

/* A pegged page never answers, so every question asked of one needs its own
   deadline — otherwise the suite hangs exactly as the app does, and a suite
   that hangs reports nothing at all. */
const within = (promise, ms, whenLate) => Promise.race([
  promise.catch(e => 'ERR ' + String(e && e.message).slice(0, 40)),
  new Promise(r => setTimeout(() => r(whenLate), ms)),
]);

const STATES = [
  { name: 'nothing remembered (a fresh browser)', ls: {} },
  { name: '"Show 1C schedule" left on',           ls: { cm_due_sched: '1' } },
  { name: 'This week left as the view',           ls: { cm_due_view: 'week' } },
  { name: 'both remembered',                      ls: { cm_due_sched: '1', cm_due_view: 'week' } },
];

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  for (const st of STATES) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.addInitScript(s => {
      localStorage.setItem('up_dests', '[]');
      Object.keys(s).forEach(k => localStorage.setItem(k, s[k]));
    }, st.ls);
    await within(p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' }), 25000, 'late');
    await within(p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 15000 }), 16000, 'late');
    /* The Due screen is where renderDue() runs, so this is the screen that
       froze. Opening it must not cost the thread. */
    await within(p.evaluate(() => showPane('paneDue')), 8000, 'late');

    const answered = await within(p.evaluate(() => 1 + 1), 8000, 'FROZEN');
    ok(st.name + ': the page still answers', answered === 2, String(answered));

    if (answered === 2) {
      /* Not merely alive — still able to do work, repeatedly, which a
         thread losing every slice to a repaint loop cannot. */
      const spins = await within(p.evaluate(async () => {
        const t0 = Date.now();
        for (let i = 0; i < 5; i++) { renderDue(); await new Promise(r => setTimeout(r, 0)); }
        return Date.now() - t0;
      }), 10000, 'FROZEN');
      ok('  and five repaints of it come back', typeof spins === 'number', String(spins) + (typeof spins === 'number' ? ' ms' : ''));
      const ver = await within(p.evaluate(() => (document.getElementById('verNum') || {}).textContent), 8000, 'FROZEN');
      ok('  with the app still up', ver && ver !== '?' && ver !== 'FROZEN', String(ver));
    }
    await within(ctx.close(), 8000, 'late');
  }
  await within(b.close(), 8000, 'late');
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
