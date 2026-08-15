/* How long has this one got.

   Percent worn says where a part is standing. It does not say when to order the
   replacement, and that is the number planning rings up about. Two dated
   readings and a condemn limit give it — and the "new" figure is not needed at
   all, which is the point: the thirty-two positions on this fleet whose "new"
   is borrowed or disputed can still be forecast.

   The dangerous version of this idea is using the previous reading as the
   reference for percent worn. On a Komatsu D155A roller (new 250, condemn 210)
   sitting at 212 mm — five millimetres from scrap, 95% worn — that arithmetic
   returns 50%, and it returns 50% again at 210.5 mm. It converges on a constant
   instead of on 100%. The last block here holds that line: the previous reading
   feeds the RATE and never the percentage.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const txt = async (p, s) => ((await p.textContent(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();

/* Put rounds in the store the way saving one does, so the forecast is reading
   real history rather than a fixture shaped to please it. */
const seed = (p, unit, rows) => p.evaluate(async ({ unit, rows }) => {
  for (const r of rows) {
    const pos = {}; pos[r.k] = { mm: r.mm };
    await dbPut({ id: 'SEED-' + unit + '-' + r.date + '-' + r.k, rev: 1, type: 'UC',
                  equip: unit, date: r.date, smu: r.smu == null ? '' : String(r.smu),
                  by: 'seed', positions: pos, up: 1 });
  }
}, { unit, rows });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]');
    localStorage.setItem('inspector', 'R. Marrero'); });
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForTimeout(500);

  console.log('the arithmetic, on a real reference');
  /* Komatsu D155A track roller: new 250 mm, condemn 210 mm, wears down. */
  const m = await p.evaluate(() => {
    const ref = WEAR.refFor('DZ001', 'KOMATSU D155A.5', 'ROLLER', 'L1', '2026-08-04');
    const f = WEAR.forecast(ref, [{ mm: 250, at: '2026-01-01', smu: 1000 },
                                  { mm: 230, at: '2026-05-01', smu: 4000 }]);
    return { ref, f };
  });
  ok('20 mm gone in 3,000 h is 6.7 mm per 1,000 h',
    Math.abs(m.f.rate - 6.6667) < 0.01, m.f.rate);
  ok('and 20 mm still to go is 3,000 h of life', Math.round(m.f.hours) === 3000, m.f.hours);
  ok('measured against the hour meter, not the calendar', m.f.basis === 'smu');

  console.log('\n  it refuses to answer rather than guess');
  const R = (series, ref) => p.evaluate(({ series, ref }) =>
    WEAR.forecast(ref || WEAR.refFor('DZ001', 'KOMATSU D155A.5', 'ROLLER', 'L1', '2026-08-04'), series),
    { series, ref });
  ok('one reading is a dot, not a line',
    (await R([{ mm: 250, at: '2026-01-01', smu: 1000 }])).why === 'few');
  ok('two days apart is inside the caliper\'s own error',
    (await R([{ mm: 250, at: '2026-05-01', smu: 4000 }, { mm: 249, at: '2026-05-03', smu: 4020 }])).why === 'soon');
  ok('a part that has not moved does not get a date',
    (await R([{ mm: 230, at: '2026-01-01', smu: 1000 }, { mm: 230, at: '2026-05-01', smu: 4000 }])).why === 'flat');
  ok('a reading that moved AWAY from the limit is called out, not extrapolated',
    (await R([{ mm: 230, at: '2026-01-01', smu: 1000 }, { mm: 236, at: '2026-05-01', smu: 4000 }])).why === 'away');
  ok('already past condemn says nothing — the band has said it',
    (await R([{ mm: 230, at: '2026-01-01', smu: 1000 }, { mm: 208, at: '2026-05-01', smu: 4000 }])).why === 'past');
  const cal = await R([{ mm: 250, at: '2026-01-01' }, { mm: 230, at: '2026-05-01' }]);
  ok('with no hour meter it falls back to dates and says so', cal.basis === 'days' && cal.hours > 0,
    JSON.stringify(cal));

  console.log('\n  three readings are fitted, because two make one bad caliper the trend');
  const noisy = await R([{ mm: 250, at: '2026-01-01', smu: 1000 },
                         { mm: 239, at: '2026-03-01', smu: 2500 },
                         { mm: 230, at: '2026-05-01', smu: 4000 }]);
  ok('least squares over three', noisy.fit === 'ls' && noisy.pts === 3, JSON.stringify(noisy));
  /* One fat-fingered middle reading must not swing the answer the way it would
     if the last two points were all that counted. */
  const spike = await R([{ mm: 250, at: '2026-01-01', smu: 1000 },
                         { mm: 219, at: '2026-03-01', smu: 2500 },
                         { mm: 230, at: '2026-05-01', smu: 4000 }]);
  const twoPt = await R([{ mm: 219, at: '2026-03-01', smu: 2500 },
                         { mm: 230, at: '2026-05-01', smu: 4000 }]);
  ok('a fitted series survives one bad reading; two points do not',
    spike.hours != null && twoPt.why === 'away',
    'fitted ' + Math.round(spike.hours) + ' h, two-point ' + (twoPt.why || twoPt.hours));

  console.log('\n  a point whose "new" is borrowed still gets a forecast');
  /* The whole reason this is worth building: the forecast never touches "new". */
  const sd90 = await p.evaluate(() => {
    const ref = WEAR.refFor('DZ017', 'SHANTUI SD90-C5', 'BUSH', 'L', '2026-08-04');
    return { x: ref && ref.x, pct: WEAR.wear(ref, 100),
             f: WEAR.forecast(ref, [{ mm: 116, at: '2026-01-01', smu: 1000 },
                                    { mm: 110, at: '2026-05-01', smu: 4000 }]) };
  });
  ok('the SD90 bushing still scores no percentage', sd90.x === 'borrowed' && sd90.pct === null);
  ok('but it does get hours to condemn', sd90.f.hours > 0, Math.round(sd90.f.hours) + ' h');

  console.log('\n  a point that wears UPWARD forecasts too');
  const up = await p.evaluate(() => WEAR.forecast(
    WEAR.refFor('DZ001', 'KOMATSU D155A.5', 'IDLER', 'L-OUT', '2026-08-04'),
    [{ mm: 22, at: '2026-01-01', smu: 1000 }, { mm: 26, at: '2026-05-01', smu: 4000 }]));
  ok('the idler tread grows toward its limit and is counted the same way',
    up.hours > 0 && up.rate > 0, Math.round(up.hours) + ' h at ' + up.rate.toFixed(1) + ' mm/1000h');

  console.log('\n  and on the screen, out of real history');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await seed(p, 'DZ001', [{ date: '2026-01-10', smu: 1000, k: 'ROLLER.L1', mm: 250 },
                          { date: '2026-05-10', smu: 4000, k: 'ROLLER.L1', mm: 230 }]);
  await p.evaluate(() => selectEquip('DZ001')); await p.waitForTimeout(900);
  /* The header folds once the unit and the name are settled, and the hour
     meter is behind it — tap Change first, the way a person does. */
  await p.evaluate(() => { const h = document.getElementById('hdrSum');
    if (h && !h.classList.contains('hidden')) h.click(); });
  await p.waitForTimeout(200);
  await p.fill('#smu', '5000'); await p.waitForTimeout(150);
  await p.evaluate(() => { curItem = 'ROLLER.L1'; loadPos(); renderChips(); });
  await p.waitForTimeout(500);
  await p.fill('#ucMM', '224'); await p.waitForTimeout(700);
  const line = await txt(p, '#ucFcast');
  ok('the line is on the capture screen', line.length > 0, line);
  ok('it gives hours, not a percentage', /h left/.test(line) && !/%/.test(line), line);
  ok('and the rate it used', /mm per 1,000 h/.test(line), line);
  ok('the verdict above it is still percent worn',
    /%/.test(await txt(p, '#ucRead')), await txt(p, '#ucRead'));

  console.log('\n  the trap this exists to avoid');
  /* Previous-reading-as-reference on a roller 5 mm from scrap. */
  const trap = await p.evaluate(() => {
    const ref = WEAR.refFor('DZ001', 'KOMATSU D155A.5', 'ROLLER', 'L1', '2026-08-04');
    return { real: WEAR.wear(ref, 212),
             ifPrevWereNew: ((212 - 214) / (ref.c - 214)) * 100 };
  });
  ok('212 mm on a 250 → 210 roller really is 95% worn', Math.round(trap.real) === 95, trap.real);
  ok('and previous-as-reference would have called it 50%', Math.round(trap.ifPrevWereNew) === 50,
     trap.ifPrevWereNew);
  ok('so the percentage on screen comes from "new", never from last time',
    await p.evaluate(async () => {
      /* Same position, same history, a reading near condemn: the band must be
         the severe one, whatever the rate says. */
      const e = document.getElementById('ucMM'); e.value = '212';
      e.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const read = document.getElementById('ucRead').textContent;
      return /9[0-9]%|100%/.test(read) && !/5[0-9]%/.test(read);
    }), await txt(p, '#ucRead'));

  console.log('\n  it goes quiet while the reading is being questioned');
  /* A reading the app cannot believe cannot produce a wear rate it can believe.
     "About 400 h left" printed under "88 mm is larger than the new figure of
     80 mm" is the app arguing with itself in front of the inspector. */
  await p.fill('#ucMM', '260'); await p.waitForTimeout(700);
  ok('an impossible reading is challenged', await p.evaluate(() =>
    !document.getElementById('ucWarn').classList.contains('hidden')));
  ok('and the forecast says nothing at all', (await txt(p, '#ucFcast')) === '',
    await txt(p, '#ucFcast'));
  await p.fill('#ucMM', '224'); await p.waitForTimeout(700);
  ok('a believable reading brings it back', (await txt(p, '#ucFcast')).length > 0,
    await txt(p, '#ucFcast'));

  console.log('\n  a record that did not come from this app does not break the queue');
  /* The rounds seeded above carry no `created` — which is what a merge from
     another phone, an entries.json import, or an older build can look like.
     renderPending used to sort on that field unguarded and take the whole
     Queue screen down with it. */
  const drew = await p.evaluate(async () => {
    try { await renderPending(); } catch (e) { return 'threw: ' + e.message; }
    return document.querySelectorAll('#pending .pitem').length;
  });
  ok('the queue draws instead of throwing', typeof drew === 'number' && drew > 0, String(drew));
  ok('and counts them', await p.evaluate(() => Number(document.getElementById('qCount').textContent) > 0),
    await p.evaluate(() => document.getElementById('qCount').textContent));

  console.log('\n  Russian');
  await p.evaluate(() => document.querySelector('.lang button[data-lang="ru"]').click());
  await p.waitForTimeout(600);
  await p.evaluate(() => { curItem = 'ROLLER.L1'; loadPos(); renderChips(); });
  await p.waitForTimeout(700);
  const ru = await txt(p, '#ucFcast');
  ok('the forecast speaks Russian', /[Ѐ-ӿ]/.test(ru) && !/left|per/.test(ru), ru);

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
