/* A PHOTOGRAPH IN AN ORDINARY BOARD CELL IS LETTERBOXED, NOT STRETCHED, IN
   THE ACTUAL PDF RASTER — html2canvas honours neither object-fit nor
   aspect-ratio, and #rptRoot .cel .phg img (report-core.js) carried both:
   width:100%;aspect-ratio:4/3;object-fit:contain. On screen that boxed a
   photograph politely; in the FILE the browser has nothing left to derive
   a height from once html2canvas ignores aspect-ratio, so it fell back to
   the box's own CSS height (from the ignored ratio) and stretched whatever
   image was inside it to fill that box edge to edge — a ~2x horizontal
   squeeze on a portrait frame in a landscape-shaped cell. Confirmed by two
   independent report-quality-sweep agents on two different round types
   (MP's mpEvidence board, a LUBE compartment board) rasterising a real
   compartment cell with the bundled html2canvas and sampling pure fill
   colour at every edge of the box — zero letterbox trace.

   The fix mirrors the gallery rule one section above it in the same
   file (.cel .phg.gallery img, fixed for the identical reason at build 421):
   width:auto;height:auto;max-width:100%;max-height:182px, no aspect-ratio,
   no object-fit — the photograph keeps its own natural proportions and is
   vertically centred by the grid container (.cel .phg{align-items:center})
   instead of being told to fill a box it was never really inside. (The
   container's horizontal alignment moved from centred to left-justified
   later — see the same rule's own comment — which this suite's own
   assertions never depended on.)

   This suite renders a REAL mpEvidence board (two full-bleed, solid-colour
   photographs — one portrait blue, one landscape red — so any stretch is
   trivially visible) and rasterises it with the actual bundled
   html2canvas.min.js, the same technique tests/bodyflatten.cjs already
   uses for exactly this reason: the live DOM was correct before every one
   of these bugs shipped, so only the raster can catch this class of
   defect.

   Run: node tests/phgstretch.cjs [port]   (needs tests/ed-srv.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  const solid = (w, h, rgb) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h);
    return c.toDataURL('image/png');
  };
  const portrait = solid(300, 600, [30, 60, 220]);   // pure blue, ratio 0.5
  const landscape = solid(600, 300, [210, 40, 40]);  // pure red, ratio 2
  window.CMDash.importRecords([{
    equip: 'TK900', date: '2026-09-18', type: 'MP', cls: 'HT', by: 'Rayanov', smu: '5000',
    items: [{ key: '4E', label: 'Left Rear Final Drive', grade: 3, defect: 'Ferrous debris',
      action: 'Monitor / re-inspect next PM', photos: [portrait, landscape] }],
  }]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1200 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR && window.CMReport && window.html2canvas, { timeout: 20000 });
  await p.waitForTimeout(800);
  await p.evaluate(SEED);
  await p.waitForTimeout(300);

  const r = await p.evaluate(async () => {
    const secs = CMReport.sectionsFor('one', 'TK900|2026-09-18|MP', { lang: 'en', photos: true });
    const st = document.createElement('style'); st.textContent = CMR.CSS; document.head.appendChild(st);
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:relative;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);

    const imgs = [...d.querySelectorAll('.cel .phg img')];
    // wait for both photographs to actually decode before measuring or
    // rasterising — an unloaded <img> under width:auto;height:auto has no
    // intrinsic box at all, unlike the old width:100% rule this replaces.
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

    const cell = d.querySelector('.cel');
    const cellRect = cell.getBoundingClientRect();
    const boxes = imgs.map(im => im.getBoundingClientRect());
    const ratios = boxes.map(bx => bx.width / bx.height);

    const canvas = await html2canvas(cell, { scale: 1, backgroundColor: '#ffffff', logging: false });
    const cx = canvas.getContext('2d');
    const sample = (px, py) => {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(px)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(py)));
      const dat = cx.getImageData(x, y, 1, 1).data;
      return [dat[0], dat[1], dat[2]];
    };
    // Sample each photograph's own reported centre (should be its own pure
    // colour) and a point OUTSIDE its own box but still inside the grid
    // column allotted to it (should be background, not stretched photo
    // colour, if the fix holds — that column is wider than a 182px-tall
    // photograph's own natural width leaves it).
    const toCanvas = (px, py) => ({ x: px - cellRect.left, y: py - cellRect.top });
    const centres = boxes.map(bx => sample(...Object.values(toCanvas(bx.left + bx.width / 2, bx.top + bx.height / 2))));
    // A point just past each image's own right edge, still on the same row,
    // inside the .phg grid track — where the pre-fix width:100% rule would
    // have painted the SAME photograph's colour (stretched to fill it).
    const pastEdge = boxes.map(bx => sample(...Object.values(toCanvas(bx.right + 12, bx.top + bx.height / 2))));

    d.remove(); st.remove();
    return { ratios, centres, pastEdge, n: imgs.length, cellW: cellRect.width };
  });

  ok('both photographs rendered', r.n === 2, JSON.stringify(r.n));
  ok('the portrait photograph keeps its own ~0.5 aspect ratio (not squeezed square/wide)',
     r.ratios[0] > 0.3 && r.ratios[0] < 0.7, 'ratio=' + r.ratios[0].toFixed(2));
  ok('the landscape photograph keeps its own ~2.0 aspect ratio (not squeezed to 4:3)',
     r.ratios[1] > 1.6 && r.ratios[1] < 2.4, 'ratio=' + r.ratios[1].toFixed(2));

  const isBlue = (rgb) => rgb[2] > 150 && rgb[2] - rgb[0] > 60 && rgb[2] - rgb[1] > 60;
  const isRed = (rgb) => rgb[0] > 150 && rgb[0] - rgb[1] > 60 && rgb[0] - rgb[2] > 60;
  const isBackground = (rgb) => !isBlue(rgb) && !isRed(rgb);

  ok('the RASTER (not just the DOM) shows the portrait photograph\'s own colour at its centre',
     isBlue(r.centres[0]), 'rgb=' + r.centres[0].join(','));
  ok('the RASTER shows the landscape photograph\'s own colour at its centre',
     isRed(r.centres[1]), 'rgb=' + r.centres[1].join(','));
  /* Columns are auto-sized to each photograph's own width now (report-core.js,
     the same technique galmixed4.cjs proves for a mixed four-across row), so
     the portrait photograph's column no longer carries the slack space the
     old equal-width column had — its landscape neighbour legitimately sits
     close beside it. What still has to be true is that this is NOT the
     portrait's own colour stretched past its edge to fill a column: past the
     edge is either background or the genuinely adjacent photograph, never
     blue again. */
  ok('THE FIX: past the portrait photograph\'s own right edge is its neighbour or background, never its own colour stretched to fill a column',
     !isBlue(r.pastEdge[0]), 'rgb=' + r.pastEdge[0].join(','));
  ok('  and past the landscape photograph\'s own right edge is background, never its own colour stretched to fill a column',
     !isRed(r.pastEdge[1]), 'rgb=' + r.pastEdge[1].join(','));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
