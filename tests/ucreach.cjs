/* Every undercarriage station, on the shortest screens a handset has: the number
   and Next must both be on screen once the app has brought the sheet into view.
   tests/sizes.cjs measures one station; this walks the whole round, because the
   side-walk changed which station that one was and two others (IDLER.L-OUT,
   ROLLER.L5) had been 30-45 px under the fold at 320x568 all along. */
const { chromium } = require(require('./pw.cjs'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[320, 568], [360, 640], [375, 667]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await p.goto('http://127.0.0.1:8093/mobile/index.html');
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?');
    await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
    await p.evaluate(() => { selectEquip('DZ001'); goStep(2); });
    await p.waitForTimeout(800);
    const keys = await p.evaluate(() => ucOrder());
    const bad = [];
    for (const k of keys) {
      const r = await p.evaluate(async k => {
        pickComponent(k); ucKeepFrameInView();
        await new Promise(r => setTimeout(r, 120));
        const f = document.getElementById('ucMM'); f.value = '88'; f.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 200));
        const g = i => { const e = document.getElementById(i), q = e.getBoundingClientRect();
          return !e.classList.contains('hidden') && q.height > 0 && q.top >= -0.5 && q.bottom <= innerHeight + 0.5; };
        return { nav: g('ucSheetNav'), mm: g('ucMM') };
      }, k);
      if (!r.nav || !r.mm) bad.push(k + (r.nav ? '' : ' nav') + (r.mm ? '' : ' number'));
    }
    ok(w + '×' + h + ': the number and Next are on screen at all ' + keys.length + ' stations',
      keys.length > 30 && bad.length === 0, bad.slice(0, 6).join(', '));
    await p.close();
  }
  await b.close();
  console.log(fails.length ? 'FAILED: ' + fails.length : 'all passed'); process.exit(fails.length ? 1 : 0);
})();
