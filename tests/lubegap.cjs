/* A lubrication audit with no reference has to SAY so.

   The reference is keyed by MODEL — pick a unit, the app finds its model, and
   shows that model's compartments, capacities and intervals. On this fleet 901
   of 1,128 units have a model the masterlist has never heard of. Most are light
   vehicles and arguably out of scope; 26 are production machines — loaders,
   drills, scrapers — that a fitter could genuinely be sent to audit.

   Until now that arrived as an empty screen. No compartments, no message, and
   nothing at all to separate "this machine needs no audit" from "the app is
   broken" — and a fitter standing at a drill with an empty phone concludes the
   second one. The same failure as a report with no photographs: a real gap
   rendered as nothing.

   Run: node tests/lubegap.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8116, B = `http://127.0.0.1:${PORT}`;
let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const openLube = (p, unit) => p.evaluate(u => {
  const s = document.getElementById('typeSel'); s.value = 'LUBE'; s.dispatchEvent(new Event('change'));
  selectEquip(u);
  return new Promise(r => setTimeout(() => r({
    comps: (currentTree() || []).length,
    nav: (document.getElementById('posnav').textContent || '').replace(/\s+/g, ' ').trim(),
    capture: getComputedStyle(document.getElementById('captureBox')).display !== 'none',
  }), 700));
}, unit);

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

  /* Real machines from the real fleet, chosen by whether the masterlist knows
     them — not hand-picked names, which would go stale the moment the
     masterlist grows. */
  const pick = await p.evaluate(() => {
    const has = [], none = [];
    (window.ASSETS || []).forEach(a => {
      const covered = LUBE.comps(a.m || '', a.cls || '').length > 0;
      const row = { u: a.n, m: a.m, cls: a.cls };
      if (covered) { if (has.length < 1 && a.cls !== 'GEN') has.push(row); }
      else if (a.cls && a.cls !== 'GEN' && none.length < 1) none.push(row);
    });
    return { has: has[0] || null, none: none[0] || null };
  });
  ok('the fleet has a unit the masterlist covers', !!pick.has, JSON.stringify(pick.has));
  ok('and one it does not', !!pick.none, JSON.stringify(pick.none));

  console.log('\na machine the masterlist knows');
  const good = await openLube(p, pick.has.u);
  ok(pick.has.u + ' (' + pick.has.m + ') offers its compartments', good.comps > 0, good.comps + ' compartment(s)');
  /* Closed until a compartment is chosen — that is the design for every
     register-walking round, not a fault. What matters is that it opens once
     there is something to attach a finding to. */
  ok('  with the form waiting for a compartment to be chosen', !good.capture);
  const chosen = await p.evaluate(() => { pickComponent((currentTree() || [])[0].k);
    return new Promise(r => setTimeout(() => r(
      getComputedStyle(document.getElementById('captureBox')).display !== 'none'), 400)); });
  ok('  and opening once one is', chosen);

  console.log('\nand one it has never heard of');
  const gap = await openLube(p, pick.none.u);
  ok(pick.none.u + ' (' + pick.none.m + ') offers none', gap.comps === 0, gap.comps + ' compartment(s)');
  /* The whole point. An empty screen and an explained screen look identical to
     any check that only counts compartments. */
  ok('  but the screen SAYS why, instead of being blank',
     /lubrication reference|карты смазки/i.test(gap.nav), gap.nav.slice(0, 90) || '(blank)');
  ok('  and names the model, because the model is what has to be added',
     gap.nav.indexOf(pick.none.m) >= 0, gap.nav.slice(0, 110));
  /* No compartments means nothing to fill in. Leaving the form open invites a
     round with a grade against nothing. */
  ok('  and does not offer a form with nothing to put in it', !gap.capture);

  console.log('\nand going back to a covered machine recovers');
  const back = await openLube(p, pick.has.u);
  ok('the compartments come back', back.comps > 0, back.comps + ' compartment(s)');
  ok('  and the notice is gone', !/lubrication reference|карты смазки/i.test(back.nav));

  await b.close(); bye();
  console.log(fail ? `\n${fail} FAILED` : '\na gap that names itself is a work item, not a mystery');
  process.exit(fail ? 1 : 0);
})();
