/* THE GUARD IN pw-guard.cjs, PROVEN — and proven able to see.

   Every suite's browser comes through tests/pw.cjs, which now hands back
   pw-guard.cjs. This asks it three things on a real Chromium:
     · a fetch to a production host fails at once, without leaving the browser;
     · a local server still answers (the guard must not break the sweep);
     · both ways a suite opens a page (browser.newPage and newContext().newPage)
       are guarded.
   And it plants its own blind spot: the bare module (CM_PW_UNGUARDED) does NOT
   block, so the first check is reading the guard and not the network. That
   second half does not touch the network either: the production URL is
   fulfilled by a route of this suite's own, so a 200 there means "the guard
   was not in the way", never "we reached live". */
const http = require('http');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const PROD_URL = 'https://script.google.com/macros/s/X/exec?action=ping';

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); r.end('local'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const LOCAL = 'http://127.0.0.1:' + srv.address().port + '/';
  const probe = p => p.evaluate(async ([a, b]) => {
    const t0 = Date.now(); let prod;
    /* no-cors: an opaque answer still resolves, so only a connection that was
       never made rejects. A plain fetch would also reject on Google's own
       missing CORS header and could not tell the two apart. */
    try { const r = await fetch(a, { mode: 'no-cors' }); prod = 'answered ' + r.type; } catch (e) { prod = 'refused'; }
    const ms = Date.now() - t0;
    let local; try { local = await (await fetch(b)).text(); } catch (e) { local = 'refused'; }
    return { prod, ms, local };
  }, [PROD_URL, LOCAL]);

  const { chromium } = require(require('./pw.cjs'));
  const b = await chromium.launch();
  const p1 = await b.newPage(); await p1.goto(LOCAL);
  const r1 = await probe(p1);
  ok('browser.newPage: a production host is refused', r1.prod === 'refused', JSON.stringify(r1));
  ok('  and refused at once, not after a network timeout', r1.ms < 2000, r1.ms + ' ms');
  ok('  while a local server still answers', r1.local === 'local', r1.local);
  const ctx = await b.newContext(); const p2 = await ctx.newPage(); await p2.goto(LOCAL);
  const r2 = await probe(p2);
  ok('newContext().newPage: a production host is refused too', r2.prod === 'refused', JSON.stringify(r2));
  /* A suite that answers a production URL itself keeps doing so: the guard
     steps aside for the host that route covers (tests/fboverlay.cjs). */
  const p4 = await ctx.newPage(); await p4.goto(LOCAL);
  await p4.route(/script\.google\.com/, r => r.fulfill({ status: 200, body: 'stub', headers: { 'Access-Control-Allow-Origin': '*' } }));
  const r4 = await probe(p4);
  ok("a suite's own route for a production URL still answers it", r4.prod === 'answered opaque', JSON.stringify(r4));
  const p5 = await ctx.newPage(); await p5.goto(LOCAL);
  const r5 = await probe(p5);
  ok('  and only on that page: the next page is still guarded', r5.prod === 'refused', JSON.stringify(r5));
  await b.close();

  /* The blind spot, planted: the bare module, with the production URL served
     by this suite's own route — so the network is never asked. */
  const bare = require(require('./pw-guard.cjs').REAL);
  const b2 = await bare.chromium.launch();
  const c2 = await b2.newContext();
  await c2.route(PROD_URL, r => r.fulfill({ status: 200, body: 'stub', headers: { 'Access-Control-Allow-Origin': '*' } }));
  const p3 = await c2.newPage(); await p3.goto(LOCAL);
  const r3 = await probe(p3);
  ok('the bare module does not block — so the checks above read the guard', r3.prod === 'answered opaque', JSON.stringify(r3));
  await b2.close(); srv.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('  FAIL  ' + e.message); process.exit(1); });
