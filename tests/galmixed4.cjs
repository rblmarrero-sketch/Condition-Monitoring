/* A ROW OF FOUR NEVER STRETCHES A PHOTOGRAPH OUT OF ITS OWN SHAPE — AND, AS
   OF THE SQUARE-TILE REDESIGN, NEVER SIZES ITS TILE FROM THE PHOTOGRAPHS
   EITHER.

   This suite has tracked the SAME underlying defect through three
   redesigns now. The .g4 fix (galorphan.cjs) forced four EQUAL 1fr columns
   so a four-photograph row would fill the sheet edge to edge — correct for
   the pure-landscape case it was built and tested against, wrong for
   TK109's own Rear Differential a second time: a wide machinery shot, a
   PORTRAIT cylindrical part, a wide gasket, a PORTRAIT plug. Equal columns
   gave each portrait photograph a column as wide as its landscape
   neighbours, reported back as "the gap are too much." `auto` columns
   fixed that, then a JUSTIFIED row (solving one shared HEIGHT so the row's
   own photographs summed to 746px) fixed the next report off the same
   position — but a THIRD and FOURTH real report (TK154, TK117, 2026-09-22)
   asked for the tiles to be the SAME SIZE outright, not merely the same
   line width at whatever height the row's own content happened to need:
   "the width of photos are not the same, they should be equal or resize to
   be equal." `tileSize`/`tiledRow` (report-core.js) now give every tile in
   a row the identical SQUARE footprint — derived purely from the sheet's
   746px width and the column count, never from the row's own photographs —
   and letterbox each photograph inside its own tile, centred, at the
   largest size that keeps its true aspect ratio. The gap between tiles is
   the sheet's own tight ~1mm hairline (about 4px at this document's 105
   CSS-px-per-inch baseline), asked for by name to replace the older 8px.

   One further reversal since: a letterboxed fit — fitting each photograph
   INSIDE its own tile, padded on the axis that doesn't match — was itself
   rejected on a real reference photograph the maintainer sent of four
   actual magnetic-plug close-ups, every tile filled completely with no
   padding bar on any side: "this an example of same and standard." The fit
   is COVER now, not CONTAIN — a photograph fills its tile on both axes and
   whatever does not fit is cropped — and a further instruction made this
   explicit for every round type, not just Magnetic Plug: the tile size is
   solved for FOUR columns always (`GAL_TILE_COLS`, report-core.js), never
   from how many photographs a particular row actually holds.

   The non-gallery (mpEvidence) board keeps the earlier `auto`-column fix,
   unchanged here — its own board width varies with how many sibling
   positions share a row, and it was never asked to become uniform tiles or
   cropped photographs; this is a narrow exception to this project's
   "never crop" rule, scoped to the ≥3-photo gallery board alone.

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
    const tileEls = gallery ? [...d.querySelectorAll('.phgrow > div')] : [];
    const tiles = tileEls.map(t => t.getBoundingClientRect());
    const gapEls = gallery ? tiles : boxes;
    const gaps = [];
    for (let i = 1; i < gapEls.length; i++) gaps.push(Math.round(gapEls[i].left - gapEls[i - 1].right));
    const cel = imgs[0].closest('.cel');
    const celRect = cel.getBoundingClientRect();
    const canvas = await html2canvas(cel, { scale: 1, backgroundColor: '#ffffff', logging: false });
    const cx = canvas.getContext('2d');
    const sample = (px, py) => { const x = Math.max(0, Math.min(canvas.width - 1, Math.round(px)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(py))); const dat = cx.getImageData(x, y, 1, 1).data; return [dat[0], dat[1], dat[2]]; };
    const rasterColors = boxes.map(bx => sample(bx.left - celRect.left + bx.width / 2, bx.top - celRect.top + bx.height / 2));
    d.remove();
    return { gaps, boxes: boxes.map(bx => ({ l: Math.round(bx.left), w: Math.round(bx.width), h: Math.round(bx.height) })),
             tiles: tiles.map(t => ({ l: Math.round(t.left), w: Math.round(t.width), h: Math.round(t.height) })), rasterColors };
  }, { gallery, photoShapes });

  console.log('GALLERY BOARD (TK109-style): 2 landscape + 2 portrait, one row of four');
  const g4 = await measure(true, [[800,600],[600,800],[800,600],[600,800]]);
  ok('four photographs found', g4.boxes.length === 4, JSON.stringify(g4.boxes));
  ok('  every gap between tiles is the sheet\'s own tight ~1mm hairline (about 4px), not a big gap around a portrait photo',
     g4.gaps.every(x => x >= 2 && x <= 6), JSON.stringify(g4.gaps));
  /* Every tile is a SQUARE now (tileSize/tiledRow, report-core.js) — sized
     purely from the sheet's own width and a FIXED four-column count, never
     from what the row's own photographs look like or how many of them there
     are. A landscape and a portrait photograph therefore get the IDENTICAL
     tile footprint; what still varies is how far each photograph's own
     COVER-fit image overflows (and is cropped) on its non-filled axis. */
  ok('  all four tiles are the SAME square size (landscape and portrait alike — the tile no longer depends on the photograph)',
     g4.tiles.length === 4 && new Set(g4.tiles.map(t => t.w)).size === 1 && new Set(g4.tiles.map(t => t.h)).size === 1
       && g4.tiles.every(t => Math.abs(t.w - t.h) <= 1),
     JSON.stringify(g4.tiles));
  ok('  the two landscape photographs fill their tile\'s height and overflow width; the two portrait ones fill the tile\'s width and overflow height — COVER, cropped, never left short on either axis (never letterboxed)',
     g4.boxes.every((bx, i) => bx.w >= g4.tiles[i].w - 3 && bx.h >= g4.tiles[i].h - 3)
       && g4.boxes[1].w < g4.boxes[0].w && g4.boxes[3].w < g4.boxes[2].w,
     JSON.stringify({ boxes: g4.boxes, tiles: g4.tiles }));
  ok('  the raster shows each photograph\'s own colour, not a neighbour bleeding through the gap',
     g4.rasterColors.length === 4 && new Set(g4.rasterColors.map(String)).size === 4, JSON.stringify(g4.rasterColors));

  console.log('\nGALLERY BOARD control: four LANDSCAPE photographs get the IDENTICAL tile size as the mixed row above');
  const gAll = await measure(true, [[800,600],[800,600],[800,600],[800,600]]);
  ok('four photographs, uniform tile size', gAll.tiles.length === 4 && new Set(gAll.tiles.map(t => t.w)).size === 1, JSON.stringify(gAll.tiles));
  ok('  edge-to-edge, tight hairline gap only', gAll.gaps.every(x => x >= 2 && x <= 6), JSON.stringify(gAll.gaps));
  ok('  THE FIX, side by side: the mixed row above and this pure-landscape row both fill the same 746px line, at the SAME tile size — not merely the same width at two different heights',
     (g4.tiles[3].l + g4.tiles[3].w - g4.tiles[0].l) > 700 && (gAll.tiles[3].l + gAll.tiles[3].w - gAll.tiles[0].l) > 700
       && g4.tiles[0].h === gAll.tiles[0].h && g4.tiles[0].w === gAll.tiles[0].w,
     JSON.stringify({ mixedRowSpan: g4.tiles[3].l + g4.tiles[3].w - g4.tiles[0].l, mixedTile: g4.tiles[0],
                       landscapeRowSpan: gAll.tiles[3].l + gAll.tiles[3].w - gAll.tiles[0].l, landscapeTile: gAll.tiles[0] }));

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
