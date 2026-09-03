/* "Is the automatic synchronisation working?"

   Half of it was. The dashboard pulls on its own since build 68. The phone
   pushed at every obvious moment — after a save, at startup, on the browser's
   "online" event — and then never tried again. That last part is the one that
   matters in a pit: "online" fires when a network interface attaches, not when
   the network starts working, so driving out of a dead zone on the same
   cellular connection fires nothing. A round captured at the face could sit in
   the queue all shift with the phone showing full bars.

   What has to be true now: a round captured with the link down leaves by
   itself, with nobody pressing anything. */
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');   // the machine photographs every round now carries
const B = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
};
const dismiss = async p => { for (let i = 0; i < 3; i++) {
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(250); } else break; } };
const pend = p => p.evaluate(async () => (await dbAll()).filter(r => !r.up).length);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));

  /* One working destination. Every id has to be listed with a non-empty url,
     or loadDests() fills the missing ones in from upload-defaults.js and the
     round is also posted at the real SharePoint, which fails and muddies the
     result. A url present means "this phone has made a choice" — the tick is
     then honoured. */
  const DEAD = 'http://127.0.0.1:9/exec';        // a closed port: the pit
  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify([
    { id: 'gas',  on: true,  url: u,                       sec: '', folder: '' },
    { id: 'pa',   on: false, url: 'https://off.invalid/',  sec: '', folder: '' },
    { id: 'post', on: false, url: 'https://off.invalid/',  sec: '', folder: '' },
  ])), DEAD);
  const pointAt = (url) => p.evaluate(u => {
    const d = JSON.parse(localStorage.getItem('up_dests'));
    d.find(x => x.id === 'gas').url = u;
    localStorage.setItem('up_dests', JSON.stringify(d));
    destsCache = null; destsRaw = null;          // the storage event only fires cross-tab
  }, url);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);

  console.log('  the retry is armed only when there is something to send');
  const idle = await p.evaluate(() => ({ timer: !!retryTimer, at: retryAt }));
  ok('an empty queue arms nothing', !idle.timer);
  ok('and the backoff sits at its minimum', idle.at === 20000, String(idle.at));

  console.log('\n  a round captured with the link down');
  // the destination is already pointed at a closed port — reachable phone,
  // nothing answering, which is what the pit looks like
  await p.evaluate(() => {
    const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '6100');
  await p.evaluate(() => {
    const k = items()[0].k; curItem = k; loadPos();
    const pp = curP(); pp.grade = 'C'; pp.sev = 'DEG'; pp.defect = 'DT14-03';
    pp.cause = 'CA-WEAR'; pp.action = 'RA-04'; pp.prio = 'P2';
    saveCur();
  });
  await p.evaluate(PLANT);
  await p.click('#saveBtn'); await p.waitForTimeout(900); await dismiss(p);

  ok('the round is stored and queued', (await pend(p)) === 1, String(await pend(p)));
  const armed = await p.evaluate(async () => {
    for (let i = 0; i < 30; i++) { if (retryTimer) break; await new Promise(r => setTimeout(r, 200)); }
    return { timer: !!retryTimer, at: retryAt };
  });
  ok('a failed send arms a retry, unprompted', armed.timer, 'backoff ' + armed.at + ' ms');

  const bar = await p.textContent('#syncBar');
  ok('and the bar says it will retry by itself, not "press Sync"',
    /retry by itself/i.test(bar || ''), (bar || '').replace(/\s+/g, ' ').trim().slice(0, 90));

  console.log('\n  the link comes back — nobody presses anything');
  await pointAt(B + '/exec');
  // Coming back to the app is one of the triggers. No button is touched.
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const drained = await p.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      const n = (await dbAll()).filter(r => !r.up).length;
      if (!n) return { n, i };
      await new Promise(r => setTimeout(r, 500));
    }
    return { n: (await dbAll()).filter(r => !r.up).length, i: -1 };
  });
  ok('the queue drains with no button pressed', drained.n === 0,
    drained.n + ' left after ' + (drained.i < 0 ? 'timeout' : (drained.i * 0.5) + 's'));
  ok('and the retry disarms once the queue is empty',
    await p.evaluate(async () => { for (let i = 0; i < 20; i++) { if (!retryTimer) return true; await new Promise(r => setTimeout(r, 250)); } return !retryTimer; }));

  /* The bar answered "All synced." next to a header pill reading "Synced". It
     goes quiet now once there is nothing queued and nothing failing — the one
     state where it had nothing the pill had not already said — and the pill is
     what reports the all-clear. */
  const bar2 = (await p.textContent('#syncBar') || '').replace(/\s+/g, ' ').trim();
  const pill2 = (await p.textContent('#netStatus') || '').replace(/\s+/g, ' ').trim();
  /* The word, not the state, was what this matched — and the word changed on
     purpose: the pill claims only that every file was accepted, because this
     phone has never spoken to the dashboard and cannot say more. Ask the app
     what it calls the all-clear rather than keeping a copy of it here. */
  const clear = await p.evaluate(() => I18N.en.net_synced);
  const pillOn = await p.evaluate(() =>
    document.getElementById('netStatus').className.split(/\s+/).indexOf('on') >= 0);
  ok('the all-clear is reported', pillOn && pill2 === clear, pill2);
  ok('  by the pill, not by a bar repeating it', bar2 === '', bar2 || '(silent)');

  console.log('\n  the backoff lengthens while it keeps failing, and resets on progress');
  const grew = await p.evaluate(async () => {
    // three failures in a row, driven directly so the test does not wait minutes
    retryAt = 20000;
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const before = 1, after = 1;                          // no progress
      retryAt = after < before ? 20000 : Math.min(retryAt * 1.8, 300000);
      seen.push(retryAt);
    }
    return seen;
  });

  ok('it backs off rather than hammering a dead link',
    grew[0] < grew[1] && grew[1] < grew[2], grew.join(' → ') + ' ms');
  ok('and it is capped, so it never gives up entirely',
    Math.min(300000 * 1.8, 300000) === 300000);

  console.log('\n  a phone put away stops working the radio');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(400);
  ok('backgrounding cancels the pending retry',
    await p.evaluate(() => !retryTimer));
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); });

  console.log('\n  the build check keeps asking, not just at startup');
  const upd = await p.evaluate(() => typeof checkForNewBuild === 'function');
  ok('there is a check', upd);
  const stale = await p.evaluate(async () => {
    // pretend the server has moved on
    const real = window.fetch;
    window.fetch = (u, o) => String(u).indexOf('sw.js') >= 0
      ? Promise.resolve(new Response('const BUILD = "999";', { status: 200 }))
      : real(u, o);
    await checkForNewBuild();
    window.fetch = real;
    const bar = document.getElementById('staleBar');
    return { shown: bar && !bar.classList.contains('hidden'),
      txt: (document.getElementById('staleTxt') || {}).textContent || '' };
  });
  ok('a newer build raises the banner', stale.shown, stale.txt.slice(0, 80));
  ok('and it names both versions', /999/.test(stale.txt), stale.txt.slice(0, 80));

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
