/* A FULL ROW OF THREE OR FOUR PHOTOGRAPHS FILLS THE SHEET'S OWN LINE, NEVER
   CROPPED, NEVER STRETCHED OUT OF ITS OWN SHAPE — WHATEVER THE PHOTOGRAPHS
   ACTUALLY LOOK LIKE.

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

   The fix (report-core.js's justifiedH/justifiedRow, next to gridCols) is a
   JUSTIFIED row: solve for the one shared height that makes the row's own
   photographs, each kept at its own untouched aspect ratio, sum to the
   sheet's 746px content width. A row of near-square or portrait content
   needs a TALLER shared height to reach the same width four wide landscape
   photographs already reach at a shorter one — same rule, same width,
   because the height is solved for the row rather than assumed to be
   135px or 182px.

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

  const render = async (key, name, shapes) => p.evaluate(async ({ key, name, shapes }) => {
    const jpeg = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.92); };
    const colors = [[210,40,40],[30,60,220],[30,180,60],[220,180,20],[160,30,200],[40,180,180]];
    const photos = shapes.map((s, i) => jpeg(s[0], s[1], colors[i % colors.length]));
    const recs = [
      { equip: 'TK900', clsLabel: 'HT', model: 'X', type: 'MP', typeLabel: 'MP', date: '2026-09-14', by: 'R', smu: '1',
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
      rasterColors,
    };
    d.remove();
    return out;
  }, { key, name, shapes });

  console.log('TK109\'s RRD (four real, mixed-shape close-ups): fills the same line CH.BY\'s tray photos do');
  const rrd = await render('RRD', 'Rear Differential', [[500, 420], [420, 560], [480, 480], [400, 560]]);
  const span = (r) => r.boxes[r.boxes.length - 1].l + r.boxes[r.boxes.length - 1].w - r.boxes[0].l;
  ok('four photographs, one justified row', rrd.boxes.length === 4 && rrd.rowCount === 1 && /\bg3plus\b/.test(rrd.boardClass), JSON.stringify(rrd.boxes));
  ok('  every photograph keeps its own aspect ratio (nothing cropped, nothing stretched to a shared width)',
     new Set(rrd.boxes.map(b => b.w)).size > 1 && new Set(rrd.boxes.map(b => b.h)).size === 1, JSON.stringify(rrd.boxes));
  ok('  THE FIX: the row fills essentially the whole 746px line', span(rrd) > 720, 'span=' + span(rrd));
  ok('  the raster shows each photograph in its own place, no bleed across the hairline gaps',
     new Set(rrd.rasterColors.map(String)).size === 4, JSON.stringify(rrd.rasterColors));

  console.log('\nCH.BY-style (four wide landscape tray shots): fills the SAME line, at its own (shorter) height');
  const chby = await render('CH.BY', 'Dump Body', [[1200, 800], [1200, 800], [1200, 800], [1200, 800]]);
  ok('four photographs, one justified row, uniform width', chby.boxes.length === 4 && new Set(chby.boxes.map(b => b.w)).size === 1, JSON.stringify(chby.boxes));
  ok('  THE FIX: this row ALSO fills essentially the whole 746px line', span(chby) > 720, 'span=' + span(chby));
  ok('  at a shorter height than the mixed-shape row above (landscape content needs less height to reach the same width)',
     chby.boxes[0].h < rrd.boxes[0].h, 'chby h=' + chby.boxes[0].h + ' rrd h=' + rrd.boxes[0].h);

  console.log('\nA remainder past a full row of four adopts that row\'s own height, not an independent one');
  const five = await render('RRD', 'Rear Differential', [[500, 420], [420, 560], [480, 480], [400, 560], [600, 450]]);
  ok('five photographs, two rows', five.boxes.length === 5 && five.rowCount === 2, JSON.stringify(five.boxes));
  ok('  the first four match the four-photograph case exactly', five.boxes.slice(0, 4).every((b, i) => b.w === rrd.boxes[i].w && b.h === rrd.boxes[i].h), JSON.stringify(five.boxes));
  ok('  THE FIX: the fifth photograph is the SAME height as the row above it, not independently stretched to fill the line by itself',
     five.boxes[4].h === five.boxes[0].h, JSON.stringify(five.boxes[4]));

  console.log('\nA lone photograph, and a pair, are still NOT justified to the line (photogallerysize.cjs, galportrait.cjs, untouched)');
  const one = await render('RRD', 'Rear Differential', [[500, 420]]);
  ok('one photograph is a standard tile, not stretched to the line', one.boxes.length === 1 && !/\bg3plus\b/.test(one.boardClass) && span(one) < 300, JSON.stringify(one));
  const two = await render('RRD', 'Rear Differential', [[420, 560], [400, 560]]);
  ok('two portrait photographs pack and centre, not justified to the line', two.boxes.length === 2 && !/\bg3plus\b/.test(two.boardClass) && span(two) < 400, JSON.stringify(two));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
