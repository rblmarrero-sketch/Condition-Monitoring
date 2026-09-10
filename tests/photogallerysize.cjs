/* THE PHOTOGRAPHS PAGE SIZES A TILE TO HOW MANY OTHERS SHARE ITS CARD, NOT TO
   ANYTHING ELSE ON THE SHEET — and a real UC report showed exactly what that
   produces: SPROCKET.L's five close-ups printed as a grid of small squares,
   BUSH.R's two printed twice that size, and SAG.L's lone establishing shot
   printed as a single photograph nearly the width of the page — four
   different physical sizes for four positions on the same machine, on a
   sheet whose own comment already says "every frame is the same size, in
   rows across the page." The field read it as photographs "not properly
   aligned and sizes not the same," which is what a two-up board of
   wildly-different-height cards next to each other also produces.

   The fix: the gallery board is always full width (b1 — one photo card does
   not sit half as wide as the page while a five-photo one takes the other
   half), and .cel .phg.gallery holds every tile to the SAME floor size
   (auto-fill) regardless of how many share the card, so a lone photograph
   stays a tile and does not stretch to fill the space nothing else on its
   row is using.

   Run: node tests/photogallerysize.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SWATCH = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300"/></svg>');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1200 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR, { timeout: 20000 });

  const res = await p.evaluate((swatch) => {
    const st = document.createElement('style'); st.textContent = CMR.CSS; document.head.appendChild(st);
    // Same shape as SPROCKET.L (5), BUSH.L (4), BUSH.R (2) and SAG.L (1) on
    // the real report: four cards, wildly different photo counts, in the
    // gallery board the Photographs page actually uses.
    function cel(n) {
      const imgs = Array.from({ length: n }, () => '<img src="' + swatch + '">').join('');
      return '<div class="cel"><div class="phg gallery">' + imgs + '</div>'
        + '<div class="bd"><div class="pk">x</div></div></div>';
    }
    const holder = document.createElement('div'); holder.id = 'rptRoot';
    holder.style.cssText = 'position:relative;width:760px;background:#fff;';
    holder.innerHTML = '<div class="sec"><div class="board gal b1">'
      + cel(5) + cel(4) + cel(2) + cel(1) + '</div></div>';
    document.body.appendChild(holder);

    const cards = Array.prototype.slice.call(holder.querySelectorAll('.cel'));
    const widths = cards.map(function (c) { return c.getBoundingClientRect().width; });
    const tileWidths = cards.map(function (c) {
      return Array.prototype.slice.call(c.querySelectorAll('.phg img'))
        .map(function (im) { return Math.round(im.getBoundingClientRect().width); });
    });
    const board = holder.querySelector('.board.gal');
    return { cardWidths: widths, tileWidths: tileWidths, boardClass: board.className };
  }, SWATCH);

  console.log('  card widths (5,4,2,1 photos):', res.cardWidths.map(w => Math.round(w)));
  console.log('  tile widths per card:', JSON.stringify(res.tileWidths));

  ok('the gallery board is full page width (b1), not a two-up column',
    /\bb1\b/.test(res.boardClass) && !/\bb2\b/.test(res.boardClass), res.boardClass);

  const allCardsFullWidth = res.cardWidths.every(w => Math.abs(w - res.cardWidths[0]) < 1);
  ok('every position card is the same width — cards stack, they do not sit two-up',
    allCardsFullWidth, res.cardWidths.map(w => Math.round(w)).join(','));

  // The actual field complaint: a tile in the 1-photo card must be the SAME
  // size as a tile in the 5-photo card, not the whole card stretched to fill
  // the width nothing else on its row needs.
  const oneTile = res.tileWidths[3][0];
  const fiveTile = res.tileWidths[0][0];
  ok('a lone photograph is a tile, not the whole card stretched to fill it',
    oneTile < res.cardWidths[3] * 0.6, 'lone tile=' + oneTile + ' of a ' + Math.round(res.cardWidths[3]) + 'px card');
  ok('the same tile size is used whether a position has one photograph or five',
    Math.abs(oneTile - fiveTile) <= 2, 'one=' + oneTile + ' five=' + fiveTile);

  // Every tile within a single card should also agree with itself.
  res.tileWidths.forEach(function (ws, i) {
    const same = ws.every(w => Math.abs(w - ws[0]) <= 1);
    ok('card ' + i + ' (' + ws.length + ' photos): every tile in it is the same size', same, ws.join(','));
  });

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
