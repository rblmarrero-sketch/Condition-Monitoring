/* THE RETIRED PLUG ANGLES ARE ONE DRIVE ON THE DASHBOARD, NOT FOUR.

   The TR60 magnetic-plug set carried four final-drive codes — 4C and 4E for the
   left rear, 4D and 4F for the right — where in truth there are two drives, each
   photographed from two angles. The set was corrected to one code per drive
   (4E left, 4F right), but rounds captured under the old scheme still hold all
   four positions in the folder, and nobody is going to rewrite three hundred
   sidecars. So the dashboard FOLDS the retired angles for display: 4C into 4E,
   4D into 4F, both angles' photographs on one card, the worse of the two grades.

   The failure this guards against is the signature one — a real value rendered
   as nothing. Fold on the URL and a lone-4C round shows a "4E" card that opens
   an empty drawer, because the stored record holds no 4E: the photograph is
   there and the click reaches nothing. So the card shows the canonical code but
   OPENS the position the record actually has (`data-ik`).

   Display only: the stored record keeps its captured positions, so the
   correction drawer still edits each angle as it was walked, and nothing is
   rewritten.

   Run: node tests/mpfold.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Four data-URL photographs, one per angle, so mediaAll() has real bytes to
   resolve without a folder pick, and each carries its own name (the URL). */
const PX = t => 'data:image/gif;base64,R0lGODlhAQABAIAAA' + t + 'AAAAAACwAAAAAAQABAAACAkQBADs=';
const A_4C = PX('AAP///'), A_4E = PX('P///AA'), A_4D = PX('AP//AA'), A_4F = PX('//AAAP');

const RECS = [
  /* Both drives, both angles, captured under the old scheme. 4C worse than 4E,
     4F worse than 4D, so the merge must take the worse grade from each pair. */
  { equip: 'TK149', date: '2026-08-24', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '19004',
    items: [
      { key: '1',  label: 'Engine', grade: 1 },
      { key: '4',  label: 'Differential', grade: 1 },
      { key: '4C', label: '4C Left Rear Final Drive', grade: 5, defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', photos: [A_4C] },
      { key: '4E', label: 'Left Rear Final Drive', grade: 2, photos: [A_4E] },
      { key: '4D', label: '4D Right Rear Final Drive', grade: 1, photos: [A_4D] },
      { key: '4F', label: 'Right Rear Final Drive', grade: 4, defect: 'Ferrous debris — moderate', photos: [A_4F] },
    ] },
  /* A lone retired angle: 4C only, no 4E anywhere on the record. */
  { equip: 'TK152', date: '2026-07-10', type: 'MP', cls: 'HT', by: 'C', smu: '5000',
    items: [{ key: '4C', label: '4C Left Rear Final Drive', grade: 3, defect: 'Fine swarf', photos: [A_4C] }] },
  /* A record already on the new codes — must pass through untouched. */
  { equip: 'TK160', date: '2026-09-01', type: 'MP', cls: 'HT', by: 'D', smu: '8000',
    items: [
      { key: '4E', label: 'Left Rear Final Drive', grade: 2, photos: [A_4E] },
      { key: '4F', label: 'Right Rear Final Drive', grade: 1, photos: [A_4F] },
    ] },
];

const seed = p => p.evaluate(recs => {
  window.CM_DATA = null; lang = 'en'; applyLang();
  CMDash.importRecords(recs);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  clearFilters();
}, RECS);

const recOf = (p, unit) => p.evaluate(u => RECS.find(r => r.equip === u), unit);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await seed(p); await p.waitForTimeout(300);

  console.log('the fold, at the level the views call it');
  const fold = await p.evaluate(() => {
    const r = RECS.find(x => x.equip === 'TK149');
    return mpDisplayFold(r).map(i => ({ key: i.key, grade: i.grade, srcKeys: (i._src || []).map(s => s.key), open: i._openKey }));
  });
  ok('four positions fold to four cards, the two drives merged', fold.length === 4, fold.map(f => f.key).join(','));
  const drives = fold.filter(f => f.key === '4E' || f.key === '4F');
  ok('  one card for each drive, keyed on the surviving code', drives.length === 2 && drives.map(d => d.key).sort().join() === '4E,4F', fold.map(f => f.key).join(','));
  ok('  4C folded into 4E', (fold.find(f => f.key === '4E') || {}).srcKeys.sort().join() === '4C,4E');
  ok('  4D folded into 4F', (fold.find(f => f.key === '4F') || {}).srcKeys.sort().join() === '4D,4F');
  ok('  the worse of the two grades leads each drive',
     (fold.find(f => f.key === '4E') || {}).grade === 5 && (fold.find(f => f.key === '4F') || {}).grade === 4,
     '4E=' + (fold.find(f => f.key === '4E') || {}).grade + ' 4F=' + (fold.find(f => f.key === '4F') || {}).grade);
  ok('  the plain engine and differential positions are untouched',
     fold.filter(f => f.key === '1' || f.key === '4').length === 2);

  console.log('\nthe media of a folded card carries both angles, each once');
  const med = await p.evaluate(() => {
    const r = RECS.find(x => x.equip === 'TK149');
    const c = mpDisplayFold(r).find(i => i.key === '4E');
    return histMedia(c._src, r).map(m => m.name);
  });
  ok('both angle photographs are on the one card', med.length === 2, med.length + ' media');
  ok('  and neither is dropped or doubled', new Set(med).size === 2);

  console.log('\na record already on the new codes is unchanged');
  const passthru = await p.evaluate(() => {
    const r = RECS.find(x => x.equip === 'TK160');
    const f = mpDisplayFold(r);
    return { same: f === r.items, keys: f.map(i => i.key), src: f.some(i => i._src) };
  });
  ok('the fold returns the record\'s own items, not a copy', passthru.same, passthru.keys.join(','));
  ok('  with no merge bookkeeping added', !passthru.src);

  console.log('\nthe list view: one row per drive, and each row opens its record');
  await p.evaluate(() => { histView = 'list'; try { localStorage.setItem('cm_dash_histview', 'list'); } catch (e) {} });
  await p.evaluate(() => { const el = document.getElementById('equipSel'); el.value = 'TK149'; el.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#history tr.hrow')].map(tr => ({ code: (tr.querySelector('b') || {}).textContent, ik: tr.dataset.ik })));
  ok('four positions, four rows — no 4C/4D rows beside 4E/4F',
     rows.length === 4 && !rows.some(r => r.code === '4C' || r.code === '4D'),
     rows.map(r => r.code).join(','));
  const rowE = rows.find(r => r.code === '4E');
  ok('  the 4E row opens the 4E position the record holds', rowE && rowE.ik === '4E', rowE && rowE.ik);

  console.log('\na lone 4C round shows a 4E card that OPENS — the drawer is not empty');
  await p.evaluate(() => { const el = document.getElementById('equipSel'); el.value = 'TK152'; el.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  const lone = await p.evaluate(() => [...document.querySelectorAll('#history tr.hrow')].map(tr => ({ code: (tr.querySelector('b') || {}).textContent, ik: tr.dataset.ik })));
  ok('the retired angle is shown under the surviving code', lone.length === 1 && lone[0].code === '4E', JSON.stringify(lone));
  ok('  but the click lands on 4C, the position the record actually has', lone[0] && lone[0].ik === '4C', lone[0] && lone[0].ik);
  await p.evaluate(() => { const tr = document.querySelector('#history tr.hrow'); tr.click(); });
  await p.waitForTimeout(500);
  const opened = await p.evaluate(() => { const d = document.getElementById('drw'); return !!d && !d.hidden && !d.classList.contains('hidden'); });
  ok('  the drawer opens on it, not on nothing', opened);

  console.log('\nthe photo-card view: one card per drive, both angles shown');
  await p.evaluate(() => { histView = 'photo'; try { localStorage.setItem('cm_dash_histview', 'photo'); } catch (e) {} });
  await p.evaluate(() => { const el = document.getElementById('equipSel'); el.value = 'TK149'; el.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(500);
  const cards = await p.evaluate(() => [...document.querySelectorAll('#history .pos')].map(d => ({
    ik: d.dataset.ik,
    imgs: (() => { try { return JSON.parse(d.dataset.med || '[]').length; } catch (e) { return -1; } }) })));
  const withImgs = await p.evaluate(() => [...document.querySelectorAll('#history .pos')].map(d => { try { return JSON.parse(d.dataset.med || '[]').length; } catch (e) { return -1; } }));
  ok('no card carries a retired code as its open target', !cards.some(c => c.ik === '4C' || c.ik === '4D'), cards.map(c => c.ik).join(','));
  ok('the merged left-drive card shows two photographs', withImgs.includes(2), withImgs.join(','));

  /* THE MEDIA EDITOR ON A MERGED CARD FILES AGAINST THE POINT THAT OWNS THE
     PHOTOGRAPH, NOT THE CODE THE CARD IS DRAWN UNDER. A 4C frame is shown on
     the 4E card; withdrawing it must take it off 4C, or hiddenSet(4C) never
     sees it and the removal is a click that does nothing — the signature
     defect, on the one screen whose whole subject is evidence. */
  console.log('\nwithdrawing a folded-in photograph takes it off the point that owns it');
  await p.evaluate(() => {
    window.__w = [];
    CMDrive.saveEdit = d => { window.__w.push(JSON.parse(JSON.stringify(d))); return Promise.resolve({ ok: true }); };
    CMDrive.hasName = () => true; CMDrive.configured = () => true;
    try { localStorage.setItem('cm_dash_who', 'R. Marrero'); localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    const el = document.getElementById('equipSel'); el.value = 'TK149'; el.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(500);
  const wd = await p.evaluate(async () => {
    const r = RECS.find(x => x.equip === 'TK149');
    /* The 4C frame, resolved the way the card resolves it, so we withdraw the
       exact name the button carries. */
    const c4c = (r.items || []).find(i => i.key === '4C');
    const name = mediaOf(c4c, r).map(m => m.name)[0];
    for (const bx of document.querySelectorAll('#history .medit')) bx.querySelector('.mtog').click();
    await new Promise(r => setTimeout(r, 150));
    const btn = [...document.querySelectorAll('#history .medit .mx')].find(b => b.dataset.name === name && b.dataset.on === '1');
    if (!btn) return { no: 'no remove button for ' + name };
    const card = btn.closest('.medit');
    const pk = btn.dataset.pk;
    const before4C = mediaOf((RECS.find(x => x.equip === 'TK149').items).find(i => i.key === '4C'), RECS.find(x => x.equip === 'TK149')).length;
    btn.click();                                   // arms — first press asks
    await new Promise(r => setTimeout(r, 120));
    card.querySelector('.mwhyi').value = 'thumb over the lens';
    card.querySelector('.mgo').click();            // confirm with a reason
    await new Promise(r => setTimeout(r, 400));
    const rec2 = RECS.find(x => x.equip === 'TK149');
    const after4C = mediaOf((rec2.items).find(i => i.key === '4C'), rec2).length;
    const doc = window.__w[window.__w.length - 1] || null;
    return { name, cardIk: card.dataset.ik, pk, before4C, after4C,
             filedItems: doc ? Object.keys(doc.items || {}) : [] };
  });
  if (wd.no) ok(false, 'the folded card offers a remove button', wd.no);
  else {
    ok('the frame is shown on the 4E card', wd.cardIk === '4E', wd.cardIk);
    ok('  but its remove button knows the frame belongs to 4C', wd.pk === '4C', wd.pk);
    ok('  and withdrawing it drops 4C\'s count by one', wd.after4C === wd.before4C - 1, wd.before4C + ' → ' + wd.after4C);
    ok('  the withdrawal is filed against 4C, not the card code', wd.filedItems.includes('4C') && !wd.filedItems.includes('4E'), wd.filedItems.join(','));
  }

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
