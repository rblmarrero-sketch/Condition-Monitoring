/* Where is this part between new and scrap.

   That is the whole job, and it was answered by three small separate things: a
   grey line of limits above the field, a number in a box, and a percentage set
   in the same 15px as the optional work-order field at the bottom of the card.
   Nothing on the screen said which of them mattered.

   One instrument instead — a scale from new to condemn with the reading marked
   on it. What is guarded here is that it stays an instrument and does not drift
   into decoration:

     · the pin is where the arithmetic says, not where it looks nice
     · past condemn it parks on the end rather than floating off the screen,
       and the channel turns, because a marker nobody can see is not a warning
     · the number, the chip and the channel always agree on the verdict
     · it appears only when there IS a score, and leaves no scale behind on a
       point that has none — the first version set the class on one branch and
       never cleared it
     · the limits are not printed twice; the line above drops them when the
       gauge is drawing them
     · a part 2.8 mm PAST condemn does not say "2.8 mm to condemn"

   And the severity ramp, which is the other half of this pass: four states that
   escalate, drawn for years as four identical grey rectangles.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

/* Put a reading a given fraction of the way from new to condemn, and report
   what the gauge made of it. */
const READ = frac => {
  const k = ucOrder()[4];
  saveCur(); curItem = k; loadPos();
  const r = ucRef(); if (!r) return { err: 'no reference at ' + k };
  const v = r.n + (r.c - r.n) * frac;
  const el = document.getElementById('ucMM');
  el.value = v.toFixed(1); el.dispatchEvent(new Event('input', { bubbles: true }));
  saveCur(); renderUC();
  const box = document.getElementById('ucRead');
  const t = box.querySelector('.wg-t'), pin = box.querySelector('.wg-t i');
  const cs = pin ? getComputedStyle(pin) : null;
  return {
    mm: +v.toFixed(1), n: r.n, c: r.c,
    cls: box.className,
    pct: +(box.querySelector('.wg-n b') || {}).textContent,
    pinPct: t ? t.style.getPropertyValue('--p').trim() : null,
    fillPct: t ? t.style.getPropertyValue('--w').trim() : null,
    pinLeftPx: pin ? Math.round(pin.getBoundingClientRect().left - t.getBoundingClientRect().left) : null,
    trackW: t ? Math.round(t.getBoundingClientRect().width) : null,
    band: (box.querySelector('.band') || {}).textContent || '',
    src: (box.querySelector('.src') || {}).textContent || '',
    ends: [...box.querySelectorAll('.wg-e span')].map(s => s.textContent),
    refLine: document.getElementById('ucRefLine').textContent.trim(),
    channel: t ? getComputedStyle(t).backgroundImage + '|' + getComputedStyle(t).backgroundColor : '',
  };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    localStorage.setItem('inspector', 'R. Marrero');
    localStorage.setItem('insp_type', 'UC');
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForTimeout(400);
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(400);

  console.log('the pin lands where the arithmetic says');
  for (const [frac, want] of [[0, 0], [0.25, 25], [0.5, 50], [0.75, 75], [0.99, 99]]) {
    const r = await p.evaluate(READ, frac);
    if (r.err) { ok('a reading at ' + frac, false, r.err); continue; }
    ok(`${Math.round(frac * 100)}% of the way to condemn reads ${want}%`,
       Math.abs(r.pct - want) <= 1, r.mm + ' mm of ' + r.n + '→' + r.c + ' = ' + r.pct + '%');
    /* Not the CSS variable — where the mark actually rendered. A --p the
       browser never applied is a number in an attribute, not a gauge. */
    const wantPx = Math.round(r.trackW * want / 100);
    ok('   and the mark is drawn there', Math.abs(r.pinLeftPx - wantPx) <= 3,
       r.pinLeftPx + 'px of ' + r.trackW + ', wanted ~' + wantPx);
  }

  console.log('\nthe number, the chip and the channel never disagree');
  for (const [frac, band, cls] of [[0.30, /serviceable|исправ/i, 'b-ok'],
                                   [0.85, /watch|наблюд/i, 'b-watch'],
                                   [1.02, /condemn|предел/i, 'b-act']]) {
    const r = await p.evaluate(READ, frac);
    ok(`${r.pct}% is ${cls}`, r.cls.indexOf(cls) >= 0, r.cls);
    ok('   and the chip says the same', band.test(r.band), r.band);
  }

  /* Past the limit, but not past belief. 1.35 of the way from 190 to 171 is
     164 mm on a roller, which the implausibility guard correctly refuses to
     score — so the first version of this check was testing that guard and
     calling it a broken gauge. */
  console.log('\npast condemn it parks on the end and the channel turns');
  const past = await p.evaluate(READ, 1.06);
  ok('the percentage is not clamped — it still says how far past', past.pct > 100, past.pct + '%');
  ok('but the mark is, so it stays on screen',
     past.pinLeftPx >= past.trackW - 4 && past.pinLeftPx <= past.trackW,
     past.pinLeftPx + 'px of ' + past.trackW);
  ok('and the whole channel carries the warning, not just a 3px mark',
     /none/.test(past.channel.split('|')[0]) || past.cls.indexOf('b-act') >= 0,
     past.channel.slice(0, 60));
  ok('a part past the limit does not claim millimetres still to go',
     /past|за пределом/i.test(past.src), past.src);
  note('reads', past.pct + '% · ' + past.band + ' · ' + past.src);

  console.log('\nand a part still inside the limit counts down to it');
  const inside = await p.evaluate(READ, 0.6);
  ok('it says how far is left', /to condemn|до предела/i.test(inside.src), inside.src);

  console.log('\nthe limits are printed once');
  const g = await p.evaluate(READ, 0.5);
  ok('the gauge carries new and condemn on its ends',
     g.ends.length === 2 && g.ends.join(' ').indexOf(String(g.n)) >= 0
     && g.ends.join(' ').indexOf(String(g.c)) >= 0, g.ends.join(' | '));
  ok('so the line above stops repeating them',
     g.refLine.indexOf(String(g.n)) < 0 && g.refLine.indexOf(String(g.c)) < 0, g.refLine);
  ok('and still says the two things the gauge cannot',
     /counts|растёт|убыв/i.test(g.refLine) && g.refLine.length > 8, g.refLine);

  console.log('\nit leaves nothing behind');
  const cleared = await p.evaluate(() => {
    const box = document.getElementById('ucRead');
    const k = ucOrder()[4];
    saveCur(); curItem = k; loadPos();
    const el = document.getElementById('ucMM');
    el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true }));
    saveCur(); renderUC();
    const was = box.className;
    /* And on a point walked to with no reading of its own. */
    saveCur(); curItem = ucOrder()[5]; loadPos(); renderUC();
    return { cleared: was, moved: box.className, html: box.innerHTML.length,
             refBack: document.getElementById('ucRefLine').textContent.trim() };
  });
  ok('clearing the reading takes the scale with it',
     cleared.cleared.indexOf('wg') < 0, cleared.cleared);
  ok('and walking to an unmeasured point shows no scale',
     cleared.moved.indexOf('wg') < 0, cleared.moved);
  ok('with the limits back on the line above, where they are now the only copy',
     /\d/.test(cleared.refBack), cleared.refBack);

  console.log('\nan implausible reading is questioned, not gauged');
  const imp = await p.evaluate(() => {
    const k = ucOrder()[4]; saveCur(); curItem = k; loadPos();
    const el = document.getElementById('ucMM');
    el.value = '9'; el.dispatchEvent(new Event('input', { bubbles: true }));
    saveCur(); renderUC();
    return { cls: document.getElementById('ucRead').className,
             warn: !document.getElementById('ucWarn').classList.contains('hidden') };
  });
  ok('no scale is drawn from a number the app does not believe',
     imp.cls.indexOf('wg') < 0, imp.cls);
  ok('and it is questioned instead', imp.warn);

  console.log('\nseverity is drawn as the ramp it is');
  const keys = ['NOF', 'INC', 'DEG', 'CRI'];
  /* The severity strip is derived and no longer pressable — a technician
     choosing a severity independently of the grade is exactly the split answer
     the record cannot resolve. Drive it the way the app does, through A/B/C/X,
     and read the spans it paints. */
  const SEVG = { NOF: 'A', INC: 'B', DEG: 'C', CRI: 'X' };
  const ramp = {};
  for (const s of keys) {
    ramp[s] = { rail: await p.evaluate(x =>
      getComputedStyle(document.querySelector('#sevSeg .s-' + x), '::before').backgroundColor, s) };
    await p.evaluate(g => document.querySelector('#gradeSeg .g-' + g).click(), SEVG[s]);
    /* The buttons transition their background over 100ms, so reading the
       computed colour in the same tick as the click returns the colour it is
       LEAVING. Three of the four came back grey that way and the fourth came
       back correct, which is exactly what a race looks like when it is
       mistaken for a bug. Let it land. */
    await p.waitForTimeout(250);
    ramp[s].on = await p.evaluate(x =>
      getComputedStyle(document.querySelector('#sevSeg .s-' + x)).backgroundColor, s);
  }
  /* Put it back, so nothing downstream inherits a Critical. */
  await p.evaluate(() => { const b = document.querySelector('#gradeSeg .g-A');
    b.click(); b.click(); });
  ok('each step carries its own colour when selected',
     new Set(keys.map(k => ramp[k].on)).size === 4, keys.map(k => k + '=' + ramp[k].on).join(' '));
  ok('and shows it before it is tapped, so the order reads at a glance',
     new Set(keys.map(k => ramp[k].rail)).size === 4,
     keys.map(k => k + '=' + ramp[k].rail).join(' '));
  const transparent = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  ok('no step is left grey', !keys.some(k => transparent(ramp[k].on)),
     keys.filter(k => transparent(ramp[k].on)).join(',') || 'all four filled');

  console.log('\nand the round it belongs to is visible the whole way down');
  const rail = await p.evaluate(() => {
    const out = {};
    ['UC', 'GET', 'MP'].forEach(r => {
      const s = document.getElementById('typeSel'); s.value = r;
      s.dispatchEvent(new Event('change'));
      const c = document.getElementById('cardComponent');
      const cs = getComputedStyle(c);
      out[r] = { w: cs.borderLeftWidth, col: cs.borderLeftColor,
                 cat: getComputedStyle(document.body).getPropertyValue('--cat').trim() };
    });
    return out;
  });
  ok('the working card wears the round colour down its edge',
     ['UC', 'GET', 'MP'].every(r => parseFloat(rail[r].w) >= 2),
     ['UC', 'GET', 'MP'].map(r => r + ' ' + rail[r].w).join(' '));
  ok('and it is a different colour in each round',
     new Set(['UC', 'GET', 'MP'].map(r => rail[r].col)).size === 3,
     ['UC', 'GET', 'MP'].map(r => r + ' ' + rail[r].col).join('  '));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
