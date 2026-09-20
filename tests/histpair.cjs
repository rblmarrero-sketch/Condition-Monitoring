/* TWO POSITIONS, EACH WITH SEVERAL PHOTOGRAPHS, IS THE ORDINARY SHAPE OF A
   MAGNETIC PLUG ROUND — AND IT WAS THE ONE SHAPE histwide.cjs's OWN FIX
   NEVER REACHED.

   That fix (build 396-era) lifted a LONE history item with more than one
   photograph clear of the .b1 340px cap. A Magnetic Plug round almost never
   carries a lone item — it carries 4E and 4F together — and told.length===2
   packs them into a 2-column row regardless: each item's own column is
   already halved, and the photo grid INSIDE that column halves it again.

   Read off a real report, TK150: 4E on the current visit spans most of the
   page (unitSheets' own "photos" board, one item to a row); the identical
   position one visit earlier, in this section, printed at roughly a
   quarter of that. "not fixed as agreed... photos report... still very
   messy" — the same complaint histwide.cjs's own comment already describes,
   one item count over.

   Run: node tests/histpair.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  let n = 0;
  const px = (w, h) => {
    n++;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#556'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#cda'; x.fillRect(4, 4, w - 8, h - 8);
    x.fillStyle = '#000'; x.fillRect(0, 0, n, n);
    return c.toDataURL('image/jpeg', 0.6);
  };
  /* TK150's real shape: 4E and 4F, both graded, both carrying two
     photographs each, on an older visit. */
  const older = {
    equip: 'TK150X', date: '2026-09-06', type: 'MP', cls: 'HT', by: 'Nurbol', smu: '7475',
    items: [
      { key: '4E', label: 'Left Rear Final Drive', grade: 3, defect: 'Ferrous debris — light',
        action: 'Monitor / re-inspect next PM', photos: [px(320, 240), px(320, 240)] },
      { key: '4F', label: 'Right Rear Final Drive', grade: 2, defect: 'Ferrous debris — light',
        action: 'Monitor / re-inspect next PM', photos: [px(320, 240), px(320, 240)] },
    ],
  };
  const latest = {
    equip: 'TK150X', date: '2026-09-17', type: 'MP', cls: 'HT', by: 'Rayanov', smu: '7638',
    items: [
      { key: '4E', label: 'Left Rear Final Drive', grade: 1, photos: [px(320, 240), px(320, 240)] },
      { key: '4F', label: 'Right Rear Final Drive', grade: 1, photos: [px(320, 240), px(320, 240)] },
    ],
  };
  /* Control: three or more graded items on one older round keep their
     existing packed density — this fix is scoped to the common two-item
     shape, not every busy round. */
  const busy = {
    equip: 'BUSY01', date: '2026-09-08', type: 'INSP', cls: 'GEN', by: 'Rayanov', smu: '5000',
    items: [
      { key: 'A', label: 'Point A', grade: 3, defect: 'Crack', photos: [px(320, 240), px(320, 240)] },
      { key: 'B', label: 'Point B', grade: 3, defect: 'Crack', photos: [px(320, 240), px(320, 240)] },
      { key: 'C', label: 'Point C', grade: 3, defect: 'Crack', photos: [px(320, 240), px(320, 240)] },
    ],
  };
  const busyLatest = {
    equip: 'BUSY01', date: '2026-09-10', type: 'INSP', cls: 'GEN', by: 'Rayanov', smu: '5010',
    items: [{ key: 'A', label: 'Point A', grade: 3, defect: 'Crack', photos: [px(320, 240)] }],
  };
  CMDash.importRecords([latest, older, busyLatest, busy]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(SEED); await p.waitForTimeout(300);

  const measure = async (equip) => p.evaluate(async (eq) => {
    const secs = CMReport.sectionsFor('unit', eq, { lang: 'en', photos: true });
    const st = document.getElementById('histpaircss') || (() => { const s = document.createElement('style'); s.id = 'histpaircss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    /* The non-gallery .cel .phg img rule sizes a photograph from its own
       natural dimensions (width:auto;height:auto;max-height:182px), the same
       html2canvas-safe technique the gallery rule already used — so, unlike
       the old width:100% rule, its rendered box is 0x0 until the <img> has
       actually decoded. A real report only rasterises once every image has
       loaded; this waits for the same thing before measuring. */
    await Promise.all([...d.querySelectorAll('img')].map(im => im.complete ? null :
      new Promise(res => { im.onload = im.onerror = res; })));
    const board = d.querySelector('.sec.olderr .board');
    const cells = board ? [...board.querySelectorAll('.cel')] : [];
    const curCells = [...d.querySelectorAll('.sec:not(.olderr) .board .cel')];
    const out = {
      boardClass: board ? board.className : null,
      cellCount: cells.length,
      cellWidths: cells.map(c => Math.round(c.getBoundingClientRect().width)),
      photoWidths: cells.map(c => { const im = c.querySelector('.phg img,img.ph'); return im ? Math.round(im.getBoundingClientRect().width) : null; }),
      curPhotoWidths: curCells.map(c => { const im = c.querySelector('.phg img,img.ph'); return im ? Math.round(im.getBoundingClientRect().width) : null; }).filter(w => w != null),
    };
    d.remove();
    return out;
  }, equip);

  console.log('two graded items, each with two photographs, no longer share a packed row');
  const r = await measure('TK150X');
  ok('one older-round board found, holding both positions', r.cellCount === 2, JSON.stringify(r));
  ok('the board carries the wide class (one item deep)', /(^| )wide( |$)/.test(r.boardClass || ''), r.boardClass);
  ok('THE FIX: each item spans the full width, not half of it',
     r.cellWidths.every(w => w > 700), JSON.stringify(r.cellWidths));
  /* "Sized like the current visit's" is no longer a width to clear (that was
     this project's OTHER standing bug — .cel .phg img stretching a photo to
     fill whatever column it landed in, so a wider board simply stretched it
     further). Fixed, both visits' photographs land on the SAME standard
     tile size — the sheet's one floor, not one computed per card — so the
     real assertion is that the older round's width equals the current
     round's, not that it cleared an arbitrary pixel count. */
  ok('  so each photograph is sized like the current visit\'s — the same standard tile, not a quarter of it',
     r.curPhotoWidths.length > 0 &&
     r.photoWidths.every(w => r.curPhotoWidths.some(cw => Math.abs(cw - w) <= 1)),
     JSON.stringify({ older: r.photoWidths, current: r.curPhotoWidths }));

  console.log('\n(control: three graded items on one older round keep their existing packed density)');
  const rb = await measure('BUSY01');
  ok('three cells, packed into the ordinary 3-column row', rb.cellCount === 3, JSON.stringify(rb));
  ok('no wide class — this fix is scoped to the common two-item shape', !/(^| )wide( |$)/.test(rb.boardClass || ''), rb.boardClass);
  ok('each cell is a third of the sheet, unchanged', rb.cellWidths.every(w => w < 300), JSON.stringify(rb.cellWidths));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
