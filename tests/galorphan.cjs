/* FOUR PHOTOGRAPHS PER LINE, ALWAYS, AND A LEFTOVER OF ONE TO THREE PRINTS AT
   THE SAME SIZE AS THE ROW ABOVE IT — NOT SPANNED, NOT STRANDED BESIDE EMPTY
   SPACE.

   Read off TK109's Equipment Trend Report, Rear Differential (RRD), four
   photographs: three printed across a row and the fourth dropped to a row of
   its own, small, with visible empty space beside it "although it has space
   still." The previous fix for this shape (build 421, see this file's own
   prior history) spanned a genuine trailing ORPHAN of one or two across the
   row and centred it — correct for an orphan, but this was never an orphan:
   four photographs is a complete row under the "four per line" rule the site
   asked for, and the old gridCols() picked 3 columns for a remainder of one
   here because a "least-waste" algorithm chose whichever of 4/3/2 divided the
   count with the smallest remainder — so 4, 7 and 8 got four columns while 5
   and 6 got three, the SAME photograph count rendering at inconsistent sizes
   depending on how many total photographs happened to be on the position.

   gridCols(n) is now n<=4 ? n : 4 — a flat rule with no waste-minimisation,
   used by both the gallery board and the non-gallery (mpEvidence/gradedBody)
   grid. Four across is never split into 3+1 again; five through eight always
   render at the SAME four-column tile size, whatever the remainder. A
   genuine remainder (n%4 !== 0, n>4) sits in the fixed four-column grid
   occupying fewer of the same columns — ordinary CSS grid behaviour that
   needs no spanning class at all, so last1/last2 are retired.

   The four-column tile is narrower than the three-column standard (746px
   available width, 8px gaps: (746-24)/4 ~ 180.5px vs (746-16)/3 ~ 243.3px),
   so a 4:3 landscape photograph in it is shorter too — .g4 carries an
   adaptive max-height (135px, the same 3/4 derivation the 182px/three-column
   standard already uses) so a wide photograph still fills its own, narrower
   column edge to edge instead of leaving a gap under the 182px cap sized for
   three columns.

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
  /* TK109's RRD shape (four) plus its neighbours: 1, 3 are full rows under
     the OLD three-column rule and stay full rows under the new four-column
     one too; 4 is TK109's own case; 5-8 must all render at the SAME
     four-column tile size as 4, never reverting to a wider three-column
     tile for a "less wasteful" remainder. */
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
    d.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const board = d.querySelector('.phg.gallery');
    const imgs = [...d.querySelectorAll('.phg.gallery img')];
    await Promise.all(imgs.map(im => im.complete ? null : new Promise(res => { im.onload = im.onerror = res; })));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const out = {
      boardClass: board.className,
      gridTemplate: getComputedStyle(board).gridTemplateColumns.split(' ').length,
      last1: imgs.some(im => im.classList.contains('last1')),
      last2: imgs.some(im => im.closest('.last2')),
      boxes: imgs.map(im => { const r = im.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; }),
    };
    d.remove();
    return out;
  }, equip);

  console.log('EX023 (three photographs — the old three-column standard, untouched)');
  const r3 = await measure('EX023');
  ok('three photographs, no g4 class, three columns', r3.boxes.length === 3 && !/\bg4\b/.test(r3.boardClass) && r3.gridTemplate === 3, JSON.stringify(r3));
  ok('  at the standard 182px height', r3.boxes.every(x => x.h === 182), JSON.stringify(r3.boxes));

  console.log('\nEX026 (one photograph — untouched)');
  const r1 = await measure('EX026');
  ok('one photograph, no g4 class', r1.boxes.length === 1 && !/\bg4\b/.test(r1.boardClass), JSON.stringify(r1));

  console.log('\nEX021 (TK109\'s own shape — four photographs)');
  const r4 = await measure('EX021');
  ok('four photographs found, carries g4, four columns', r4.boxes.length === 4 && /\bg4\b/.test(r4.boardClass) && r4.gridTemplate === 4, JSON.stringify(r4));
  ok('no photograph spans (last1/last2 retired)', !r4.last1 && !r4.last2, JSON.stringify(r4));
  ok('THE FIX: all four sit in ONE row, same size, edge to edge — none dropped to a row of its own with space beside it',
     new Set(r4.boxes.map(b => b.l)).size === 4 && r4.boxes.every(b => b.h === 135), JSON.stringify(r4.boxes));

  console.log('\nEX024 (five) and EX025 (six): must render at the SAME tile size as four, not a wider three-column tile');
  const r5 = await measure('EX024');
  const r6 = await measure('EX025');
  ok('five photographs, g4, four columns — a row of four and a row of one', r5.boxes.length === 5 && /\bg4\b/.test(r5.boardClass) && r5.gridTemplate === 4, JSON.stringify(r5));
  ok('six photographs, g4, four columns — a row of four and a row of two', r6.boxes.length === 6 && /\bg4\b/.test(r6.boardClass) && r6.gridTemplate === 4, JSON.stringify(r6));
  ok('THE FIX: five and six photographs render at the identical tile size as four (the old "least-waste" rule gave them a wider three-column tile instead)',
     r5.boxes.every(b => b.w === r4.boxes[0].w && b.h === 135) && r6.boxes.every(b => b.w === r4.boxes[0].w && b.h === 135),
     JSON.stringify({ four: r4.boxes[0], five: r5.boxes[0], six: r6.boxes[0] }));
  ok('  no spanning markers on the five/six-photograph remainder', !r5.last1 && !r5.last2 && !r6.last1 && !r6.last2);

  console.log('\nEX022 (seven) and EX027 (eight): the same shape one and two rows later');
  const r7 = await measure('EX022');
  const r8 = await measure('EX027');
  ok('seven photographs, g4, four columns, same tile size', r7.boxes.length === 7 && /\bg4\b/.test(r7.boardClass) && r7.boxes.every(b => b.w === r4.boxes[0].w && b.h === 135), JSON.stringify(r7));
  ok('eight photographs, g4, four columns, two full rows, same tile size', r8.boxes.length === 8 && /\bg4\b/.test(r8.boardClass) && r8.boxes.every(b => b.w === r4.boxes[0].w && b.h === 135), JSON.stringify(r8));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
