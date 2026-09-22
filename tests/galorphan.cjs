/* FOUR PHOTOGRAPHS PER LINE, ALWAYS, AND A LEFTOVER OF ONE TO THREE PRINTS AT
   THE SAME SIZE AS THE ROW ABOVE IT — NOT SPANNED, NOT STRANDED BESIDE EMPTY
   SPACE, AND A FULL ROW OF THREE OR FOUR ALWAYS FILLS THE LINE.

   Read off TK109's Equipment Trend Report, Rear Differential (RRD), four
   photographs: three printed across a row and the fourth dropped to a row of
   its own, small, with visible empty space beside it "although it has space
   still." The build-424 fix (a flat gridCols(n) = n<=4?n:4, no
   waste-minimisation) put all four in one row and retired the old
   last1/last2 spanning classes, and build 425 fixed the uneven gaps a
   mixed-orientation row produced under equal-width columns. Both of those
   are proven here still, in the same test they were first proven in.

   A THIRD report off the same position, real photographs this time rather
   than uniform synthetic swatches, showed a THIRD shape of the identical
   underlying gap: "the RRD photos since its already 4 then it should
   occupy the whole line like CH.BY" — a row of four near-square/portrait
   close-ups packed to a fraction of the sheet while a row of four wide
   landscape tray photographs, the same rule, filled it. `auto` columns
   correctly stopped forcing width onto a photograph that did not need it;
   they never made the row itself reach for the space a narrower set of
   photographs left unused.

   The justified-row fix this comment used to describe (a shared HEIGHT
   solved from the row's own widths) is superseded twice over since: a
   letterboxed square tile, then — on the maintainer's own reference
   photograph of four real magnetic-plug close-ups, every tile filled
   completely with no padding — a COVER-fit square tile, sized for a FIXED
   four columns always (`GAL_TILE_COLS`, report-core.js), never solved from
   how many photographs a particular row actually holds. A full row of
   FOUR still fills the 746px line edge to edge (four tiles at the fixed
   size IS the line); a full row of fewer than four — EX023's own three
   photographs below — now falls SHORT of the line by design, at the same
   tile size a four-photograph row uses, flush left. A remainder past a
   full row of four keeps that SAME tile size rather than solving its own,
   smaller one — "adopting the sizes... of the other photos," TK109's own
   original words for it, true of the tile size now rather than of a
   shared row height.

   Run: node tests/galorphan.cjs   (needs tests/mock.cjs on 8099) */
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
    x.fillStyle = '#000'; x.fillRect(0, 0, n * 3, n * 3);
    return c.toDataURL('image/jpeg', 0.7);
  };
  const mk = (equip, count) => ({
    equip, date: '2026-09-14', type: 'INSP', cls: 'EXC', by: 'Rayanov', smu: '7941',
    items: [{ key: 'HS.MP', label: 'Hydraulic Pumps', grade: 2, defect: 'None noted',
      action: 'Monitor / re-inspect next PM', photos: Array.from({ length: count }, () => px(400, 300)) }],
  });
  /* TK109's RRD shape (four) plus its neighbours: 1, 3 are full rows on
     their own; 4 is TK109's own case; 5-8 must all render at the SAME
     four-photograph tile size, whatever the remainder. Every photograph
     here is 400x300 (4:3), so a full row's own justified height is one
     number every one of these positions can be checked against directly. */
  CMDash.importRecords([mk('EX021', 4), mk('EX022', 7), mk('EX023', 3), mk('EX024', 5),
    mk('EX025', 6), mk('EX026', 1), mk('EX027', 8)]);
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
    const secs = CMReport.sectionsFor('one', eq + '|2026-09-14|INSP', { lang: 'en', photos: true });
    const st = document.getElementById('galorphancss') || (() => { const s = document.createElement('style'); s.id = 'galorphancss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
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
    const rowEls = [...d.querySelectorAll('.phgrow')];
    const out = {
      boardClass: board.className,
      rowCount: rowEls.length,
      boxes: imgs.map(im => { const r = im.getBoundingClientRect();
        return { l: Math.round(r.left - boardRect.left), w: Math.round(r.width), h: Math.round(r.height) }; }),
    };
    d.remove();
    return out;
  }, equip);

  console.log('EX023 (three photographs — a full row of three, justified to fill the line)');
  const r3 = await measure('EX023');
  ok('three photographs, one justified row', r3.boxes.length === 3 && r3.rowCount === 1 && /\bg3plus\b/.test(r3.boardClass), JSON.stringify(r3));
  ok('  THE FIX: the tile size is the fixed four-column size, so a row of only three photographs falls SHORT of the line by design (about one tile\'s width) rather than solving its own wider three-column line',
     new Set(r3.boxes.map(b => b.h)).size === 1
       && (r3.boxes[r3.boxes.length - 1].l + r3.boxes[r3.boxes.length - 1].w - r3.boxes[0].l) < 650,
     JSON.stringify(r3.boxes));

  console.log('\nEX026 (one photograph — untouched, not justified)');
  const r1 = await measure('EX026');
  ok('one photograph, no g3plus, not stretched to the line', r1.boxes.length === 1 && !/\bg3plus\b/.test(r1.boardClass) && r1.boxes[0].w < 300, JSON.stringify(r1));

  console.log('\nEX021 (TK109\'s own shape — four photographs)');
  const r4 = await measure('EX021');
  ok('four photographs, one justified row, filling the line', r4.boxes.length === 4 && r4.rowCount === 1 && /\bg3plus\b/.test(r4.boardClass), JSON.stringify(r4));
  ok('THE FIX: all four sit in ONE row, same size, edge to edge, filling the sheet — none dropped to a row of its own with space beside it',
     new Set(r4.boxes.map(b => b.h)).size === 1 && new Set(r4.boxes.map(b => b.l)).size === 4
       && (r4.boxes[3].l + r4.boxes[3].w - r4.boxes[0].l) > 720,
     JSON.stringify(r4.boxes));

  console.log('\nEX024 (five) and EX025 (six): must render at the SAME tile size as four, not a wider three-column tile');
  const r5 = await measure('EX024');
  const r6 = await measure('EX025');
  ok('five photographs, two rows, the second reusing the first row\'s height', r5.boxes.length === 5 && r5.rowCount === 2, JSON.stringify(r5));
  ok('six photographs, two rows, both at the same height', r6.boxes.length === 6 && r6.rowCount === 2, JSON.stringify(r6));
  ok('THE FIX: five and six photographs render at the identical tile size as four (the old "least-waste" rule gave them a wider three-column tile instead)',
     r5.boxes.every(b => b.w === r4.boxes[0].w && b.h === r4.boxes[0].h) && r6.boxes.every(b => b.w === r4.boxes[0].w && b.h === r4.boxes[0].h),
     JSON.stringify({ four: r4.boxes[0], five: r5.boxes[0], six: r6.boxes[0] }));
  /* THE REMAINDER ROW STARTS AT THE LINE'S OWN LEFT MARGIN, NOT CENTRED.
     Read off TK154's own Equipment Trend Report, HS.DL Hydraulic Lines,
     2026-09-22: a fifth photograph on a row of its own, pinned small with
     empty space kept to its RIGHT — the correct edge, arrived at only
     because the row happens to hold one photograph (see galshort.cjs for
     the same alignment mechanism failing the other way, centred, for a
     FULL row). Asserted directly here so a future change to the alignment
     technique cannot reopen either shape. */
  ok('the fifth photograph starts flush with the first photograph of the row above it, not centred under the line',
     r5.boxes[4].l === r4.boxes[0].l, JSON.stringify({ fifth: r5.boxes[4].l, first: r4.boxes[0].l }));

  console.log('\nEX022 (seven) and EX027 (eight): the same shape one and two rows later');
  const r7 = await measure('EX022');
  const r8 = await measure('EX027');
  ok('seven photographs, same tile size as four', r7.boxes.length === 7 && r7.boxes.every(b => b.w === r4.boxes[0].w && b.h === r4.boxes[0].h), JSON.stringify(r7));
  ok('eight photographs, two full rows, same tile size as four', r8.boxes.length === 8 && r8.rowCount === 2 && r8.boxes.every(b => b.w === r4.boxes[0].w && b.h === r4.boxes[0].h), JSON.stringify(r8));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
