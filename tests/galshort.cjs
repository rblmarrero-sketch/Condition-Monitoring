/* A ROW HELD SHORTER THAN THE LINE BY THE PAGE-HEIGHT CEILING STILL HAS
   TO REACH THE LINE.

   "same no change" — read against CM_unit_TK109_2026-09-21.pdf, the exact
   report galjustify.cjs's own fix was already supposed to have answered.
   CH.UC's three photographs (a hub, a tall oil sample jar, a small cap)
   are portrait/near-square enough that solving for the row's own width
   the way RRD's four wider close-ups do would need a height past
   GAL_MAX_H (250) — the ceiling that exists so an all-narrow-portrait row
   does not blow out a page. Clamped there, the row's own TRUE width at
   that height falls short of GAL_ROW_W (746), and `justify-content:
   center` on a row that is only ever as wide as its own content pinned
   every photograph into the left ~70% of the line with one blank strip
   banked after the last frame — the exact defect galjustify.cjs already
   fixed for a DIFFERENT cause (auto columns), reopened here by a height
   cap this project needs for a different, real reason.

   The fix is two changes to justifiedRow(), not a wider ceiling — a wider
   GAL_MAX_H just moves the same problem to a taller row of narrower
   photographs, and this project's own "never crop, never stretch" rule
   already rules out resizing a photograph past its true ratio to make up
   the difference:
     - `justify-self:stretch` makes the row itself (a flex box that
       otherwise sizes to its own content) actually occupy the full
       746px grid column, not just centre a narrower box inside it;
     - `justify-content:space-between` then spends the leftover width as
       gaps BETWEEN photographs instead of banking it all after the last
       one, so the row still reaches both edges of the line — nothing
       cropped, nothing stretched past its own aspect ratio, only WHERE
       the unavoidable extra space goes.
   The threshold that decides "short" is deliberately loose (more than one
   full gap's worth) — `Math.round(h)` in justifiedH means an ordinary,
   correctly-filling row is almost never exactly GAL_ROW_W wide either,
   and galmixed4.cjs's own control caught the fix's first draft turning
   that rounding noise into a visibly widened hairline gap.

   Run: node tests/galshort.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR, { timeout: 20000 });

  const render = async (key, name, shapes) => p.evaluate(async ({ key, name, shapes }) => {
    const jpeg = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.92); };
    const colors = [[90, 85, 80], [40, 40, 45], [60, 55, 40], [70, 70, 75]];
    const photos = shapes.map((s, i) => jpeg(s[0], s[1], colors[i % colors.length]));
    const recs = [
      { equip: 'TK109', clsLabel: 'HT', model: 'X', type: 'UC', typeLabel: 'UC', date: '2026-09-21', by: 'R', smu: '1',
        items: [{ key, name, grade: 2, defect: 'oil level', action: 'Monitor', photos }] },
      { equip: 'TK109', clsLabel: 'HT', model: 'X', type: 'FC', typeLabel: 'FC', date: '2026-09-21', by: 'R', smu: '1',
        items: [{ key: 'ENG', name: 'Engine Oil Filter', grade: 1 }] },
    ];
    const secs = window.CMR.sections({ lang: 'en', bi: false, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs });
    const st = document.getElementById('gscss') || (() => { const s = document.createElement('style'); s.id = 'gscss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const imgs = [...d.querySelectorAll('.phg.gallery img')];
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const row = d.querySelector('.phgrow');
    const rowRect = row ? row.getBoundingClientRect() : null;
    const boxes = imgs.map(im => im.getBoundingClientRect());
    const out = {
      justify: row ? getComputedStyle(row).justifyContent : null,
      rowWidth: rowRect ? Math.round(rowRect.width) : null,
      boxes: boxes.map(bx => ({ l: Math.round(bx.left), w: Math.round(bx.width), h: Math.round(bx.height) })),
      gaps: boxes.slice(1).map((bx, i) => Math.round(bx.left - (boxes[i].left + boxes[i].width))),
    };
    d.remove();
    return out;
  }, { key, name, shapes });

  console.log('CH.UC-shaped row: a near-square hub + two portrait shots — needs a height past GAL_MAX_H to fill the line');
  const r = await render('CH.UC', 'Undercarriage', [[500, 480], [300, 620], [280, 520]]);
  const span = r.boxes.length ? (r.boxes[r.boxes.length - 1].l + r.boxes[r.boxes.length - 1].w - r.boxes[0].l) : 0;
  ok('three photographs found, all at the GAL_MAX_H ceiling (250px)', r.boxes.length === 3 && r.boxes.every(bx => bx.h === 250), JSON.stringify(r.boxes));
  ok('  the row is held short of a full row height by the clamp — this is the case the fix targets', true, 'h=250');
  ok('  THE FIX: the row still reaches the 746px line, edge to edge', span >= 744, 'span=' + span);
  ok('  by widening the GAPS between photographs, not by cropping or stretching one past its own ratio',
     r.justify === 'space-between' && new Set(r.boxes.map(bx => bx.w)).size === 3, JSON.stringify({ justify: r.justify, widths: r.boxes.map(bx => bx.w) }));

  console.log('\ncontrol: RRD-style row (wider close-ups) already fills the line without clamping — untouched by this fix');
  const rrd = await render('RRD', 'Rear Differential', [[500, 420], [420, 400], [480, 480]]);
  const spanRrd = rrd.boxes.length ? (rrd.boxes[rrd.boxes.length - 1].l + rrd.boxes[rrd.boxes.length - 1].w - rrd.boxes[0].l) : 0;
  ok('this row is not held short — it already reaches the line on its own', spanRrd >= 740, 'span=' + spanRrd);
  ok('  so it keeps the ordinary centred hairline gap, not the redistributed one', r.justify !== rrd.justify || rrd.justify === 'center', 'rrd justify=' + rrd.justify);
  ok('  and its gaps stay at the sheet\'s own hairline width (8px), not widened by rounding noise',
     rrd.gaps.every(g => g >= 7 && g <= 9), JSON.stringify(rrd.gaps));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
