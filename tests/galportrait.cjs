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

   The columns are sized to their own photograph now (`auto`, not `1fr`),
   packed together as a group rather than stretched to fill whatever the
   row's own width happens to be — and, asked for by name afterward ("when
   1 or 2 photo is taken it should start from left-justify, not in the
   center"), the group starts at the line's own left margin
   (`justify-content:start`) instead of centring in it, the same edge every
   other row on this sheet already starts from.

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
      return {
        phgWidth: phg ? phg.getBoundingClientRect().width : null,
        imgWidths: imgs.map(r => Math.round(r.width)),
        imgLefts: imgs.map(r => Math.round(r.left - phg.getBoundingClientRect().left)),
      };
    });
    d.remove();
    return { boardWidth: d.querySelector ? 760 : null, cells };
  });

  /* What matters is not the .phg.gallery CONTAINER's own width — it is a
     block box and naturally spans the full board, fix or no fix — it is
     whether the PHOTOGRAPHS inside it sit packed together as a group (the
     fix) or each stranded in the middle of its own equal 1fr share of that
     width (the bug). A tight pack means: consecutive photographs touch
     (an 8px gap, not ~230px), and the group as a whole starts at the
     board's own left margin, the same edge every other row on the sheet
     starts from — not centred in the line, and not each member centred in
     its own oversized column. */
  console.log('DRS.ENG (two portrait photographs on one full-width row)');
  const c0 = geo.cells[0];
  ok('two photographs found', c0.imgWidths.length === 2, JSON.stringify(c0));
  ok('the two photographs sit next to each other, not each centred in its own half',
     Math.abs(c0.imgLefts[1] - (c0.imgLefts[0] + c0.imgWidths[0])) < 20,
     'gap=' + (c0.imgLefts[1] - (c0.imgLefts[0] + c0.imgWidths[0])) + 'px');
  ok('the pair starts flush at the board\'s own left margin, not centred as a group',
     c0.imgLefts[0] < 10, 'leftMargin=' + Math.round(c0.imgLefts[0]));
  ok('each photograph keeps its own ~137px width — nothing was stretched to fill a column',
     c0.imgWidths.every(w => w > 100 && w < 180), JSON.stringify(c0.imgWidths));

  console.log('\nENG.EXS (one portrait photograph alone on its own row)');
  const c1 = geo.cells[1];
  ok('one photograph found', c1.imgWidths.length === 1, JSON.stringify(c1));
  ok('it keeps its own ~137px width — not stretched wider to fill the line',
     c1.imgWidths[0] > 100 && c1.imgWidths[0] < 180, 'width=' + c1.imgWidths[0]);
  ok('  and it starts flush at the left margin, not centred in the row',
     c1.imgLefts[0] < 10, 'leftMargin=' + Math.round(c1.imgLefts[0]));

  console.log(fails.length ? '\nFAILED: ' + fails.length : '\nall passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
