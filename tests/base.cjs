/* "This part is new."

   The reference this app scores against came out of a workbook, and on this
   fleet the workbook is wrong in four countable ways: the sprocket is missing
   from fifteen of sixteen models, the SD90 carries the SD32's entire row, the
   ZX330 has two link pitches under one model name because two undercarriage
   builds ship under one label, and the PC2000 is not in it at all. Two hundred
   and forty of the 1,620 positions on the fleet record a millimetre and decline
   to score it. Two machines score nothing whatsoever.

   No document is going to arrive and fix that. The person standing at a freshly
   fitted roller with a caliper can, and this is where they do it.

   WEAR.refFor() has known how to prefer a dated baseline over the catalogue
   since the wear engine was written. Nothing ever called setBaselines(), so the
   branch was dead. This file is the guarantee that it is alive, that it is
   dated so history does not silently re-score itself, and — the one that
   matters most — that it never produces a confident number out of half a
   reference.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const txt = async (p, s) => ((await p.textContent(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const vis = (p, s) => p.evaluate(x => { const e = document.querySelector(x);
  return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, s);

const point = (p, k) => p.evaluate(x => { saveCur(); curItem = x; loadPos(); renderChips(); }, k);
const openBase = async (p) => { await p.evaluate(() => {
  const b = document.getElementById('ucBaseTog');
  if (b && document.getElementById('ucBase').classList.contains('hidden')) b.click(); });
  await p.waitForTimeout(300); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]');
    localStorage.setItem('inspector', 'R. Marrero'); });
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);

  console.log('the machine the catalogue cannot describe');
  /* DZ017, Shantui SD90. wear.js says it outright: the bushings measure 114-116
     against a "new" of 79, which is impossible, and the note reads "Set a
     baseline instead." */
  await p.evaluate(() => selectEquip('DZ017')); await p.waitForTimeout(900);
  await point(p, 'BUSH.L'); await p.waitForTimeout(400);
  await p.fill('#ucMM', '116'); await p.waitForTimeout(500);
  ok('116 mm on a "new" of 79 mm scores nothing at all',
    !/%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  ok('and the reference line says why', /another model/.test(await txt(p, '#ucRefLine')));

  await openBase(p);
  ok('the panel says what it is about to change', /From today/.test(await txt(p, '#ucBase')));
  ok('it names the point and the figure',
    /116 mm/.test(await txt(p, '#ucBase')) && /Bushing/.test(await txt(p, '#ucBase')));
  ok('and promises not to re-score what is already taken',
    /keep the reference they were judged against/i.test(await txt(p, '#ucBase')));

  console.log('\n  it will not accept a baseline that changes nothing');
  /* The SD90's condemn is borrowed too, so there is nothing safe to inherit.
     A baseline with only a "new" figure moves no number on any screen — wear()
     needs both ends of the span and so does the forecast. */
  ok('a condemn figure is asked for', await p.evaluate(() => !!document.getElementById('ucBaseC')));
  ok('and until it is given, the buttons are dead', await p.evaluate(() =>
    [...document.querySelectorAll('#ucBase [data-b="one"],#ucBase [data-b="all"]')].every(x => x.disabled)));
  await p.evaluate(() => { const c = document.getElementById('ucBaseC');
    c.value = '104'; c.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(200);
  ok('with one, they wake up', await p.evaluate(() =>
    [...document.querySelectorAll('#ucBase [data-b="one"]')].every(x => !x.disabled)));

  console.log('\n  and then the machine scores');
  await p.evaluate(() => document.querySelector('#ucBase [data-b="one"]').click());
  await p.waitForTimeout(600);
  ok('116 against a measured 116 → 104 is 0% worn', /0%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  ok('with the distance to the limit', /12.0 mm to condemn/.test(await txt(p, '#ucRead')));
  /* The figures live on the gauge's ends now, not on the line above it — once
     a reading is scored the line stops repeating them, because printing new
     and condemn twice spent two lines of a small screen. What matters here is
     unchanged and is what this asks: the inspector can see that the machine is
     being judged against 116 and 104, and not against the catalogue. */
  ok('the new figures are on screen', /new 116/.test(await txt(p, '#ucRead'))
    && /condemn 104/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  ok('drawn on the gauge that scored the reading',
    await p.evaluate(() => document.querySelectorAll('#ucRead .wg-e span').length === 2));
  ok('and the line above says where they came from',
    /vs the baseline set/.test(await txt(p, '#ucRefLine')), await txt(p, '#ucRefLine'));
  ok('the row reports it is set', /Recorded as new/.test(await txt(p, '#ucBaseTog')));

  console.log('\n  it can be taken back');
  await p.evaluate(() => document.querySelector('#ucBase [data-b="off"]').click());
  await p.waitForTimeout(500);
  ok('undo puts the catalogue back', /another model/.test(await txt(p, '#ucRefLine')),
    await txt(p, '#ucRefLine'));
  ok('and the score goes with it', !/%/.test(await txt(p, '#ucRead')));

  console.log('\n  one tap for a whole track group');
  /* Sixteen rollers get replaced together. Sixteen taps is how a good idea gets
     abandoned on the second machine. */
  await point(p, 'BUSH.L'); await p.waitForTimeout(300);
  await p.fill('#ucMM', '116'); await p.waitForTimeout(400);
  await openBase(p);
  await p.evaluate(() => { const c = document.getElementById('ucBaseC');
    c.value = '104'; c.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(150);
  const twoSided = await p.evaluate(() => !!document.querySelector('#ucBase [data-b="all"]'));
  ok('the "all of this point" button knows how many there are', twoSided,
    await txt(p, '#ucBase'));
  await p.evaluate(() => document.querySelector('#ucBase [data-b="all"]').click());
  await p.waitForTimeout(600);
  await point(p, 'BUSH.R'); await p.waitForTimeout(400);
  await p.fill('#ucMM', '112'); await p.waitForTimeout(500);
  ok('the other side of the same point is judged against it too',
    /new 116/.test(await txt(p, '#ucRead')) || /new 116 mm/.test(await txt(p, '#ucRefLine')),
    await txt(p, '#ucRead') + '  ||  ' + await txt(p, '#ucRefLine'));
  ok('and scores', /33%|34%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));

  console.log('\n  history is not re-scored behind anyone\'s back');
  const dated = await p.evaluate(() => {
    /* refFor takes the date of the reading being judged. A round taken before
       the baseline existed must keep the reference it was taken against. */
    const before = WEAR.refFor('DZ017', 'SHANTUI SD90-C5', 'BUSH', 'L', '2020-01-01');
    const after  = WEAR.refFor('DZ017', 'SHANTUI SD90-C5', 'BUSH', 'L', '2030-01-01');
    return { before: before && before.src, after: after && after.src };
  });
  ok('a round from before the baseline still reads against the catalogue',
    dated.before === 'catalogue', dated.before);
  ok('a round from after reads against the baseline', dated.after === 'baseline', dated.after);

  console.log('\n  it survives being saved');
  await p.evaluate(async () => {
    { const bytes=new Uint8Array([0xff,0xd8,0xff,0xdb,1,2,3,4,5,6,7,8,9,0xff,0xd9]); const g=(draft.positions[GEN_KEY] ||= {}); for(const s of machineSlots(type)) if(s.req && !genPhotos(draft,s.cat).length) addPos(g, attWrap(new File([bytes], s.cat+'.jpg',{type:'image/jpeg'})), s.cat); }
    document.getElementById('saveBtn').click();
    await new Promise(r => setTimeout(r, 900));
    const d = document.getElementById('dlg'); if (d && d.open) document.getElementById('dlgOk').click();
  });
  await p.waitForTimeout(900);
  const stored = await p.evaluate(async () => {
    const recs = (await dbAll()).filter(r => r.type === 'UC' && r.equip === 'DZ017');
    const withBase = recs.flatMap(r => Object.entries(r.positions || {})
      .filter(([, x]) => x && x.base).map(([k, x]) => k + '=' + JSON.stringify(x.base)));
    return { recs: recs.length, withBase };
  });
  ok('the baseline is in the saved round', stored.withBase.length > 0, stored.withBase.join(' '));
  ok('carrying the scope it was set with', /"all":1/.test(stored.withBase.join(' ')));
  ok('and it is loaded back out of history', await p.evaluate(async () => {
    WEAR.setBaselines([]);              // forget everything
    await loadBaselines();              // and read it back the way boot does
    const r = WEAR.refFor('DZ017', 'SHANTUI SD90-C5', 'BUSH', 'R', '2030-01-01');
    return !!r && r.src === 'baseline' && r.n === 116 && r.c === 104;
  }));

  console.log('\n  a flagged catalogue condemn is never quietly inherited');
  /* The trap: the SD90's condemn is borrowed from the SD32 as well. Replacing
     "new" with a real measurement while keeping a borrowed limit would print a
     percentage under "vs the baseline set" — which reads as though somebody
     checked both ends of it. */
  const half = await p.evaluate(() => {
    WEAR.setBaselines([{ unit: 'DZ018', point: 'BUSH', pos: 'L', n: 116, c: null,
                         from: '2026-01-01', by: 'x', why: 'baseline' }]);
    const r = WEAR.refFor('DZ018', 'SHANTUI SD90-C5', 'BUSH', 'L', '2026-08-04');
    return { c: r && r.c, x: r && r.x, pct: WEAR.wear(r, 110) };
  });
  ok('a baseline with no condemn does not borrow the borrowed one', half.c == null, String(half.c));
  ok('it says there is no limit', half.x === 'nolimit', String(half.x));
  ok('and refuses to score rather than inventing a percentage', half.pct === null, String(half.pct));

  console.log('\n  where the catalogue is sound, it is inherited');
  const sound = await p.evaluate(() => {
    WEAR.setBaselines([{ unit: 'DZ001', point: 'ROLLER', pos: 'L1', n: 246, c: null,
                         from: '2026-01-01', by: 'x', why: 'baseline' }]);
    const r = WEAR.refFor('DZ001', 'KOMATSU D155A.5', 'ROLLER', 'L1', '2026-08-04');
    return { n: r.n, c: r.c, src: r.src, pct: Math.round(WEAR.wear(r, 228)) };
  });
  ok('a rebuilt roller keeps the catalogue condemn and takes the measured new',
    sound.n === 246 && sound.c === 210 && sound.src === 'baseline', JSON.stringify(sound));
  ok('and scores against what was actually fitted', sound.pct === 50, String(sound.pct));

  console.log('\n  the rounds it does not belong to');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'TB'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  await p.evaluate(() => selectEquip('TK101')); await p.waitForTimeout(900);
  await p.evaluate(() => { const k = ucOrder()[0]; saveCur(); curItem = k; loadPos(); renderChips(); });
  await p.waitForTimeout(600);
  ok('the dump body has no per-station catalogue to override yet, so no row',
    !(await vis(p, '#ucBaseTog')));
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'GET'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  await p.evaluate(() => selectEquip('EX001')); await p.waitForTimeout(900);
  ok('nor the GET round, which has its own reference table', !(await vis(p, '#ucBaseTog')));

  console.log('\n  Russian');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.lang button[data-lang="ru"]').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => selectEquip('DZ001')); await p.waitForTimeout(900);
  await point(p, 'ROLLER.L2'); await p.waitForTimeout(400);
  await p.fill('#ucMM', '246'); await p.waitForTimeout(400);
  await openBase(p);
  const ru = await txt(p, '#ucBase');
  ok('the panel speaks Russian', /[Ѐ-ӿ]/.test(ru) && !/From today/.test(ru), ru.slice(0, 60));
  ok('so does the row', /[Ѐ-ӿ]/.test(await txt(p, '#ucBaseTog')), await txt(p, '#ucBaseTog'));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
