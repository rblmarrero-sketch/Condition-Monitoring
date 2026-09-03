/* The component cards must say two things at a glance: which one you are on, and
   which ones you have already captured. Neither worked — refreshChips() only ever
   understood the magnetic-plug chip row, so on the cascade cards it set nothing
   and actively stripped the "captured" dot on every repaint. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8094';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };

async function app(b) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  return { ctx, p };
}
const cls = (p, sel) => p.evaluate(s => { const b = document.querySelector(s); return b ? b.className : null; }, sel);
const on = async (p, sel) => /\bon\b/.test(await cls(p, sel) || '');
const has = async (p, sel) => /\bhas\b/.test(await cls(p, sel) || '');
// the dot is what an inspector actually sees, so check the paint, not just the class
const dot = (p, sel) => p.evaluate(s => {
  const d = document.querySelector(s + ' .dot');
  return d ? getComputedStyle(d).display : null; }, sel);
const outline = (p, sel) => p.evaluate(s => {
  const b = document.querySelector(s);
  return b ? getComputedStyle(b).boxShadow : null; }, sel);

(async () => {
  const b = await chromium.launch();
  const { ctx, p } = await app(b);
  await p.evaluate(() => { document.getElementById('typeSel').value = 'INSP';
    document.getElementById('typeSel').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(250);
  await p.evaluate(() => selectEquip('TK032'));
  await p.waitForTimeout(400);

  console.log('systems, before drilling in');
  ok('a system card is not marked selected', !(await on(p, '[data-l7="BS"]')));
  ok('nor captured, with nothing captured', !(await has(p, '[data-l7="BS"]')));

  await p.evaluate(() => { cascL7 = 'BS'; renderChips(); });
  await p.waitForTimeout(250);

  console.log('\npicking a component');
  ok('nothing is selected yet', !(await on(p, '[data-l8="BS.TV"]')));
  await p.click('[data-l8="BS.TV"]');
  await p.waitForTimeout(250);
  ok('it becomes the current item', (await p.evaluate(() => curItem)) === 'BS.TV');
  ok('and the card is outlined', await on(p, '[data-l8="BS.TV"]'), await cls(p, '[data-l8="BS.TV"]'));
  ok('visibly, not just in the class list',
    /inset/.test(await outline(p, '[data-l8="BS.TV"]') || ''), await outline(p, '[data-l8="BS.TV"]'));
  ok('the label under the cards names it',
    /BS\.TV/.test(await p.textContent('#posLabel')), await p.textContent('#posLabel'));

  console.log('\ncapturing something on it');
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="3"]').click());
  await p.waitForTimeout(250);
  ok('the card shows it is captured', await has(p, '[data-l8="BS.TV"]'), await cls(p, '[data-l8="BS.TV"]'));
  ok('the green dot is actually painted', (await dot(p, '[data-l8="BS.TV"]')) === 'block',
    await dot(p, '[data-l8="BS.TV"]'));
  ok('and it is still the selected one', await on(p, '[data-l8="BS.TV"]'));

  console.log('\n  the repaint that used to wipe it');
  // Typing a comment calls refreshChips(). That is what erased the dot.
  await p.evaluate(() => { const e = document.getElementById('comment');
    e.value = 'fine swarf on the plug'; e.dispatchEvent(new Event('input')); });
  await p.waitForTimeout(250);
  ok('the dot survives typing a comment', (await dot(p, '[data-l8="BS.TV"]')) === 'block',
    await cls(p, '[data-l8="BS.TV"]'));
  ok('so does the outline', await on(p, '[data-l8="BS.TV"]'));
  await p.evaluate(() => { curP().wo = 'N-880'; saveCur(); refreshChips(); });
  await p.waitForTimeout(200);
  ok('and a direct refreshChips() does not wipe it either',
    (await dot(p, '[data-l8="BS.TV"]')) === 'block' && await on(p, '[data-l8="BS.TV"]'));

  console.log('\nmoving to another component');
  await p.click('[data-l8="BS.ABS"]');
  await p.waitForTimeout(250);
  ok('the new one is outlined', await on(p, '[data-l8="BS.ABS"]'));
  ok('the old one is not', !(await on(p, '[data-l8="BS.TV"]')));
  ok('but the old one keeps its captured dot', (await dot(p, '[data-l8="BS.TV"]')) === 'block');
  ok('and the new one has no dot yet', (await dot(p, '[data-l8="BS.ABS"]')) === 'none');

  console.log('\nback out to the systems');
  await p.evaluate(() => { cascL7 = null; renderChips(); });
  await p.waitForTimeout(250);
  ok('the system carrying the capture is marked', await has(p, '[data-l7="BS"]'),
    await cls(p, '[data-l7="BS"]'));
  ok('its dot is painted', (await dot(p, '[data-l7="BS"]')) === 'block');
  ok('a system is never outlined as selected', !(await on(p, '[data-l7="BS"]')));
  const other = await p.evaluate(() => {
    const b = [...document.querySelectorAll('[data-l7]')].find(x => x.dataset.l7 !== 'BS');
    return b ? b.dataset.l7 : null; });
  if (other) ok('a system with nothing under it is unmarked',
    (await dot(p, `[data-l7="${other}"]`)) === 'none', other);

  console.log('\nthe magnetic-plug chip row still works');
  await p.evaluate(() => { document.getElementById('typeSel').value = 'MP';
    document.getElementById('typeSel').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK032'));
  await p.waitForTimeout(300);
  const first = await p.evaluate(() => items()[0].k);
  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, first);
  await p.waitForTimeout(200);
  ok('the current plug position is marked', await on(p, `[data-pos="${first}"]`),
    await cls(p, `[data-pos="${first}"]`));
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="2"]').click());
  await p.waitForTimeout(250);
  ok('and shows captured once graded', (await dot(p, `[data-pos="${first}"]`)) === 'block');
  const second = await p.evaluate(() => items()[1].k);
  await p.click(`[data-pos="${second}"]`);
  await p.waitForTimeout(250);
  ok('moving along the row moves the marker', await on(p, `[data-pos="${second}"]`)
    && !(await on(p, `[data-pos="${first}"]`)));
  ok('without losing the first one\'s dot', (await dot(p, `[data-pos="${first}"]`)) === 'block');

  await ctx.close(); await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
