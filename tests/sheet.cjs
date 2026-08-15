/* Thirty-six points used to cost thirty-six scrolls down to the form and back up
   to the machine. The measurement comes to the inspector instead, and Next walks
   the round without ever going back for it.

   It used to arrive as a SHEET — a modal over the map, with a backdrop and the
   page locked behind it. That covered the map it existed to keep you beside, and
   it put "could not measure it?" above the number: the exception in the position
   of the job, on every one of thirty-six points. It is a DOCK now: the same
   fields, in the page, under the map, with the number first and everything
   secondary behind a row you open. This file was rewritten with it, and the
   checks below are the new guarantees, not softened old ones. */
const { chromium } = require(require('./pw.cjs'));
/* The map is one photograph with the catalog's eleven numbers on it, so a
   single measurement is reached through the number that covers it rather than
   by clicking a puck that no longer exists. Same target, same result. */
const pickPoint = async (p, key) => {
  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, key);
  await p.waitForTimeout(350);
};
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const txt = async (p, s) => ((await p.textContent(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const vis = (p, s) => p.evaluate(x => {
  const e = document.querySelector(x);
  return !!e && !e.classList.contains('hidden') && e.getClientRects().length > 0; }, s);

async function settled(p) {
  await p.waitForTimeout(1400);
  for (let i = 0; i < 4; i++) {
    try {
      await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?',
        null, { timeout: 8000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => !!document.getElementById('typeSel'));
      return;
    } catch (e) { await p.waitForTimeout(600); }
  }
  throw new Error('page never settled');
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);
  await p.evaluate(() => { const s = document.getElementById('typeSel');
    s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(350);
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(700);

  console.log('the map alone, before anything is picked');
  const docked = () => p.evaluate(() => document.getElementById('ucFields').classList.contains('dock'));
  ok('nothing is docked before a point is picked', !(await vis(p, '#ucFields')) && !(await docked()));
  ok('the page scrolls normally', await p.evaluate(() =>
    getComputedStyle(document.body).overflow !== 'hidden'));

  console.log('\ntapping a point brings the measurement to you');
  await pickPoint(p, `IDLER.L-OUT`);
  await p.waitForTimeout(500);
  ok('the dock comes up', await p.evaluate(() =>
       document.getElementById('ucFields').classList.contains('dock')) && await vis(p, '#ucFields'));
  /* The point of the change: it is IN the page, not over it. A modal is the
     vocabulary for "are you sure you want to delete this", not for typing 8.4. */
  ok('it is in the page, not floating over it', await p.evaluate(() => {
    const f = document.getElementById('ucFields');
    return getComputedStyle(f).position === 'static' && !f.classList.contains('sheet');
  }));
  /* #ucBackdrop was the dimming layer the modal raised. It is not hidden now,
     it does not exist — and a check written against a deleted element passes
     for the wrong reason, forever. */
  ok('there is no dimming layer left in the document at all',
     await p.evaluate(() => !document.getElementById('ucBackdrop')));
  ok('the machine this reading belongs to is still visible above it', await p.evaluate(() => {
    const g = document.querySelector('.ucmapwrap');
    const r = g.getBoundingClientRect();
    const s = document.getElementById('ucFields').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= s.top; }));
  // 70 vh, not 65: the measurement, its verdict and the challenge to a bad
  // reading are all pinned above the buttons now, and they need the room. The
  // check above is the real guarantee — the frame is still fully visible.
  ok('and the dock leaves room for it', await p.evaluate(() =>
    document.getElementById('ucFields').getBoundingClientRect().height <= window.innerHeight * 0.71));
  ok('it names the point', /Idler tread — Left · outer/.test(await txt(p, '#ucSheetTitle')),
    await txt(p, '#ucSheetTitle'));
  ok('and says where you are in the round',
    /point 1 of 36 · 0 taken/.test(await txt(p, '#ucSheetCount')), await txt(p, '#ucSheetCount'));
  /* The drawing is a row now, closed, and the choice is remembered — in a dock
     it is 340 px between the number and the way on, and an inspector on their
     hundredth roller does not want it back on every point. It has to be ONE tap
     away, and it has to actually arrive. */
  ok('the drawing is not in the way', await p.evaluate(() =>
    !document.querySelector('#ucFig svg') || document.getElementById('ucFig').style.display === 'none'));
  await p.click('#ucFigTog');
  await p.waitForTimeout(350);
  ok('and one tap brings it', await p.evaluate(() => !!document.querySelector('#ucFig svg')));
  await p.click('#ucFigTog');
  await p.waitForTimeout(300);
  ok('so did the figures', /new 21 mm → condemn 33.5 mm/.test(await txt(p, '#ucRefLine')));
  /* The number comes before the exceptions. That ordering is the other half of
     the change and it is wrong in any container, sheet or dock. */
  ok('the number sits above "could not measure it?"', await p.evaluate(() =>
    document.getElementById('ucMM').getBoundingClientRect().top
      < document.querySelector('.ucna-h').getBoundingClientRect().top));
  ok('the field is on screen without scrolling', await p.evaluate(() => {
    const r = document.getElementById('ucMM').getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight; }));
  ok('and the page still scrolls, like every other screen',
    await p.evaluate(() => document.body.style.overflow !== 'hidden'));
  console.log('  and everything the point needs came with it');
  /* The camera is not behind a row. It went behind one with the comment, and
     the row said "Photos and comment" — no camera in the words, third in a
     list of three grey disclosures — so on a measurement round the photograph
     was, in practice, not offered. The comment stayed behind the row; it is
     genuinely occasional. */
  const inSheet = (p, id) => p.evaluate(x => {
    const e = document.getElementById(x);
    return !!e && !!e.closest('#ucFields') && e.getClientRects().length > 0; }, id);
  ok('the photo button is in the dock, with nothing to open first', await inSheet(p, 'takeBtn'));
  ok('so is video', await inSheet(p, 'videoBtn'));
  ok('the thumbnail strip is not there yet, because there is nothing in it',
     !(await inSheet(p, 'mediastrip')));
  ok('and it arrives the moment there is', await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 40;
    c.getContext('2d').fillRect(0, 0, 40, 40);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.6));
    (draft.positions[curItem] = draft.positions[curItem] || {}).photos = [blob];
    renderMedia(); renderUCExtra(true);
    await new Promise(r => setTimeout(r, 150));
    const s = document.getElementById('mediastrip');
    return !!s.closest('#ucFields') && s.querySelectorAll('.mtile').length === 1
        && s.getClientRects().length > 0;
  }));
  await p.evaluate(() => { delete draft.positions[curItem].photos; renderMedia(); renderUCExtra(true); });
  await p.click('#ucExtraTog');
  await p.waitForTimeout(300);
  ok('the comment is one tap behind the row that names it', await inSheet(p, 'commentFld'));
  ok('they are the real controls, not copies', await p.evaluate(() =>
    document.querySelectorAll('#takeBtn').length === 1 &&
    document.querySelectorAll('#comment').length === 1));
  ok('a comment typed here lands on the position', await p.evaluate(async () => {
    const c = document.getElementById('comment');
    c.value = 'fine swarf on the tread'; c.dispatchEvent(new Event('input'));
    saveCur(); await new Promise(r => setTimeout(r, 150));
    return (draft.positions['IDLER.L-OUT'] || {}).comment === 'fine swarf on the tread'; }));

  console.log('\nwalking the round without going back to the map');
  ok('Back is dead on the first point', await p.evaluate(() =>
    document.getElementById('ucPrev').disabled));
  await p.fill('#ucMM', '23');
  await p.waitForTimeout(250);
  ok('the reading scores in place', /16%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  ok('and the count in the header moves', /1 taken/.test(await txt(p, '#ucSheetCount')),
    await txt(p, '#ucSheetCount'));
  await p.click('#ucNext');
  await p.waitForTimeout(400);
  ok('Next lands on the next point in the walk',
    await p.evaluate(() => curItem) === 'IDLER.L-IN', await p.evaluate(() => curItem));
  ok('the dock stayed up', await p.evaluate(() => document.getElementById('ucFields').classList.contains('dock')));
  ok('the field cleared for it', (await p.inputValue('#ucMM')) === '');
  ok('the header followed', /point 2 of 36/.test(await txt(p, '#ucSheetCount')));
  /* Folding it away empties the box now instead of leaving the last drawing
     behind display:none, so this check has to open the row before asking what
     is in it. It passed for months on the previous point's hidden drawing. */
  await p.evaluate(() => { if (!ucFigOpen) document.getElementById('ucFigTog').click(); });
  await p.waitForTimeout(300);
  ok('and the drawing is the one for this point', await p.evaluate(() =>
    !!document.querySelector('#ucFig svg')));
  await p.evaluate(() => { if (ucFigOpen) document.getElementById('ucFigTog').click(); });
  await p.waitForTimeout(200);
  ok('and folding it away leaves nothing behind', await p.evaluate(() =>
    !document.querySelector('#ucFig svg')));
  await p.click('#ucPrev');
  await p.waitForTimeout(400);
  ok('Back returns to the reading already taken',
    await p.evaluate(() => curItem) === 'IDLER.L-OUT' && (await p.inputValue('#ucMM')) === '23');

  console.log('  the keypad go-key does the same, so a round needs no buttons');
  await p.click('#ucNext'); await p.waitForTimeout(350);
  await p.fill('#ucMM', '24');
  await p.press('#ucMM', 'Enter');
  await p.waitForTimeout(450);
  ok('Enter stores the reading and moves on',
    await p.evaluate(() => draft.positions['IDLER.L-IN'].mm) === 24 &&
    await p.evaluate(() => curItem) === 'IDLER.R-OUT',
    await p.evaluate(() => curItem));

  console.log('\nwhat the same point read last time');
  await p.evaluate(async () => {
    // a round from a month ago, stored the way the app stores one
    const d = await idb();
    await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put({ id: 'prev-uc-1', equip: 'DZ001', type: 'UC', date: '2026-07-01',
        positions: { 'ROLLER.L2': { mm: 244 } }, up: 1 });
      t.oncomplete = res; t.onerror = rej; });
    ucPrevCache = { key: '', rows: null };
    pickComponent('ROLLER.L2');
  });
  await p.waitForTimeout(700);
  ok('the sheet shows what it read last round',
    /last round 244 mm · 2026-07-01/.test(await txt(p, '#ucLast')), await txt(p, '#ucLast'));
  await p.fill('#ucMM', '241'); await p.waitForTimeout(400);
  ok('a normal change is not flagged', await p.evaluate(() =>
    !document.getElementById('ucLast').classList.contains('jump')));
  await p.fill('#ucMM', '180'); await p.waitForTimeout(400);
  ok('a reading nowhere near last time is', await p.evaluate(() =>
    document.getElementById('ucLast').classList.contains('jump')));
  ok('but it is still recorded — a flag, never a block',
    await p.evaluate(() => draft.positions['ROLLER.L2'].mm) === 180);
  await p.evaluate(() => pickComponent('ROLLER.L3'));
  await p.waitForTimeout(500);
  ok('a point with no history says nothing', (await txt(p, '#ucLast')) === '',
    await txt(p, '#ucLast'));

  console.log('  the diagram folds away once you know the job');
  ok('a toggle for it is offered', await p.evaluate(() =>
    !!document.getElementById('ucFigTog') &&
    document.getElementById('ucFigTog').getClientRects().length > 0));
  /* Closed by default in the dock — it is 340 px between the number and the way
     on, and the number is why anyone is here. The guarantee that matters is not
     which way it starts but that the CHOICE STICKS: somebody on their first
     roller opens it once and it is still open at point thirty-six. */
  const figShown = () => p.evaluate(() =>
    getComputedStyle(document.getElementById('ucFig')).display !== 'none');
  ok('the drawing starts out of the way', !(await figShown()));
  await p.click('#ucFigTog'); await p.waitForTimeout(300);
  ok('tapping brings the drawing', await figShown());
  await p.evaluate(() => pickComponent('ROLLER.L4'));
  await p.waitForTimeout(400);
  ok('and it is still there on the next point', await figShown());
  await p.click('#ucFigTog'); await p.waitForTimeout(300);
  ok('tapping again folds it away', !(await figShown()));
  await p.evaluate(() => pickComponent('ROLLER.L5'));
  await p.waitForTimeout(400);
  ok('and that sticks too', !(await figShown()));

  console.log('\nthe verdict is never behind the buttons');
  /* The figure is 250 px of a 640 px sheet. With the nav sticky at the bottom of
     one long scroller, "405% worn — past the condemn limit" and the checkbox
     that questions it both landed underneath it, unseen. */
  const seen = async () => p.evaluate(() => {
    const r = i => { const e = document.getElementById(i); const b = e.getBoundingClientRect();
      return { h: b.height, top: b.top, bot: b.bottom,
        hidden: e.classList.contains('hidden') }; };
    const nav = r('ucSheetNav');
    const inside = x => !x.hidden && x.h > 0 && x.top >= 0 && x.bot <= window.innerHeight + 0.5;
    return { mm: inside(r('ucMM')), read: inside(r('ucRead')),
      warn: r('ucWarn').hidden ? 'n/a' : inside(r('ucWarn')),
      nav: inside(nav), navTop: Math.round(nav.top) };
  });
  await p.evaluate(() => { const f = document.getElementById('ucMM');
    f.value = '232'; f.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(300);
  let v = await seen();
  ok('a good reading shows its verdict on screen', v.mm && v.read && v.nav, JSON.stringify(v));
  await p.evaluate(() => { const f = document.getElementById('ucMM');
    f.value = '88'; f.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(300);
  v = await seen();
  ok('so does a questioned one', v.mm && v.read && v.warn === true && v.nav, JSON.stringify(v));
  ok('and the re-measure checkbox can be reached', await p.evaluate(() => {
    const b = document.getElementById('ucStood').getBoundingClientRect();
    return b.height > 0 && b.top >= 0 && b.bottom <= window.innerHeight; }));
  /* There is no "half that scrolls" any more — the dock has no inner scroller,
     the page scrolls. What has to hold is the ORDER: the number, the verdict and
     the way on come before the reference material, in the dock as they did in
     the sheet's foot, because that is what the sheet got wrong on paper and
     right on screen. */
  ok('the reference material still comes after the number', await p.evaluate(() => {
    const y = i => document.getElementById(i).getBoundingClientRect().top;
    return y('ucMM') < y('ucFigTog') && y('ucSheetNav') < y('ucFigTog');
  }));
  ok('and the photo and comment controls are in the dock', await p.evaluate(() =>
    !!document.getElementById('takeBtn').closest('#ucFields') &&
    !!document.getElementById('comment').closest('#ucFields')));
  await p.evaluate(() => { const f = document.getElementById('ucMM');
    f.value = '23'; f.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(250);

  console.log('\nreaching the end');
  const last = await p.evaluate(() => { const o = WEAR.walk(ASSET_BY['DZ001'].m).map(w => w.k);
    pickComponent(o[o.length - 1]); return o[o.length - 1]; });
  await p.waitForTimeout(400);
  // It said Done and was disabled — a label promising an action the button
  // refused. Done now ends the round; ucClose below still has to work too.
  ok('Next turns into Done on the last point',
    /Done/.test(await txt(p, '#ucNext')) &&
    await p.evaluate(() => !document.getElementById('ucNext').disabled &&
      document.getElementById('ucNext').dataset.done === '1'), last);

  console.log('\nclosing it');
  await p.click('#ucClose');
  await p.waitForTimeout(400);
  ok('the dock goes away', !(await docked()) && await p.evaluate(() => curItem) === '');
  // one picture, not two: Left and Right are a choice above it now
  ok('the map is back with nothing selected', await p.evaluate(() => curItem) === '' &&
    (await p.$$('#posnav .ucmap')).length === 1);
  ok('the page scrolls again', await p.evaluate(() =>
    getComputedStyle(document.body).overflow !== 'hidden'));
  ok('the readings survived', await p.evaluate(() => draft.positions['IDLER.L-OUT'].mm) === 23);
  ok('and the controls went back where they came from', await p.evaluate(() =>
    !document.getElementById('takeBtn').closest('#ucFields') &&
    !!document.getElementById('takeBtn').closest('#captureBox')));
  /* Number 1 covers the idler's two bands, so the number goes green when what
     it covers has been taken — which is the reading the picture has to give. */
  ok('and show on the machine', await p.evaluate(() =>
    document.querySelector('.ucmap [data-ucg="1"]').classList.contains('done')));

  console.log('  the machine stays live beside the dock');
  await pickPoint(p, `ROLLER.L4`);
  await p.waitForTimeout(900);
  ok('tapping another point jumps straight to it, no dismiss first',
    await p.evaluate(() => curItem) === 'ROLLER.L4'
    && await p.evaluate(() => document.getElementById('ucFields').classList.contains('dock')),
    await p.evaluate(() => curItem));
  /* Tap-away and Escape used to dismiss it, and both are deliberately gone: in
     a dock there is nothing to dismiss FROM, and the tap-away listener ran in
     the capture phase and rewrote #posnav out from under the very element being
     tapped. The ✕ is the way out, and it is the only one. These two checks used
     to read the deleted backdrop and pass whatever happened. */
  await p.evaluate(() => document.querySelector('.ucmapwrap').click());
  await p.waitForTimeout(400);
  ok('tapping the frame does NOT dismiss it — the map is context, not a scrim',
     await docked() && await p.evaluate(() => curItem) === 'ROLLER.L4');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  ok('nor does Escape', await docked() && await p.evaluate(() => curItem) === 'ROLLER.L4');
  await p.click('#ucClose');
  await p.waitForTimeout(400);
  ok('the ✕ does, and it is the only thing that does', !(await docked()));

  console.log('\nthe list is unchanged — the cards are already the navigation there');
  await p.click('.ucviews button[data-v="list"]');
  await p.waitForTimeout(450);
  await p.click('[data-l7="GROUSER"]'); await p.waitForTimeout(300);
  await p.click('[data-l8="GROUSER.L"]'); await p.waitForTimeout(400);
  ok('no dock over the list', !(await docked()));
  ok('the form sits in the page as before', await p.evaluate(() =>
    getComputedStyle(document.getElementById('ucFields')).position !== 'fixed'));
  ok('and it still works', await p.evaluate(async () => {
    const e = document.getElementById('ucMM'); e.value = '60';
    e.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 200));
    return /40%/.test(document.getElementById('ucRead').textContent); }));

  await ctx.close(); await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
