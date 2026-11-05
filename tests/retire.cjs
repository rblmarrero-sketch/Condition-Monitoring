/* CM_RETIRE_V1 (build 595, Rickie 06.11.2026 "we need only one dashboard which is the next ... old one should be retired").
   On a real host the classic page sends the reader to dashboard-next, keeping the query and #tab; on 127.0.0.1 (every
   test suite) and with ?classic it stays; the landing page no longer links to it.  Run: node tests/retire.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  let p = path.join(ROOT, u.startsWith('/cm/') ? u.slice(4) : u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' }); r.end(d); }); });
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const P = srv.address().port;
  const b = await chromium.launch({ args: ['--host-resolver-rules=MAP cm.example.test 127.0.0.1'] });
  const go = async (url) => { const ctx = await b.newContext(); await ctx.route(/\.(png|woff2?)$/, r => r.abort()); const p = await ctx.newPage(); const seen = [];
    p.on('request', q => { if (q.isNavigationRequest() && q.frame() === p.mainFrame()) seen.push(q.url()); });
    await p.goto(url, { waitUntil: 'commit' }).catch(() => {}); await p.waitForTimeout(1500);
    /* where the redirect sent it: the last page requested (the page itself may tidy its own #tab afterwards) */
    const u = seen.length > 1 ? seen[seen.length - 1] + (new URL(url).hash || '') : p.url(); await ctx.close(); return u; };
  const H = `http://cm.example.test:${P}`;
  let u = await go(`${H}/cm/dashboard/#equipment?eq=TK146`);
  ok('a real host: /cm/dashboard/ goes to /cm/dashboard-next/, same #tab', u === `${H}/cm/dashboard-next/#equipment?eq=TK146`, u);
  u = await go(`${H}/cm/dashboard/index.html?x=1#cmwo`);
  ok('index.html with a query goes there too, query kept', u === `${H}/cm/dashboard-next/?x=1#cmwo`, u);
  u = await go(`${H}/cm/dashboard/?classic`);
  ok('?classic stays on the classic page', /\/cm\/dashboard\/\?classic(#|$)/.test(u), u);
  u = await go(`http://127.0.0.1:${P}/cm/dashboard/#overview`);
  ok('127.0.0.1 (the test suites) stays', /:\d+\/cm\/dashboard\/#/.test(u), u);
  const land = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok('the landing page links to dashboard-next and no longer to the classic page', /href="dashboard-next\/"/.test(land) && !/href="dashboard\/"/.test(land));
  await b.close(); srv.close(); console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('ERR', e); process.exit(1); });
