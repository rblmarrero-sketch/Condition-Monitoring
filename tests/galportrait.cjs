/* A PORTRAIT PHOTOGRAPH DOES NOT SIT STRANDED IN THE MIDDLE OF A COLUMN BUILT
   FOR A LANDSCAPE ONE.

   Every earlier fix to this gallery (last1/last2/gridCols, see galorphan.cjs)
   corrected the COUNT of columns a row gets — never their WIDTH. All three
   were proved with 400x300 (landscape) synthetic photographs, which nearly
   fill a `1fr` column built to a ~243px-wide standard tile anyway, so the
   waste never showed up in a test.

   A field phone shoots portrait by default. Read off TK126's real INSP
   round (2026-09-19): two 1200x1600 component photographs, each held to the
   sheet's standard 182px tile height, are only ~137px wide — split across
   two EQUAL `1fr` columns of a 758px-wide full-width board, each column came
   out ~369px wide, so each photograph sat in the middle of roughly 230px of
   pure white on either side of it. Reported repeatedly as "the spacing is
   too much" and "these has been a long time request."

   The columns were sized to their own photograph for a while (`auto`, not
   `1fr`), packed together as a group rather than stretched to fill
   whatever the row's own width happens to be, starting at the line's own
   left margin rather than centred — and that held until a THIRD real
   report circled the SAME sheet's FRD position (two photographs) sitting
   at a visibly smaller size than its neighbours' four-photograph rows,
   asking directly: "if a photo is 1 to 3, it will follow the height and
   width of the photos that has already 4... standardize the width and
   height of all photos in all components inspected, for all type of
   inspections." A pair or a lone photograph on the gallery board is now
   TILED exactly like a row of three or four — the same fixed square
   footprint (`tileSize`/`tiledRow`, cover-fit, cropped on whichever axis
   overflows), flush left, with the unused slots of that same four-wide row
   simply left empty. This is a deliberate reversal of the "keep its own
   natural size" rule this file used to assert — kept here as history, not
   as the current contract.

   Run: node tests/galportrait.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  const px = (w, h, r, g, bl) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = 'rgb(' + r + ',' + g + ',' + bl + ')'; x.fillRect(0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.7);
  };
  /* The real shape: two portrait (3:4, matching a 1200x1600 field capture)
     photographs on one finding, and a second position with a single
     portrait photograph of its own — both real cases from TK126's report. */
  CMDash.importRecords([
    { equip: 'PT021', date: '2026-09-14', type: 'INSP', cls: 'AT', by: 'Rayanov', smu: '31025',
      items: [
        { key: 'DRS.ENG', label: 'Engine', grade: 2, defect: 'None noted',
          action: 'Create 1C notification - plan repair',
          photos: [px(900, 1200, 90, 90, 100), px(900, 1200, 100, 80, 70)] },
        { key: 'ENG.EXS', label: 'Exhaust system', grade: 1,
          photos: [px(900, 1200, 60, 90, 60)] }
      ] }
  ]);
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

  const geo = await p.evaluate(async () => {
    const secs = CMReport.sectionsFor('one', 'PT021|2026-09-14|INSP', { lang: 'en', photos: true });
    const st = document.getElementById('galportraitcss') || (() => { const s = document.createElement('style'); s.id = 'galportraitcss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const allImgs = [...d.querySelectorAll('img')];
    await Promise.all(allImgs.map(im => im.complete ? Promise.resolve()
      : new Promise(res => { im.onload = res; im.onerror = res; })));
    const cells = [...d.querySelectorAll('.cel')].map(c => {
      const phg = c.querySelector('.phg.gallery');
      const imgs = [...c.querySelectorAll('.phg.gallery img')].map(im => im.getBoundingClientRect());
      const tiles = [...c.querySelectorAll('.phgrow > div')].map(t => t.getBoundingClientRect());
      return {
        phgClass: phg ? phg.className : null,
        phgWidth: phg ? phg.getBoundingClientRect().width : null,
        imgWidths: imgs.map(r => Math.round(r.width)),
        imgHeights: imgs.map(r => Math.round(r.height)),
        imgLefts: imgs.map(r => Math.round(r.left - phg.getBoundingClientRect().left)),
        tiles: tiles.map(t => ({ l: Math.round(t.left - phg.getBoundingClientRect().left), w: Math.round(t.width), h: Math.round(t.height) })),
      };
    });
    d.remove();
    return { boardWidth: d.querySelector ? 760 : null, cells };
  });

  /* THE STANDARDIZATION FIX: a pair or a lone photograph is now tiled at
     the SAME square footprint a full four-photograph row uses on this
     sheet (`g3plus` markup, `.phgrow > div` tiles) — never each photo's
     own natural size, and never centred as a group. A tight pack of
     hairline gaps between TILES (not photographs, which can overflow
     their own tile on the cropped axis) is what "not stretched, not
     centred" now means. */
  console.log('DRS.ENG (two portrait photographs on one full-width row)');
  const c0 = geo.cells[0];
  ok('two photographs found', c0.imgWidths.length === 2, JSON.stringify(c0));
  ok('tiled — the same markup the gallery board uses for three or four photographs',
     /\bg3plus\b/.test(c0.phgClass || ''), c0.phgClass);
  ok('two tiles, the same square size', c0.tiles.length === 2
     && Math.abs(c0.tiles[0].w - c0.tiles[0].h) <= 1 && Math.abs(c0.tiles[0].w - c0.tiles[1].w) <= 1,
     JSON.stringify(c0.tiles));
  ok('the two tiles sit next to each other at the sheet\'s own hairline gap, not ~230px apart',
     Math.abs((c0.tiles[1].l - (c0.tiles[0].l + c0.tiles[0].w))) <= 6,
     'gap=' + (c0.tiles[1].l - (c0.tiles[0].l + c0.tiles[0].w)) + 'px');
  ok('the pair starts flush at the board\'s own left margin, not centred as a group',
     c0.tiles[0].l < 10, 'leftMargin=' + c0.tiles[0].l);
  ok('THE FIX: each photograph now fills its OWN standard tile (cover-fit) — not the old ~137px natural width',
     c0.imgWidths.every((w, i) => w >= c0.tiles[i].w - 3), JSON.stringify({ imgWidths: c0.imgWidths, tiles: c0.tiles }));
  ok('  and a portrait photograph still overflows and is cropped on its own height, never squeezed to fit',
     c0.imgHeights.every((h, i) => h >= c0.tiles[i].h - 3), JSON.stringify({ imgHeights: c0.imgHeights, tiles: c0.tiles }));

  console.log('\nENG.EXS (one portrait photograph alone on its own row)');
  const c1 = geo.cells[1];
  ok('one photograph found', c1.imgWidths.length === 1, JSON.stringify(c1));
  ok('THE FIX: tiled, the same standard square a four-photograph row would use — not its own natural size, not stretched to the line',
     /\bg3plus\b/.test(c1.phgClass || '') && c1.tiles.length === 1
       && Math.abs(c1.tiles[0].w - c1.tiles[0].h) <= 1 && Math.abs(c1.tiles[0].w - c0.tiles[0].w) <= 1,
     JSON.stringify({ phgClass: c1.phgClass, tile: c1.tiles[0], matchesOtherRow: c0.tiles[0] }));
  ok('  and it starts flush at the left margin, not centred in the row',
     c1.tiles[0].l < 10, 'leftMargin=' + c1.tiles[0].l);

  console.log(fails.length ? '\nFAILED: ' + fails.length : '\nall passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
