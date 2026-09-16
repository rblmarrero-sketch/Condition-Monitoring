/* THE ONE PHOTOGRAPH LEFT ON A ROW OF ITS OWN PRINTS AT ITS OWN SIZE, NOT
   STRANDED IN A THIRD OF A TRACK.

   Read off EX021's own report: a position with four photographs printed
   three across, evenly sized — the fix build 371 shipped for this same
   equipment, when a portrait frame beside two landscape ones came out an
   inconsistent size — and then a fourth alone on its own row, small and
   pinned to the left third of the card with two empty tracks beside it
   nothing was using. auto-fill cannot single that lone photograph out; it
   only knows how many 200px tracks the row's OWN width admits, not how
   many photographs are actually left to place in it.

   The gallery grid's column count is computed in JS now (gridCols-style:
   full rows of three), so a photograph that is genuinely alone in the
   final row — remainder of exactly one — can be marked and given the
   `.ph`-style single-photograph treatment: its own natural size, up to
   330px, centred across the row. Every full row is untouched: three,
   five, six or one photograph must print exactly as before.

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
  /* EX021's own shape (four) plus its neighbours: an orphan of exactly one
     shows up again at seven; three, five, six and one must all stay put. */
  CMDash.importRecords([mk('EX021', 4), mk('EX022', 7), mk('EX023', 3), mk('EX024', 5), mk('EX025', 6), mk('EX026', 1)]);
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
    const secs = CMReport.sectionsFor('one', eq + '|2026-09-14|INSP', { lang: 'en', photos: true });
    const st = document.getElementById('galorphancss') || (() => { const s = document.createElement('style'); s.id = 'galorphancss'; s.textContent = CMR.CSS; document.head.appendChild(s); return s; })();
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    const imgs = [...d.querySelectorAll('.phg.gallery img')];
    const out = imgs.map(im => ({ last1: im.classList.contains('last1'), h: Math.round(im.getBoundingClientRect().height) }));
    d.remove();
    return out;
  }, equip);

  console.log('EX021 (four photographs): three at the ordinary size, the fourth alone and larger');
  const r4 = await measure('EX021');
  ok('four photographs found', r4.length === 4, JSON.stringify(r4));
  ok('the first three carry no last1 marker', r4.slice(0, 3).every(x => !x.last1), JSON.stringify(r4.slice(0, 3)));
  ok('  and sit at the ordinary gallery height', r4.slice(0, 3).every(x => x.h === 182), JSON.stringify(r4.slice(0, 3)));
  ok('the fourth carries last1', r4[3].last1, JSON.stringify(r4[3]));
  ok('  and renders taller than the row above it', r4[3].h > 182, r4[3].h + 'px');

  console.log('\n   (EX022, seven photographs: the same shape one row later)');
  const r7 = await measure('EX022');
  ok('seven photographs found', r7.length === 7, JSON.stringify(r7));
  ok('only the seventh carries last1', r7.filter(x => x.last1).length === 1 && r7[6].last1, JSON.stringify(r7.map(x => x.last1)));

  console.log('\n   (control: a full row of three is untouched)');
  const r3 = await measure('EX023');
  ok('three photographs, none marked', r3.length === 3 && r3.every(x => !x.last1), JSON.stringify(r3));

  console.log('\n   (control: five photographs — a row of three and a row of two, no lone orphan)');
  const r5 = await measure('EX024');
  ok('five photographs, none marked — a remainder of two is not a remainder of one', r5.length === 5 && r5.every(x => !x.last1), JSON.stringify(r5));

  console.log('\n   (control: two full rows of three)');
  const r6 = await measure('EX025');
  ok('six photographs, none marked', r6.length === 6 && r6.every(x => !x.last1), JSON.stringify(r6));

  console.log('\n   (control: a position with only one photograph is unaffected)');
  const r1 = await measure('EX026');
  ok('one photograph, not marked — the existing single-photo rule is untouched', r1.length === 1 && !r1[0].last1, JSON.stringify(r1));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
