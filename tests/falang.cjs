/* A FINDING IS NAMED IN THE LANGUAGE ON SCREEN.

   Field report, build 267: the dashboard in English, and the Failure
   analysis table's "Top defect" column reading "F62 · Разгрузочная часть"
   and "Втулка — Слева" down most of its length, with "Ferrous debris" on the
   rows captured by an English-speaking inspector. The table printed the text
   frozen on the record at capture — whatever language that phone was in —
   and the Pareto counted the same coded defect twice when it arrived in two
   languages.

   What has to be true, on the dashboard, from the real defect tables:
     · two rounds carrying the same defect CODE, one captured in Russian and
       one in English, are ONE Pareto bar, labelled in the language on screen;
     · pressing that bar keeps both rounds, and the filter chip is in the
       language on screen;
     · the affected-equipment table names a measured tray station and a
       track point in the language on screen, whatever the phone wrote;
     · switching to Russian re-labels all of it, and back.

   Run: node tests/falang.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const CYR = /[Ѐ-ӿ]/;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(2200);

  /* Seed: the same coded plug defect from two phones in two languages, a
     tray station measured past condemn on a Russian phone, a track point on
     a Russian phone. Units come off the register so the tray has a model. */
  const S = await p.evaluate(() => {
    const d = DEF['DT14-03'];
    const tb = (window.ASSETS || []).find(a => typeof bodyModelOf === 'function' && bodyModelOf(a.n));
    const uc = (window.ASSETS || []).find(a => (WEAR.map[a.m] || {}).m);
    RECS.length = 0;
    RECS.push({ id: 'fl1', equip: 'TK151', type: 'MP', date: '2026-09-01', by: 'Smith', cls: 'HT',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 5, defect: d.en, defectCode: 'DT14-03', cause: 'Gear wear', causeCode: 'CS-01' }] });
    RECS.push({ id: 'fl2', equip: 'TK152', type: 'MP', date: '2026-09-02', by: 'Хасенов', cls: 'HT',
      items: [{ key: '4C', label: 'Левая задняя бортовая', grade: 5, defect: d.ru, defectCode: 'DT14-03', cause: 'Износ шестерён', causeCode: 'CS-01' }] });
    if (tb) RECS.push({ id: 'fl3', equip: tb.n, type: 'TB', date: '2026-09-03', by: 'Хасенов', cls: 'AT',
      items: [{ key: 'F62', label: 'F62 · Разгрузочная часть', detection: 'DM-02', mm: 2.5, newMM: 20, condemnMM: 3, wearPct: 103, refSrc: 'tray:HM400' }] });
    if (uc) RECS.push({ id: 'fl4', equip: uc.n, type: 'UC', date: '2026-09-04', by: 'Хасенов', cls: 'DOZ',
      items: [{ key: 'BUSH.L', label: 'Втулка — Слева', grade: 5, mm: 60 }] });
    renderAll(); showTab('failure', true); clearDrill();
    return { tb: tb && tb.n, uc: uc && uc.n, en: d.en, ru: d.ru };
  });
  await p.waitForTimeout(500);
  ok('the seed found a tray unit and a track unit in the register', !!S.tb && !!S.uc, JSON.stringify(S));

  const read = () => p.evaluate(() => ({
    bars: [...document.querySelectorAll('#paretoDefect .prow[data-drill]')].map(r => ({ key: r.dataset.drill, label: r.querySelector('.lbl').textContent.trim(), n: Number(r.querySelector('.n').textContent) })),
    top: [...document.querySelectorAll('#failAffTbl tbody tr')].map(tr => ({ u: tr.dataset.u, top: tr.children[3].textContent.trim() })),
    chip: [...document.querySelectorAll('#chips .chip, #chips span, #chips button')].map(e => e.textContent).join(' | '),
    lang }));

  console.log('\nin English');
  let R = await read();
  const bar = R.bars.find(x => x.key === 'DT14-03');
  ok('the two captures of DT14-03 are one bar', !!bar && R.bars.filter(x => x.key === 'DT14-03').length === 1 && bar.n === 2, JSON.stringify(R.bars));
  ok('  labelled in English', !!bar && bar.label.indexOf(S.en) === 0, bar && bar.label);
  const tops = Object.fromEntries(R.top.map(x => [x.u, x.top]));
  ok('the affected table names the Russian-phone plug round in English', tops.TK152 === S.en, tops.TK152);
  ok('  and the tray station', !CYR.test(tops[S.tb] || '') && /F62/.test(tops[S.tb] || ''), tops[S.tb]);
  ok('  and the track point', !CYR.test(tops[S.uc] || '') && /Bushing/i.test(tops[S.uc] || ''), tops[S.uc]);
  ok('nothing in the column is in the wrong script', R.top.every(x => !CYR.test(x.top)), R.top.map(x => x.top).join(' | '));

  console.log('\npressing the bar');
  await p.evaluate(() => document.querySelector('#paretoDefect .prow[data-drill="DT14-03"]').click()); await p.waitForTimeout(400);
  const D = await p.evaluate(() => ({ drill: drill.defect, units: [...document.querySelectorAll('#failAffTbl tbody tr')].map(tr => tr.dataset.u).sort(), hash: location.hash }));
  ok('the filter is the code, and both machines stay', D.drill === 'DT14-03' && D.units.join() === 'TK151,TK152', JSON.stringify(D));
  R = await read();
  ok('  the chip names the defect in English', R.chip.indexOf(S.en) >= 0, R.chip);

  console.log('\nin Russian');
  await p.evaluate(() => document.querySelector('[data-lang="ru"]').click());
  await p.waitForTimeout(600);
  R = await read();
  const barRu = R.bars.find(x => x.key === 'DT14-03');
  ok('the same one bar, labelled in Russian', !!barRu && barRu.n === 2 && barRu.label.indexOf(S.ru) === 0, barRu && barRu.label);
  ok('  the chip follows', R.chip.indexOf(S.ru) >= 0, R.chip);
  await p.evaluate(() => clearDrill()); await p.waitForTimeout(400);
  R = await read();
  const topsRu = Object.fromEntries(R.top.map(x => [x.u, x.top]));
  ok('the English-phone plug round now reads in Russian', topsRu.TK151 === S.ru, topsRu.TK151);
  ok('  the tray station and the track point too', CYR.test(topsRu[S.tb] || '') && CYR.test(topsRu[S.uc] || ''), topsRu[S.tb] + ' | ' + topsRu[S.uc]);

  await p.evaluate(() => document.querySelector('[data-lang="en"]').click()); await p.waitForTimeout(600);
  R = await read();
  ok('and back to English', R.top.every(x => !CYR.test(x.top)), R.top.map(x => x.top).join(' | '));

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
