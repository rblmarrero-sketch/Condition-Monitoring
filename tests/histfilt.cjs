/* THE HISTORY NEVER CONTRADICTS THE FILTER ON THE BAR.

   Public defect, build 268: Grade "5 – Critical" chosen, Equipment History
   opened, the address #equipment?sev=5, the Critical chip on the bar — and
   CR002 listed with "3 – Degraded". The history read every record and ignored
   every filter the chips announced.

   What has to be true now, for the grade, the type, the class, the period,
   the search, the removable chips, a direct address and Back/Forward:
     · the machine list holds only machines with a matching inspection;
     · the chosen machine moves on if it stops matching;
     · the list shows only matching rounds, and on a grade filter only the
       matching positions;
     · a machine named in the address with nothing matching stays chosen and
       the page says "No Critical inspections for this equipment.";
     · removing the chip restores the whole history and the whole list;
     · Back and Forward restore the machine, the filter and the record.

   Run: node tests/histfilt.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  const recs = [
    { equip: 'CR002', date: '2026-08-20', type: 'INSP', cls: 'CRJ', by: 'A', smu: '100',
      items: [{ key: 'GEN', label: 'General', grade: 3, defect: 'Cracking', defectCode: 'FM-MEC-04' }] },
    { equip: 'TK151', date: '2026-09-01', type: 'MP', cls: 'HT', by: 'B', smu: '7100',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 5, defect: 'Ferrous debris — heavy', defectCode: 'DT14-03' },
              { key: '4D', label: 'Right Rear Final Drive', grade: 1 }] },
    { equip: 'TK151', date: '2026-07-10', type: 'MP', cls: 'HT', by: 'B', smu: '6900',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 2 }] },
    { equip: 'TK152', date: '2026-06-01', type: 'MP', cls: 'HT', by: 'C', smu: '5000',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 5, defect: 'Ferrous debris — heavy', defectCode: 'DT14-03' }] },
    { equip: 'DZ003', date: '2026-09-02', type: 'MP', cls: 'DOZ', by: 'D', smu: '9000',
      items: [{ key: '1A', label: 'Transmission', grade: 5, defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', comment: 'weld line seep' }] },
  ];
  CMDash.importRecords(recs);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  clearFilters();
};
const state = p => p.evaluate(() => ({
  hash: location.hash, unit: document.getElementById('equipSel').value,
  units: [...document.getElementById('equipSel').options].map(o => o.value),
  chips: [...document.querySelectorAll('#chips .chip:not(.clearall)')].map(c => c.textContent.replace('×', '').trim()),
  sub: document.getElementById('histSub').textContent,
  empty: (document.querySelector('#history .empty') || {}).textContent || '',
  rounds: [...document.querySelectorAll('#history .insp')].map(d => d.querySelector('.date').textContent),
  grades: [...document.querySelectorAll('#history .hrow .sevcell, #history .pos .pill, #history .sevcell')].map(e => e.textContent.trim()),
  drawer: !(document.getElementById('drw') || { hidden: true }).hidden && !(document.getElementById('drw') || {}).classList.contains('hidden'),
}));
const setSel = (p, id, v) => p.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change')); }, [id, v]);
const setInput = (p, id, v) => p.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }, [id, v]);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(SEED); await p.waitForTimeout(400);
  const CRIT = await p.evaluate(() => SEV[5].l), CRITN = await p.evaluate(() => GRADE.name(5, lang));

  console.log('\n1. the public defect: Grade 5 – Critical, then Equipment History');
  await setSel(p, 'fGrade', '5'); await p.waitForTimeout(300);
  await p.evaluate(() => showTab('equipment', true)); await p.waitForTimeout(400);
  let S = await state(p);
  ok('the address carries the filter', /#equipment\?.*sev=5/.test(S.hash), S.hash);
  ok('the Critical chip is on the bar', S.chips.some(c => c.indexOf(CRIT) >= 0), S.chips.join(' | '));
  ok('the machine list holds only machines with a Critical inspection', S.units.sort().join() === 'DZ003,TK151,TK152', S.units.join());
  ok('  CR002 (worst 3 – Degraded) is not offered', !S.units.includes('CR002'));
  ok('  and the chosen machine is one of them', ['DZ003', 'TK151', 'TK152'].includes(S.unit), S.unit);
  await setSel(p, 'equipSel', 'TK151'); await p.waitForTimeout(300);
  S = await state(p);
  ok('TK151 shows only its Critical round', S.rounds.join() === '2026-09-01', S.rounds.join());
  ok('  and only its Critical position, not the 1 – Normal one beside it', S.grades.length === 1 && S.grades[0].indexOf(CRIT) >= 0, S.grades.join(' | '));
  ok('  the sub-line says these are matching inspections', /matching/i.test(S.sub), S.sub);

  console.log('\n2. a direct address naming a machine with nothing Critical');
  await p.evaluate(() => { location.hash = '#equipment?sev=5&eq=CR002'; }); await p.waitForTimeout(600);
  S = await state(p);
  ok('the machine named in the address stays chosen', S.unit === 'CR002', S.unit);
  ok('  the chip is still on the bar', S.chips.some(c => c.indexOf(CRIT) >= 0), S.chips.join(' | '));
  ok('  and the page says "No Critical inspections for this equipment."', S.empty === 'No ' + CRITN + ' inspections for this equipment.', S.empty);
  ok('  nothing of grade 3 is shown', S.rounds.length === 0 && S.grades.length === 0);

  console.log('\n3. removing the chip restores everything');
  await p.evaluate(() => { const x = document.querySelector('#chips .chip [data-x]'); x.click(); }); await p.waitForTimeout(400);
  S = await state(p);
  ok('the chip is gone and the address no longer carries the grade', S.chips.length === 0 && !/sev=/.test(S.hash), S.hash);
  ok('CR002 shows its whole history again', S.unit === 'CR002' && S.rounds.join() === '2026-08-20', S.unit + ' ' + S.rounds.join());
  ok('  and the machine list is complete again', S.units.includes('CR002') && S.units.includes('TK151'), S.units.length + ' machines');

  console.log('\n4. type, class, period and search narrow the list the same way');
  await setSel(p, 'fType', 'INSP'); await p.waitForTimeout(300); S = await state(p);
  ok('type INSP: only CR002', S.units.join() === 'CR002', S.units.join());
  await setSel(p, 'fType', ''); await setSel(p, 'fClass', 'HT'); await p.waitForTimeout(300); S = await state(p);
  ok('class HT: TK151 and TK152, chosen machine moved on to one of them', S.units.join() === 'TK151,TK152' && ['TK151', 'TK152'].includes(S.unit), S.units.join() + ' · ' + S.unit);
  await setSel(p, 'fClass', ''); await setSel(p, 'fRange', '30'); await p.waitForTimeout(300); S = await state(p);
  ok('last 30 days: the June round on TK152 drops out', !S.units.includes('TK152') && S.units.includes('DZ003'), S.units.join());
  await setSel(p, 'equipSel', 'TK151'); await p.waitForTimeout(300); S = await state(p);
  ok('  and TK151 shows only its round inside the period', S.rounds.join() === '2026-09-01', S.rounds.join());
  await setSel(p, 'fRange', '0'); await setInput(p, 'fQ', 'weld'); await p.waitForTimeout(500); S = await state(p);
  ok('search "weld": only DZ003', S.units.join() === 'DZ003' && S.unit === 'DZ003', S.units.join() + ' · ' + S.unit);
  await setInput(p, 'fQ', ''); await p.waitForTimeout(300);
  await p.evaluate(() => clearFilters()); await p.waitForTimeout(300);

  console.log('\n5. Back and Forward restore the machine, the filter and the record');
  await setSel(p, 'equipSel', 'TK151'); await p.waitForTimeout(200);
  await setSel(p, 'fGrade', '5'); await p.waitForTimeout(300);
  await setSel(p, 'equipSel', 'TK152'); await p.waitForTimeout(300);
  S = await state(p);
  ok('TK152 under the Critical filter is in the address', /sev=5/.test(S.hash) && /eq=TK152/.test(S.hash), S.hash);
  await p.goBack(); await p.waitForTimeout(600); S = await state(p);
  ok('Back: TK151, the filter still on', S.unit === 'TK151' && /sev=5/.test(S.hash) && S.chips.some(c => c.indexOf(CRIT) >= 0), S.unit + ' ' + S.hash);
  ok('  and its list is still the Critical one', S.rounds.join() === '2026-09-01' && S.grades.length === 1, S.rounds.join());
  await p.goForward(); await p.waitForTimeout(600); S = await state(p);
  ok('Forward: TK152 again', S.unit === 'TK152' && /eq=TK152/.test(S.hash), S.unit + ' ' + S.hash);
  /* The record: open a position, Back closes it and leaves the page where it was. */
  await p.evaluate(() => { const tr = document.querySelector('#history tr.hrow, #history .pos, #history .hrow'); if (tr) tr.click(); else { const r = RECS.find(x => x.equip === 'TK152'); openPos(ekOf(r), '4C'); } });
  await p.waitForTimeout(500);
  const opened = await p.evaluate(() => { const d = document.getElementById('drw'); return !!d && !d.hidden && !d.classList.contains('hidden'); });
  ok('a position opens its record', opened);
  await p.goBack(); await p.waitForTimeout(600); S = await state(p);
  const closed = await p.evaluate(() => { const d = document.getElementById('drw'); return !d || d.hidden || d.classList.contains('hidden'); });
  ok('Back closes the record and keeps TK152 under the same filter', closed && S.unit === 'TK152' && /sev=5/.test(S.hash), S.unit + ' ' + S.hash);

  console.log('\n6. a fresh load on a filtered address applies the filter before anything is drawn');
  await p.goto(URL + '#equipment?sev=5&eq=TK151', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  await p.evaluate(SEED); await p.waitForTimeout(300);
  await p.evaluate(() => urlRead('#equipment?sev=5&eq=TK151')); await p.waitForTimeout(500);
  S = await state(p);
  ok('the filter, the machine and the Critical-only list are all in force', S.unit === 'TK151' && S.chips.some(c => c.indexOf(CRIT) >= 0) && S.rounds.join() === '2026-09-01' && S.grades.length === 1 && !S.units.includes('CR002'),
     JSON.stringify({ unit: S.unit, chips: S.chips, rounds: S.rounds, units: S.units }));

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
