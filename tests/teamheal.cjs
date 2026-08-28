/* The phone that was ALREADY syncing before whole rounds were kept.

   The first suite could not see this case, because it seeded records through
   teamMerge() — the fresh-arrival path. A real phone has been pulling for
   weeks: its summary rows are in localStorage and its cursor says "I hold
   everything up to here", so the next check returns nothing and every round
   already on the list has a row and no record.

   Tapping one silently dropped the inspector into a blank capture screen. No
   measurements, no report, and nothing saying why:
   "I selected dz007 from the system. I cant generate the report. And dont see
   the measurements."

   Then, having been fixed by fetching the round, it failed the other way —
   every row said the round could not be fetched — because "fetch the round"
   meant "re-read the entire folder" over a satellite link. Hence the checks
   below on WHICH requests a tap makes, and on a failure to reach Drive being
   reported as a failure to reach Drive.

   The gap never closes on its own either: only the newest TEAM_KEEP rounds are
   stored while every row stays on the list, so a round from last winter is a
   row with no record on a phone that healed months ago.
*/
const { chromium } = require(require('./pw.cjs'));
const PORT = process.env.EDPORT || 8092;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForFunction(() => typeof window.WEAR === 'object', null, { timeout: 20000 });
  await p.waitForTimeout(400);
};
const openSystem = async p => {
  await p.evaluate(() => { showPane('paneSystem'); renderTeam(); });
  await p.waitForTimeout(350);
};

/* Rows and a cursor, no records — exactly what an upgrade leaves behind.

   NOTE: this runs in the page. addInitScript serialises the function itself,
   so everything it needs must arrive as its argument; a variable captured from
   this file is simply not there on the other side. */
const UPGRADED = o => {
  localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', name: 'Drive', url: o.url, sec: '' }]));
  const rows = [
    { u: 'TK146', d: '2026-03-09', t: 'MP', by: 'B. Ivanov', g: 'C' },
    { u: 'TK147', d: '2026-03-10', t: 'MP', by: 'B. Ivanov', g: 'A' },
  ];
  localStorage.setItem('cm_team', JSON.stringify(rows));
  /* And the last-done index that goes with them. Every round in the cache is
     represented in the index — that is the invariant the app now checks, and a
     phone missing it is a phone with a damaged index, which is a different
     story from the one this file tells. Without this the boot repair fires,
     forces a full re-read, and the round this fixture exists to NOT hold
     arrives after all. */
  const h = {}; rows.forEach(r => { h[r.t + '|' + r.u] = { d: r.d }; });
  localStorage.setItem('cm_hist', JSON.stringify(h));
  /* And the one-time due-list repair, marked done. This file is about the
     ROUND-BODY heal; the history heal is a separate mechanism that also forces
     a full re-read, and leaving it armed would mask the thing under test by
     fetching the round this fixture exists to NOT hold. */
  localStorage.setItem('cm_hist_full_v1', '1');
  /* Far in the future: "I already have everything", so a normal pull is empty. */
  localStorage.setItem('cm_team_cursor', String(Date.now() + 864e5));
  /* healed: this phone has already done its one-time re-read. The row is
     missing its record for the reason that never goes away — it fell off the
     end of the rounds the phone keeps. */
  if (o.healed) localStorage.setItem('cm_team_full_v1', '1');
};
const LIVE = 'http://127.0.0.1:' + PORT + '/exec';
const DEAD = 'http://127.0.0.1:1/exec';          // configured, and nothing answers

(async () => {
  await fetch('http://127.0.0.1:' + PORT + '/__seed');
  const b = await chromium.launch();

  console.log('a row whose round this phone does not hold');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(UPGRADED, { url: LIVE, healed: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    const asked = [];
    p.on('request', r => { const u = r.url();
      if (u.indexOf('/exec') > 0) asked.push((u.match(/action=(\w+)/) || [, '?'])[1]); });
    await p.goto('http://127.0.0.1:' + PORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);

    const before = await p.evaluate(async () => ({ rows: teamAll().length, kept: (await dbTeam()).length }));
    note('on boot', JSON.stringify(before));
    ok('it lists rounds it does not hold', before.rows > 0 && before.kept === 0,
       before.rows + ' rows, ' + before.kept + ' kept');

    await openSystem(p);
    const rows = await p.$$('#teamList [data-k]');
    ok('  and shows them', rows.length > 0, rows.length + '');

    /* THE bug: this used to jump to a blank capture screen. */
    if (rows.length) {
      const unit = (await rows[0].getAttribute('data-k') || '').split('|')[0];
      asked.length = 0;
      await rows[0].click();
      await p.waitForFunction(
        () => !document.getElementById('roundOv').classList.contains('hidden'),
        null, { timeout: 20000 }).catch(() => {});
      const r = await p.evaluate(() => ({
        open: !document.getElementById('roundOv').classList.contains('hidden'),
        tab: (document.querySelector('#tabbar button.on') || {}).dataset?.pane || '',
        title: (document.getElementById('roundTitle') || {}).textContent || '',
        sub: (document.getElementById('roundSub') || {}).textContent || '',
        rows: document.querySelectorAll('#roundBody .rdrow').length,
        rptWired: typeof (document.getElementById('roundRpt') || {}).onclick === 'function' }));
      note('after tapping', JSON.stringify(r));
      note('requests', JSON.stringify(asked));
      ok('tapping it fetches the round and opens it', r.open);
      /* The specific wrong behaviour, named so it cannot come back. */
      ok('  it never silently starts a new round instead', r.tab !== 'paneCapture', r.tab);
      ok('  with the machine that was pressed on it',
         unit && r.title.indexOf(unit) === 0, unit + ' -> ' + r.title);
      /* "I dont see the measurements" — the whole point of opening it. */
      ok('  and its findings, not an empty sheet', r.rows > 0, r.rows + ' rows');
      /* "I cant generate the report" — the other half. */
      ok('  with the report button live on it', r.rptWired);
      /* And it asks for ONE round, not for the whole folder. A season of work
         is megabytes over a satellite link, the script stops at 600 sidecars a
         call, and what does not arrive in time reads as "that round is not
         there" — which is how every row came to fail at once. */
      ok('it does not re-read the entire folder to open one round',
         asked.indexOf('records') < 0, asked.join(',') || 'none');
    }
    await ctx.close();
  }

  console.log('\nand a phone upgraded into this build heals itself, unasked');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(UPGRADED, { url: LIVE, healed: false });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);
    /* No tap at all — just the boot pull and the one-time heal behind it. */
    await p.waitForFunction(async () => (await dbTeam()).length > 0, null, { timeout: 20000 })
      .catch(() => {});
    const healed = await p.evaluate(async () => {
      const kept = await dbTeam();
      return { kept: kept.length,
               items: kept.filter(r => (r.items || []).length).length,
               flag: !!localStorage.getItem('cm_team_full_v1') };
    });
    note('after boot', JSON.stringify(healed));
    ok('the rounds are downloaded on the next launch with a signal', healed.kept > 0, healed.kept + '');
    ok('  whole, with what was found', healed.items > 0, healed.items + '');
    ok('  and it is flagged so it does not re-read every launch', healed.flag);
    await ctx.close();
  }

  console.log('\na phone that cannot reach Drive says so, and is not marked healed');
  {
    /* The flag must follow a pull that actually happened. Setting it after one
       that returned early — or whose fetch failed — records the phone as healed
       while it still holds nothing, and it never tries again. A dead port is
       the pit: the destination is configured, the phone believes it is online,
       and nothing answers. */
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(UPGRADED, { url: DEAD, healed: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);
    await p.waitForTimeout(1200);

    await openSystem(p);
    const rows = await p.$$('#teamList [data-k]');
    ok('the row is still listed and pressable', rows.length > 0, rows.length + '');
    if (rows.length) {
      await rows[0].click();
      await p.waitForFunction(() => {
        const t2 = (document.getElementById('dlgTitle') || {}).textContent || '';
        return (document.getElementById('dlg') || {}).open && t2 && !/…$/.test(t2);
      }, null, { timeout: 30000 }).catch(() => {});
      const r = await p.evaluate(() => ({
        dlg: !!(document.getElementById('dlg') || {}).open,
        title: (document.getElementById('dlgTitle') || {}).textContent || '',
        msg: (document.getElementById('dlgMsg') || {}).textContent || '',
        overlay: !document.getElementById('roundOv').classList.contains('hidden'),
        tab: (document.querySelector('#tabbar button.on') || {}).dataset?.pane || '' }));
      note('tap with nothing answering', JSON.stringify(r));
      ok('the tap explains itself rather than failing silently', r.dlg, String(r.dlg));
      /* dlg() takes [title, body]. Handed a bare string it prints its first two
         letters as the heading — which is how the first cut shipped, and looks
         exactly like a rendering fault. */
      ok('  with a real heading, not two letters of one', r.title.length > 4, r.title);
      ok('  and a body that says what to do', r.msg.length > 20, r.msg.slice(0, 60));
      /* The distinction that matters in the pit. "Withdrawn, or older than the
         folder keeps" sends an inspector looking for a missing file; the truth
         is the link. */
      ok('  and it names the link, not a missing round',
         /reach|signal|связ|сигнал/i.test(r.title + ' ' + r.msg), r.title);
      ok('  it does not pretend to have opened the round', !r.overlay);
      ok('  and still does not start a round on that machine', r.tab !== 'paneCapture', r.tab);
    }
    await ctx.close();
  }

  console.log('\nand the round being opened survives the trim it triggers');
  {
    /* The phone keeps the newest few hundred rounds. A round somebody taps is
       by definition one it did not have — usually an old one — so it would be
       written and deleted inside the same call, and the screen would say the
       folder no longer holds it. */
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(UPGRADED, { url: LIVE, healed: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.goto('http://127.0.0.1:' + PORT + '/mobile/index.html', { waitUntil: 'load' });
    await settled(p);

    const r = await p.evaluate(async () => {
      const OLD = { equip: 'ZZ001', date: '2019-01-01', type: 'MP', by: 'B. Ivanov',
                    items: [{ key: '1A', label: 'Transmission', grade: 'B' }] };
      const flood = [];
      for (let i = 0; i < TEAM_KEEP + 50; i++)
        flood.push({ equip: 'FL' + i, date: '2026-07-01', type: 'MP', by: 'B. Ivanov',
                     items: [{ key: '1A', grade: 'A' }] });
      const id = TEAM_ID + 'ZZ001|2019-01-01|MP';

      teamPin = id;                                   // what openTeamRow does
      await teamStash([OLD].concat(flood));
      const pinned = !!(await dbGet(id));

      teamPin = '';                                   // and once nobody is waiting on it
      await teamStash(flood);
      return { pinned, after: !!(await dbGet(id)), kept: (await dbTeam()).length, keep: TEAM_KEEP };
    });
    note('trim', JSON.stringify(r));
    ok('the round somebody is waiting on is not trimmed away', r.pinned);
    /* And the pin is a pin, not a leak: nothing is exempt once it is cleared. */
    ok('  but it is not kept for ever either', !r.after);
    ok('  and the cache stays bounded', r.kept <= r.keep, r.kept + '/' + r.keep);
    await ctx.close();
  }

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
