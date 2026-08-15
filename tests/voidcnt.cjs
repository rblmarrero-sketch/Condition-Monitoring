/* Two counters that look like the same fact must never disagree in silence.
   The source chip counts everything loaded; the Inspections tile counts what is
   being counted. A voided round is in the first and not the second, and until
   now nothing on screen said so — the reader was left comparing 18 against 16
   and guessing. This drives the gap open and asks the page to explain itself. */
const { chromium } = require(require('./pw.cjs'));
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const UNITS = ['TK146', 'TK147', 'TK151', 'TK158', 'EX001', 'DZ001'];
const TAG = 'ZQXVOID';                 // a token no bundled record carries
const recs = () => UNITS.map((u, n) => ({
  equip: u, date: '2027-0' + (n + 1) + '-14', type: 'MP', cls: 'HT', by: TAG + ' ' + n,
  smu: String(5000 + n * 100),
  items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'C',
            defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', cause: 'Gear wear',
            action: 'SCH', actionLabel: 'Schedule repair' }],
}));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_/.test(m.text())) fails.push('CONSOLE ' + m.text()); });

  await p.goto('http://127.0.0.1:8099/dashboard/index.html', { waitUntil: 'load' });
  await p.evaluate(() => document.getElementById('dataOv').classList.add('hidden'));
  await p.waitForTimeout(300);
  // the page ships with bundled records; every count below is a delta on those
  const BASE = +(await p.$eval('#kpis .tile .v', e => e.textContent.trim()));
  await p.evaluate(r => CMDash.importRecords(r), recs());
  await p.evaluate(() => document.getElementById('dataOv').classList.add('hidden'));
  await p.waitForTimeout(300);

  const chip = () => p.textContent('#srcText');
  const tileV = () => p.$eval('#kpis .tile .v', e => e.textContent.trim());
  const tileS = () => p.$eval('#kpis .tile .s', e => e.textContent.trim());
  const hint = async () => (await p.$('#kpiVoid')) ? (await p.textContent('#kpiVoid')).trim() : null;

  const chipN = async () => +(await chip()).match(/(\d+)/)[1];

  console.log('nothing voided — the two counters agree');
  ok('chip counts all six', await chipN() === BASE + 6, await chip());
  ok('tile counts all six', +await tileV() === BASE + 6, await tileV());
  ok('chip says nothing about voids', !/voided/.test(await chip()), await chip());
  ok('no hint when there is no gap to explain', await hint() === null);

  console.log('\ntwo rounds voided');
  await p.evaluate(() => CMDash.setEdits([
    { key: 'TK147|2027-02-14|MP', void: true, reason: 'wrong unit', by: 'R. Marrero', at: '2026-08-01T09:00:00Z' },
    { key: 'EX001|2027-05-14|MP', void: true, reason: 'duplicate',  by: 'R. Marrero', at: '2026-08-01T09:01:00Z' },
  ]));
  await p.waitForTimeout(300);

  ok('chip still counts them — they are withdrawn, not deleted',
     await chipN() === BASE + 6, await chip());
  ok('chip now says two of them are voided', /2 voided/.test(await chip()), await chip());
  ok('tile drops the two', +await tileV() === BASE + 4, await tileV());
  ok('tile explains the missing two', /2 voided, not counted/.test(await tileS()), await tileS());
  ok('the tile plus the note add up to the chip', (+await tileV()) + 2 === await chipN());

  console.log('\nthe explanation is the control');
  await p.click('#kpiVoid');
  await p.waitForTimeout(300);
  ok('clicking it ticks Show voided', await p.isChecked('#fVoid'));
  ok('tile now counts them again', +await tileV() === BASE + 6, await tileV());
  ok('and the hint is gone, because there is no gap left', await hint() === null, await tileS());

  console.log('\nthe count is of the current view, not of the whole file');
  await p.uncheck('#fVoid');
  await p.fill('#fQ', TAG + ' 1');       // one record, and it is a voided one
  await p.waitForTimeout(400);
  ok('search finds nothing to count', await tileV() === '0', await tileV());
  ok('and says one voided is being held out of this view',
     /1 voided, not counted/.test(await tileS()), await tileS());
  await p.fill('#fQ', TAG + ' 0');       // one record, not voided
  await p.waitForTimeout(400);
  ok('a view with no voided rounds says nothing about voids',
     await tileV() === '1' && await hint() === null, await tileS());

  console.log('\nRussian');
  await p.fill('#fQ', '');
  await p.click('button[data-lang="ru"]');
  await p.waitForTimeout(400);
  const ru = await p.$eval('#kpis .tile .s', e => e.textContent.trim()).catch(() => '');
  ok('the note is translated', /отозвано: 2/.test(ru), ru);
  ok('the chip is translated', /отозвано: 2/.test(await chip()), await chip());

  await b.close();
  console.log(fails.length ? '\nFAILURES:\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})();
