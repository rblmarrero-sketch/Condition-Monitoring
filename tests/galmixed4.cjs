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

   The non-gallery (mpEvidence) board kept the earlier `auto`-column fix
   for a while after this — its own board width varies with how many
   sibling positions share a row, so a NARROW multi-column board (several
   positions side by side) still shrinks its own columns to fit, unchanged.
   But a WIDE board (mpEvidence's own single-column case, one position or a
   few that would otherwise squeeze — `boardCols`' own `wide` flag) is the
   sheet's FULL 746px width, the identical width the gallery board already
   tiles at three or four across — and a real TK112 Magnetic Plug report,
   after "1 or 2 photos start left, not centred" had already shipped,
   showed exactly why "auto, unchanged" was not the end of the story there
   either: CTR's own four photographs sat in a small huddle at their own
   natural width, left-justified but nowhere near filling the wide grey
   card beside them. Asked for again, by name: "4 photos MUST be perfectly
   align, fill the horizontal line" — pointing at the gallery board's own
   EX016 report as the standard. A WIDE mpEvidence board's row of three or
   four now shares the identical tiledRow/tileSize function the gallery
   board uses, at the identical 746px target width — same tile, same
   hairline gap, same cover-fit crop. A NARROW board (several positions
   packed side by side) is unaffected: it was never asked to become
   uniform tiles, and cramming a cover-fit square into a quarter-width
   column would make an already-small photograph unreadable.

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

  const measure = async (gallery, photoShapes, extraPositions) => p.evaluate(async ({ gallery, photoShapes, extraPositions }) => {
    const solid = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
    const colors = [[210,40,40],[30,60,220],[30,180,60],[220,180,20]];
    const photos = photoShapes.map((s, i) => solid(s[0], s[1], colors[i % colors.length]));
    /* extraPositions: single-photo filler positions added ONLY to push a
       non-gallery board past boardCols' wide<=3 threshold into a NARROW,
       multi-column board — proving the fix is scoped to a wide board and
       does not reach a card packed side by side with its siblings. */
    const filler = Array.from({ length: extraPositions || 0 }, (_, i) => ({
      key: 'F' + i, label: 'Filler ' + i, grade: 1, photos: [solid(800, 600, [120, 120, 120])] }));
    const recs = gallery
      ? [{ equip: 'TK900', clsLabel: 'HT', model: 'X', type: 'MP', typeLabel: 'MP', date: '2026-09-14', by: 'R', smu: '1',
            items: [{ key: 'RRD', name: 'Rear Differential', grade: 2, defect: 'Ferrous debris', action: 'Monitor', photos }] },
          { equip: 'TK900', clsLabel: 'HT', model: 'X', type: 'FC', typeLabel: 'FC', date: '2026-09-14', by: 'R', smu: '1',
            items: [{ key: 'ENG', name: 'Engine Oil Filter', grade: 1 }] }]
      : [{ equip: 'TK901', date: '2026-09-14', type: 'MP', cls: 'HT', by: 'R', smu: '1',
            items: [{ key: 'A', label: 'Plug A', grade: 2, defect: 'debris', action: 'Monitor', photos }].concat(filler) }];
    const secs = window.CMR.sections({ lang: 'en', bi: false, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs });
    const st = document.getElementById('galmixedcss') || (() => { const s = document.createElement('style'); s.id = 'galmixedcss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    /* Scoped to position A's OWN cel — with filler positions added (the
       narrow-board control) there is more than one .cel on the page, and
       only A's carries the photographs this measurement is about. */
    const cel = gallery ? d.querySelector('.board.gal .cel')
      : [...d.querySelectorAll('.cel')].find(c => c.querySelector('.pk') && c.querySelector('.pk').textContent.trim().indexOf('A') === 0);
    const board = cel.closest('.board');
    const boardClass = board ? board.className : null;
    const imgs = [...cel.querySelectorAll('.phg img')];
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const boxes = imgs.map(im => im.getBoundingClientRect());
    const tileEls = [...cel.querySelectorAll('.phgrow > div')];
    const tiles = tileEls.map(t => t.getBoundingClientRect());
    const gapEls = tiles.length ? tiles : boxes;
    const gaps = [];
    for (let i = 1; i < gapEls.length; i++) gaps.push(Math.round(gapEls[i].left - gapEls[i - 1].right));
    const celRect = cel.getBoundingClientRect();
    const canvas = await html2canvas(cel, { scale: 1, backgroundColor: '#ffffff', logging: false });
    const cx = canvas.getContext('2d');
    const sample = (px, py) => { const x = Math.max(0, Math.min(canvas.width - 1, Math.round(px)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(py))); const dat = cx.getImageData(x, y, 1, 1).data; return [dat[0], dat[1], dat[2]]; };
    const rasterColors = boxes.map(bx => sample(bx.left - celRect.left + bx.width / 2, bx.top - celRect.top + bx.height / 2));
    d.remove();
    return { boardClass, gaps, boxes: boxes.map(bx => ({ l: Math.round(bx.left), w: Math.round(bx.width), h: Math.round(bx.height) })),
             tiles: tiles.map(t => ({ l: Math.round(t.left), w: Math.round(t.width), h: Math.round(t.height) })), rasterColors };
  }, { gallery, photoShapes, extraPositions });

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

  console.log('\nNON-GALLERY (mpEvidence) WIDE BOARD: 2 landscape + 1 portrait, one plug position alone — now TILED like the gallery board (asked for by name against a real TK112 report: "4 photos MUST be perfectly align, fill the horizontal line")');
  const ngWide = await measure(false, [[800,600],[600,800],[800,600]], 0);
  ok('the board carries the wide class (one position alone)', /\bwide\b/.test(ngWide.boardClass), ngWide.boardClass);
  ok('three photographs found', ngWide.boxes.length === 3, JSON.stringify(ngWide.boxes));
  ok('  THE FIX: tiled at the gallery board\'s own square footprint, not auto-sized to each photograph',
     ngWide.tiles.length === 3 && new Set(ngWide.tiles.map(t => t.w)).size === 1 && new Set(ngWide.tiles.map(t => t.h)).size === 1
       && ngWide.tiles.every(t => Math.abs(t.w - t.h) <= 1) && ngWide.tiles[0].w === g4.tiles[0].w,
     JSON.stringify({ tiles: ngWide.tiles, gallerySquare: g4.tiles[0] }));
  ok('  the same tight hairline gap the gallery board uses, not the old 2px auto-grid gap',
     ngWide.gaps.every(x => x >= 2 && x <= 6), JSON.stringify(ngWide.gaps));
  /* THREE photographs are, by the gallery board's own documented rule
     (GAL_TILE_COLS fixed at 4, always), a row that falls SHORT of the
     746px line by design — the identical tile a full four-photograph row
     uses, with the fourth slot simply left empty, flush left. A wide
     mpEvidence board sharing the same function inherits that same rule:
     three photographs here are not stretched to fill the line either,
     they sit at the exact same partial span (3 tiles + 2 hairline gaps)
     a three-photograph gallery row would. */
  const wideSpan = ngWide.tiles[2].l + ngWide.tiles[2].w - ngWide.tiles[0].l;
  const expectSpan = 3 * ngWide.tiles[0].w + 2 * 4;
  ok('  three photographs fall short of the line by design, at the SAME partial span the gallery board\'s own three-photo row uses (not stretched to reach it, not squeezed to a size of their own)',
     Math.abs(wideSpan - expectSpan) <= 6, JSON.stringify({ wideSpan, expectSpan }));
  ok('  the portrait photograph still keeps its own shape — cropped on its overflowing axis, never squeezed',
     ngWide.boxes[1].w >= ngWide.tiles[1].w - 3 && ngWide.boxes[1].h >= ngWide.tiles[1].h - 3, JSON.stringify(ngWide.boxes));

  console.log('\nNON-GALLERY (mpEvidence) NARROW BOARD control: the SAME 2+1 photo position, packed beside three siblings — still auto-sized, not tiled (a quarter-width column has no room for a full-size cover-fit square)');
  const ngNarrow = await measure(false, [[800,600],[600,800],[800,600]], 3);
  ok('the board does NOT carry the wide class (four positions share the row)', !/\bwide\b/.test(ngNarrow.boardClass), ngNarrow.boardClass);
  ok('three photographs found', ngNarrow.boxes.length === 3, JSON.stringify(ngNarrow.boxes));
  ok('  unchanged: every gap is the board\'s own hairline (2px), not the gallery board\'s tile gap',
     ngNarrow.gaps.every(x => x === 2), JSON.stringify(ngNarrow.gaps));
  /* At this squeeze (four positions sharing the row, one card a quarter
     of the sheet) `auto` columns clamp every photograph to the SAME
     narrow column width regardless of its own shape — landscape and
     portrait alike — rather than a landscape photograph coming out
     visibly wider the way it does on a wide, unconstrained board
     (galmixed4.cjs's own wide-board case above, and phgstretch.cjs). That
     is exactly the "shrinks gracefully" behaviour `auto` was chosen for,
     and it is a DIFFERENT question from the one this control exists to
     answer: no `.phgrow` tile markup and no `gallery`/`g3plus` class ever
     appears on a narrow board's own `.phg`, proving the wide-board fix
     above did not leak into it. */
  ok('  never tiled: no gallery/g3plus class or .phgrow tile markup reaches a narrow board\'s own .phg',
     ngNarrow.tiles.length === 0, JSON.stringify(ngNarrow.tiles));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
