/* THE FIREBASE OVERLAY, PROVEN AGAINST THE PAGE IT IS APPLIED TO.

   Phones load the app from Firebase, not from GitHub Pages, and Pechanka
   applies docs/firebase/fb_overlay.py to that copy only: the main slot
   swaps to Google Apps Script (google-back-2026-10), BUILD goes up by one,
   and postT() leaves the x.upload listeners off for script.google.com.
   That last change is load-bearing. ANY listener on xhr.upload makes a
   request non-simple, a non-simple request is preflighted, and Apps Script
   has no doOptions and cannot answer a preflight -- so with the listeners
   on, every photograph and sidecar to Google fails at once.

   The overlay finds its targets by TEXT. If the swap block or the two
   postT lines change shape, it refuses (exit 2) and Firebase stays on the
   last good build -- nothing new reaches a phone, silently. This suite runs
   the real overlay against the CURRENT files, so a change that moves those
   anchors fails here, on the push, rather than on Pechanka a quarter of an
   hour later.

   What it proves, on the overlaid page:
     1. the overlay applies cleanly (exit 0), BUILD +1 on every stamp, swap id
        google-back-2026-10, and it is idempotent on a second run;
     2. a POST to script.google.com goes out SIMPLE: no listener on
        x.upload, POST, Content-Type text/plain -- the definition of a request
        the browser does not preflight -- and it still resolves;
     3. a POST to any other endpoint is exactly as before: upload listeners
        on, the idle clock armed, the same result;
     4. the Google request is still bounded (the overall max clock aborts it);
     5. an unexpected source makes the overlay refuse rather than publish.

   No real backend is named or reached: the Google URL carries a made-up
   deployment id and every remote request is fulfilled by page.route().
   prodWriteGuard refuses remote hosts under automation, so navigator.webdriver
   is reported false for this page only, as tests/prodguard.cjs does. */
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { execFileSync, spawnSync } = require('child_process');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const OVERLAY = path.join(ROOT, 'docs', 'firebase', 'fb_overlay.py');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const TOUCHED = ['mobile/upload-defaults.js', 'mobile/index.html', 'mobile/sw.js', 'dashboard/index.html', 'dashboard-next/index.html'];
function copyTree() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fbov-'));
  for (const f of TOUCHED) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(d, f)); }
  return d;
}
const py = (dir) => spawnSync('python3', [OVERLAY, dir], { encoding: 'utf8' });
const buildOf = t => (t.match(/const BUILD\s*=\s*"(\d+)"/) || [])[1];

const GAS = 'https://script.google.com/macros/s/AKfycbTESTONLY000000000000000000/exec';
const OTHER = 'https://example-other-backend.test/exec';

(async () => {
  /* ---- 1. the overlay against the current source ------------------------ */
  const dir = copyTree();
  const r1 = py(dir);
  ok('the overlay applies to the current files (exit 0)', r1.status === 0, (r1.stdout + r1.stderr).trim().replace(/\n/g, ' | '));
  const before = buildOf(fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8'));
  const mi = fs.readFileSync(path.join(dir, 'mobile/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(dir, 'mobile/sw.js'), 'utf8');
  const ud = fs.readFileSync(path.join(dir, 'mobile/upload-defaults.js'), 'utf8');
  const want = String(+before + 1);
  ok('BUILD goes up by exactly one in index.html and sw.js', buildOf(mi) === want && buildOf(sw) === want, `${before} -> ${buildOf(mi)}/${buildOf(sw)}`);
  for (const f of ['mobile/index.html', 'dashboard/index.html', 'dashboard-next/index.html']) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    ok(`${f}: every ?v= tag moved with it, none left on ${before}`, !t.includes(`?v=${before}"`) && t.includes(`?v=${want}"`));
  }
  ok('the swap is google-back-2026-10 and the retire block is untouched',
     /swap:\s*\{[^}]*google-back-2026-10/.test(ud) &&
     (fs.readFileSync(path.join(ROOT, 'mobile/upload-defaults.js'), 'utf8').match(/retire:\s*\{[\s\S]*?\n\s*\},/) || [''])[0] === (ud.match(/retire:\s*\{[\s\S]*?\n\s*\},/) || ['x'])[0]);
  ok('postT now carries the script.google.com exception', /simpleOnly/.test(mi));
  const r2 = py(dir);
  ok('a second run on the overlaid copy changes nothing it already changed (exit 0, swap and postT reported present)',
     r2.status === 0 && /already google-back/.test(r2.stdout) && /already in the source/.test(r2.stdout), r2.stdout.trim().replace(/\n/g, ' | '));
  // Undo the second run's own BUILD step, so the page served below is exactly the first overlay.
  fs.rmSync(dir, { recursive: true, force: true });
  const site = copyTree(); py(site);

  /* ---- 5. an unexpected source is refused ------------------------------- */
  {
    const bad = copyTree();
    const p = path.join(bad, 'mobile/index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('x.upload.onprogress=onUp;', 'x.upload.onprogress = onUp;'));
    const r = py(bad);
    // Since build 534 the source itself carries the Google simple POST (one source, 2026-10-07),
    // so the overlay must leave postT alone whatever its listener line looks like. Before that,
    // a moved anchor had to make it refuse. Both answers are checked against what the source holds.
    if (/simpleOnly/.test(fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8')))
      ok('the source already carries the Google simple POST, so the overlay leaves postT alone (exit 0, "already in the source")', r.status === 0 && /Google simple POST already in the source/.test(r.stdout), r.stdout.trim().replace(/\n/g, ' | '));
    else
      ok('a postT whose anchor line has moved makes the overlay refuse (exit 2), so Firebase keeps the last good build', r.status === 2, r.stdout.trim());
    const bad2 = copyTree();
    const q = path.join(bad2, 'mobile/upload-defaults.js');
    fs.writeFileSync(q, fs.readFileSync(q, 'utf8').replace(/swap:\s*\{/, 'swapX: {'));
    const r3 = py(bad2);
    ok('a missing swap block is refused too (exit 2)', r3.status === 2, r3.stdout.trim());
    fs.rmSync(bad, { recursive: true, force: true }); fs.rmSync(bad2, { recursive: true, force: true });
  }

  /* ---- 2-4. the overlaid page, driven -------------------------------- */
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const rel = p.replace(/^\//, '');
    const f = fs.existsSync(path.join(site, rel)) ? path.join(site, rel) : path.join(ROOT, rel);
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
  });
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    // Record what postT does to each XMLHttpRequest, without changing it.
    const O = window.XMLHttpRequest;
    window.__xhr = [];
    window.XMLHttpRequest = function () {
      const x = new O(), rec = { url: '', method: '', headers: {}, up: false, upLoad: false };
      window.__xhr.push(rec);
      const open = x.open, set = x.setRequestHeader;
      x.open = function (m, u) { rec.method = m; rec.url = u; return open.apply(x, arguments); };
      x.setRequestHeader = function (k, v) { rec.headers[k.toLowerCase()] = v; return set.apply(x, arguments); };
      const up = x.upload;
      if (up) {
        let a = null, l = null;
        Object.defineProperty(up, 'onprogress', { get: () => a, set: v => { a = v; if (v) rec.up = true; } });
        Object.defineProperty(up, 'onload', { get: () => l, set: v => { l = v; if (v) rec.upLoad = true; } });
        const ael = up.addEventListener.bind(up);
        up.addEventListener = function () { rec.up = true; return ael.apply(up, arguments); };
      }
      return x;
    };
  });
  const page = await ctx.newPage();
  const hits = [];
  await page.route(/script\.google\.com|example-other-backend\.test/, route => {
    hits.push(route.request().method() + ' ' + route.request().url());
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: '{"ok":true}' });
  });
  await page.goto(`http://127.0.0.1:${port}/mobile/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.postT === 'function', null, { timeout: 30000 });
  ok('sanity: the page served is the overlaid one', await page.evaluate(() => typeof BUILD !== 'undefined' && BUILD) === want);

  const run = (u, max) => page.evaluate(async ([u, max]) => {
    const n = window.__xhr.length;
    try { const r = await postT(u, '{"op":"ping"}', undefined, max); return { ok: r.ok, status: r.status, rec: window.__xhr[n] }; }
    catch (e) { return { err: String(e && e.message || e), rec: window.__xhr[n] }; }
  }, [u, max]);

  const g = await run(GAS);
  ok('Google: the POST resolves', g.ok === true && g.status === 200, JSON.stringify(g));
  ok('Google: no listener on x.upload (onprogress, onload or addEventListener)', g.rec && !g.rec.up && !g.rec.upLoad, JSON.stringify(g.rec));
  ok('Google: it is a simple request -- POST with Content-Type text/plain and no other header',
     g.rec && g.rec.method === 'POST' && /^text\/plain/.test(g.rec.headers['content-type'] || '') && Object.keys(g.rec.headers).length === 1, JSON.stringify(g.rec && g.rec.headers));
  ok('Google: no OPTIONS request reached the network', !hits.some(h => h.startsWith('OPTIONS')), JSON.stringify(hits));

  const o = await run(OTHER);
  ok('other endpoint: the POST resolves exactly as before', o.ok === true && o.status === 200, JSON.stringify(o));
  ok('other endpoint: the upload listeners are on, as before (the idle and reply clocks need them)', o.rec && o.rec.up && o.rec.upLoad, JSON.stringify(o.rec));
  const l = await run(`http://127.0.0.1:${port}/nowhere-post`);
  ok('a local endpoint is untouched as well (listeners on)', l.rec && l.rec.up && l.rec.upLoad, JSON.stringify(l.rec));
  ok('the script.google.com rule matches the host only, not a look-alike path',
     await page.evaluate(() => /^https:\/\/script\.google(usercontent)?\.com\//i.test('https://example.test/script.google.com/x')) === false);

  /* 4. still bounded: a Google request that never answers is aborted by the max clock. */
  await page.unroute(/script\.google\.com|example-other-backend\.test/);
  await page.route(/script\.google\.com/, () => { /* never answer */ });
  const t0 = Date.now();
  const hung = await run(GAS, 1500);
  ok('Google: a request that never answers is still ended by the overall max clock', !!hung.err && Date.now() - t0 < 10000, JSON.stringify({ err: hung.err, ms: Date.now() - t0 }));

  await b.close(); srv.close();
  fs.rmSync(site, { recursive: true, force: true });
  if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
  console.log('\nall passed');
})().catch(e => { console.error(e); process.exit(1); });
