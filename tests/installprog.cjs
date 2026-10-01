/* THE FIRST INSTALL SAYS HOW FAR IT HAS GOT.

   Audit of 2026-10-01: on a fresh phone the readiness card said "NOT READY —
   Not installed for offline use yet" and went on saying exactly that, through
   a reload and a "Check again", until the worker finished its first precache —
   twelve seconds on data-centre bandwidth, and on a one-bar mine-site link
   minutes, with nothing on screen to say whether it was moving.

   This serves the app with one essential file held back from the WORKER's
   download (the page's own <script> load is served at once — Sec-Fetch-Dest
   tells the two apart), so the first install sits part-way for as long as the
   test wants. While it does, the card must say "Downloading for offline use:
   N of M files" with N < M and the verdict must carry the same count — not
   "Setup needed", because nothing is wrong. Released, the card must reach
   "ready offline" BY ITSELF, without anybody pressing Check again.

   Run: node tests/installprog.cjs   (starts its own server on 8150) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = 8150;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

const HOLD = '/mobile/assets.js';
let held = [], release = false;
const serve = (res, p) => {
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(res);
};
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  // The worker's precache fetch() is dest "empty"; the page's <script> is "script".
  if (u.pathname === HOLD && req.headers['sec-fetch-dest'] === 'empty' && !release) { held.push(() => serve(res, p)); return; }
  serve(res, p);
}).listen(PORT);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });

  // The worker reaches the held file and stops there.
  for (let i = 0; i < 60 && !held.length; i++) await p.waitForTimeout(250);
  ok('the worker\'s download is held part-way (test rig)', held.length > 0, held.length);

  await p.evaluate(() => yardCheck());
  const mid = await p.evaluate(() => {
    const r = (lastYard && lastYard.rows || []).find(x => x.key === 'offline_installing');
    return { row: r ? { k: r.k, text: r.text, vars: r.vars } : null, v: lastYard && lastYard.v,
      controlled: !!navigator.serviceWorker.controller,
      verdictText: lastYard ? t(lastYard.v.s, lastYard.v.vars) : '' };
  });
  ok('no worker is in charge yet (a first install)', !mid.controlled);
  ok('the card has an "installing" row, not the flat "not installed"', !!mid.row, JSON.stringify(mid).slice(0, 300));
  ok('  saying how many files of how many', !!mid.row && /\d+ of \d+ files/.test(mid.row.text), mid.row && mid.row.text);
  ok('  part-way: some cached, not all', !!mid.row && mid.row.vars.n > 0 && mid.row.vars.n < mid.row.vars.of, mid.row && JSON.stringify(mid.row.vars));
  ok('the verdict carries the count, not "Setup needed"', mid.v && mid.v.s === 'rdy_v_installing' && /\d+ of \d+/.test(mid.verdictText), mid.verdictText);
  await p.waitForTimeout(3500);   // the bar re-asks every 3 s
  const bar = await p.evaluate(() => (document.getElementById('readyBar') || {}).textContent || '');
  const nBar = +((bar.match(/(\d+) of \d+/) || [])[1] || -1);
  ok('and so does the bar on the capture screen, with the same count', nBar === mid.row.vars.n, bar);

  // Let it finish — nobody presses anything.
  release = true; held.splice(0).forEach(f => f());
  const done = await p.waitForFunction(() => {
    const r = lastYard && lastYard.rows.find(x => x.key === 'offline' || x.key === 'offline_installing');
    return r && r.key === 'offline' && r.k === 'ok';
  }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  const end = await p.evaluate(() => (lastYard.rows.find(x => /^offline/.test(x.key)) || {}).text);
  ok('released, the card reaches "ready offline" by itself, with no tap', done, end);
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');

  await b.close(); srv.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
