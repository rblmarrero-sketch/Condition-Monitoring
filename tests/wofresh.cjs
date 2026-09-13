/* THE 1C PULL REFRESHES ITSELF, AND SAYS HOW OLD IT IS.

   data/work_orders.js is a <script> tag, so it is read once at load and never
   again. An office screen opened at the start of the shift and left on the
   Defects tab therefore showed the work orders as they stood at breakfast —
   all day, with the stamp under the heading counting the hours and nobody
   watching it. The inspections beside them have refreshed themselves every
   three minutes since build 300; the 1C half did not refresh at all.

   The refresh is hourly at source (a scheduled GitHub job, plus the VM's own
   watcher on the pipeline's WO.xlsx since build 357), so the page asks every
   ten minutes and on coming back to the tab. This suite drives woRefresh()
   against a file it controls and asserts:
   · a newer pull replaces what is on screen and redraws the tab;
   · the same pull twice does nothing at all — no redraw, no flicker;
   · a reply that is not a pull changes nothing (silence is not a verdict);
   · the stamp says the age, and turns amber past AS_OF_STALE_H with a way to
     run the job now.

   Run: node tests/wofresh.cjs   (starts its own server on 8469) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8469);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

/* The served copy of data/work_orders.js, swapped under the page's feet
   exactly as the hourly job swaps it on Pages. Built from the REAL file so
   every other field the tab reads is the shape it reads in production. */
const REAL = fs.readFileSync(path.join(ROOT, 'data/work_orders.js'), 'utf8');
const base = JSON.parse(REAL.slice(REAL.indexOf('{'), REAL.lastIndexOf('}') + 1));
let served = null, asked = 0;
const woBody = () => 'window.CM_WO_DATA = ' + JSON.stringify(served) + ';';

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.endsWith('/data/work_orders.js')) {
    asked++;
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    return res.end(woBody());
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

const stamp = h => new Date(Date.now() - h * 3600000).toISOString();

srv.listen(PORT, async () => {
  /* Opens on a pull three hours old, so the first thing asserted is the state
     an office actually walks up to. */
  served = Object.assign({}, base, { generated: stamp(3) });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => showTab('cmwo'));
  await p.waitForTimeout(400);

  console.log('1. the stamp says how old the pull is, and when it is too old');
  const s1 = await p.evaluate(() => ({ txt: ($('cwAsOf') || {}).textContent || '',
                                       stale: !!($('cwAsOf') || { classList: { contains: () => false } }).classList.contains('stale'),
                                       href: (($('cwAsOf') || {}).querySelector ? ($('cwAsOf').querySelector('a') || {}).href : '') || '',
                                       hours: AS_OF_STALE_H }));
  ok('a three-hour-old pull is named as such', /3 hours ago/.test(s1.txt), s1.txt.slice(0, 80));
  ok('  and past the stale mark it is amber and offers to run the job', s1.stale && /refresh-work-orders/.test(s1.href), s1.hours + ' h · ' + (s1.href ? 'linked' : 'no link'));

  console.log('\n2. a newer pull arrives without anybody pressing anything');
  const before = await p.evaluate(() => ({ gen: CM_WO_DATA.generated, rows: document.querySelectorAll('#cwList tbody tr').length }));
  served = Object.assign({}, base, { generated: stamp(0.2) });
  const r2 = await p.evaluate(() => woRefresh('test'));
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ gen: CM_WO_DATA.generated, txt: ($('cwAsOf') || {}).textContent || '',
                                          stale: $('cwAsOf').classList.contains('stale'),
                                          rows: document.querySelectorAll('#cwList tbody tr').length }));
  ok('the page takes the new pull', r2 === true && after.gen !== before.gen, before.gen + ' → ' + after.gen);
  ok('  the stamp follows it and drops the amber', /less than an hour ago/.test(after.txt) && !after.stale, after.txt.slice(0, 60));
  ok('  and the table is still drawn', after.rows > 0 && after.rows === before.rows, after.rows + ' rows');

  console.log('\n3. the same pull again is not a change, and is not redrawn');
  const n0 = asked;
  const r3 = await p.evaluate(() => woRefresh('test'));
  ok('an unchanged file reports nothing to do', r3 === false, String(r3));
  ok('  it was still asked for — the check is real', asked > n0, (asked - n0) + ' request(s)');

  console.log('\n4. a reply that is not a pull leaves the page alone');
  const held = served;
  served = { hello: 'not a work-order file' };
  const r4 = await p.evaluate(() => woRefresh('test'));
  const keep = await p.evaluate(() => CM_WO_DATA.generated);
  ok('the page keeps what it had', r4 === false && keep === after.gen, keep);
  served = held;

  console.log('\n5. it keeps itself current without being asked');
  const wired = await p.evaluate(() => ({ ms: WO_MS, timer: !!woTimer }));
  ok('a timer is running', wired.timer === true);
  ok('  and it is at most fifteen minutes, for an hourly source', wired.ms > 0 && wired.ms <= 900000, Math.round(wired.ms / 60000) + ' min');

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
});
