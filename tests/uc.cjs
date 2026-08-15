/* The undercarriage round on a phone: pick a machine, walk the points, put in a
   number — or say why there isn't one. The two things paper cannot do are the
   ones under the most scrutiny here: a reason counts as done, and an impossible
   reading is questioned without ever being refused. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

async function app(b) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load|404/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]');
    localStorage.setItem('uc_view', 'list'); });   // this suite drives the list
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1700);
  return { ctx, p };
}
const setType = (p, ty) => p.evaluate(t => {
  const s = document.getElementById('typeSel'); s.value = t; s.dispatchEvent(new Event('change'));
}, ty);
const vis = (p, sel) => p.evaluate(s => {
  const e = document.querySelector(s);
  return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0;
}, sel);
const txt = async (p, sel) => (await p.textContent(sel).catch(() => '') || '').replace(/\s+/g, ' ').trim();
const enter = async (p, v) => { await p.fill('#ucMM', String(v)); await p.waitForTimeout(180); };

(async () => {
  const b = await chromium.launch();
  const { ctx, p } = await app(b);

  console.log('the type is offered at all');
  ok('Undercarriage is in the list',
    (await p.$$eval('#typeSel option', o => o.map(x => x.value))).includes('UC'));
  await setType(p, 'UC');
  await p.waitForTimeout(300);
  ok('it asks for a machine first', /unit|Выбер|Pick/i.test(await txt(p, '#posnav')), await txt(p, '#posnav'));

  console.log('\nmachines that must be turned away');
  await p.evaluate(() => selectEquip('EX017'));          // HITACHI ZX210W-5A, wheeled
  await p.waitForTimeout(400);
  ok('the wheeled excavator is refused', /tyres|шинах/i.test(await txt(p, '#posnav')), await txt(p, '#posnav'));
  ok('it names the model so nobody has to guess',
    (await txt(p, '#posnav')).includes('ZX210W'), await txt(p, '#posnav'));
  ok('and the capture form stays shut', !(await vis(p, '#captureBox')));

  await p.evaluate(() => selectEquip('TK032'));          // a haul truck
  await p.waitForTimeout(400);
  ok('a haul truck is refused too', /tracked|гусенич/i.test(await txt(p, '#posnav')), await txt(p, '#posnav'));

  console.log('\na dozer that is in the register');
  await p.evaluate(() => selectEquip('DZ001'));          // KOMATSU D155A.5
  await p.waitForTimeout(500);
  const walk = await p.evaluate(() => items().length);
  /* 36 measured points plus the three condition checks the client's catalog
     carries and the caliper table never did — adjuster, frame and sag — on both
     sides. The paper tab is 36; the round is now 42. */
  ok('42 positions: the paper tab\'s 36, plus the catalog\'s three a side', walk === 42, walk);
  const pts = await p.evaluate(() => (ucWalkTree(curEquip) || []).map(n => n.k));
  ok('the points are the cards, not the positions',
    pts.join(",") === "IDLER,CARRIER,ROLLER,SPROCKET,LINKH,BUSH,PITCH4,PITCH1,GROUSER,ADJUST,FRAME,SAG",
    pts.join(","));

  await p.click('[data-l7="GROUSER"]');
  await p.waitForTimeout(300);
  ok('a point opens to its two sides',
    (await p.$$eval('#posnav [data-l8]', b => b.map(x => x.dataset.l8))).join(',')
      === 'GROUSER.L,GROUSER.R');
  await p.click('[data-l8="GROUSER.L"]');
  await p.waitForTimeout(300);
  ok('picking a side arms the capture form', await vis(p, '#captureBox') && await vis(p, '#ucFields'));
  ok('the label names the point and the side',
    /Grouser height — Left/.test(await txt(p, '#posLabel')), await txt(p, '#posLabel'));
  /* The drawing is a disclosure in the dock, closed unless asked for and
     remembered. What matters is that it is ONE tap away and that it arrives. */
  await p.evaluate(() => { const t = document.getElementById('ucFigTog');
    if (t && !/\u25BE/.test(t.textContent)) t.click(); });
  await p.waitForTimeout(350);
  ok('a drawing is one tap away', await p.evaluate(() => !!document.querySelector('#ucFig svg')));
  /* A caliper point has a number for an answer, not a letter. The three visual
     checks — adjuster and recoil, frame and guards, chain sag — have nothing to
     measure, so they keep the grade and are the only ones that do. */
  const gradeOn = () => p.evaluate(() => {
    const g = document.getElementById('gradeFld');
    return !!g && g.getClientRects().length > 0; });
  ok('a measured point is not offered a grade', !(await gradeOn()));
  /* The row is a row, not just an element with the right text in it. It was
     styled display:none until a container opted in, and only the dock ever did
     — so in this view, and in the whole GET round, the button existed, answered
     .click(), and could not be seen or reached by a thumb. Two suites drove it
     programmatically and both were happy. */
  ok('and the diagram row is on screen, because a grouser has a drawing',
    await vis(p, '#ucFigTog'));
  const wasOn = await p.evaluate(() => curItem);
  await p.evaluate(() => { saveCur(); curItem = 'SAG.L'; loadPos(); renderChips(); });
  await p.waitForTimeout(400);
  ok('but a visual check keeps it', await gradeOn());
  /* The three visual checks have no drawing — WEAR_FIG carries nine, one per
     caliper point, and sag, frame and adjuster are not among them. The row was
     offered anyway, so all three read "Hide the diagram" over nothing. A
     disclosure with an empty drawer is worse than no disclosure: it tells an
     inspector the app is broken at the moment they most need to trust it. */
  for (const k of ['SAG.L', 'FRAME.L', 'ADJUST.L']) {
    await p.evaluate(x => { saveCur(); curItem = x; loadPos(); renderChips(); }, k);
    await p.waitForTimeout(300);
    ok(k + ' has no drawing, so it is not offered one',
      !(await vis(p, '#ucFigTog')) && !(await vis(p, '#ucFig')),
      await txt(p, '#ucFigTog'));
  }
  /* And the other way: every point that HAS a drawing offers it, in both
     languages, so a future edit to the figure set cannot quietly take the row
     away from a point that still needs it. */
  const figPts = await p.evaluate(() => {
    const has = WEAR_FIG.codes();
    return (ucWalkTree(curEquip) || []).filter(n => has.includes(n.k))
      .map(n => [n.k, n.ch[0].k]);
  });
  const missing = [];
  for (const [code, pos] of figPts) {
    await p.evaluate(x => { saveCur(); curItem = x; loadPos(); renderChips(); }, pos);
    await p.waitForTimeout(220);
    if (!(await vis(p, '#ucFigTog'))) missing.push(code);
  }
  ok('all nine drawn points still offer the row', !missing.length,
    missing.length ? missing.join(',') : figPts.length + ' points');
  /* Put the round back where it was — everything below still expects the
     grouser point, and a check that changes the state it borrowed is how the
     next twenty become a puzzle. */
  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, wasOn);
  await p.waitForTimeout(400);
  ok('and the figures being measured against, before anything is typed',
    /new 80 mm → condemn 30 mm/.test(await txt(p, '#ucRefLine')), await txt(p, '#ucRefLine'));
  ok('including which way the number moves', /counts down/.test(await txt(p, '#ucRefLine')));
  ok('and where the reference came from', /model reference/.test(await txt(p, '#ucRefLine')));

  console.log('\nthe number, and what it means');
  await enter(p, 60);
  let r = await txt(p, '#ucRead');
  ok('60 mm on an 80 → 30 grouser reads 40%', /40%/.test(r), r);
  ok('with the band spelled out', /Serviceable/i.test(r), r);
  ok('and how far is left', /30\.0 mm to condemn/.test(r), r);
  // Provenance is stated once, on the reference line — the verdict under the
  // box does not repeat it back at an inspector who has just read it.
  ok('the reference line says where the figures came from',
    /model reference/i.test(await txt(p, '#ucRefLine')), await txt(p, '#ucRefLine'));
  ok('and the verdict does not repeat it', !/model reference/i.test(r), r);
  ok('nothing is questioned', !(await vis(p, '#ucWarn')));
  ok('the card is marked captured',
    await p.evaluate(() => document.querySelector('[data-l8="GROUSER.L"]').classList.contains('has')));

  await enter(p, 34);
  r = await txt(p, '#ucRead');
  ok('34 mm is 92% — watch', /92%/.test(r) && /Watch/i.test(r), r);
  await enter(p, 30);
  r = await txt(p, '#ucRead');
  ok('30 mm is at the condemn limit', /100%/.test(r) && /condemn/i.test(r), r);

  console.log('\nthe reading that cannot be right — questioned, never refused');
  await enter(p, 95);
  ok('the warning appears', await vis(p, '#ucWarn'));
  const w = await txt(p, '#ucWarnText');
  ok('it says what is wrong in plain words', /cannot grow/.test(w), w);
  ok('it quotes both numbers', /95/.test(w) && /80/.test(w), w);
  ok('no wear figure is shown beside it', !/%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  ok('but the reading IS stored — nothing was refused',
    await p.evaluate(() => draft.positions['GROUSER.L'].mm) === 95);
  await p.click('#ucStood');
  await p.waitForTimeout(200);
  ok('the inspector can stand by it',
    await p.evaluate(() => draft.positions['GROUSER.L'].stood) === true);
  await enter(p, 60);
  ok('a sane reading clears the warning', !(await vis(p, '#ucWarn')));
  ok('and clears the standing-by flag with it',
    !(await p.evaluate(() => draft.positions['GROUSER.L'].stood)));

  console.log('\nno number: a reason, which counts as done');
  await p.click('[data-nav="root"]'); await p.waitForTimeout(200);
  await p.click('[data-l7="ROLLER"]');
  await p.waitForTimeout(250);
  const rollers = await p.$$eval('#posnav [data-l8]', b => b.map(x => x.dataset.l8));
  ok('sixteen roller positions, eight a side', rollers.length === 16, rollers.length);
  await p.click('[data-l8="ROLLER.L1"]');
  await p.waitForTimeout(300);
  /* Six chips open on every one of thirty-six points is the exception sitting
     in the position of the job, so they are behind a row now. Open it — and the
     row itself has to be there, or the reasons are unreachable rather than
     merely tidy. */
  ok('a way to say it could not be measured is offered', await p.evaluate(() => {
    const t = document.getElementById('ucNaTog');
    return !!t && t.getClientRects().length > 0; }));
  await p.evaluate(() => { const t = document.getElementById('ucNaTog');
    if (t && !/\u25BE/.test(t.textContent)) t.click(); });
  await p.waitForTimeout(300);
  ok('the reasons are offered', (await p.$$('#ucReasons button')).length >= 6);
  ok('the guard is one of them — what they already write on paper',
    /Behind the guard/i.test(await txt(p, '#ucReasons')));
  await p.click('#ucReasons [data-r="GUARD"]');
  await p.waitForTimeout(250);
  ok('the position is now captured, not blank',
    await p.evaluate(() => !!draft.positions['ROLLER.L1']));
  ok('it reads as not measured, with the reason',
    /Not measured/i.test(await txt(p, '#ucRead')) && /guard/i.test(await txt(p, '#ucRead')),
    await txt(p, '#ucRead'));
  ok('the card shows a capture, same as a number would',
    await p.evaluate(() => document.querySelector('[data-l8="ROLLER.L1"]').classList.contains('has')));
  ok('"not fitted" is there, so the roller count corrects itself',
    await p.$('#ucReasons [data-r="NOFIT"]') !== null);

  console.log('  a number and a reason cannot both be true');
  await enter(p, 240);
  ok('typing a number drops the reason',
    !(await p.evaluate(() => draft.positions['ROLLER.L1'].reason)));
  ok('and the number scores normally', /25%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  await p.click('#ucReasons [data-r="PACKED"]');
  await p.waitForTimeout(250);
  ok('choosing a reason drops the number',
    await p.evaluate(() => draft.positions['ROLLER.L1'].mm) === null);
  ok('and clears the field', (await p.inputValue('#ucMM')) === '');
  await p.click('#ucReasons [data-r="PACKED"]');
  await p.waitForTimeout(250);
  ok('tapping the same reason again undoes it',
    await p.evaluate(() => !draft.positions['ROLLER.L1']));

  console.log('\nthe SD90, whose reference is the thing that is wrong');
  await p.evaluate(() => selectEquip('DZ018'));         // SHANTUI SD90-C5
  await p.waitForTimeout(500);
  await p.click('[data-nav="root"]').catch(()=>{}); await p.waitForTimeout(200);
  await p.click('[data-l7="BUSH"]'); await p.waitForTimeout(250);
  await p.click('[data-l8="BUSH.L"]'); await p.waitForTimeout(300);
  await enter(p, 116);
  r = await txt(p, '#ucRead');
  ok('116 mm is recorded', await p.evaluate(() => draft.positions['BUSH.L'].mm) === 116);
  ok('but not scored', !/\d+%/.test(r), r);
  ok('and it says why', /another model/i.test(r), r);
  ok('the impossible reading is still questioned', await vis(p, '#ucWarn'));
  ok('the reference line says the figures are borrowed, before anything is typed',
    /another model/.test(await txt(p, '#ucRefLine')), await txt(p, '#ucRefLine'));

  console.log('\nthe idler counts up, and the app knows it');
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(500);
  await p.click('[data-nav="root"]').catch(()=>{}); await p.waitForTimeout(200);
  await p.click('[data-l7="IDLER"]'); await p.waitForTimeout(250);
  const idl = await p.$$eval('#posnav [data-l8]', b => b.map(x => x.dataset.l8));
  ok('four idler readings, outer and inner both sides',
    idl.join(',') === 'IDLER.L-OUT,IDLER.L-IN,IDLER.R-OUT,IDLER.R-IN', idl.join(','));
  await p.click('[data-l8="IDLER.L-OUT"]'); await p.waitForTimeout(300);
  await enter(p, 23);
  ok('23 mm on a 21 → 33.5 idler is 16% worn', /16%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  await enter(p, 18);
  ok('a reading below "new" on a growing point is questioned', await vis(p, '#ucWarn'));
  ok('and the words match the direction', /cannot shrink/.test(await txt(p, '#ucWarnText')),
    await txt(p, '#ucWarnText'));

  console.log('\nRussian');
  await p.click('.lang button[data-lang="ru"]');
  await p.waitForTimeout(500);
  ok('the type is named in Russian',
    /Ходовая/.test(await p.$eval('#typeSel option[value="UC"]', o => o.textContent)));
  await p.click('[data-l8="IDLER.L-OUT"]'); await p.waitForTimeout(300);
  await enter(p, 23);
  ok('the readout is Russian too', /Годен|Наблюдать/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));
  ok('so are the reasons', /Кожух/.test(await txt(p, '#ucReasons')));

  console.log('\nthe other types still work');
  await p.click('.lang button[data-lang="en"]');
  await p.waitForTimeout(300);
  await setType(p, 'MP');
  await p.waitForTimeout(400);
  ok('magnetic plug is unaffected', !(await vis(p, '#ucFields')) && (await p.$$('#posnav [data-pos]')).length > 0);
  await setType(p, 'INSP');
  await p.evaluate(() => selectEquip('TK032'));
  await p.waitForTimeout(500);
  ok('the component inspection still builds its tree',
    (await p.$$('#posnav [data-l7]')).length > 0 && !(await vis(p, '#ucFields')));

  await ctx.close(); await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
