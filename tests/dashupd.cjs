/* THE OFFICE PAGE MUST NOTICE A NEW BUILD TOO.

   It stamped its version once at load and never asked again, so a browser
   opened on Monday served Monday's code on Friday. Same rule as the phone:
   find it silently, apply it when the reader is not mid-decision, never take a
   half-finished correction away from them. */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
/* The build the app is actually on, read from the file rather than typed in.
   Hardcoding it meant that the moment BUILD moved past the literal, the mock
   was serving an OLDER version than the page was running — which is a
   different test from the one this file is about, and it is how this suite
   started reporting a navigation to ?b=227. */
const REAL = (fs.readFileSync(path.join(ROOT, 'mobile', 'sw.js'), 'utf8')
  .match(/const BUILD\s*=\s*"([^"]+)"/) || [])[1] || '0';
let SERVED = REAL;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin':'*' };
  if (u.pathname === '/mobile/sw.js') {
    res.writeHead(200, Object.assign({ 'Content-Type':'text/javascript' }, cors));
    return res.end('const BUILD = "' + SERVED + '";');
  }
  if (u.pathname === '/live') { res.writeHead(200, Object.assign({'Content-Type':'application/json'},cors));
    return res.end(JSON.stringify({ ok:true, records:[], files:[], cursor:0, failed:0 })); }
  const p = path.join(ROOT, u.pathname);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404, cors); return res.end('no'); }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
}).listen(8131);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let navs = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
  await p.addInitScript(() => {
    localStorage.setItem('cm_drive_url', 'http://127.0.0.1:8131/live');
    localStorage.setItem('cm_swap_off', '1');
  });
  await p.goto('http://127.0.0.1:8131/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  const start = navs;

  console.log('\n1. AN IDLE DASHBOARD PICKS THE NEW BUILD UP BY ITSELF');
  SERVED = String(Number(REAL) + 1);
  await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(6000);
  const url = p.url();
  ok('it reloaded itself with nothing tapped', navs > start, (navs - start) + ' navigation(s)');
  ok('  onto the new build', url.indexOf('b=' + SERVED) >= 0, url.slice(-40));

  console.log('\n1b. AN OLDER BUILD IS NOT AN UPDATE');
  /* The check compared for INEQUALITY, so a build number lower than the
     running one counted as new: the page navigated backwards onto it, re-read
     its own version, saw the difference again and went round once more. Live
     it never shows, because Pages serves exactly one version — which is
     exactly why it would have waited there until the day something served a
     stale copy, and then presented as the dashboard reloading in a loop. */
  await p.goto('http://127.0.0.1:8131/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  SERVED = String(Math.max(0, Number(REAL) - 5));
  const bOld = navs, urlOld = p.url();
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(5000);
  ok('a lower build number is ignored', navs === bOld && p.url() === urlOld,
     'served ' + SERVED + ' while running ' + REAL + ', ' + (navs - bOld) + ' navigation(s)');
  const q = await p.evaluate(() => (document.getElementById('dashVer') || {}).classList
    ? document.getElementById('dashVer').classList.contains('stale') : null);
  ok('  and nothing is announced', q === false, 'badge marked stale: ' + q);

  console.log('\n2. A READER MID-CORRECTION IS NOT INTERRUPTED');
  await p.goto('http://127.0.0.1:8131/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  SERVED = String(Number(REAL) + 2);
  const before = p.url();
  await p.evaluate(() => {
    const ov = document.getElementById('editOv');
    if (ov) ov.classList.remove('hidden');           // somebody is mid-decision
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(6000);
  ok('the page did not change under them', p.url() === before, p.url().slice(-30));
  const badge = await p.evaluate(() => {
    const el = document.getElementById('dashVer');
    return { txt: el.textContent, stale: el.classList.contains('stale'), tip: el.title }; });
  console.log('   ' + JSON.stringify(badge));
  ok('  but the badge says a new version is waiting', badge.stale, badge.txt);
  ok('  and explains it will apply on its own', /refresh itself|обновится сама/i.test(badge.tip), badge.tip);

  console.log('\n3. AND IT LANDS THE MOMENT THEY CLOSE THE PANEL');
  const n2 = navs;
  await p.evaluate(() => {
    const ov = document.getElementById('editOv'); if (ov) ov.classList.add('hidden');
    document.body.click();
  });
  await p.waitForTimeout(3000);
  ok('closing it let the update through', navs > n2, (navs - n2) + ' navigation(s)');
  ok('  onto the newer build', p.url().indexOf('b=' + SERVED) >= 0, p.url().slice(-40));

  ok('no page errors', errs.length === 0, errs.join(' | ') || 'none');
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(String(e.message||e).slice(0,300)); srv.close(); process.exit(1); });
