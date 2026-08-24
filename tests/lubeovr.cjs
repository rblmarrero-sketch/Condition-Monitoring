/* One machine that is not like the others.

   The lubrication reference is keyed by MODEL, which is right — a capacity is a
   property of the design. Until a transmission is rebuilt with a larger sump,
   or one excavator arrives with the cold-climate package and the rest did not.
   Editing the model to fix that machine would quietly change the figures for
   every other unit of the model, which is a worse bug than the one being fixed.

   lube-overrides.js is keyed by UNIT. This proves the three things that decide
   whether it can be trusted:

     the named machine changes, every other machine of that model does NOT,
     and the change is visible rather than silent.

   Run: node tests/lubeovr.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8117, B = `http://127.0.0.1:${PORT}`;
let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { localStorage.setItem('up_swap_off', '1'); localStorage.setItem('up_dests', '[]'); });
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);

  console.log('\nthe file ships empty, and is loaded');
  ok('lube-overrides.js is on the page', await p.evaluate(() => !!window.LUBE_OVERRIDES),
     JSON.stringify(await p.evaluate(() => window.LUBE_OVERRIDES || null)));
  ok('  and holds no overrides yet, so no machine is quietly different',
     await p.evaluate(() => Object.keys(window.LUBE_OVERRIDES || {}).length === 0));

  /* Two real machines of the SAME model, so "the other one is unaffected" is a
     claim about a sibling rather than about an unrelated machine. */
  const pair = await p.evaluate(() => {
    const byModel = {};
    (window.ASSETS || []).forEach(a => {
      if (!LUBE.comps(a.m || '', a.cls || '').length) return;
      (byModel[a.cls + '|' + a.m] = byModel[a.cls + '|' + a.m] || []).push(a.n);
    });
    const k = Object.keys(byModel).find(x => byModel[x].length >= 2);
    if (!k) return null;
    const [one, two] = byModel[k];
    const comps = LUBE.comps(k.split('|')[1], k.split('|')[0]);
    return { model: k, one, two, k: comps[0].k, cap: comps[0].cap, n: comps.length };
  });
  ok('the fleet has two machines of one model to compare', !!pair, pair && (pair.one + ' / ' + pair.two + ' — ' + pair.model));

  console.log('\none machine given a rebuilt compartment');
  const res = await p.evaluate(o => {
    window.LUBE_OVERRIDES[o.one] = {
      why: 'transmission rebuilt 03-2026, sump 8 L larger — WO 44182',
      set: { [o.k]: { cap: 999.5, iv: 1000 } },
      add: [{ k: 'ZZ', en: 'Aux gearbox', ru: 'Доп. редуктор', cap: 5, iv: 500, t: 'gear' }],
    };
    const a = lubeComps(o.one), bb = lubeComps(o.two);
    const find = (l, k) => l.filter(c => String(c.k) === String(k))[0] || null;
    return {
      oneCap: (find(a, o.k) || {}).cap, twoCap: (find(bb, o.k) || {}).cap,
      oneMarked: !!(find(a, o.k) || {}).ovr,
      oneN: a.length, twoN: bb.length,
      oneHasAdded: !!find(a, 'ZZ'), twoHasAdded: !!find(bb, 'ZZ'),
    };
  }, pair);
  ok('the named machine takes the new capacity', res.oneCap === 999.5, String(res.oneCap));
  /* The whole reason this file is keyed by unit. If the sibling moved too, the
     override would be a model edit wearing a different name — and the harm
     would be invisible, because both machines would agree with each other. */
  ok('  and its sibling on the same model does NOT', res.twoCap === pair.cap,
     res.twoCap + ' (unchanged: ' + pair.cap + ')');
  ok('  the extra compartment appears on the one machine', res.oneHasAdded && !res.twoHasAdded,
     'one ' + res.oneN + ' comps, sibling ' + res.twoN);
  /* Marked, so the app can say a figure is not the manual's. An override that
     looks identical to the reference is one nobody can check. */
  ok('  and the changed compartment is marked as overridden', res.oneMarked);

  console.log('\nand dropping one the machine does not have');
  const dropped = await p.evaluate(o => {
    window.LUBE_OVERRIDES[o.one] = { why: 'no aux tank on this chassis', drop: [o.k] };
    return { one: lubeComps(o.one).length, two: lubeComps(o.two).length };
  }, pair);
  ok('the machine loses it', dropped.one === pair.n - 1, dropped.one + ' of ' + pair.n);
  ok('  and its sibling keeps it', dropped.two === pair.n, dropped.two + ' of ' + pair.n);

  /* Repeated reads must not accumulate. LUBE.comps() hands back the model's own
     array, and writing a patch into it would change every unit of that model
     for the rest of the session — this file's exact harm, arrived at by
     accident and impossible to see from the screen. */
  console.log('\nand asking twice does not change the model itself');
  const stable = await p.evaluate(o => {
    window.LUBE_OVERRIDES[o.one] = { why: 'x', set: { [o.k]: { cap: 111 } } };
    lubeComps(o.one); lubeComps(o.one); lubeComps(o.one);
    delete window.LUBE_OVERRIDES[o.one];
    const back = lubeComps(o.one).filter(c => String(c.k) === String(o.k))[0] || {};
    return { cap: back.cap, marked: !!back.ovr, n: lubeComps(o.two).length };
  }, pair);
  ok('removing the override restores the manual figure', stable.cap === pair.cap,
     stable.cap + ' (manual: ' + pair.cap + ')');
  ok('  with no leftover mark', !stable.marked);
  ok('  and the model is intact for everything else', stable.n === pair.n, stable.n + ' of ' + pair.n);

  await b.close(); bye();
  console.log(fail ? `\n${fail} FAILED` : '\none machine changed, and only that machine');
  process.exit(fail ? 1 : 0);
})();
