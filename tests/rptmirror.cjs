/* THE OFFICE AND THE FIELD PRINT THE SAME DOCUMENT, AND IT IS MEASURED.

   Read off four PDFs on 2026-09-14: three DZ002 reports made in the office at
   190 ppi and one EX021 made on the phone at 253. 190 ppi is scale 1.8 and
   253 is 2.4, and the office offered a "Small file (slow link)" point the
   phone does not have — so one surface could emit a document the other could
   not, and the one it emitted is the one a superintendent has to zoom in to
   read. The comment beside that picker said, in the repository, that 190 ppi
   is "what you have to zoom to read". Knowing is not the same as closing.

   tests/parity.cjs already holds the two surfaces to one ENGINE — same
   sections, same wording, from the ctx each host builds. This suite holds
   them to one OUTPUT: the raster the engine is printed at, and the geometry
   of the photo cell, which is what "professional" and "not pixelated" cash
   out to on paper.

   It makes REAL PDFs, on both surfaces, and measures them rather than
   trusting the setting that produced them.

   Run: node tests/rptmirror.cjs     (needs tests/mock.cjs on 8099) */
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099';
const OUT = path.join(os.tmpdir(), 'cm-mirror');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* THE RASTER, READ OFF THE FILE. pdfimages reports each image's own x-ppi —
   its pixels against the BOX IT IS PLACED IN, which is the page inside its
   margins, not the full sheet. Dividing the pixel width by A4's width instead
   gives 221 where the file says 253, and a number that is only nearly right
   is the thing this whole suite exists to catch. Columns:
   page num type width height color comp bpc enc interp object ID x-ppi ... */
function raster(file) {
  let out = '';
  try { out = execFileSync('pdfimages', ['-list', file], { encoding: 'utf8' }); }
  catch (e) { return null; }
  const rows = out.split('\n').filter(l => /\bimage\b/.test(l)).map(l => l.trim().split(/\s+/));
  if (!rows.length) return null;
  const ppis = rows.map(r => Number(r[12])).filter(n => n > 0);
  const widths = rows.map(r => Number(r[3])).filter(Boolean);
  if (!ppis.length) return null;
  return { n: rows.length, width: Math.max.apply(null, widths),
           ppi: Math.min.apply(null, ppis) };      // the WORST page is the standard
}

const SEED = () => {
  /* One machine, two rounds on one day, every position NORMAL and every one
     photographed — the DZ002 case: nothing wrong, twelve photographs taken. */
  const px = (n) => { const c = document.createElement('canvas'); c.width = 640; c.height = n % 2 ? 480 : 800;
    const x = c.getContext('2d'); x.fillStyle = n % 2 ? '#4a6' : '#46a'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#fff'; x.font = '64px sans-serif'; x.fillText('P' + n, 40, 120);
    return c.toDataURL('image/jpeg', 0.9); };
  /* it.photos is an array of URL STRINGS — cell() maps it straight into
     <img src="...">. Handing it {url,name} objects yields src="[object
     Object]" and four cards with nothing in them, which looks exactly like
     the defect this suite is here to prove is fixed. */
  const shot = (n) => px(n);
  const it = (k, label, n) => ({ key: k, label: label, grade: 1, photos: [shot(n), shot(n + 1)] });
  CMDash.importRecords([
    { equip: 'DZ002', date: '2026-09-14', type: 'FC', cls: 'DOZ', by: 'Rayanov', smu: '27908',
      items: [it('ENG', 'Engine Oil Filter', 1), it('HYD', 'Hydraulic Filter', 3)] },
    { equip: 'DZ002', date: '2026-09-14', type: 'UC', cls: 'DOZ', by: 'Rayanov', smu: '27908',
      items: [it('IDLER.L-OUT', 'Idler tread — Left · outer', 5), it('ROLLER.L2', 'Track roller — Left 2', 7)] },
  ]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();

  console.log('1. THE OFFICE CANNOT CHOOSE A PAGE THE FIELD WOULD NOT PRINT');
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(SEED); await p.waitForTimeout(400);

  const picker = await p.evaluate(() => ({
    offered: [...document.querySelectorAll('#rScale option')].map(o => Number(o.value)),
    std: RPT_SCALE, opt: reportOpts().scale,
  }));
  ok('every quality the office offers is at or above the standard',
     picker.offered.length && picker.offered.every(x => x >= picker.std),
     picker.offered.join(', ') + ' (standard ' + picker.std + ')');
  ok('  and the value it hands the engine is never below it',
     picker.opt >= picker.std, String(picker.opt));

  const phoneScale = await (async () => {
    const c2 = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const q = await c2.newPage();
    await q.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    await q.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await q.waitForFunction(() => typeof PHONE_PDF === 'object', null, { timeout: 30000 });
    const v = await q.evaluate(() => ({ scale: PHONE_PDF.scale, jpeg: PHONE_PDF.jpeg }));
    await c2.close(); return v;
  })();
  ok('  the phone prints at the very same scale, with no picker at all',
     phoneScale.scale === picker.std, 'phone ' + phoneScale.scale + ' · office ' + picker.std);

  console.log('\n2. A MACHINE IN ORDER STILL SHOWS WHAT WAS PHOTOGRAPHED');
  /* The DZ002 case exactly: every position Normal, so there are no open
     actions — and the evidence block used to be built from the actions list,
     so twelve photographs were taken, twelve were confirmed, and none were
     printed while page 1 announced the count. Asked BEFORE anything is
     rasterised: generate() leaves the page having built and torn down a
     document, and a probe after it measures that, not the report. */
  const ev = await p.evaluate(() => {
    const secs = CMReport.sectionsFor('unit', 'DZ002', { lang: 'en', bi: false, photos: true, scale: 2.4 });
    const html = secs.map(s => s.html).join('');
    const d = document.createElement('div'); d.innerHTML = html;
    return { imgs: d.querySelectorAll('img').length,
             hasEvidence: d.querySelectorAll('.board.gal img').length > 0,
             raw: /&lt;span|&lt;\/span/.test(html) ? 'markup' : 'clean',
             method: /method_[A-Z]/.test(d.textContent || '') };
  });
  ok('the machine report carries photographs even with nothing wrong',
     ev.imgs > 0, ev.imgs + ' image(s)');
  ok('  and it is presented as evidence, not smuggled in', ev.hasEvidence === true);

  console.log('\n3. THE VERDICT DOES NOT CONTRADICT THE TABLE UNDER IT');
  /* DZ002 printed "No finding on this machine requires action; continue
     normal monitoring" on page 1 and "Nothing above Incipient" on page 2,
     directly above a consolidated actions table whose first row was RED and
     read "1 points at or past condemn". The verdict was the worst GRADE, and
     a measured point past its condemn limit carries no grade — it is a
     millimetre against a number. Planted here as a roll-up the same way. */
  const verdict = await p.evaluate(() => {
    const before = CMReport.sectionsFor('unit', 'DZ002', { lang: 'en', bi: false, photos: false, scale: 2.4 })
      .map(s => s.html).join('');
    const d0 = document.createElement('div'); d0.innerHTML = before;
    const clean = (d0.textContent || '');
    /* now give one point a worn reading past its limit */
    CMDash.importRecords([{ equip: 'DZ009', date: '2026-09-14', type: 'UC', cls: 'DOZ', by: 'R', smu: '100',
      items: [{ key: 'IDLER.L-OUT', label: 'Idler tread', grade: 1, mm: 5, worn: 1.4 },
              { key: 'ROLLER.L2', label: 'Track roller', grade: 1, mm: 5, worn: 1.2 }] }]);
    const after = CMReport.sectionsFor('unit', 'DZ009', { lang: 'en', bi: false, photos: false, scale: 2.4 })
      .map(s => s.html).join('');
    const d1 = document.createElement('div'); d1.innerHTML = after;
    const t1 = (d1.textContent || '');
    /* READ THE VERDICT ELEMENT, NOT THE PAGE. "Continue normal monitoring"
       is also the legitimate NEXT STEP cell for a type with no findings, so
       searching the whole document matches a sentence that is telling the
       truth about a different thing. The verdict is .verdict, and its class
       carries the rung: v-ok / v-watch / v-act. */
    const vd = (d) => { const v = d.querySelector('.verdict');
      return v ? { cls: v.className, text: (v.textContent || '').trim() } : null; };
    return { clean: vd(d0), after: vd(d1),
             condemnRows: (t1.match(/at or past condemn/gi) || []).length };
  });
  ok('a machine genuinely in order still reads as in order',
     !!(verdict.clean && /v-ok/.test(verdict.clean.cls)),
     verdict.clean && verdict.clean.text.slice(0, 60));
  if (verdict.condemnRows > 0 && verdict.after) {
    ok('  and one with a point past condemn does not read as in order',
       !/v-ok/.test(verdict.after.cls),
       verdict.condemnRows + ' condemn row(s) · ' + verdict.after.cls + ' · '
         + verdict.after.text.slice(0, 60));
  } else {
    ok('  a condemn roll-up and a verdict are both present to compare',
       verdict.condemnRows > 0 && !!verdict.after,
       'condemn ' + verdict.condemnRows + ' · verdict ' + (verdict.after ? 'yes' : 'none'));
  }

  console.log('\n4. NOTHING REACHES THE PAGE AS MARKUP OR AS A KEY');
  ok('no escaped markup is printed as text', ev.raw === 'clean', ev.raw);
  ok('no round type prints the key that looks it up', ev.method === false);

  console.log('\n5. A REAL DOCUMENT, MEASURED — NOT THE SETTING THAT ASKED FOR IT');
  async function make(scope, unit, opt, tag) {
    const dl = p.waitForEvent('download', { timeout: 900000 }); dl.catch(() => {});
    const pages = await p.evaluate(a => window.CMReport.generate(a[0], a[1], a[2]), [scope, unit, opt]);
    const d = await dl; const f = path.join(OUT, tag + '.pdf'); await d.saveAs(f);
    return { pages, file: f, r: raster(f) };
  }
  const OPT = await p.evaluate(() => reportOpts());
  delete OPT.msg;                                   // not serialisable
  const unit = await make('unit', 'DZ002', OPT, 'office-unit');
  ok('the office unit report is at the standard raster',
     unit.r && unit.r.ppi >= 250, unit.r ? unit.r.ppi + ' ppi (' + unit.r.width + ' px)' : 'pdfimages unavailable');
  ok('  and nothing in it is the 190 ppi that had to be zoomed',
     unit.r && unit.r.ppi > 200, unit.r && String(unit.r.ppi));

  console.log('\n6. THE CELLS ARE THE SAME SIZE, MEASURED ON A LAID-OUT PAGE');
  /* The CSS assertions below say what the rule IS; this says what the browser
     DID with it. Every photograph in a gallery sits in a TILE of the same
     square footprint whatever its own proportions are — a portrait frame
     beside two landscape ones is what produced the ragged row and the
     half-empty line reported off EX021.

     The uniform thing to measure is the TILE (`.phgrow > div`), not the raw
     `<img>` height: cover-fit (report-core.js's `tiledRow`, superseding the
     earlier letterboxed design this assertion was first written against)
     fills a photograph to its tile on the axis matching its own shape and
     lets the OTHER axis overflow, cropped by the tile's own
     `overflow:hidden` — a portrait frame's own `<img>` element is legitimately
     TALLER than a landscape one's, by design, so asserting every image's raw
     height is identical is asserting the letterboxed design this file's own
     rules retired. */
  const geo = await p.evaluate(async () => {
    const secs = CMReport.sectionsFor('unit', 'DZ002', { lang: 'en', bi: false, photos: true, scale: 2.4 });
    const host = document.createElement('div'); host.id = 'rptRoot';
    host.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    host.innerHTML = secs.map(s => s.html).join('');
    document.body.appendChild(host);
    const st = document.createElement('style'); st.textContent = CMR.CSS; document.head.appendChild(st);
    await new Promise(r => setTimeout(r, 700));
    const imgs = [...host.querySelectorAll('.board.gal img')];
    const box = imgs.map(i => { const b = i.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), nat: i.naturalWidth,
               natW: i.naturalWidth, natH: i.naturalHeight }; });
    const tiles = [...host.querySelectorAll('.board.gal .phgrow > div')].map(t => {
      const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    host.remove(); st.remove();
    return { box, n: imgs.length, tiles };
  });
  const tw = [...new Set(geo.tiles.map(t => t.w))], th = [...new Set(geo.tiles.map(t => t.h))];
  ok('every photograph sits in the same square TILE, whatever its own proportions overflow into',
     geo.tiles.length === geo.n && tw.length === 1 && th.length === 1 && tw[0] === th[0] && tw[0] > 0,
     geo.n + ' photo(s), tile size(s) ' + tw.join('/') + 'x' + th.join('/'));
  /* AND NONE OF THEM IS SQUASHED. The uniform thing is the CELL; the
     photograph inside keeps its own shape, so a portrait frame is narrower
     than a landscape one and both are true. A single width across frames of
     different proportion would mean exactly the distortion being prevented. */
  ok('  and each keeps its own proportions — nothing is stretched to fit',
     geo.box.every(b => Math.abs((b.w / b.h) - (b.natW / b.natH)) < 0.05),
     geo.box.map(b => (b.w / b.h).toFixed(2) + ' vs ' + (b.natW / b.natH).toFixed(2)).join(', '));
  ok('  and every frame actually loaded — a blank cell is not a uniform cell',
     geo.box.length > 0 && geo.box.every(b => b.nat > 0), geo.box.map(b => b.nat).join(','));

  console.log('\n7. ONE PHOTOGRAPH CELL, ON EVERY CONTAINER');
  const cells = await p.evaluate(() => {
    const css = (window.CMR && CMR.CSS) || '';
    const of = (sel) => {
      const i = css.indexOf(sel); if (i < 0) return null;
      return css.slice(i, css.indexOf('}', i));
    };
    return { gal: of('.cel .phg.gallery{'), shots: of('.shots{'), genrow: of('.genrow{'),
             galImg: of('.cel .phg.gallery img{'), shotsImg: of('.shots img{'), genImg: of('.genrow img{') };
  });
  ['gal', 'shots', 'genrow'].forEach(k => {
    ok('  ' + k + ' lays out as a grid, so a row cannot go ragged',
       cells[k] && /display:grid/.test(cells[k]), (cells[k] || '').slice(0, 70));
  });
  /* galImg IS the grid item — .cel .phg.gallery has no figure wrapper — so
     capping its own width to the track (max-width:100%) is enough. It fits
     inside a box (max-height, both dimensions auto) rather than a fixed
     height, because a four-across row (.g4, see report-core.js) needs a
     SHORTER cap than a three-or-fewer row — html2canvas draws the PDF and
     does not honour aspect-ratio, so a cell that is perfect in the DOM came
     out ragged in the FILE — the one place it matters. */
  const c = cells.galImg || '';
  ok('  galImg fits inside a box, at the photograph\'s own width',
     /max-height:182px/.test(c) && /width:auto/.test(c) && /height:auto/.test(c) && /max-width:100%/.test(c),
     c.slice(0, 90));
  /* shots/genrow wrap the img in a figure that IS the grid item, and a wide
     landscape frame at a fixed height has no reason to stay inside its own
     track — nothing capped the figure, so it grew into the row's free space
     and the same three-photo row printed as two oversized tiles with a gap
     where the third belonged (2026-09-16, general evidence). Fitted inside a
     box now — max-width AND max-height, both dimensions auto — the classic
     technique that predates object-fit/aspect-ratio and asks html2canvas for
     nothing beyond what it already does correctly for a plain img: derive
     size from the photo's own ratio. A portrait frame and a landscape one
     now occupy the identical box regardless of which way round they are. */
  ['shotsImg', 'genImg'].forEach(k => {
    const c = cells[k] || '';
    ok('  ' + k + ' fits inside a fixed box, not a fixed height alone',
       /max-width:240px/.test(c) && /max-height:182px/.test(c)
         && /width:auto/.test(c) && /height:auto/.test(c),
       c.slice(0, 90));
  });

  console.log('\n8. AND THE PHONE MAKES THE SAME DOCUMENT, MEASURED THE SAME WAY');
  /* The office half above is measured off a real file. This is the other
     half: a round saved on a handset, its report built by the phone's own
     button, and the resulting PDF held to the same raster. Anything that
     drifts between the two surfaces shows up here as a different number. */
  const c3 = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                  hasTouch: true, acceptDownloads: true });
  const q = await c3.newPage(); const qerr = []; q.on('pageerror', e => qerr.push(e.message));
  await q.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await q.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await q.waitForFunction(() => typeof reportOne === 'function' && typeof dbPut === 'function'
    && typeof items === 'function', null, { timeout: 30000 });
  const seeded = await q.evaluate(async () => {
    const frame = (n) => { const c = document.createElement('canvas');
      c.width = 640; c.height = n % 2 ? 480 : 800;
      const x = c.getContext('2d'); x.fillStyle = n % 2 ? '#4a6' : '#46a';
      x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#fff'; x.font = '64px sans-serif'; x.fillText('P' + n, 30, 110);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); };
    type = 'FC'; selectEquip('DZ002');
    await new Promise(r => setTimeout(r, 500));
    const pos = {}; let n = 0;
    for (const k of items().map(x => x.k).slice(0, 3))
      pos[k] = { grade: 1, sev: 'NOF', defect: '', cause: '', action: '', wo: '', comment: '',
                 photos: [await frame(++n), await frame(++n)] };
    const rec = { id: 'mirror-1', equip: 'DZ002', date: '2026-09-14', type: 'FC', cls: 'DOZ',
      by: 'Rayanov', smu: '27908', positions: pos, up: 0, upTo: {}, rev: 1,
      dev: 'PH-01', gps: null, sign: null, created: '2026-09-14T06:00:00.000Z' };
    await dbPut(rec);
    return Object.keys(pos).length;
  });
  ok('a round is saved on the handset to report on', seeded > 0, seeded + ' position(s)');
  const pdl = q.waitForEvent('download', { timeout: 900000 }); pdl.catch(() => {});
  await q.evaluate(async () => { const r = (await dbAll()).find(x => x.id === 'mirror-1');
                                 await reportOne(r); });
  let phoneFile = null;
  try { const d = await pdl; phoneFile = path.join(OUT, 'phone-one.pdf'); await d.saveAs(phoneFile); }
  catch (e) { phoneFile = null; }
  const pr = phoneFile && raster(phoneFile);
  ok('the phone produced a real PDF', !!pr, phoneFile || 'no download');
  if (pr && unit.r) {
    ok('  at the very same raster as the office\'s', pr.ppi === unit.r.ppi,
       'phone ' + pr.ppi + ' ppi · office ' + unit.r.ppi + ' ppi');
    ok('  which is the standard, not merely equal to each other', pr.ppi >= 250, pr.ppi + ' ppi');
  }
  ok('  and the handset raised nothing while doing it', qerr.length === 0, qerr.slice(0, 2).join(' | '));
  await c3.close();

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('\n   PDFs kept in ' + OUT);
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
