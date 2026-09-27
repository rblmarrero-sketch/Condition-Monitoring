/* A FILTER PER COLUMN ON THE MAINTENANCE ACTIONS REGISTER.

   Defects Raised already had this (cwColQ/cwWordMatch, tests/cmwo.cjs §9):
   a second header row, one plain-text input per column, each narrowing only
   its OWN column, on top of the sortable headers the register already had.
   The Actions register is the second table to get it, reusing the exact
   same input class (table.grid th.cwfh input.cwcf) so no new CSS was needed
   — only the word-boundary match (cwWordMatch) and its own text accessor
   (actColVal) are register-specific.

   Run: node tests/actcolq.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const SEED = () => {
  const it = (o) => Object.assign({ key: '4C', label: 'Left Rear Final Drive', defect: 'Ferrous debris', action: 'SCH', actionLabel: 'Schedule repair' }, o);
  CMDash.importRecords([
    { equip: 'TK101', date: '2026-08-20', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 4, owner: 'A. Sokolov', due: '2026-12-01', wo: 'WO-1' })] },
    { equip: 'TK200', date: '2026-08-21', type: 'MP', cls: 'HT', by: 'Petrov', smu: '100', items: [it({ grade: 5, key: '4E', label: 'Right Rear Final Drive', owner: 'V. Petrov', due: '2026-09-05', wo: 'WO-2' })] },
    { equip: 'EX016', date: '2026-08-22', type: 'FC', cls: 'EXC', by: 'Sokolov', smu: '100', items: [it({ grade: 3, key: 'HYD', label: 'Hydraulic filter', defect: 'Metal filings', owner: '', due: '', wo: '', action: '', actionLabel: '' })] },
  ]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  showTab('actions', true); actView = 'table'; renderActions();
};
const INPAGE = () => {
  window.READ = () => ({
    units: [...document.querySelectorAll('#actionTbl tbody tr.hrow')].map(tr => (tr.dataset.fu || '').split('|')[0]),
    filterRow: [...document.querySelectorAll('#actionTbl thead tr:nth-child(2) th')].length,
    filterInputs: [...document.querySelectorAll('#actionTbl thead tr:nth-child(2) input.cwcf')].map(i => i.dataset.k),
    headCols: [...document.querySelectorAll('#actionTbl thead tr:first-child th')].length,
  });
  window.setCol = (k, v) => { const el = document.querySelector('#actionTbl .cwcf[data-k="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input')); };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(INPAGE); await p.evaluate(SEED); await p.waitForTimeout(400);

  console.log('\n── the filter row exists, one input per visible column, none over the tick or chevron columns');
  const shape = await p.evaluate(() => READ());
  ok('a second header row sits under the sortable one, same column count', shape.filterRow === shape.headCols, shape.filterRow + ' vs ' + shape.headCols);
  ok('every data column has its own filter input', shape.filterInputs.join(',') === 'queue,unit,comp,act,req,owner,due,st,wo', shape.filterInputs.join(','));
  ok('three rows to start', shape.units.length === 3, String(shape.units.length));

  console.log('\n── a column filter narrows to only that column, never another');
  const byOwner = await p.evaluate(() => { setCol('owner', 'Petrov'); return READ(); });
  ok('"Petrov" in Owner keeps only TK200 (owner V. Petrov)', byOwner.units.join(',') === 'TK200', byOwner.units.join(','));
  const clearOwner = await p.evaluate(() => { setCol('owner', ''); return READ(); });
  ok('clearing it restores all three', clearOwner.units.length === 3, String(clearOwner.units.length));

  const eq = (a, b) => a.length === b.length && a.slice().sort().join(',') === b.slice().sort().join(',');
  const byUnit = await p.evaluate(() => { setCol('unit', 'TK'); return READ(); });
  ok('a unit-column query never matches EX016 (Component/Finding, a different column)', eq(byUnit.units, ['TK101', 'TK200']), byUnit.units.join(','));
  await p.evaluate(() => setCol('unit', ''));

  console.log('\n── a short query does not match the middle of an unrelated word (the same rule cwWordMatch already proves on Defects Raised)');
  const wordBoundary = await p.evaluate(() => { setCol('comp', 'Rear'); return READ(); });
  ok('"Rear" matches both final-drive rows, on the word it actually starts', eq(wordBoundary.units, ['TK101', 'TK200']), wordBoundary.units.join(','));
  await p.evaluate(() => setCol('comp', ''));

  console.log('\n── a query matching nothing leaves the filter row on screen, with an explanation, not a blank table');
  const none = await p.evaluate(() => { setCol('unit', 'ZZZZ'); return { units: READ().units, empty: !!document.querySelector('#actionTbl td.empty'), filterStillThere: !!document.querySelector('#actionTbl .cwcf[data-k="unit"]') }; });
  ok('no rows match', none.units.length === 0, String(none.units.length));
  ok('the empty row says so', none.empty, String(none.empty));
  ok('and the filter input is still there to clear', none.filterStillThere, String(none.filterStillThere));
  await p.evaluate(() => setCol('unit', ''));

  console.log('\n── typing keystroke by keystroke never loses focus mid-rebuild (the disabled-input-that-looks-live shape)');
  await p.click('#actionTbl .cwcf[data-k="unit"]');
  await p.type('#actionTbl .cwcf[data-k="unit"]', 'EX0', { delay: 60 });
  const typed = await p.evaluate(() => {
    const el = document.querySelector('#actionTbl .cwcf[data-k="unit"]');
    return { val: el.value, focused: document.activeElement === el, units: READ().units };
  });
  ok('all three keystrokes landed', typed.val === 'EX0', typed.val);
  ok('the input never lost focus across the rebuilds in between', typed.focused, String(typed.focused));
  ok('and it actually narrowed the table', typed.units.join(',') === 'EX016', typed.units.join(','));
  await p.evaluate(() => setCol('unit', ''));

  console.log('\n── sorting a column and filtering it are independent — a filter survives a header click');
  const sortThenFilter = await p.evaluate(() => {
    setCol('owner', 'Sokolov');
    document.querySelector('#actionTbl th[data-asort="unit"]').click();
    return READ();
  });
  ok('the column filter is still applied after a sort', sortThenFilter.units.join(',') === 'TK101', sortThenFilter.units.join(','));
  await p.evaluate(() => setCol('owner', ''));

  console.log('\n── in Russian too — the shared placeholder, already proven on Defects Raised, needs no new key');
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(300);
  const ru = await p.evaluate(() => (document.querySelector('#actionTbl .cwcf') || {}).placeholder || '');
  ok('the filter placeholder is in Russian', /[А-Яа-я]/.test(ru), ru);

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
