/* Thirty-six positions is thirty-six renders. Two SVG frames, a figure and a
   reference lookup each time — measure it before an inspector on a cold phone
   in a pit does. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);

  const r = await p.evaluate(async () => {
    const t0 = performance.now(); selectEquip('DZ001');
    await new Promise(r => setTimeout(r, 400));
    const pick = performance.now() - t0;
    const o = ucOrder();
    const t1 = performance.now();
    for (const k of o) pickComponent(k);
    const walk = performance.now() - t1;
    const t2 = performance.now();
    for (let i = 0; i < 40; i++) { const f = document.getElementById('ucMM');
      f.value = String(20 + i * 0.1); f.dispatchEvent(new Event('input', { bubbles: true })); }
    const typing = performance.now() - t2;
    return { pick, walk, per: walk / o.length, n: o.length, typing, perKey: typing / 40,
      nodes: document.querySelectorAll('*').length };
  });
  console.log('  ' + JSON.stringify(r));
  ok('picking a machine paints inside 400 ms', r.pick < 1200, Math.round(r.pick) + ' ms');
  ok('a position change is under 60 ms', r.per < 60, Math.round(r.per) + ' ms each, ' + r.n + ' points');
  ok('a keystroke in the measurement box is under 25 ms', r.perKey < 25, Math.round(r.perKey * 10) / 10 + ' ms');
  ok('the DOM stays under 4000 nodes', r.nodes < 4000, String(r.nodes));

  /* Walking the whole round must not leak nodes or listeners. */
  const before = await p.evaluate(() => document.querySelectorAll('*').length);
  await p.evaluate(() => { for (let i = 0; i < 5; i++) ucOrder().forEach(k => pickComponent(k)); });
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => document.querySelectorAll('*').length);
  ok('five more laps add no nodes', after <= before + 4, before + ' → ' + after);

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
