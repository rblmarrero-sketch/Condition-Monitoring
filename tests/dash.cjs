const { chromium } = require(require('./pw.cjs'));
const OUT = '/tmp/claude-0/-home-user-Condition-Monitoring/1f3ebdba-c3da-5675-b557-e45dfee4b57e/scratchpad/out';
require('fs').mkdirSync(OUT, { recursive: true });

const recs = () => {
  const out = [];
  const units = ['TK146', 'TK147', 'TK151', 'TK158', 'EX07'];
  const defs = [['Ferrous debris — heavy', 'DT14-03', 'Gear wear'],
                ['External leakage — oil', 'DT1-05', 'Seal worn / hardened'],
                ['Cut / gouge exposing cords', 'DT8-02', 'Poor road maintenance']];
  units.forEach((u, n) => ['2026-05-20', '2026-06-18', '2026-07-23'].forEach((d, k) => {
    const [defect, defectCode, cause] = defs[(n + k) % defs.length];
    out.push({ equip: u, date: d, type: ['MP', 'FC', 'INSP', 'TEMP'][n % 4], cls: 'HT',
      by: ['R. Marrero', 'B. Ivanov'][n % 2], smu: String(5000 + n * 100 + k * 40),
      items: [
        { key: '4C', label: 'Left Rear Final Drive', grade: ['A', 'C', 'X'][(n + k) % 3],
          sev: '', defect, defectCode, cause, action: 'SCH', actionLabel: 'Schedule repair',
          wo: 'N-' + (100 + n), comment: 'seen on ' + d, particle: String(40 + k * 30) },
        { key: '4D', label: 'Right Rear Final Drive', grade: 'B' },
      ] });
  }));
  return out;
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const fails = [];
  const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_/.test(m.text())) fails.push('CONSOLE ' + m.text()); });

  await p.goto('http://127.0.0.1:8099/dashboard/index.html', { waitUntil: 'load' });

  console.log('first run');
  ok('data sheet opens itself when there is nothing loaded',
     await p.evaluate(() => !document.getElementById('dataOv').classList.contains('hidden')) ||
     await p.evaluate(() => CMDash.allRecs().length > 0), 'or bundled data exists');
  const cards = await p.$$eval('#dataOv .srccard .srchead > div > b', a => a.map(x => x.textContent));
  ok('three sources, each explained', cards.length === 3, cards.join(' | '));

  // load records the way the folder pick does
  await p.evaluate(r => { CMDash.importRecords(r); refreshSources(); }, recs());
  await p.evaluate(() => document.getElementById('dataOv').classList.add('hidden'));
  await p.waitForTimeout(300);

  console.log('\nstatus chip');
  const chip = await p.textContent('#srcText');
  ok('says what is loaded and from where', /inspection/.test(chip) && /unit/.test(chip), chip);

  console.log('\nsearch');
  const rowCount = () => p.$$eval('#fleetTbl tbody tr', a => a.length);
  const base = await rowCount();
  await p.fill('#fQ', 'TK151'); await p.waitForTimeout(400);
  const rowsAfter = await rowCount();
  ok('search narrows the fleet table', rowsAfter === 1, `${base} rows -> ${rowsAfter}`);
  const chipTxt = await p.textContent('#chips');
  ok('an active search shows as a chip', /Search/.test(chipTxt), chipTxt.replace(/\s+/g, ' ').trim());
  await p.click('#chipClear'); await p.waitForTimeout(300);
  const restored = await rowCount();
  ok('clear all restores everything', restored === base, `${restored} of ${base}`);
  ok('clear all empties the search box', (await p.inputValue('#fQ')) === '');

  console.log('\nsorting');
  const firstBy = k => p.$$eval('#fleetTbl tbody tr td:first-child', a => a.map(x => x.textContent.trim())[0]);
  await p.click('#fleetTbl th[data-sort="equip"]'); await p.waitForTimeout(200);
  const asc = await firstBy();
  await p.click('#fleetTbl th[data-sort="equip"]'); await p.waitForTimeout(200);
  const desc = await firstBy();
  ok('unit column sorts both ways', asc !== desc, `${asc} then ${desc}`);

  console.log('\ndrill-down from a chart');
  await p.click('nav.tabs button[data-tab="failure"]'); await p.waitForTimeout(250);
  const bar = await p.$('#paretoDefect .prow');
  const barLabel = (await bar.textContent()).trim().split('·')[0].trim();
  await bar.click(); await p.waitForTimeout(350);
  const chips2 = (await p.textContent('#chips')).replace(/\s+/g, ' ');
  ok('clicking a failure mode filters the dashboard', /Defect/.test(chips2), chips2.trim());
  await p.click('nav.tabs button[data-tab="actions"]'); await p.waitForTimeout(250);
  /* Grouped worklist, not a table: the defect sits in the second cell of a row. */
  /* nth-of-type counts SPANS, not .cell spans — the row also holds .sev and
     .go, so nth-of-type(2) was the wrong element. Take the cells properly. */
  const actDefects = await p.$$eval('#actionTbl .wlr',
    rows => rows.map(r => { const c = r.querySelectorAll('.cell');
      return c[1] ? (c[1].querySelector('.t1') || c[1]).textContent.trim() : ''; }));
  ok('the action register follows the drill-down',
     actDefects.length > 0 && actDefects.every(d => d.startsWith(barLabel.slice(0, 12))),
     `${actDefects.length} rows, all "${barLabel.slice(0, 20)}"`);
  await p.click('#chipClear'); await p.waitForTimeout(300);

  console.log('\nseverity legend');
  await p.click('nav.tabs button[data-tab="overview"]'); await p.waitForTimeout(300);
  const legend = await p.$$eval('#kpis .legend button', a => a.map(x => x.textContent.replace(/\s+/g,' ').trim()));
  ok('severity mix is a 4-row legend', legend.length === 4, legend.join(' | '));
  await p.click('#kpis .legend button:not([disabled])'); await p.waitForTimeout(300);
  ok('clicking a severity band filters', /Severity/.test(await p.textContent('#chips')));
  await p.click('#chipClear'); await p.waitForTimeout(300);

  console.log('\nscreens');
  await p.click('nav.tabs button[data-tab="overview"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/dash-overview.png`, fullPage: false });
  await p.evaluate(() => openData()); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/dash-sources.png`, fullPage: false });

  console.log(fails.length ? '\nFAILURES: ' + fails.join(' | ') : '\nall dashboard checks passed');
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
