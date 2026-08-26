/* Controls that can only say "nothing to do" should not be on screen.

   A phone that had synced showed, one under the other: a bar reading "All
   synced." beside a header pill reading "Synced"; a button for work the app
   does on its own; a gear that opened the same sheet as the gear two
   centimetres above it; and three buttons — Share, Export ZIP, PDF — whose
   only possible answer to a tap was "nothing to export". Six controls, none of
   which could do anything, above a card that already said "Nothing captured
   yet".

   None of that was broken. Every one of them worked exactly as written, which
   is why it survived: there is no error to catch and no test that fails. The
   defect is that a reader has to try each control to learn it is inert, and
   next time they will not bother trying the one that isn't.

   So the rule this suite holds: a control appears when it can act.

   The other half is the reverse — nothing may be hidden that a reader needs.
   The sync bar carries the wire's own error text and the promise of a retry,
   which the pill cannot; it has to come back the moment anything is wrong.

   Run: node tests/quiet.cjs   (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s);
  if (!e) return false; const cs = getComputedStyle(e);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length > 0; }, sel);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: 'http://127.0.0.1:9/dead', sec: '', folder: '' }])));
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1400);

  console.log('an empty, settled phone');
  await p.evaluate(() => showPane('paneQueue'));
  await p.waitForTimeout(500);
  /* Nothing queued and nothing failing: the header pill has already said
     "Synced" in one word. */
  ok('the sync bar says nothing when it has nothing to say',
     !(await vis(p, '#syncBar')),
     (await p.textContent('#syncBar')).trim() || '(empty)');
  ok('and takes no room doing it',
     await p.evaluate(() => document.getElementById('syncBar').getBoundingClientRect().height === 0));
  ok('the hand-off row waits for something to hand off', !(await vis(p, '#shareBtn')));
  ok('so does Export ZIP', !(await vis(p, '#exportBtn')));
  ok('and the PDF', !(await vis(p, '#reportBtn')));
  /* The card the buttons belonged to still speaks. */
  ok('the screen still says why it is empty',
     /Nothing captured/i.test(await p.textContent('#pending')),
     (await p.textContent('#pending')).trim().slice(0, 40));

  console.log('\nthe gear that opened the same sheet as the other gear');
  ok('there is one settings control, in the header', !(await p.$('#syncSet')));
  ok('and it is on every screen, not only this one',
     await vis(p, '#setBtn'));
  ok('it opens the settings sheet', await (async () => {
    await p.click('#setBtn'); await p.waitForTimeout(300);
    const open = !(await p.evaluate(() => document.getElementById('setOv').classList.contains('hidden')));
    await p.evaluate(() => document.getElementById('setOv').classList.add('hidden'));
    return open;
  })());

  console.log('\nand the moment there is something to say, it says it');
  /* A round with nowhere to go: the queue fills, and the bar has to come back
     carrying what the pill cannot — the count, and the promise of a retry. */
  await ctx.setOffline(true);
  await p.evaluate(async () => {
    await dbPut({ id: 'q-1', equip: 'TK999', date: todayISO(), type: 'MP', cls: 'HT',
      by: 'R. Marrero', smu: '1000', rev: 1, up: 0, created: Date.now(),
      positions: {}, photos: {}, sign: null });
    /* Both of these are async — they await dbAll() before they paint. Called
       without await, the sleep below is the only thing making this work, which
       is how rt5.cjs's escaping check came to fail about one sweep in ten. */
    await renderPending(); await renderSync(); renderNet();
  });
  await p.waitForTimeout(300);
  ok('the sync bar comes back', await vis(p, '#syncBar'));
  const bar = (await p.textContent('#syncBar')).replace(/\s+/g, ' ').trim();
  ok('counting what is waiting', /1/.test(bar), bar);
  /* The sentence that stops an inspector concluding the app gave up. */
  ok('and saying it will keep trying on its own', /retry|itself|offline/i.test(bar), bar);
  ok('Sync now is there for somebody who will not wait', await vis(p, '#syncGo'));
  ok('and the hand-off row is back, now that there is work to hand off',
     await vis(p, '#shareBtn') && await vis(p, '#exportBtn') && await vis(p, '#reportBtn'));
  /* One document per name. This one is every round on the phone; the round
     card's button is one round. */
  ok('the PDF button says which report it is',
     /this phone/i.test(await p.textContent('#reportBtn')),
     (await p.textContent('#reportBtn')).trim());
  await ctx.setOffline(false);

  console.log('\nsix green ticks is not news');
  await p.evaluate(() => showPane('paneSystem'));
  await p.waitForTimeout(1200);
  /* Take back the round queued above, or "Nothing left over" is correctly
     amber and the branch under test never runs. Nothing is faked here: the six
     checks are answered by the real app on a real settled phone. */
  await p.evaluate(async () => { await dbDel('q-1'); renderPending(); });
  await p.evaluate(() => yardCheck()); await p.waitForTimeout(1200);
  const amber = await p.evaluate(() => document.getElementById('yardBadge').textContent.trim());
  ok('with nothing amber, the card folds to one line',
     await p.evaluate(() => document.getElementById('yardCard').classList.contains('folded')),
     amber);
  ok('and says what it folded away', /passed/i.test(await p.textContent('#yardSum')),
     (await p.textContent('#yardSum')).trim());
  ok('the rows are put away', !(await vis(p, '#yardList')));
  ok('and so is the Check-again button nobody needs to press',
     !(await vis(p, '#yardGo')));
  ok('opening it shows them', await (async () => {
    await p.click('#yardSum'); await p.waitForTimeout(300);
    return await vis(p, '#yardList');
  })());
  ok('and it stays open once somebody asked for it', await (async () => {
    await p.evaluate(() => yardCheck()); await p.waitForTimeout(900);
    return await vis(p, '#yardList');
  })());
  /* The other half: the card exists to surface the row that is NOT green, so
     one amber row has to open it whatever the reader last chose. */
  ok('one amber row opens it again', await (async () => {
    /* A real amber: a round that has not gone. */
    await p.evaluate(async () => {
      await dbPut({ id: 'q-2', equip: 'TK998', date: todayISO(), type: 'MP', cls: 'HT',
        by: 'R. Marrero', smu: '1', rev: 1, up: 0, created: Date.now(),
        positions: {}, photos: {}, sign: null });
    });
    await p.evaluate(() => yardCheck()); await p.waitForTimeout(1200);
    return await vis(p, '#yardList')
      && !(await p.evaluate(() => document.getElementById('yardCard').classList.contains('folded')));
  })(), (await p.textContent('#yardBadge')).trim());

  console.log('\ntwo refresh icons nobody could tell apart');
  ok('the everyday one is the button',
     await vis(p, '#teamRefresh') && /check for new/i.test(await p.textContent('#teamRefresh')),
     (await p.textContent('#teamRefresh')).trim());
  /* Re-reading the whole folder is a recovery action for the rare case where
     two devices hold different subsets. Offered, but not as a second button of
     equal weight carrying an arrow that curls the other way. */
  ok('the recovery one is a line of text, not a matching button',
     await p.evaluate(() => {
       const el = document.getElementById('teamReload');
       return !!el && el.className.indexOf('btn') < 0;
     }), await p.evaluate(() => (document.getElementById('teamReload') || {}).className));
  ok('and it says what it does rather than showing an arrow',
     !/^[↻⟳]/.test((await p.textContent('#teamReload')).trim()),
     (await p.textContent('#teamReload')).trim());
  ok('it is still big enough for a gloved thumb',
     await p.evaluate(() => document.getElementById('teamReload').getBoundingClientRect().height >= 44),
     String(await p.evaluate(() => Math.round(document.getElementById('teamReload').getBoundingClientRect().height))));

  console.log('\neach screen answers one question');
  /* "Is this phone fit to work" is System's question. It sat on the queue,
     which left System holding one card above a screen of blank while the queue
     scrolled. */
  ok('readiness is on System', await vis(p, '#yardCard'));
  ok('and the queue is only about the queue', await (async () => {
    await p.evaluate(() => showPane('paneQueue')); await p.waitForTimeout(300);
    return !(await vis(p, '#yardCard'));
  })());
  ok('nothing on System points at a list that is no longer under it',
     !/list below|below knows/i.test(await p.evaluate(() => {
       showPane('paneSystem'); return document.getElementById('paneSystem').textContent; })),
     'no stale directions');

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ')
                           : '\nall quiet-screen checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
