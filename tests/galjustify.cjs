/* A FULL ROW OF THREE OR FOUR PHOTOGRAPHS FILLS THE SHEET'S OWN LINE AT ONE
   UNIFORM SQUARE TILE SIZE, CROPPED TO FILL IT COMPLETELY — WHATEVER THE
   PHOTOGRAPHS ACTUALLY LOOK LIKE, AND WHATEVER ROUND TYPE THEY BELONG TO.

   galorphan.cjs and galmixed4.cjs prove the column-count and gap parts of
   this rule with synthetic, uniform swatches. This suite proves the part
   those cannot: REAL, VARIED photographs — read off TK109's own report a
   third time, real close-up photographs of a Rear Differential plug (a
   near-square hub shot, a portrait cylindrical part, a round gasket, a
   portrait plug) that packed to a fraction of the sheet next to the SAME
   machine's Dump Body tray photographs, four wide landscape shots, that
   filled it — "the RRD photos since its already 4 then it should occupy
   the whole line like CH.BY." Two positions, the same four-per-line rule,
   two different line widths on the printed page.

   The fix this file originally proved (report-core.js's justifiedH, one
   shared height) and its first replacement (a letterboxed square tile) are
   both superseded now. Two real reports (TK154, TK117, 2026-09-22) asked
   for equal-size photographs; the maintainer's own reference photograph of
   four real magnetic-plug close-ups then settled HOW they are made equal —
   every tile filled completely, cropped, no padding bar on any side — and
   a further instruction made explicit that the rule is not specific to any
   one round type: every gallery row on every type is a slot in a FOUR-
   COLUMN grid, always, whether the finding carries four photographs, three,
   or a remainder — `GAL_TILE_COLS` is fixed at 4 in `tileSize`
   (report-core.js), never solved from the row's own count. So RRD's mixed
   close-ups (three photographs) and CH.BY's four wide tray shots now get
   the IDENTICAL tile — not merely the same LINE WIDTH, the same TILE, at
   the same size a four-photograph row anywhere else on this document uses.

   A further instruction generalised this past a full row entirely: a
   third real TK112 report circled a TWO-photograph position (FRD) sitting
   at a visibly smaller, unconstrained size next to sibling positions'
   correctly-tiled four-photograph rows on the SAME sheet, and asked
   directly to "standardize the width and height of all photos in all
   components inspected, for all type of inspections... if a photo is 1 to
   3, it will follow the height and width of the photos that has already
   4." One and two photographs on a wide board are tiled now too — the
   IDENTICAL square footprint, cover-fit, that three and four already use;
   the fixed four-column size simply has one or two of its slots occupied.

   Getting there costs no async step: every photograph here is already a
   JPEG or PNG data URI by the time cell() sees it, and photoDims() reads
   the format's own header bytes (a JPEG SOF marker, a PNG IHDR chunk)
   through atob() on a short prefix of the base64 text — no Image() decode,
   because cell() is a synchronous string builder called from deep inside
   synchronous code throughout this file. This suite renders through REAL
   JPEG data URIs (canvas.toDataURL('image/jpeg', ...)), not PNGs, so the
   JPEG branch of that parser is the one actually exercised end to end.

   Run: node tests/galjustify.cjs   (needs tests/ed-srv.cjs on 8093) */
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

  const render = async (key, name, shapes, type) => p.evaluate(async ({ key, name, shapes, type }) => {
    const jpeg = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.92); };
    const colors = [[210,40,40],[30,60,220],[30,180,60],[220,180,20],[160,30,200],[40,180,180]];
    const photos = shapes.map((s, i) => jpeg(s[0], s[1], colors[i % colors.length]));
    const ty = type || 'MP';
    const recs = [
      { equip: 'TK900', clsLabel: 'HT', model: 'X', type: ty, typeLabel: ty, date: '2026-09-14', by: 'R', smu: '1',
        items: [{ key, name, grade: 2, defect: 'Ferrous debris', action: 'Monitor', photos }] },
      { equip: 'TK900', clsLabel: 'HT', model: 'X', type: 'FC', typeLabel: 'FC', date: '2026-09-14', by: 'R', smu: '1',
        items: [{ key: 'ENG', name: 'Engine Oil Filter', grade: 1 }] },
    ];
    const secs = window.CMR.sections({ lang: 'en', bi: false, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs });
    const st = document.getElementById('gjcss') || (() => { const s = document.createElement('style'); s.id = 'gjcss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const imgs = [...d.querySelectorAll('.phg.gallery img')];
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const board = d.querySelector('.phg.gallery');
    const rows = [...d.querySelectorAll('.phgrow')];
    const tiles = [...d.querySelectorAll('.phgrow > div')];
    const boxes = imgs.map(im => im.getBoundingClientRect());
    const cel = imgs[0].closest('.cel');
    const celRect = cel.getBoundingClientRect();
    const canvas = await html2canvas(cel, { scale: 1, backgroundColor: '#ffffff', logging: false });
    const cx = canvas.getContext('2d');
    const sample = (px, py) => { const x = Math.max(0, Math.min(canvas.width - 1, Math.round(px)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(py))); const dat = cx.getImageData(x, y, 1, 1).data; return [dat[0], dat[1], dat[2]]; };
    const rasterColors = boxes.map(bx => sample(bx.left - celRect.left + bx.width / 2, bx.top - celRect.top + bx.height / 2));
    const out = {
      boardClass: board.className,
      rowCount: rows.length,
      boxes: boxes.map(bx => ({ l: Math.round(bx.left), w: Math.round(bx.width), h: Math.round(bx.height) })),
      tiles: tiles.map(t => { const r = t.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; }),
      rasterColors,
    };
    d.remove();
    return out;
  }, { key, name, shapes, type });

  console.log('TK109\'s RRD (four real, mixed-shape close-ups): fills the same line, at the same tile size CH.BY\'s tray photos get');
  const rrd = await render('RRD', 'Rear Differential', [[500, 420], [420, 560], [480, 480], [400, 560]]);
  const span = (r) => r.tiles[r.tiles.length - 1].l + r.tiles[r.tiles.length - 1].w - r.tiles[0].l;
  ok('four photographs, one tiled row', rrd.boxes.length === 4 && rrd.rowCount === 1 && /\bg3plus\b/.test(rrd.boardClass), JSON.stringify(rrd.boxes));
  ok('  every tile is the SAME square size (width == height, all four identical)',
     rrd.tiles.length === 4 && new Set(rrd.tiles.map(t => t.w)).size === 1 && new Set(rrd.tiles.map(t => t.h)).size === 1
       && rrd.tiles.every(t => Math.abs(t.w - t.h) <= 1),
     JSON.stringify(rrd.tiles));
  ok('  every photograph COVERS its own tile completely on both axes — cropped to the tile, not stretched out of its own ratio (its natural aspect ratio still decides how far it overflows, so the four displayed sizes differ)',
     new Set(rrd.boxes.map(b => b.w + 'x' + b.h)).size > 1
       && rrd.boxes.every((bx, i) => bx.w >= rrd.tiles[i].w - 3 && bx.h >= rrd.tiles[i].h - 3),
     JSON.stringify({ boxes: rrd.boxes, tiles: rrd.tiles }));
  ok('  THE FIX: the row fills essentially the whole 746px line', span(rrd) > 720, 'span=' + span(rrd));
  ok('  the raster shows each photograph in its own place, no bleed across the hairline gaps',
     new Set(rrd.rasterColors.map(String)).size === 4, JSON.stringify(rrd.rasterColors));

  console.log('\nCH.BY-style (four wide landscape tray shots): fills the SAME line, at the IDENTICAL tile size — not merely the same width at a different height');
  const chby = await render('CH.BY', 'Dump Body', [[1200, 800], [1200, 800], [1200, 800], [1200, 800]]);
  ok('four photographs, one tiled row, uniform tile size', chby.tiles.length === 4 && new Set(chby.tiles.map(t => t.w)).size === 1, JSON.stringify(chby.tiles));
  ok('  THE FIX: this row ALSO fills essentially the whole 746px line', span(chby) > 720, 'span=' + span(chby));
  ok('  at the IDENTICAL tile size as the mixed-shape row above — the field\'s own complaint (two different sizes for the same four-per-line rule) is gone at the root',
     chby.tiles[0].w === rrd.tiles[0].w && chby.tiles[0].h === rrd.tiles[0].h,
     'chby=' + JSON.stringify(chby.tiles[0]) + ' rrd=' + JSON.stringify(rrd.tiles[0]));

  console.log('\nA remainder past a full row of four gets that SAME tile size, not an independent one');
  const five = await render('RRD', 'Rear Differential', [[500, 420], [420, 560], [480, 480], [400, 560], [600, 450]]);
  ok('five photographs, two rows', five.boxes.length === 5 && five.rowCount === 2, JSON.stringify(five.boxes));
  ok('  the first four match the four-photograph case exactly', five.tiles.slice(0, 4).every((t, i) => t.w === rrd.tiles[i].w && t.h === rrd.tiles[i].h), JSON.stringify(five.tiles));
  ok('  THE FIX: the fifth photograph\'s tile is the SAME size as the row above it, not independently sized to fill the line by itself',
     five.tiles[4].w === five.tiles[0].w && five.tiles[4].h === five.tiles[0].h, JSON.stringify(five.tiles[4]));

  console.log('\nTHE FIX: a lone row of THREE photographs (RRD\'s own total, no fourth to fill the line) gets the IDENTICAL tile size as a full row of four — never a bigger, three-column tile — and simply leaves the fourth slot empty, flush left');
  const three = await render('RRD', 'Rear Differential', [[500, 420], [420, 560], [480, 480]]);
  ok('three photographs, one row', three.boxes.length === 3 && three.rowCount === 1 && /\bg3plus\b/.test(three.boardClass), JSON.stringify(three.boxes));
  ok('  the tile size is the SAME four-column size the four- and five-photograph cases above use — not solved from this row\'s own count of three',
     three.tiles.length === 3 && three.tiles.every(t => t.w === rrd.tiles[0].w && t.h === rrd.tiles[0].h),
     'three=' + JSON.stringify(three.tiles[0]) + ' four=' + JSON.stringify(rrd.tiles[0]));
  ok('  the row therefore falls SHORT of the 746px line by about one tile\'s width — it does not stretch three tiles to fill four columns\' worth of space',
     span(three) < span(rrd) - 100, 'span(three)=' + span(three) + ' span(four)=' + span(rrd));
  ok('  the three tiles still start at the line\'s own left margin, never centred to make the shortfall symmetric',
     three.tiles[0].l === rrd.tiles[0].l, 'left=' + three.tiles[0].l);
  ok('  every photograph still covers its own tile completely (cropped), the same as the four-photograph row',
     three.boxes.every((bx, i) => bx.w >= three.tiles[i].w - 3 && bx.h >= three.tiles[i].h - 3),
     JSON.stringify({ boxes: three.boxes, tiles: three.tiles }));

  console.log('\nTHE RULE IS NOT SPECIFIC TO ONE ROUND TYPE: a real INSP (General Inspection) record\'s three-photograph finding gets the IDENTICAL tile size as MP\'s three-photograph row above');
  const insp3 = await render('BRK', 'Brake Assembly', [[900, 700], [640, 900], [820, 820]], 'INSP');
  ok('three photographs on a record whose type is genuinely INSP, not MP — same tile size as the MP case above',
     insp3.tiles.length === 3 && insp3.tiles.every(t => t.w === three.tiles[0].w && t.h === three.tiles[0].h),
     'insp=' + JSON.stringify(insp3.tiles[0]) + ' mp=' + JSON.stringify(three.tiles[0]));

  console.log('\nSINCE STANDARDIZED: a lone photograph, and a pair, are now tiled at the SAME size a full row uses too (galportrait.cjs, galorphan.cjs) — a third real TK112 report circled a two-photograph position sitting visibly smaller than its four-photograph neighbours and asked, by name, for every count from one to a complete set to match');
  const one = await render('RRD', 'Rear Differential', [[500, 420]]);
  ok('one photograph is tiled at the fixed four-column size, flush left — the SAME tile the three- and four-photograph rows above use',
     one.boxes.length === 1 && /\bg3plus\b/.test(one.boardClass) && one.tiles.length === 1
       && one.tiles[0].w === rrd.tiles[0].w && one.tiles[0].h === rrd.tiles[0].h,
     JSON.stringify({ boxes: one.boxes, tile: one.tiles[0], fourTile: rrd.tiles[0] }));
  const two = await render('RRD', 'Rear Differential', [[420, 560], [400, 560]]);
  ok('two portrait photographs are tiled too, at the identical square footprint, not packed at their own natural width',
     two.boxes.length === 2 && /\bg3plus\b/.test(two.boardClass) && two.tiles.length === 2
       && two.tiles.every(t => t.w === rrd.tiles[0].w && t.h === rrd.tiles[0].h),
     JSON.stringify({ tiles: two.tiles, fourTile: rrd.tiles[0] }));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
