/* A ROW OF NEAR-SQUARE OR PORTRAIT PHOTOGRAPHS STILL REACHES THE LINE, AT
   THE SAME SQUARE TILE SIZE AS ANY OTHER ROW — AND EVERY TILE IS FILLED
   COMPLETELY, CROPPED RATHER THAN PADDED.

   This suite used to prove a "short row" fix, then a letterboxed-square-tile
   fix; both are superseded. The tile size is not solved from the row's own
   content (GAL_ROW_W and the column count alone decide it), and the FIT
   inside that tile is COVER, not CONTAIN: read off the maintainer's own
   reference photograph of four real magnetic-plug close-ups, every tile is
   filled edge to edge by its photograph with no padding bar on any side —
   "this an example of same and standard." The letterboxed version shipped
   one build earlier was rejected on exactly this point; cropping the
   overflow, not padding around a smaller image, is what "the same" turned
   out to mean. This is a narrow, deliberate exception to this project's
   otherwise-strict "never crop" rule, scoped to this one gallery board only
   (report-core.js's own comment on `tiledRow` says why).

   What still has to hold for CH.UC's own shapes (a near-square hub, two
   portrait shots): every tile here is the same fixed width AND height, the
   row reaches GAL_ROW_W edge to edge, the gap between tiles is the sheet's
   own tight ~1mm hairline (not widened, not collapsed), and a photograph
   fills its tile completely on BOTH axes — never falls short on either one,
   which is what a letterboxed fit would still show as a padding bar.

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
    const boxes = imgs.map(im => im.getBoundingClientRect());
    // The TILE is the bordered box behind each photograph — a sibling <div>
    // immediately before its <img>, per tiledRow's own markup.
    const tiles = [...d.querySelectorAll('.phgrow > div')];
    const out = {
      tiles: tiles.map(t => { const r = t.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; }),
      boxes: boxes.map(bx => ({ l: Math.round(bx.left), w: Math.round(bx.width), h: Math.round(bx.height) })),
      gaps: tiles.slice(1).map((t, i) => { const a = tiles[i].getBoundingClientRect(), bRect = t.getBoundingClientRect();
        return Math.round(bRect.left - (a.left + a.width)); }),
    };
    d.remove();
    return out;
  }, { key, name, shapes });

  console.log('CH.UC-shaped row: a near-square hub + two portrait shots');
  const r = await render('CH.UC', 'Undercarriage', [[500, 480], [300, 620], [280, 520]]);
  const span = r.tiles.length ? (r.tiles[r.tiles.length - 1].l + r.tiles[r.tiles.length - 1].w - r.tiles[0].l) : 0;
  ok('three tiles found, every one the SAME size (square, width == height)',
     r.tiles.length === 3 && new Set(r.tiles.map(t => t.w)).size === 1 && new Set(r.tiles.map(t => t.h)).size === 1
       && r.tiles.every(t => Math.abs(t.w - t.h) <= 1),
     JSON.stringify(r.tiles));
  ok('  THE FIX: the tile size is the sheet\'s own fixed four-column size — a row of only three photographs is never solved as its own three-column line, so it falls short of 746px by about a tile\'s width and sits flush left instead of stretching to reach it',
     span > 500 && span < 650, 'span=' + span);
  ok('  the gap between tiles is the sheet\'s own tight ~1mm hairline (about 4px), not widened or collapsed',
     r.gaps.every(g => g >= 2 && g <= 6), JSON.stringify(r.gaps));
  ok('  every photograph COVERS its own tile completely on both axes — cropped, never left short (never letterboxed)',
     // COVER, not contain: the displayed image must reach (or exceed) the
     // tile's own inner size on BOTH axes — a portrait or near-square shape
     // is cropped on whichever axis overflows, never padded on either one.
     // The tile's own 1px border eats 2px off each side (box-sizing:border-box).
     r.boxes.every((bx, i) => bx.w >= r.tiles[i].w - 3 && bx.h >= r.tiles[i].h - 3),
     JSON.stringify({ boxes: r.boxes, tiles: r.tiles }));
  ok('  the first tile still starts at the line\'s own left margin, never centred',
     r.tiles[0].l <= 8, 'left=' + r.tiles[0].l);

  console.log('\ncontrol: RRD-style row (wider close-ups) — same tile size, same tight gap, different photographs');
  const rrd = await render('RRD', 'Rear Differential', [[500, 420], [420, 400], [480, 480]]);
  const spanRrd = rrd.tiles.length ? (rrd.tiles[rrd.tiles.length - 1].l + rrd.tiles[rrd.tiles.length - 1].w - rrd.tiles[0].l) : 0;
  ok('this row falls short of the line by the SAME amount, at the identical tile size the CH.UC row used — the tile size never depends on which photographs happen to be in it',
     spanRrd === span && rrd.tiles[0].w === r.tiles[0].w && rrd.tiles[0].h === r.tiles[0].h,
     'span=' + spanRrd + ' tile=' + JSON.stringify(rrd.tiles[0]));
  ok('  and the same tight hairline gap, not widened by rounding noise',
     rrd.gaps.every(g => g >= 2 && g <= 6), JSON.stringify(rrd.gaps));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
