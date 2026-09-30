/* THE STRUCTURAL GATE, PROVEN -- not the text scan (tests/noprodhit.cjs,
   which only catches a test that literally names the real host), the actual
   mechanism: postT() (mobile/index.html) and post() (dashboard/drive.js,
   shared by dashboard/ and dashboard-next/) now refuse to reach any REMOTE
   (non-127.0.0.1/localhost) host while navigator.webdriver is true -- which
   the WebDriver spec requires every automation-controlled browser to report,
   with nothing for a test to remember to set. See prodWriteGuard's own
   comment in each file for the 2026-09-30 incident this closes.

   This suite proves two things, deliberately never naming the real
   production host (that would trip tests/noprodhit.cjs's own scan, and
   there is no need to: a synthetic non-local hostname exercises the
   identical code path, since the guard only asks "is this host local", not
   "is this THE real host"):

     (a) a simulated test harness WITHOUT any mock destination configured --
         navigator.webdriver true, exactly as every Playwright-driven test in
         this repo already is by construction, with NOTHING overriding the
         upload/write destination -- cannot reach a non-local host even if it
         tries. Proven for postT (mobile) and for CMDrive.saveEdit/resolve
         (dashboard, which dashboard-next/index.html loads unchanged from the
         same drive.js). A page.route() intercept is ALSO wired to the
         synthetic host as a second, independent proof that zero bytes ever
         left the browser -- so this proves the guard fired, not merely that
         the test forgot to check.

     (b) the real deployed app, unflagged (navigator.webdriver spoofed to
         false, simulating a genuine human browser), behaves EXACTLY as it
         did before this fix -- the identical call reaches the network layer
         unchanged. Fulfilled locally via page.route() so no real request
         ever needs to leave the machine to prove this; the point is that the
         CODE path is unchanged for a real session, not that this test
         performs real internet egress.

   Run: node tests/prodguard.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});

/* A stand-in for "the real production host" -- structurally identical (a
   real, remote-looking hostname, not 127.0.0.1/localhost) without ever
   naming the actual one. The guard's own logic never inspects WHICH remote
   host it is, only whether it is local, so this exercises the identical
   branch. */
const FAKE_PROD = 'https://example-prod-backend.test/exec';

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  /* ---- (a) unflagged automation, no mock destination configured -------- */
  {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    let networkHit = false;
    await p.route('**/example-prod-backend.test/**', route => { networkHit = true; route.abort(); });
    await p.goto(`http://127.0.0.1:${port}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof window.postT === 'function', null, { timeout: 20000 });

    const isWebdriver = await p.evaluate(() => navigator.webdriver);
    ok('sanity: Playwright itself reports navigator.webdriver === true, exactly like every other suite in this repo',
       isWebdriver === true, String(isWebdriver));

    const result = await p.evaluate(url => {
      try { postT(url, 'x'); return { threw: false }; }
      catch (e) { return { threw: true, blocked: e.prodGuardBlocked === true, msg: e.message }; }
    }, FAKE_PROD);
    ok('mobile/index.html: postT() to a non-local host throws the guard\'s own error, synchronously, before any network call',
       result.threw && result.blocked, JSON.stringify(result));
    ok('and no request for it ever reached the network layer', !networkHit, String(networkHit));

    /* Same proof again through CMDrive (drive.js — shared verbatim by
       dashboard/index.html and dashboard-next/index.html), against
       dashboard/index.html this time. saveEdit/resolve both funnel through
       drive.js's own post(), so proving saveEdit proves the shared choke
       point both dialogs and both pages write through. */
    const p2 = await ctx.newPage();
    let networkHit2 = false;
    await p2.route('**/example-prod-backend.test/**', route => { networkHit2 = true; route.abort(); });
    await p2.goto(`http://127.0.0.1:${port}/dashboard/index.html`, { waitUntil: 'load' });
    await p2.waitForFunction(() => window.CMDrive && typeof window.CMDrive.saveEdit === 'function', null, { timeout: 20000 });
    await p2.evaluate(url => { CMDrive.save(url, ''); }, FAKE_PROD);
    const result2 = await p2.evaluate(async () => {
      try { await CMDrive.saveEdit({ key: 'TK000|2026-01-01|MP' }); return { threw: false }; }
      catch (e) { return { threw: true, blocked: e.prodGuardBlocked === true, msg: e.message }; }
    });
    ok('dashboard/index.html (shared drive.js, also loaded unchanged by dashboard-next/index.html): CMDrive.saveEdit() to a non-local host is refused the same way',
       result2.threw && result2.blocked, JSON.stringify(result2));
    ok('and CMDrive.saveEdit\'s own attempt never reached the network layer either', !networkHit2, String(networkHit2));

    /* Explicit unit coverage of the local/remote line itself, since the whole
       guard rests on it: every host a real mock test already uses must read
       as local, and ordinary real-world hosts must not. */
    const hostChecks = await p.evaluate(() => {
      const cases = [
        ['http://127.0.0.1:8085/exec', true], ['http://localhost:9999/x', true],
        ['http://127.5.5.5/x', true], ['https://example-prod-backend.test/exec', false],
        ['https://some-real-domain.example.org/exec', false], ['https://203.0.113.9/exec', false],
      ];
      return cases.map(([u, want]) => ({ u, want, got: isLocalUploadHost(u) }));
    });
    ok('isLocalUploadHost() draws the local/remote line correctly for every case (mock ports pass, real-shaped hosts do not)',
       hostChecks.every(c => c.got === c.want), JSON.stringify(hostChecks));

    await ctx.close();
  }

  /* ---- (b) a genuine, unautomated session behaves exactly as before ----- */
  {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    // Simulate "not under WebDriver" the way a real installed browser
    // reports itself -- BEFORE any page script runs, so postT's own guard
    // reads the same value the rest of the page would.
    await p.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    let reqBody = null;
    await p.route('**/example-prod-backend.test/**', route => {
      reqBody = route.request().postData();
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await p.goto(`http://127.0.0.1:${port}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof window.postT === 'function', null, { timeout: 20000 });

    const spoofed = await p.evaluate(() => navigator.webdriver);
    ok('the spoof itself took: this page now reports navigator.webdriver === false, as a real browser would',
       spoofed === false, String(spoofed));

    const result = await p.evaluate(async url => {
      try { const r = await postT(url, JSON.stringify({ hello: 'world' })); return { threw: false, ok: r.ok }; }
      catch (e) { return { threw: true, msg: e.message, blocked: e.prodGuardBlocked === true }; }
    }, FAKE_PROD);
    ok('mobile/index.html: with navigator.webdriver false (a genuine session), postT() to the SAME non-local host is UNCHANGED -- it reaches the network exactly as it did before this fix, not blocked',
       result.threw === false && result.ok === true, JSON.stringify(result));
    ok('and the request actually reached the (locally fulfilled) route -- proving the code path, not merely the assertion, is unaffected for a real session',
       reqBody !== null, String(reqBody));

    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length ? 1 : 0);
})();
