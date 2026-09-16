/* A HISTORY ROUND WITH ONE FINDING AND SEVERAL PHOTOGRAPHS GETS THE SHEET
   TOO, NOT A THIRD OF IT.

   `.b1` alone caps a lone card at 340px — sized for a single short finding
   sitting among narrower content — and mpEvidence already lifts that cap
   (the `wide` class) for exactly this shape: one item, more than one
   photograph. earlierRoundSections (the Equipment History report's older-
   round cards) never did. Read off CR005's Jaw Crusher (CRS.JAW): its
   2026-09-08 card — one position, two photographs — printed squeezed to
   roughly a third of the page width, while the SAME position on the
   2026-09-10 visit, one section up, spanned the full width (that section
   uses the gallery board, which is immune to the cap). One component looked
   like two different reports depending on which visit was showing it.

   Run: node tests/histwide.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  /* Distinct frames, not the same data URI repeated — a position's own
     photographs are deduplicated by content on ingest, and two identical
     stand-ins would silently collapse to one, which is not the shape this
     suite is testing. */
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
  /* The latest visit (drives the summary table and the "photos" section)
     and one older round behind it, both on the same single position, so the
     only thing that differs between their two cards is which code path
     rendered them. */
  const latest = {
    equip: 'CR005', date: '2026-09-10', type: 'INSP', cls: 'GEN', by: 'Rayanov', smu: '3036',
    items: [{ key: 'CRS.JAW', label: 'Jaw Crusher', grade: 4, defect: 'Crack / fracture',
      action: 'Create 1C notification - plan repair', photos: [px(320, 240), px(320, 240), px(320, 240)] }],
  };
  const older = {
    equip: 'CR005', date: '2026-09-08', type: 'INSP', cls: 'GEN', by: 'Rayanov', smu: '3020',
    items: [{ key: 'CRS.JAW', label: 'Jaw Crusher', grade: 4, defect: 'Weld defect / crack at weld (HAZ)',
      action: 'Create 1C notification - plan repair', photos: [px(320, 240), px(320, 240)] }],
  };
  /* Control: an older round with only ONE photograph — mpEvidence's own
     `wide` rule requires MORE than one, so this one should stay capped. */
  const oneShot = {
    equip: 'CR006', date: '2026-09-08', type: 'INSP', cls: 'GEN', by: 'Rayanov', smu: '2000',
    items: [{ key: 'CRS.JAW', label: 'Jaw Crusher', grade: 4, defect: 'Crack', photos: [px(320, 240)] }],
  };
  const latest6 = {
    equip: 'CR006', date: '2026-09-10', type: 'INSP', cls: 'GEN', by: 'Rayanov', smu: '2010',
    items: [{ key: 'CRS.JAW', label: 'Jaw Crusher', grade: 4, defect: 'Crack', photos: [px(320, 240), px(320, 240)] }],
  };
  CMDash.importRecords([latest, older, latest6, oneShot]);
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

  const measure = async (equip) => p.evaluate((eq) => {
    const secs = CMReport.sectionsFor('unit', eq, { lang: 'en', photos: true });
    const st = document.getElementById('histwidecss') || (() => { const s = document.createElement('style'); s.id = 'histwidecss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const boards = [...d.querySelectorAll('.sec.olderr .board')];
    const widths = boards.map(bd => Math.round(bd.getBoundingClientRect().width));
    const classes = boards.map(bd => bd.className);
    d.remove();
    return { widths, classes };
  }, equip);

  console.log('a history round with one finding and TWO photographs spans the full width');
  const r1 = await measure('CR005');
  ok('exactly one older-round board found', r1.widths.length === 1, JSON.stringify(r1));
  ok('the board carries the wide class', /(^| )wide( |$)/.test(r1.classes[0] || ''), r1.classes[0]);
  ok('and its rendered width is not capped at 340px', r1.widths[0] > 500, r1.widths[0] + 'px');

  console.log('\n   (control: a history round with only ONE photograph stays at the ordinary card width)');
  const r2 = await measure('CR006');
  ok('exactly one older-round board found', r2.widths.length === 1, JSON.stringify(r2));
  ok('no wide class — mpEvidence\'s own rule needs more than one photograph', !/(^| )wide( |$)/.test(r2.classes[0] || ''), r2.classes[0]);
  ok('and its rendered width stays at the narrow cap', r2.widths[0] <= 340, r2.widths[0] + 'px');

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
