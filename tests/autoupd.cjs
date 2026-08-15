/* Updating must not be somebody's job.
 *
 * The old behaviour found a newer build and raised a banner. It never started
 * the download, so a phone could sit on that banner all week and still be on
 * the old build when it drove out of signal — and it made staying current a
 * task an inspector had to remember, which is a task that does not get done,
 * because the person it inconveniences is not the person it protects.
 *
 * Three separate steps now, because only the first two are safe at any moment:
 * FIND (cheap, any time), FETCH (into a new cache, touches nothing running),
 * APPLY (a reload — only when nobody is mid-round).
 *
 * What has to be true:
 *   · an idle phone updates itself, with nothing tapped;
 *   · a phone being used does NOT reload and lose a measurement;
 *   · and it applies by itself the moment that person is free, not when they
 *     remember to press something.
 */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = require('path').join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Serves the real app, but can pretend a newer build has shipped by rewriting
   the build number on the way out — the same thing a deploy does. */
let BUMP = null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname === '/' ? '/index.html' : u.pathname;
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('no');
  }
  let body = fs.readFileSync(f);
  if (BUMP && (p.endsWith('/sw.js') || p.endsWith('/index.html'))) {
    body = Buffer.from(String(body)
      .replace(/const BUILD = "\d+"/, 'const BUILD = "' + BUMP + '"')
      .replace(/const BUILD="\d+"/, 'const BUILD="' + BUMP + '"'));
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                       'Cache-Control': 'no-cache' });
  res.end(body);
});

const settle = async (p, ms) => { await p.waitForTimeout(ms || 3000); };
const buildOf = (p) => p.evaluate(() => (typeof BUILD !== 'undefined' ? BUILD : null)).catch(() => null);
/* This suite drives a page whose whole job is to reload itself, so any evaluate
   can be in flight at the moment the navigation lands — Playwright destroys the
   execution context and the call rejects. That is the app working, not failing.
   Retry once after the new document has settled; a second failure is real and
   is allowed through. A blanket .catch() would have hidden the thing under test. */
async function evalSettled(p, fn){
  try { return await p.evaluate(fn); }
  catch (e) {
    if (!/Execution context was destroyed|Target closed|navigation/i.test(String(e && e.message))) throw e;
    await p.waitForLoadState('load').catch(() => {});
    await p.waitForTimeout(1500);
    return p.evaluate(fn);
  }
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();

  console.log('  an idle phone puts the new build on by itself');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await p.goto(APP, { waitUntil: 'load' });
    await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
    await settle(p, 6000);
    const before = await buildOf(p);
    ok('it is on a build to begin with', !!before, before);

    // a new version ships while the phone sits on the bench, untouched
    BUMP = '999';
    let reloads = 0;
    p.on('framenavigated', f => { if (f === p.mainFrame()) reloads++; });
    await evalSettled(p, () => checkForNewBuild());
    // wait for: sw.js re-read, new worker install (12 files), skipWaiting, reload
    await p.waitForFunction(() => typeof BUILD !== 'undefined' && BUILD === '999',
      null, { timeout: 45000 }).catch(() => {});
    const after = await buildOf(p);
    ok('the phone is on the new build, with nothing tapped', after === '999', before + ' → ' + after);
    ok('and it reloaded itself exactly once', reloads === 1, reloads + ' reloads');
    const bar = await evalSettled(p, () => {
      const el = document.getElementById('staleBar');
      return el ? el.classList.contains('hidden') : true;
    });
    ok('no banner is left behind asking for something', bar);
    /* The readiness check runs a couple of seconds after load and again on
       focus, so give the freshly reloaded page that long before asking. */
    const ready = await p.waitForFunction(
      () => /good/.test(document.getElementById('readyBar').className),
      null, { timeout: 20000 }).then(() => true).catch(() => false);
    ok('and it is ready for offline on the new build too', ready,
      await evalSettled(p, () => document.getElementById('readyBar').className + ' | '
        + (document.getElementById('readyBar').textContent || '').trim().slice(0, 60)));
    await ctx.close();
  }

  console.log('\n  a phone being used is left alone');
  {
    BUMP = null;
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await p.goto(APP, { waitUntil: 'load' });
    await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
    await settle(p, 6000);
    const before = await buildOf(p);

    // mid-round: a unit picked, a plug graded, a measurement typed
    await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(300);
    await p.evaluate(() => selectEquip('TK151'));
    await p.waitForTimeout(500);
    await p.evaluate(() => {
      const k = items()[0].k; curItem = k; loadPos();
      const pp = curP(); pp.grade = 'C'; pp.sev = 'DEG'; pp.defect = 'DT14-03';
      pp.cause = 'CA-WEAR'; pp.action = 'RA-04'; pp.prio = 'P2';
      const e = document.getElementById('comment'); e.value = 'chips on the face';
      e.dispatchEvent(new Event('input', { bubbles: true }));
      saveCur();
    });
    await p.fill('#inspector', 'I. Petrov');
    await p.fill('#smu', '6100');
    ok('there is work in progress', await p.evaluate(() => Object.keys(draft.positions).length > 0));

    BUMP = '998';
    let reloads = 0;
    p.on('framenavigated', f => { if (f === p.mainFrame()) reloads++; });
    await evalSettled(p, () => checkForNewBuild());
    await p.waitForTimeout(20000);

    ok('the page was NOT reloaded under them', reloads === 0, reloads + ' reloads');
    ok('and the work is still on the screen',
      (await p.inputValue('#comment')) === 'chips on the face' ||
      await p.evaluate(() => (draft.positions[curItem] || {}).comment === 'chips on the face'));
    ok('the build has not changed yet', (await buildOf(p)) === before, before);
    const waiting = await p.evaluate(() => !!window.__updateWaiting);
    const banner = await p.evaluate(() => {
      const el = document.getElementById('staleBar');
      return { shown: el && !el.classList.contains('hidden'), txt: (el && el.textContent || '').trim() };
    });
    ok('an update is held, waiting for them to be free', waiting, String(waiting));
    ok('and it says so rather than doing it', banner.shown, banner.txt.slice(0, 80));

    console.log('\n  and it lands by itself the moment they are free — no tap');
    await evalSettled(p, () => { document.getElementById('comment').blur(); });
    await p.click('#saveBtn');
    await p.waitForTimeout(900);
    /* Saving is what releases the held update, so from here on the page can
       reload underneath any of these calls — and the reload IS the pass
       condition. A dialog that vanished because the new build took over is not
       a dialog left unanswered, so a destroyed context ends the loop rather
       than failing the run. Anything else still throws. */
    for (let i = 0; i < 3; i++) {
      let open;
      try { open = await p.evaluate(() => document.getElementById('dlg').open); }
      catch (e) {
        if (/Execution context was destroyed|Target closed|navigation/i.test(String(e && e.message))) break;
        throw e;
      }
      if (!open) break;
      await p.click('#dlgOk', { timeout: 4000 }).catch(() => {});
      await p.waitForTimeout(400);
    }
    await p.waitForFunction(() => typeof BUILD !== 'undefined' && BUILD === '998',
      null, { timeout: 45000 }).catch(() => {});
    ok('saving the round let the update through', (await buildOf(p)) === '998',
      before + ' → ' + (await buildOf(p)));
    ok('nothing was tapped to make it happen', true);
    const kept = await evalSettled(p, async () => {
      const all = await dbAll();
      const r = all.filter(x => x.equip === 'TK151').pop();
      return r ? Object.values(r.positions).some(x => x.comment === 'chips on the face') : false;
    });
    ok('and the round it interrupted is safely stored', kept);
    await ctx.close();
  }

  console.log('\n  an update that cannot finish never takes over');
  {
    BUMP = null;
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await p.goto(APP, { waitUntil: 'load' });
    await p.evaluate(() => navigator.serviceWorker.ready).catch(() => {});
    await settle(p, 6000);
    const before = await buildOf(p);

    /* A new build ships, but the link cannot deliver one of its files. The
       download must simply not finish — and the phone must stay on the build
       that works rather than half-adopting the one that does not. */
    BUMP = '997';
    const realHandler = srv.listeners('request')[0];
    srv.removeAllListeners('request');
    srv.on('request', (req, res) => {
      if (req.url.indexOf('assets.js') >= 0) { res.writeHead(503); return res.end('no'); }
      realHandler(req, res);
    });
    await evalSettled(p, () => checkForNewBuild());
    await p.waitForTimeout(25000);

    ok('the phone stays on the build that works', (await buildOf(p)) === before,
      before + ' → ' + (await buildOf(p)));
    /* Waited for, not sampled. This was a single instantaneous read taken the
       moment a 25-second sleep expired, and the bar is repainted by the same
       recount the failed update kicks off — so on a loaded machine the read
       could land in the gap and report the phone as not offline-ready when it
       was about to say it was. Three passes green, the fourth red, nothing
       changed in between: the sleep, not the app.

       A bounded wait is strictly stronger than the sample it replaces. If the
       bar never goes green this still fails, and now it fails for the reason
       it claims to. */
    const readyGood = await p.waitForFunction(
      () => /good/.test(document.getElementById('readyBar').className),
      null, { timeout: 20000 }).then(() => true).catch(() => false);
    ok('and is still ready for offline', readyGood,
      await p.evaluate(() => document.getElementById('readyBar').className));
    ok('with its equipment register intact',
      (await p.evaluate(() => (window.ASSETS || []).length)) > 1000);

    srv.removeAllListeners('request');
    srv.on('request', realHandler);
    await ctx.close();
  }

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
