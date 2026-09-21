/* A ROW OF FOUR NEVER STRETCHES A NARROWER PHOTOGRAPH TO MATCH ITS
   NEIGHBOUR, WHETHER THE ROW IS EQUAL COLUMNS, AUTO COLUMNS, OR JUSTIFIED.

   This suite has tracked the SAME defect through two fixes now. The .g4
   fix (galorphan.cjs) forced four EQUAL 1fr columns so a four-photograph
   row would fill the sheet edge to edge — correct for the pure-landscape
   case it was built and tested against, wrong for TK109's own Rear
   Differential a second time: a wide machinery shot, a PORTRAIT
   cylindrical part, a wide gasket, a PORTRAIT plug. Equal columns gave
   each portrait photograph a column as wide as its landscape neighbours,
   reported back as "the gap are too much." `auto` columns (this suite's
   own first version) fixed that — but auto sizes a row to whatever its own
   photographs need, which is narrower than the sheet for anything but
   near-4:3 landscape content, so a THIRD report off the same position, real
   photographs this time, showed the identical row of four occupying a
   fraction of the page next to a DIFFERENT position's own four wide tray
   photographs that filled it: "the RRD photos since its already 4 then it
     should occupy the whole line like CH.BY."

   The gallery board's full row of three or four is JUSTIFIED now
   (galorphan.cjs's own comment, galjustify.cjs for the general case): the
   shared row height solves for the row's own photographs so their combined
   width lands on the sheet's 746px content width, whatever the mix of
   orientations. For THIS test's exact mix — two 4:3 landscape, two 3:4
   portrait — that height works out to 173px (722 / (2*4/3 + 2*3/4)); a
   different mix gets a different number, by design, but the landscape
   photographs must still come out wider than the portrait ones at whatever
   height the row settles on, never stretched to match. The non-gallery
   (mpEvidence) board keeps the earlier `auto`-column fix, unchanged here —
   its own board width varies with how many sibling positions share a row,
   which the gallery board's fixed 746px sheet width does not have to
   account for.

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
  /* The row is JUSTIFIED now (galorphan.cjs, galjustify.cjs): the shared
     height solves for the row's own photographs, so it is no longer the
     fixed 135px a pure-landscape row happens to need — for this exact mix
     (two 4:3 landscape, two 3:4 portrait) it works out to 722/(2*4/3+2*3/4)
     = 173px. What must still hold, whatever that number comes out to, is
     that the landscape photographs stay wider than the portrait ones —
     never stretched to match — and that all four share one height. */
  ok('  the two landscape photographs are wider than the two portrait ones, not stretched to match',
     g4.boxes[0].w > g4.boxes[1].w && g4.boxes[2].w > g4.boxes[3].w && g4.boxes[0].w === g4.boxes[2].w && g4.boxes[1].w === g4.boxes[3].w,
     JSON.stringify(g4.boxes));
  ok('  all four share one row height, solved for this row\'s own photographs (173px here)',
     g4.boxes.every(x => x.h === g4.boxes[0].h) && g4.boxes[0].h === 173, JSON.stringify(g4.boxes));
  ok('  the raster shows each photograph\'s own colour, not a neighbour bleeding through the gap',
     g4.rasterColors.length === 4 && new Set(g4.rasterColors.map(String)).size === 4, JSON.stringify(g4.rasterColors));

  console.log('\nGALLERY BOARD control: four LANDSCAPE photographs still occupy the whole line, minimal gap');
  const gAll = await measure(true, [[800,600],[800,600],[800,600],[800,600]]);
  ok('four photographs, uniform ~180px width, occupy close to the full 746px line',
     gAll.boxes.length === 4 && gAll.boxes.every(x => x.w >= 170 && x.w <= 190),
     JSON.stringify(gAll.boxes));
  ok('  edge-to-edge, hairline gap only', gAll.gaps.every(x => x === 8), JSON.stringify(gAll.gaps));
  ok('  THE FIX, side by side: the mixed row above and this pure-landscape row both fill the same 746px line, at their own two different heights',
     (g4.boxes[3].l + g4.boxes[3].w - g4.boxes[0].l) > 700 && (gAll.boxes[3].l + gAll.boxes[3].w - gAll.boxes[0].l) > 700
       && g4.boxes[0].h !== gAll.boxes[0].h,
     JSON.stringify({ mixedRowSpan: g4.boxes[3].l + g4.boxes[3].w - g4.boxes[0].l, mixedH: g4.boxes[0].h,
                       landscapeRowSpan: gAll.boxes[3].l + gAll.boxes[3].w - gAll.boxes[0].l, landscapeH: gAll.boxes[0].h }));

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
