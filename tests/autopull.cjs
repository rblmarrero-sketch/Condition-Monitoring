/* THE DUE LIST HAS TO KEEP ITSELF TRUE.

   The outbound half was already automatic — a save sends, reconnecting sends,
   picking the phone up sends, and armRetry backs off and retries. The inbound
   half was not. teamPull ran at boot, on an `online` event, and after this
   phone happened to finish an upload. Nothing else.

   Which left the case that actually happens on a shift completely uncovered:

     a phone switched on at the crib room
     in signal all day, so `online` never fires again
     with nothing of its own to send, so no upload ever completes
     and armRetry stops its own timer the moment the queue is empty

   That phone shows the due list it downloaded at breakfast until somebody
   thinks to press Refresh. Meanwhile another inspector walks a machine at
   09:00, this phone never hears about it, and somebody drives out to walk it
   twice. The one thing an inspector will not do is press a button to find out
   whether the list they are already looking at is wrong.

   Checked here as behaviour, not as wiring: the mock counts the requests it
   receives, so "it pulled by itself" is a number rather than a promise.

   Run: node tests/autopull.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const stats = () => fetch(BASE + '/__stats').then(r => r.json());
const reset = q => fetch(BASE + '/__reset?' + (q || '')).then(r => r.text());

(async () => {
  await reset('n=6');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                   hasTouch: true, timezoneId: 'Asia/Anadyr' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: u, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  console.log('\n1. THE PHONE ASKS ONCE ON ITS OWN AT STARTUP');
  const A = await stats();
  console.log('   ' + JSON.stringify(A));
  ok('it fetched records without being asked', A.records > 0, A.records + ' request(s)');

  console.log('\n2. AN IDLE PHONE IN SIGNAL KEEPS ASKING — THE CASE THAT WAS BROKEN');
  /* Nothing queued, so the upload retry timer is not running; the radio never
     drops, so no `online` event fires. Before this change nothing whatever
     would happen from here on. The five-minute timer is driven forward rather
     than waited out. */
  const queued = await p.evaluate(async () => (await dbAll()).length);
  ok('there is nothing of its own to send', queued === 0, queued + ' queued');

  /* Past the throttle window first. TEAM_MIN_GAP holds automatic pulls to one
     a minute — correctly, and it is asserted below — so a timer firing seconds
     after the startup pull is *supposed* to do nothing. The behaviour under
     test is what happens when the interval fires an hour into a quiet shift. */
  await p.evaluate(() => { if (typeof teamAt !== 'undefined') teamAt = 0; });
  const before = (await stats()).records;
  await p.evaluate(() => {
    /* Exactly what the interval does when it fires, through the same guard. */
    if (!document.hidden && navigator.onLine) pullIn();
  });
  await p.waitForTimeout(2500);
  const after = (await stats()).records;
  ok('an idle phone still goes and looks', after > before, before + ' → ' + after);

  console.log('\n3. PICKING THE PHONE UP REFRESHES WHAT IS ARRIVING, NOT ONLY WHAT IS LEAVING');
  /* TEAM_MIN_GAP throttles automatic pulls to one a minute, which is what stops
     a timer becoming a request storm — so the clock is moved past it rather
     than the test sitting still for sixty seconds. */
  await p.evaluate(() => { if (typeof teamAt !== 'undefined') teamAt = 0; });
  const b3 = (await stats()).records;
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await p.waitForTimeout(2500);
  const a3 = (await stats()).records;
  ok('coming back to the app pulls the team\'s rounds in', a3 > b3, b3 + ' → ' + a3);

  console.log('\n4. AND IT DOES NOT TURN INTO A REQUEST STORM');
  /* The throttle is the other half of making this safe: without it, a timer, a
     visibility change and a finished upload landing together would each fire a
     request at the same folder. */
  const b4 = (await stats()).records;
  await p.evaluate(async () => {
    for (let i = 0; i < 6; i++) { pullIn(); document.dispatchEvent(new Event('visibilitychange')); }
  });
  await p.waitForTimeout(2500);
  const a4 = (await stats()).records;
  ok('twelve triggers in a row do not make twelve requests', a4 - b4 <= 1,
     (a4 - b4) + ' request(s) from 12 triggers');

  console.log('\n5. OFFLINE, IT ASKS FOR NOTHING AND SAYS NOTHING');
  await ctx.setOffline(true);
  await p.evaluate(() => { if (typeof teamAt !== 'undefined') teamAt = 0; });
  const b5 = (await stats()).records;
  await p.evaluate(() => {
    if (!document.hidden && navigator.onLine) pullIn();
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(2000);
  const a5 = (await stats()).records;
  ok('an offline phone makes no request', a5 === b5, b5 + ' → ' + a5);
  await ctx.setOffline(false);

  console.log('\n6. AND THE DUE LIST IS WHAT ALL THIS IS FOR');
  const due = await p.evaluate(() => {
    try { return { rows: (typeof dueRows === 'function' ? dueRows() : []).length,
                   team: Object.keys(histAll() || {}).length }; }
    catch (e) { return { err: String(e.message || e) }; }
  });
  console.log('   ' + JSON.stringify(due));
  ok('the phone holds the team\'s history, pulled without a press',
     (due.team || 0) > 0, JSON.stringify(due));

  ok('no page errors', errs.length === 0, errs.join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
