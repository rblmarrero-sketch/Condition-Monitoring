/* THE UNDERCARRIAGE IS WALKED ONE SIDE AT A TIME.

   Asked for from the field on 2026-10-02: an inspector walks every component on
   one side of the machine, then crosses to the other. Next used to follow
   WEAR.walk's table order (idler left, idler right, carrier left, carrier
   right...), which sent them across the machine on every press. This holds:

     - Next walks every point of the starting side before any point of the other;
     - within a side, the order is WEAR.walk's own (nothing else reshuffled);
     - choosing RIGHT over the map starts the walk on the right, and the choice
       is remembered on the phone;
     - crossing to the second side turns the map over with it, and Back from the
       first point of the second side returns to the last point of the first;
     - WEAR.walk itself (what reports print from) is untouched.

   Run: node tests/ucside.cjs   (static server on 8093, as runall.sh brings up) */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

async function settled(p) {
  await p.waitForTimeout(1400);
  for (let i = 0; i < 4; i++) {
    try {
      await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 8000 });
      await p.waitForTimeout(250); return;
    } catch (e) { await p.waitForTimeout(600); }
  }
  throw new Error('page never settled');
}
async function openUC(p) {
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(350);
  await p.evaluate(() => { selectEquip('DZ001'); goStep(2); });
  await p.waitForTimeout(700);
}
const side = k => (k.split('.')[1] || '').charAt(0);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);
  await p.evaluate(() => localStorage.removeItem('uc_start_side'));
  await openUC(p);

  console.log('1. THE ORDER NEXT FOLLOWS');
  const r = await p.evaluate(() => {
    const st = ucStatus(curEquip);
    return { o: ucOrder(), walk: WEAR.walk(st.model).map(w => w.k) };
  });
  const sides = r.o.map(side);
  const firstR = sides.indexOf('R');
  ok('the walk has both sides', firstR > 0 && sides.includes('L'), r.o.length + ' points');
  ok('every left point comes before any right point', sides.slice(firstR).every(s => s === 'R'), sides.join(''));
  ok('nothing is lost or added', r.o.length === r.walk.length && r.o.slice().sort().join() === r.walk.slice().sort().join());
  ok('within a side, the order is the walk\'s own',
    r.o.slice(0, firstR).join() === r.walk.filter(k => side(k) === 'L').join() &&
    r.o.slice(firstR).join() === r.walk.filter(k => side(k) === 'R').join());
  ok('the walk itself (what reports print from) still alternates',
    side(r.walk[0]) === 'L' && side(r.walk[2]) === 'R', r.walk.slice(0, 4).join(' '));

  console.log('\n2. NEXT, ACROSS THE MACHINE ONCE');
  const lastL = r.o[firstR - 1], firstRk = r.o[firstR];
  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, r.o[0]);
  await p.waitForTimeout(400);
  await p.click('#ucNext'); await p.waitForTimeout(400);
  ok('Next from the first point stays on the left', await p.evaluate(() => curItem) === r.o[1], await p.evaluate(() => curItem));
  await p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, lastL);
  await p.waitForTimeout(400);
  await p.click('#ucNext'); await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ cur: curItem, side: ucSide, map: (document.querySelector('.ucmapwrap') || {}).dataset ? document.querySelector('.ucmapwrap').dataset.side : '',
    count: document.getElementById('ucSheetCount').textContent }));
  ok('Next from the last left point crosses to the first right point', after.cur === firstRk, after.cur);
  ok('and the map turned over to the right side with it', after.side === 'R' && after.map === 'R', JSON.stringify(after));
  ok('the count runs on, not back to 1', new RegExp('\\b' + (firstR + 1) + '\\b').test(after.count), after.count);
  await p.click('#ucPrev'); await p.waitForTimeout(400);
  ok('Back returns to the last left point, and the map with it',
    await p.evaluate(k => curItem === k && ucSide === 'L', lastL), await p.evaluate(() => curItem + ' ' + ucSide));

  console.log('\n3. CHOOSING THE RIGHT SIDE FIRST');
  await p.click('[data-ucside="R"]'); await p.waitForTimeout(400);
  const rr = await p.evaluate(() => ({ o: ucOrder(), saved: localStorage.getItem('uc_start_side') }));
  const rs = rr.o.map(side), firstL = rs.indexOf('L');
  ok('RIGHT puts every right point first', firstL > 0 && rs.slice(0, firstL).every(s => s === 'R') && rs.slice(firstL).every(s => s === 'L'), rs.join(''));
  ok('and the choice is remembered on the phone', rr.saved === 'R', rr.saved);
  await p.reload({ waitUntil: 'load' }); await settled(p); await openUC(p);
  const again = await p.evaluate(() => ({ first: ucOrder()[0], side: ucSide }));
  ok('after a reload the walk still starts on the right', side(again.first) === 'R' && again.side === 'R', JSON.stringify(again));
  await p.click('[data-ucside="L"]'); await p.waitForTimeout(300);
  ok('choosing LEFT puts it back', await p.evaluate(() => ucOrder()[0].split('.')[1].charAt(0) === 'L' && localStorage.getItem('uc_start_side') === 'L'));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
