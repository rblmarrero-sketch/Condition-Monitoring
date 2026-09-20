/* FOUR ACROSS IS "AUTO" NOW, EVEN AT FOUR — SO A NARROWER PHOTOGRAPH
   NEVER SITS IN A COLUMN SIZED FOR ITS NEIGHBOUR, WITH A BIG GAP EITHER
   SIDE OF IT.

   The .g4 fix (galorphan.cjs) forced four EQUAL 1fr columns so a
   four-photograph row would fill the sheet edge to edge — correct for the
   pure-landscape case it was built and tested against. Read off TK109's own
   Rear Differential a second time, with photographs that were not
   synthetic uniform swatches: a wide machinery shot, a PORTRAIT close-up of
   a cylindrical part, a wide gasket, a PORTRAIT plug. Equal columns gave
   the portrait photographs a column exactly as wide as their landscape
   neighbours, so each one sat centred with roughly 40px of white on either
   side of it — reported back as "the gap are too much," circled on all
   three joins around the two portrait frames. The same mechanism made a
   wrapped fifth photograph, when it happened to be portrait, look a
   different size from the four landscape ones above it — not a size
   difference at all, a letterbox one.

   The fix is the SAME technique already proven for two or three
   photographs (TK126, galportrait.cjs) extended to four and past it: `auto`
   columns, sized to each photograph's own width, not a forced equal share.
   Measured directly, `auto` does not overflow a fixed-width sheet the way
   naive reasoning suggested when this session first chose 1fr for four
   columns — four wide photographs simply shrink their columns to fit,
   exactly the way four narrower ones do, so a row of genuinely similar
   (landscape) photographs still fills the line edge to edge with the
   sheet's own hairline gap, while a mixed row no longer stretches a
   narrower photograph's column out to its neighbour's width. `auto` also
   replaces the non-gallery board's own 1fr, for the identical reason on
   mpEvidence's findings cards.

   Run: node tests/galmixed4.cjs   (needs tests/ed-srv.cjs on 8093) */
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
  await p.waitForFunction(() => window.CMR && window.html2canvas, { timeout: 20000 });

  const measure = async (gallery, photoShapes) => p.evaluate(async ({ gallery, photoShapes }) => {
    const solid = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
    const colors = [[210,40,40],[30,60,220],[30,180,60],[220,180,20]];
    const photos = photoShapes.map((s, i) => solid(s[0], s[1], colors[i % colors.length]));
    const recs = gallery
      ? [{ equip: 'TK900', clsLabel: 'HT', model: 'X', type: 'MP', typeLabel: 'MP', date: '2026-09-14', by: 'R', smu: '1',
            items: [{ key: 'RRD', name: 'Rear Differential', grade: 2, defect: 'Ferrous debris', action: 'Monitor', photos }] },
          { equip: 'TK900', clsLabel: 'HT', model: 'X', type: 'FC', typeLabel: 'FC', date: '2026-09-14', by: 'R', smu: '1',
            items: [{ key: 'ENG', name: 'Engine Oil Filter', grade: 1 }] }]
      : [{ equip: 'TK901', date: '2026-09-14', type: 'MP', cls: 'HT', by: 'R', smu: '1',
            items: [{ key: 'A', label: 'Plug A', grade: 2, defect: 'debris', action: 'Monitor', photos }] }];
    const secs = window.CMR.sections({ lang: 'en', bi: false, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs });
    const st = document.getElementById('galmixedcss') || (() => { const s = document.createElement('style'); s.id = 'galmixedcss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const sel = gallery ? '.phg.gallery img' : '.cel .phg img';
    const imgs = [...d.querySelectorAll(sel)];
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const boxes = imgs.map(im => im.getBoundingClientRect());
    const gaps = [];
    for (let i = 1; i < boxes.length; i++) gaps.push(Math.round(boxes[i].left - boxes[i - 1].right));
    const cel = imgs[0].closest('.cel');
    const celRect = cel.getBoundingClientRect();
    const canvas = await html2canvas(cel, { scale: 1, backgroundColor: '#ffffff', logging: false });
    const cx = canvas.getContext('2d');
    const sample = (px, py) => { const x = Math.max(0, Math.min(canvas.width - 1, Math.round(px)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(py))); const dat = cx.getImageData(x, y, 1, 1).data; return [dat[0], dat[1], dat[2]]; };
    const rasterColors = boxes.map(bx => sample(bx.left - celRect.left + bx.width / 2, bx.top - celRect.top + bx.height / 2));
    d.remove();
    return { gaps, boxes: boxes.map(bx => ({ l: Math.round(bx.left), w: Math.round(bx.width), h: Math.round(bx.height) })), rasterColors };
  }, { gallery, photoShapes });

  console.log('GALLERY BOARD (TK109-style): 2 landscape + 2 portrait, one row of four');
  const g4 = await measure(true, [[800,600],[600,800],[800,600],[600,800]]);
  ok('four photographs found', g4.boxes.length === 4, JSON.stringify(g4.boxes));
  ok('  every gap is the sheet\'s own hairline (8px), not a big gap around a portrait photo',
     g4.gaps.every(x => x === 8), JSON.stringify(g4.gaps));
  ok('  the two landscape photographs still fill their own ~180px column width', g4.boxes[0].w >= 170 && g4.boxes[2].w >= 170, JSON.stringify(g4.boxes));
  ok('  the two portrait photographs are narrower, not stretched to match', g4.boxes[1].w < 130 && g4.boxes[3].w < 130, JSON.stringify(g4.boxes));
  ok('  all four sit at the standard 135px g4 height', g4.boxes.every(x => x.h === 135), JSON.stringify(g4.boxes));
  ok('  the raster shows each photograph\'s own colour, not a neighbour bleeding through the gap',
     g4.rasterColors.length === 4 && new Set(g4.rasterColors.map(String)).size === 4, JSON.stringify(g4.rasterColors));

  console.log('\nGALLERY BOARD control: four LANDSCAPE photographs still occupy the whole line, minimal gap');
  const gAll = await measure(true, [[800,600],[800,600],[800,600],[800,600]]);
  ok('four photographs, uniform ~180px width, occupy close to the full 746px line',
     gAll.boxes.length === 4 && gAll.boxes.every(x => x.w >= 170 && x.w <= 190),
     JSON.stringify(gAll.boxes));
  ok('  edge-to-edge, hairline gap only', gAll.gaps.every(x => x === 8), JSON.stringify(gAll.gaps));

  console.log('\nNON-GALLERY (mpEvidence) BOARD: 2 landscape + 1 portrait, one plug position');
  const ng = await measure(false, [[800,600],[600,800],[800,600]]);
  ok('three photographs found', ng.boxes.length === 3, JSON.stringify(ng.boxes));
  ok('  every gap is the board\'s own hairline (2px), not stretched wide around the portrait one',
     ng.gaps.every(x => x === 2), JSON.stringify(ng.gaps));
  ok('  the portrait photograph is narrower than its landscape neighbours', ng.boxes[1].w < ng.boxes[0].w, JSON.stringify(ng.boxes));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
