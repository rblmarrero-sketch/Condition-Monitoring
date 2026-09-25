/* GENERAL EVIDENCE, THE FLEET PATH'S "SELECTED EVIDENCE" AND THE TECHNICAL
   APPENDIX ALL PRINT THE SAME STANDARD TILE A COMPONENT'S OWN GALLERY DOES.

   Read off a real TK500 report ("Chec photos from Machine overview and
   additional photos. Apply the rule we have on photos with the
   components."): the machine's own overview/additional photographs printed
   at whatever size their own aspect ratio happened to leave them — the
   older fit-inside-a-box (.shots/.genrow, CONTAIN not COVER) technique — one
   call site over from the finding's own gallery, which already prints every
   photograph as the same square, cover-fit tile (tiledRow/tileSize). Four
   call sites carried that older shape: generalBlock() (the single-round
   report's "General evidence"), evidenceSections()'s keepGeneral branch (a
   wear round's trailing machine photographs), the fleet/management summary's
   "selected evidence" card (up to four flagged findings' lead photos), and
   the technical appendix's per-round "photographs" and "general evidence"
   boards. All four now go through capTile()/capGallery() — tiledRow's own
   square, cover-fit math, with a caption under each tile since here every
   photograph is its own distinct fact, not four angles of one finding
   sharing a caption above the row.

   This suite proves the two call sites tests/unitgenphoto.cjs and
   tests/rptmirror.cjs don't already cover: the fleet-summary "selected
   evidence" card and the technical appendix's own photo boards, reached
   through a Round-mode report with ctx.appendix set. Two genuinely
   different frames throughout — identical data URIs collapse to one on
   ingest (histwide.cjs's own lesson) — so a row actually has more than one
   tile to measure.

   Run: node tests/genevtile.cjs   (needs tests/ed-srv.cjs on 8093) */
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

  const r = await p.evaluate(async () => {
    const solid = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
    const rec = {
      equip: 'TK500', clsLabel: 'HT', model: 'X', type: 'MP', typeLabel: 'MP', date: '2026-09-24', by: 'R', smu: '12000',
      items: [
        // A flagged finding, so it earns a "selected evidence" card in the
        // fleet path's compact summary, and its own row in the appendix's
        // "photographs" board.
        { key: '4E', name: 'Magnetic Plug 4E', grade: 4, defect: 'Ferrous debris', action: 'Replace',
          photos: [solid(600, 400, [210, 40, 40])] },
      ],
      // The machine's own overview/additional photographs — two genuinely
      // different frames, one landscape, one portrait, one carrying a
      // category the other does not.
      general: [
        { u: solid(1200, 800, [80, 120, 200]), cat: 'OVERVIEW' },
        solid(700, 1000, [30, 150, 70]),
      ],
    };
    const secs = window.CMR.sections({ lang: 'en', bi: false, mode: 'round', appendix: true, title: 'x', titleAlt: 'y',
      stamp: new Date(), sevLabel: s => s, sevLabelAlt: s => s, records: [rec] });
    const html = secs.map(s => s.html).join('\n');

    const host = document.createElement('div'); host.id = 'rptRoot3';
    host.style.cssText = 'position:fixed;left:0;top:0;width:760px;background:#fff;';
    host.innerHTML = html;
    document.body.appendChild(host);
    await new Promise(res => setTimeout(res, 500));
    const boards = Array.from(host.querySelectorAll('.capgal'));
    const geo = boards.map(board => {
      const figs = Array.from(board.querySelectorAll('figure'));
      return figs.map(f => {
        const box = f.querySelector('div'); const img = f.querySelector('img');
        const cap = f.querySelector('figcaption');
        const bb = box.getBoundingClientRect();
        return { side: Math.round(bb.width), square: Math.abs(bb.width - bb.height) < 1,
                 clipped: getComputedStyle(box).overflow === 'hidden', capText: cap ? cap.textContent : null };
      });
    });
    host.remove();

    return {
      boardCount: boards.length,
      geo,
      hasOldShots: /class="shots"|class="genrow"/.test(html),
      hasGenHeading: /General evidence|Общий фотоматериал/.test(html),
      hasSelectedPhotos: /Magnetic Plug 4E/.test(html),
    };
  });

  ok('the compact fleet card and the appendix each got a captioned photo board',
     r.boardCount >= 2, 'boardCount=' + r.boardCount);
  ok('no board anywhere in the document uses the retired .shots/.genrow markup',
     !r.hasOldShots);
  ok('general evidence still carries its own heading', r.hasGenHeading);
  ok('the flagged finding\'s own caption still reaches the "selected evidence" card', r.hasSelectedPhotos);

  const allTiles = r.geo.flat();
  ok('every capgal tile across every board is a real square', allTiles.length > 0 && allTiles.every(t => t.square),
     JSON.stringify(allTiles));
  ok('  every one is clipped (cover-fit, not fitted inside a box)', allTiles.every(t => t.clipped));
  const sides = [...new Set(allTiles.map(t => t.side))];
  ok('  and every board — selected evidence, general evidence, the appendix — uses the SAME tile size',
     sides.length === 1 && sides[0] > 0, sides.join(', '));
  ok('  each tile carries its own distinct caption, not one caption shared by the whole row',
     allTiles.filter(t => t.capText).length >= 2 &&
     new Set(allTiles.filter(t => t.capText).map(t => t.capText)).size >= 2,
     JSON.stringify(allTiles.map(t => t.capText)));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
