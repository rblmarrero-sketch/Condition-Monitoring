/* The numbers on the undercarriage and GET maps: every hit area is 44 px on the
   narrowest phone, and a tap where two overlap goes to the nearer number, not to
   whichever was drawn last (audit 26.10 F21, build 565). The map is drawn about
   0.62 px a unit at 320 px, so the 28-unit radius it carried measured 35 there. */
const { chromium } = require(require('./pw.cjs'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
(async () => {
  const b = await chromium.launch();
  for (const [type, eq] of [['UC', 'DZ001'], ['GET', 'EX003']]) for (const w of [320, 360, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 820 } });
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await p.goto('http://127.0.0.1:8093/mobile/index.html');
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?');
    await p.evaluate(t => { const s = document.getElementById('typeSel'); s.value = t; s.dispatchEvent(new Event('change')); }, type);
    await p.evaluate(e => { selectEquip(e); goStep(2); }, eq);
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const gs = [...document.querySelectorAll('#posnav .ucmap [data-ucg]')].filter(g => g.getClientRects().length);
      const c = gs.map(g => { const q = g.querySelector('.um-puck').getBoundingClientRect(), h = g.querySelector('.um-hit').getBoundingClientRect();
        return { n: +g.dataset.ucg, x: q.left + q.width / 2, y: q.top + q.height / 2, hit: Math.min(h.width, h.height) }; });
      let best = null;
      for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
        const d = Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y);
        if (!best || d < best.d) best = { a: c[i], b: c[j], d };   // a drawn before b
      }
      return { n: c.length, min: Math.min(...c.map(x => x.hit)), best };
    });
    ok(`${type} ${w}px: every number's hit area is 44 px or more`, m.n > 5 && m.min >= 44, `${m.n} numbers, smallest ${m.min.toFixed(1)} px`);
    const { a, b: bb, d } = m.best, t = 0.35;
    const x = a.x + (bb.x - a.x) * t, y = a.y + (bb.y - a.y) * t;
    const inB = Math.hypot(x - bb.x, y - bb.y) <= bb.hit / 2;
    await p.mouse.click(x, y);
    await p.waitForTimeout(250);
    const sel = await p.evaluate(() => { const g = document.querySelector('#posnav .ucmap [data-ucg].sel'); return g ? +g.dataset.ucg : 0; });
    ok(`${type} ${w}px: a tap nearer ${a.n} than ${bb.n} picks ${a.n}, though ${bb.n}'s hit area is under it`,
      inB && sel === a.n, `${d.toFixed(0)} px apart, picked ${sel}, inside ${bb.n}'s area: ${inB}`);
    await p.close();
  }
  await b.close();
  console.log(fails.length ? 'FAILED: ' + fails.length : 'all passed'); process.exit(fails.length ? 1 : 0);
})();
