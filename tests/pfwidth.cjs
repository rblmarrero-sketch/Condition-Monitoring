/* THE P–F CHART FITS ITS COLUMN AT EVERY WINDOW THIS DASHBOARD IS USED AT.

   Public defect, build 268: the Failure analysis P–F container measured
   about 549px wide on a 1366×768 laptop and the chart inside it 560px, so a
   scrollbar sat under the chart and the right-hand axis label was off the
   edge. The SVG had a 560px minimum in CSS and a fixed 760-unit drawing.

   Now the chart is drawn at the width of its box — measured, not assumed —
   and redrawn when the window changes. What has to be true at 1366×768,
   1920×1080, 1280×800 and two tablet widths:
     · no horizontal scroll inside the chart's box, and none on the page;
     · the SVG is exactly as wide as its box;
     · every label is inside the drawing — none scaled away, none clipped.

   Run: node tests/pfwidth.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Four readings on one dozer, so a life and a P–F candidate exist. */
const SEED = () => {
  const series = { 'IDLER.L-OUT': [24, 26.5, 29, 31.5], 'ROLLER.L1': [240, 230, 220, 213], 'BUSH.L': [98.5, 96, 94, 92.6] };
  const recs = ['2026-02-11', '2026-04-14', '2026-06-16', '2026-08-11'].map((d, n) => ({
    equip: 'DZ002', date: d, type: 'UC', cls: 'DOZ', by: 'R', smu: String(9000 + n * 480),
    items: Object.keys(series).map(k => ({ key: k, label: k, mm: series[k][n] })) }));
  CMDash.importRecords(recs);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};
const measure = () => {
  const box = document.getElementById('pfChart'), wrap = box.querySelector('.pfwrap'), svg = box.querySelector('svg');
  if (!svg) return { nosvg: true, box: box.clientWidth };
  const vb = svg.viewBox.baseVal, sw = svg.getBoundingClientRect().width;
  const labels = [...svg.querySelectorAll('text')].map(t => { const b = t.getBBox(); return { t: t.textContent, x0: b.x, x1: b.x + b.width, y1: b.y + b.height }; });
  const out = labels.filter(l => l.x0 < 0 || l.x1 > vb.width + 0.5 || l.y1 > vb.height + 0.5);
  return { box: box.clientWidth, boxScroll: box.scrollWidth, wrapScroll: wrap ? wrap.scrollWidth : 0, wrapClient: wrap ? wrap.clientWidth : 0,
           svgW: Math.round(sw), vbW: vb.width, labels: labels.length, out: out.map(l => l.t + '@' + Math.round(l.x1)),
           font: getComputedStyle(svg.querySelector('text')).fontSize,
           page: document.documentElement.scrollWidth <= innerWidth + 1, pageScroll: document.documentElement.scrollWidth, inner: innerWidth };
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(SEED); await p.waitForTimeout(300);
  await p.evaluate(() => showTab('failure', true)); await p.waitForTimeout(300);
  const has = await p.evaluate(() => pfCandidates().length);
  ok('the seed produced a P–F candidate', has > 0, has + ' candidates');

  for (const [w, h, name] of [[1366, 768, 'laptop 1366×768'], [1920, 1080, 'desktop 1920×1080'], [1280, 800, 'laptop 1280×800'], [1024, 768, 'tablet landscape 1024×768'], [820, 1180, 'tablet portrait 820×1180'], [768, 1024, 'tablet portrait 768×1024']]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(400);                          // the resize redraw is debounced 150 ms
    const m = await p.evaluate(measure);
    console.log('\n' + name);
    ok('the chart is drawn', !m.nosvg, JSON.stringify(m));
    if (m.nosvg) continue;
    ok('no horizontal scroll inside the chart box', m.boxScroll <= m.box + 1 && m.wrapScroll <= m.wrapClient + 1, `box ${m.box} scroll ${m.boxScroll} · wrap ${m.wrapClient} scroll ${m.wrapScroll}`);
    ok('the drawing is as wide as its box', Math.abs(m.svgW - m.box) <= 2 && Math.abs(m.vbW - m.box) <= 2, `svg ${m.svgW} · viewBox ${m.vbW} · box ${m.box}`);
    ok('every label is inside the drawing (' + m.labels + ' labels)', m.out.length === 0, m.out.join(', ') || 'all inside');
    ok('the type is not scaled away', m.font === '10px', m.font);
    ok('no horizontal scroll on the page', m.page, `page ${m.pageScroll} vs window ${m.inner}`);
  }

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
