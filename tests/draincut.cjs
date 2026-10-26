/* A CUT INDEX REPLY IS NOT THE WHOLE FOLDER (audit 26.10, C3).

   The Google index answers a read from zero in pages: once the month files it
   has read pass INDEX_SLIM_BYTES it stops, says `truncated` and gives the
   `cursor` to resume from. It never says `pending` — that field belongs to the
   records path. histDrain asked only `pending`, so the first cut page of a new
   phone's full read was taken for the whole folder, and histTrueUp stripped the
   "from the system" stamp from every machine not on that page: exactly the ones
   inspected most recently, which then counted as never done.

   This serves the phone a two-page index from its own tiny backend:
     1. page one cut short, page two holding a recent round — the drain must ask
        for page two from the cursor, and keep every stamp;
     2. a cut reply whose cursor never moves — the drain must give up (false),
        never true-up on the prefix.
   Against the old code case 1 asks once and strips TK147's stamp.

   Run: node tests/draincut.cjs   (serves the repo itself on 8163) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8163, BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

let MODE = 'two';                    // 'two' = page 1 cut, page 2 ends; 'stuck' = cut, cursor never moves
const CALLS = [];
const EMPTY = { edits: [], conflicts: [], deleted: [], deferrals: [] };
function index(since) {
  if (MODE === 'stuck')
    return Object.assign({ ok: true, v: 2, at: 500, truncated: true, cursor: 100,
      rows: [{ u: 'TK146', d: '2026-09-01', t: 'MP', by: 'A' }] }, EMPTY);
  if (!since) return Object.assign({ ok: true, v: 2, at: 500, truncated: true, cursor: 100,
      rows: [{ u: 'TK146', d: '2026-09-01', t: 'MP', by: 'A' }] }, EMPTY);
  return Object.assign({ ok: true, v: 2, at: 500,
      rows: [{ u: 'TK147', d: '2026-10-20', t: 'MP', by: 'B' }] }, EMPTY);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
                '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  if (u.pathname === '/exec') {
    const a = u.searchParams.get('action');
    let out = { ok: true };
    if (a === 'index') { CALLS.push(Number(u.searchParams.get('since') || 0)); out = index(Number(u.searchParams.get('since') || 0)); }
    else if (a === 'file') out = { ok: false, error: 'Not found' };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(out));
  }
  const f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(url => {
    if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', '1');
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_hist_full_v1', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof histDrain === 'function' && typeof histAll === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(1500);                       // let the boot-time pull settle

  const seed = () => p.evaluate(() => {
    localStorage.setItem('cm_hist', JSON.stringify({
      'MP|TK146': { d: '2026-09-01', s: 'f' },
      'MP|TK147': { d: '2026-10-20', s: 'f' } }));
    localStorage.setItem('cm_team_cursor', '0');
  });

  console.log('\n1. A CUT FIRST PAGE, THEN THE REST');
  MODE = 'two'; await seed(); CALLS.length = 0;
  const r1 = await p.evaluate(async () => {
    const v = await histDrain();
    const h = histAll();
    return { v, a: histEntry(h['MP|TK146']), b: histEntry(h['MP|TK147']) };
  });
  ok('the drain asks again from the cursor the cut page gave', CALLS.length >= 2 && CALLS[0] === 0 && CALLS[1] === 100, JSON.stringify(CALLS));
  ok('and finishes', r1.v === true, JSON.stringify(r1));
  ok('the machine on page one keeps its stamp', r1.a && r1.a.s === 'f', JSON.stringify(r1.a));
  ok('the recently inspected machine on page two keeps its stamp', r1.b && r1.b.s === 'f' && r1.b.d === '2026-10-20', JSON.stringify(r1.b));

  console.log('\n2. A CUT REPLY THAT NEVER MOVES');
  MODE = 'stuck'; await seed(); CALLS.length = 0;
  const r2 = await p.evaluate(async () => {
    const v = await histDrain();
    const h = histAll();
    return { v, b: histEntry(h['MP|TK147']) };
  });
  ok('the drain does not claim a complete read', r2.v === false, JSON.stringify(r2));
  ok('and strips nothing on the strength of a prefix', r2.b && r2.b.s === 'f', JSON.stringify(r2.b));

  ok('no page errors', !fails.some(f => /^PAGEERROR/.test(f)), fails.filter(f => /^PAGEERROR/.test(f)).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
