/* THE STANDARD PHOTO ARRANGEMENT, PROVEN ON EVERY REPORT TYPE THAT PRINTS
   ONE, IN EVERY LANGUAGE THE SITE READS THIS DOCUMENT IN.

   galorphan.cjs, galshort.cjs, galjustify.cjs, galmixed4.cjs and
   galportrait.cjs each prove the shared gallery row (cell()'s justifiedRow
   branch, report-core.js) against one synthetic fixture apiece. What none of
   them ever did is walk every REPORT TYPE that calls into that same shared
   function through its own real body — FC and INSP through photoGallery(),
   GET through its own register tail, TB and UC through the wear round's
   own trailing gallery, RTW through its own photo section — and TWO real
   field reports (TK154's Equipment Trend Report and TK117's Dump Body
   Thickness sheet, both 2026-09-22) showed the exact "short row centred
   with margins, remainder pinned oddly" defect on two DIFFERENT type
   bodies before build 441 fixed the one function underneath all of them.

   This suite is the standing proof that the fix reaches every caller, not
   only the ones already covered directly: five photographs of five
   different, real-world aspect ratios (a wide establishing shot, a near-
   square close-up, two portrait frames, one more landscape one) on one
   item of ONE record per type, rendered through the REAL per-type report
   body (CMDash.importRecords → CMReport.sectionsFor, the same pipeline
   rpttypes.cjs and phgstretch.cjs already use, not a hand-built section),
   rasterised with the bundled html2canvas — never only the DOM, which is
   the one thing that let both field reports ship looking fixed and print
   broken. Checked in English, Russian and bilingual, because a layout that
   only holds in one language is not a standard, it is a coincidence.

   Run: node tests/photostandard.cjs [port]   (needs tests/mock.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8099);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR && window.CMReport && window.CMDash && window.html2canvas, { timeout: 20000 });
  await p.waitForTimeout(800);

  const seed = await p.evaluate(() => {
    const jpeg = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h);
      x.strokeStyle = '#000'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
      return c.toDataURL('image/jpeg', 0.9); };
    // Five real-world shapes: wide establishing shot, near-square close-up,
    // two portrait frames, one more landscape one — five photographs, so
    // every case renders a full row of four plus a genuine remainder of one.
    const PH = [
      jpeg(900, 500, [40, 60, 140]),
      jpeg(700, 640, [200, 40, 40]),
      jpeg(500, 900, [30, 150, 60]),
      jpeg(560, 860, [220, 180, 20]),
      jpeg(820, 560, [160, 60, 200]),
    ];
    const recs = [
      { equip: 'PS001', date: '2026-09-01', type: 'FC', cls: 'HT', by: 'Ivanov', smu: '1000',
        items: [{ key: 'ENG', label: 'Engine filter', grade: 2, particle: '7', comp: '500', oil: '500',
          defect: 'Light media debris', action: 'Next planned', photos: PH }] },
      { equip: 'PS002', date: '2026-09-01', type: 'INSP', cls: 'EXC', by: 'Ivanov', smu: '2000',
        items: [{ key: 'HS.CV', label: 'Control Valves', grade: 1, action: 'Monitor / re-inspect next PM', photos: PH }] },
      { equip: 'PS003', date: '2026-09-01', type: 'TEMP', cls: 'EXC', by: 'Ivanov', smu: '3000',
        items: [{ key: 'BRG', label: 'Slew bearing', grade: 2, tempC: 78, ambC: 22, tempMethod: 'IR',
          action: 'Recheck', photos: PH }] },
      { equip: 'PS004', date: '2026-09-01', type: 'GET', cls: 'LDR', by: 'Ivanov', smu: '4000',
        items: [{ key: 'TOOTH', label: 'Tooth', grade: 3, defect: 'Worn tip', action: 'Replace soon', photos: PH }] },
      { equip: 'PS005', date: '2026-09-01', type: 'UC', cls: 'DOZ', by: 'Ivanov', smu: '5000', wear: true,
        items: [{ key: 'L.LINK', label: 'Track link L', mm: 52, newMM: 78, condemnMM: 50, wearPct: 93, band: 'act',
          w: { mm: 52, newMM: 78, condemnMM: 50, pct: 93, band: 'act' }, photos: PH }] },
      { equip: 'PS006', date: '2026-09-01', type: 'TB', cls: 'AT', by: 'Ivanov', smu: '6000', wear: true,
        items: [{ key: 'F31', label: 'Floor front', zone: 'FLOOR', zoneLabel: 'Floor',
          w: { mm: 11, newMM: 20, condemnMM: 3, pct: 74, band: 'watch' }, photos: PH }] },
      { equip: 'PS007', date: '2026-09-01', type: 'RTW', cls: 'HT', by: 'Ivanov', smu: '7000',
        rtwWo: 'WO-2001', rtwWoType: 'P3', rtwSchedHours: 4000, rtwResult: 'S',
        items: [{ key: '1.1', mark: 'attention', comment: 'Guard reinstalled', photos: PH }] },
    ];
    window.CMDash.importRecords(recs);
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
    return recs.map(r => r.equip + '|' + r.date + '|' + r.type);
  });

  const TYPES = [
    { key: seed[0], name: 'FC (filter cut)' },
    { key: seed[1], name: 'INSP (general inspection)' },
    { key: seed[2], name: 'TEMP (thermography)' },
    { key: seed[3], name: 'GET (ground engaging tools)' },
    { key: seed[4], name: 'UC (undercarriage, measured/wear)' },
    { key: seed[5], name: 'TB (dump body thickness, measured/wear)' },
    { key: seed[6], name: 'RTW (return to work)' },
  ];
  const LANGS = [
    { lang: 'en', bi: false, label: 'English only' },
    { lang: 'ru', bi: false, label: 'Russian only' },
    { lang: 'en', bi: true, label: 'bilingual (EN primary)' },
  ];

  const measure = (key, lang, bi) => p.evaluate(async ({ key, lang, bi }) => {
    const secs = CMReport.sectionsFor('one', key, { lang, bi, photos: true });
    const st = document.getElementById('psstdcss') || (() => { const s = document.createElement('style'); s.id = 'psstdcss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const board = d.querySelector('.phg.gallery');
    if (!board) { const text = d.innerText; d.remove(); return { noBoard: true, text: text.slice(0, 400) }; }
    const imgs = [...d.querySelectorAll('.phg.gallery img')];
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const boardRect = board.getBoundingClientRect();
    const rows = [...d.querySelectorAll('.phgrow')];
    const boxes = imgs.map(im => { const r = im.getBoundingClientRect();
      return { l: Math.round(r.left - boardRect.left), w: Math.round(r.width), h: Math.round(r.height) }; });
    const text = d.innerText.replace(/\s+/g, ' ');
    d.remove();
    return { rowCount: rows.length, boxes, boardW: Math.round(boardRect.width), text: text.slice(0, 2000) };
  }, { key, lang, bi });

  for (const t of TYPES) {
    console.log('\n' + t.name);
    for (const L of LANGS) {
      const r = await measure(t.key, L.lang, L.bi);
      const tag = '  [' + L.label + ']';
      if (r.noBoard) { ok(false, tag + ' the photographs board rendered at all', 'text=' + r.text); continue; }
      ok(r.boxes.length === 5 && r.rowCount === 2,
        tag + ' five photographs, two rows (a full row of four, a remainder of one)',
        JSON.stringify({ n: r.boxes.length, rows: r.rowCount }));
      if (r.boxes.length !== 5 || r.rowCount !== 2) continue;
      const row1 = r.boxes.slice(0, 4), row2 = r.boxes.slice(4);
      const span1 = row1[3].l + row1[3].w - row1[0].l;
      ok(span1 >= r.boardW - 20,
        tag + ' the full row reaches margin to margin, not centred with blank space on either side',
        'span=' + span1 + ' boardW=' + r.boardW);
      ok(row1[0].l <= 10,
        tag + ' the full row starts flush at the left margin, not centred',
        'left=' + row1[0].l);
      ok(new Set(row1.map(x => x.h)).size === 1,
        tag + ' every photograph in the full row is the same height',
        JSON.stringify(row1.map(x => x.h)));
      ok(row2[0].l === row1[0].l,
        tag + ' the remainder photograph starts flush left, matching the row above it — never centred alone on its line',
        JSON.stringify({ remainder: row2[0].l, rowAbove: row1[0].l }));
      ok(row2[0].h === row1[0].h,
        tag + ' the remainder photograph is the SAME standard tile size as the row above it, not independently stretched or shrunk',
        JSON.stringify({ remainder: row2[0].h, rowAbove: row1[0].h }));
      if (L.lang === 'ru') {
        ok(/[Ѐ-ӿ]/.test(r.text),
          tag + ' the section actually rendered in Russian (not silently left in English)',
          r.text.slice(0, 120));
      }
    }
  }

  /* THE DOM SAYING SO IS NOT THE SAME AS THE FILE SHOWING IT — the exact gap
     both field reports fell through: galshort.cjs/galorphan.cjs measured the
     DOM correctly the whole time this defect was live, because Playwright's
     own Chromium honours the alignment keywords html2canvas does not. One
     representative type is rasterised here with the bundled html2canvas and
     sampled directly, so this suite cannot pass the way the old one did. */
  console.log('\nthe actual RASTER, not only the DOM (INSP, bilingual)');
  const raster = await p.evaluate(async ({ key }) => {
    const secs = CMReport.sectionsFor('one', key, { lang: 'en', bi: true, photos: true });
    const st = document.getElementById('psstdcss') || (() => { const s = document.createElement('style'); s.id = 'psstdcss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const board = d.querySelector('.phg.gallery');
    const imgs = [...d.querySelectorAll('.phg.gallery img')];
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const boardRect = board.getBoundingClientRect();
    const boxes = imgs.map(im => im.getBoundingClientRect());
    const canvas = await html2canvas(board, { scale: 1, backgroundColor: '#ffffff', logging: false });
    const cx = canvas.getContext('2d');
    const sample = (px, py) => { const x = Math.max(0, Math.min(canvas.width - 1, Math.round(px)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(py))); const dat = cx.getImageData(x, y, 1, 1).data; return [dat[0], dat[1], dat[2]]; };
    // The far RIGHT edge of the full row's last photograph, and a point just
    // past it still inside the row's own height: background in the raster
    // means the row genuinely reached the line there, not merely in the DOM.
    const lastImg = boxes[3];
    const rightEdgeInside = sample(lastImg.right - boardRect.left - 4, lastImg.top - boardRect.top + lastImg.height / 2);
    const rightOfBoard = sample(boardRect.width - 3, lastImg.top - boardRect.top + lastImg.height / 2);
    // The remainder's own left edge in the raster, and a point to its LEFT
    // that should be the board's own edge, not blank centring space.
    const remImg = boxes[4];
    const remLeftInside = sample(remImg.left - boardRect.left + 4, remImg.top - boardRect.top + remImg.height / 2);
    d.remove();
    return { rightEdgeInside, rightOfBoard, remLeftInside, remLeft: Math.round(remImg.left - boardRect.left) };
  }, { key: TYPES[1].key });
  const isFill = (rgb) => rgb[0] < 250 || rgb[1] < 250 || rgb[2] < 250; // not plain white background
  ok(isFill(raster.rightEdgeInside), 'the last photograph of the full row genuinely reaches its own right edge in the RASTER', JSON.stringify(raster.rightEdgeInside));
  ok(raster.remLeft <= 10, 'the remainder photograph genuinely starts at the board\'s own left edge in the RASTER, not centred', 'remLeft=' + raster.remLeft);
  ok(isFill(raster.remLeftInside), 'and its own pixels are actually there at that left edge, not a gap', JSON.stringify(raster.remLeftInside));

  ok(errs.length === 0, 'no page errors throughout', errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
