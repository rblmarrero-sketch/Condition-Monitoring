/* A FAILED CHECK IS NOT A VERDICT.

   Field report, build 262: a Safari tab on a phone with signal read "No
   signal" on the pill and "No signal" on the Update link, while the
   installed app on the same phone reached the server in the same minute.
   The check as it stood made one attempt with an eight-second deadline and
   then did nothing until the five-minute timer; it said "No signal" for a
   timeout, a 404 and a worker that would not answer alike; and the readiness
   card said "the newest there is" on the strength of navigator.onLine.

   What has to be true now, against a real server and a real worker:

     · a check that fails re-arms itself on its own clock, 20 s backing off
       to 5 min — so when the server comes back the phone takes the build in
       seconds, with nothing tapped;
     · a page whose own fetches all fail still gets the build THROUGH THE
       WORKER, which asks the server from its own process and starts the
       update from in there;
     · navigator.onLine gates nothing: a flag stuck at false does not stop
       the update, and does not stop the folder being read;
     · a slow answer (12 s) is an answer, not "no signal";
     · the Update link, tapped while the server is unreachable, names the
       host and the reason — and the phone still lands on the build by itself
       once the server is back, without a second tap;
     · the readiness card never says "the newest there is" without having
       heard from the server;
     · a page that has reached nobody for STUCK_MS across STUCK_N tries while
       the phone reports a network reloads itself once when idle, and not
       again inside STUCK_GAP.

   Run: node tests/updretry.cjs        (spawns tests/ya-srv.cjs on 8137) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const YA = 8137, YAB = 'http://127.0.0.1:' + YA, EXEC = YAB + '/exec';
const ya = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(YA), 'letmein'], { stdio: 'ignore' });
const bye = () => { try { ya.kill(); } catch (e) {} };
process.on('exit', bye);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* The app, served for real, with three knobs a deploy or a bad link would turn:
   BUMP rewrites the build number on the way out; FAIL 'page' destroys the
   PAGE's check (sw.js?ts=) and nothing else, FAIL 'all' destroys every request
   for sw.js; SLOW delays the page's check by that many milliseconds. */
let BUMP = null, FAIL = null, SLOW = 0;
const hits = { page: 0, sw: 0, script: 0, killed: 0 };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  const isSw = p.endsWith('/sw.js');
  if (isSw) { if (u.searchParams.has('ts')) hits.page++; else if (u.searchParams.has('swts')) hits.sw++; else hits.script++; }
  const kill = isSw && (FAIL === 'all' || (FAIL === 'page' && u.searchParams.has('ts')));
  if (kill) { hits.killed++; try { req.socket.destroy(); } catch (e) {} return; }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html'))) {
    body = Buffer.from(String(body).replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"').replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"'));
  }
  const send = () => { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(body); };
  if (isSw && u.searchParams.has('ts') && SLOW) setTimeout(send, SLOW); else send();
});
const reset = () => { BUMP = null; FAIL = null; SLOW = 0; hits.page = hits.sw = hits.script = hits.killed = 0; };

const buildOf = p => p.evaluate(() => (typeof BUILD !== 'undefined' ? BUILD : null)).catch(() => null);
const label = p => p.evaluate(() => (document.getElementById('forceUpdate') || {}).textContent || '').catch(() => '');
const diag = p => p.evaluate(() => (document.getElementById('updDiag') || {}).textContent || '').catch(() => '');
const upd = p => p.evaluate(() => JSON.parse(JSON.stringify(window.__upd || {}))).catch(() => ({}));
const word = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);
async function evalSettled(p, fn, arg) {
  try { return await p.evaluate(fn, arg); }
  catch (e) {
    if (!/Execution context was destroyed|Target closed|navigation/i.test(String(e && e.message))) throw e;
    await p.waitForLoadState('load').catch(() => {}); await p.waitForTimeout(1500);
    return p.evaluate(fn, arg);
  }
}
async function until(fn, ms, step) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, step || 400)); } return false; }
async function phone(b, init) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(init || (() => localStorage.setItem('up_dests', '[]')));
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  return { ctx, p };
}
/* Installed and controlled, as on a real phone after its first open. */
async function installed(p, APP) {
  await p.goto(APP, { waitUntil: 'load' });
  await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
  await p.waitForFunction(() => /good/.test((document.getElementById('readyBar') || {}).className || ''), null, { timeout: 30000 }).catch(() => {});
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForTimeout(2500);                          // past the 1.5 s boot check
  return p.evaluate(() => !!navigator.serviceWorker.controller);
}

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC + '?action=list&ext=.json'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const HOST = '127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();

  console.log('1. a failed check re-arms itself, and the build lands the moment the server is back');
  {
    reset();
    const { ctx, p } = await phone(b);
    ok('installed and in charge', await installed(p, APP));
    const was = await buildOf(p);
    FAIL = 'all'; hits.page = hits.sw = 0;
    await p.evaluate(() => { __updPace({ min: 1500, max: 3000 }); return checkForNewBuild(); });
    const u1 = await upd(p);
    ok('the check records the failure, not silence', u1.at > 0 && !u1.server && u1.why && u1.failAt > 0, JSON.stringify({ why: u1.why, next: u1.next > 0 }));
    ok('  and the next try is on the clock', u1.next > Date.now() - 1000, String(u1.next - Date.now()) + ' ms');
    const d1 = await diag(p);
    ok('the System screen names the surface and the reason', d1.indexOf(await word(p, 'ud_tab')) === 0 && d1.indexOf(u1.why) > 0, d1.slice(0, 120));
    await p.waitForTimeout(8000);
    ok('it keeps asking by itself: ' + hits.page + ' page asks, ' + hits.sw + ' worker asks in 8 s', hits.page >= 3 && hits.sw >= 3);
    /* The server comes back with a new build. Nothing is tapped. */
    FAIL = null; BUMP = '998';
    const got = await until(async () => (await buildOf(p)) === '998', 30000, 500);
    ok('the phone is on the new build within the retry clock, nothing tapped', got, was + ' → ' + await buildOf(p));
    await ctx.close();
  }

  console.log('\n2. the page cannot reach the server; the worker can — the build still lands');
  {
    reset();
    const { ctx, p } = await phone(b);
    ok('installed and in charge', await installed(p, APP));
    FAIL = 'page'; BUMP = '997'; hits.page = hits.sw = hits.script = hits.killed = 0;
    await p.evaluate(() => { __updPace({ min: 1500, max: 3000 }); return checkForNewBuild(); });
    const got = await until(async () => (await buildOf(p)) === '997', 30000, 500);
    ok('the phone is on the new build', got, String(await buildOf(p)));
    ok('  every ask from the page was cut off (' + hits.killed + '), the worker got through (' + hits.sw + ') and fetched the build (' + hits.script + ')', hits.killed >= 1 && hits.sw >= 1 && hits.script >= 1);
    await ctx.close();
  }

  console.log('\n3. navigator.onLine says false and is lying');
  {
    reset();
    const dests = JSON.stringify([{ id: 'gas', on: true, url: EXEC, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' }]);
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(d => { Object.defineProperty(navigator, 'onLine', { get: () => false }); localStorage.setItem('up_dests', d); }, dests);
    const p = await ctx.newPage(); p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    ok('installed and in charge', await installed(p, APP));
    ok('the flag reads false', await p.evaluate(() => navigator.onLine === false));
    ok('the folder is still read — the pull returns true', await p.evaluate(() => teamPull(true, true)) === true);
    BUMP = '996';
    await p.evaluate(() => { __updPace({ min: 1500, max: 3000 }); return checkForNewBuild(); });
    const got = await until(async () => (await buildOf(p)) === '996', 30000, 500);
    ok('and the update still lands', got, String(await buildOf(p)));
    await ctx.close();
  }

  console.log('\n4. a slow answer is an answer');
  {
    reset();
    const { ctx, p } = await phone(b);
    ok('installed and in charge', await installed(p, APP));
    SLOW = 12000; BUMP = '995';
    const t0 = Date.now();
    await p.evaluate(() => checkForNewBuild());
    const got = await until(async () => (await buildOf(p)) === '995', 40000, 500);
    ok('12 s to answer, and the phone still takes the build', got, Math.round((Date.now() - t0) / 1000) + ' s');
    await ctx.close();
  }

  console.log('\n5. the Update link, tapped while the server is unreachable');
  {
    reset();
    const { ctx, p } = await phone(b);
    ok('installed and in charge', await installed(p, APP));
    FAIL = 'all';
    await p.evaluate(() => { __updPace({ min: 1500, max: 3000 }); document.getElementById('forceUpdate').click(); });
    const trying = await word(p, 'upd_trying', { host: HOST });
    const said = await until(async () => { const l = await label(p); return /127\.0\.0\.1/.test(l) && l !== trying; }, 60000, 300);
    const l = await label(p), u = await upd(p);
    ok('it names the host and the reason', said && l.indexOf(HOST) >= 0 && u.why && l.indexOf(u.why) >= 0, l);
    ok('  and does not call it "no signal" on a phone that has a network', l !== await word(p, 'upd_nosig'), l);
    FAIL = null; BUMP = '994';
    const got = await until(async () => (await buildOf(p)) === '994', 30000, 500);
    ok('the server comes back; the build lands with no second tap', got, String(await buildOf(p)));
    await ctx.close();
  }

  console.log('\n6. the readiness card says only what was heard');
  {
    reset();
    const { ctx, p } = await phone(b);
    ok('installed and in charge', await installed(p, APP));
    FAIL = 'all';
    await p.evaluate(() => { __updPace({ min: 1500, max: 3000 }); return checkForNewBuild(); });
    await p.evaluate(() => showPane('paneSystem'));
    await p.evaluate(() => yardCheck());
    await p.waitForTimeout(1500);
    const rows = await p.evaluate(() => (document.getElementById('yardList') || {}).innerText || '');
    const okPhrase = (await word(p, 'rdy_bld_ok', { n: '0', t: '0' })).split('0')[0].trim();
    const failPhrase = (await word(p, 'rdy_bld_fail', { t: 'T', why: 'W', n: 'N' })).split('T')[0].trim();
    ok('it does not claim the newest build on the strength of a flag', rows.indexOf(okPhrase) < 0, okPhrase + ' | ' + rows.replace(/\s+/g, ' ').slice(0, 160));
    ok('  it says the server could not be reached, with the reason', rows.indexOf(failPhrase) >= 0 && rows.indexOf((await upd(p)).why) >= 0, failPhrase);
    FAIL = null;
    await p.evaluate(() => checkForNewBuild());
    await p.evaluate(() => yardCheck()); await p.waitForTimeout(1500);
    const rows2 = await p.evaluate(() => (document.getElementById('yardList') || {}).innerText || '');
    ok('once the server has answered it says so, with the time', rows2.indexOf(okPhrase) >= 0, rows2.replace(/\s+/g, ' ').slice(0, 160));
    await ctx.close();
  }

  console.log('\n7. a page that reaches nobody while the phone reports a network reloads itself once, when idle');
  {
    reset();
    const { ctx, p } = await phone(b);
    ok('installed and in charge', await installed(p, APP));
    let navs = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
    FAIL = 'all';
    await p.evaluate(() => { __updPace({ min: 400, max: 700, stuckN: 3, stuckMs: 800, stuckGap: 60000 }); __idleSince(400000); return checkForNewBuild(); });
    const reloaded = await until(async () => navs >= 1, 15000, 300);
    ok('it reloaded itself', reloaded, navs + ' navigations');
    await p.waitForLoadState('load').catch(() => {}); await p.waitForTimeout(1000);
    ok('  and still opens — served by the worker, offline-safe', (await buildOf(p)) !== null && await p.evaluate(() => (window.ASSETS || []).length > 100));
    const stamp = await p.evaluate(() => Number(localStorage.getItem('cm_stuck_reload') || 0));
    ok('  the reload is stamped', stamp > 0);
    await p.evaluate(() => { __updPace({ min: 400, max: 700, stuckN: 3, stuckMs: 800, stuckGap: 60000 }); __idleSince(400000); return checkForNewBuild(); });
    await p.waitForTimeout(6000);
    ok('  and not again inside the gap', navs === 1, navs + ' navigations');
    /* Mid-round is never the moment: a question on screen is a person mid-answer. */
    await p.evaluate(() => { localStorage.removeItem('cm_stuck_reload'); __idleSince(0); dlg('working'); });
    await p.evaluate(() => { __updPace({ min: 400, max: 700, stuckN: 3, stuckMs: 800, stuckGap: 60000 }); return checkForNewBuild(); });
    await p.waitForTimeout(6000);
    ok('  and never while somebody is working', navs === 1, navs + ' navigations');
    await ctx.close();
  }

  await b.close(); srv.close(); bye();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); bye(); process.exit(1); });
