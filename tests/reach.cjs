const REPO = require('path').join(__dirname, '..');
/* Everything the round captured has to arrive somewhere a person can see it.

   This is the check nobody writes, and it is the one that decays. A field gets
   added to the phone — a detection method, a baseline, a re-measure flag — and
   it is written, stored, synced, and then quietly dropped at the last step,
   because the dashboard was built before it existed. Nothing errors. The data
   is on the server. It simply never reaches a screen, and the inspector who
   filled it in every day for a year finds out it was never read.

   Three of those were live when this was written:

     · detection method (ISO 14224 "how it was found") — sent on the server
       path, MISSING from the ZIP export, and displayed on neither
     · stood — the app challenged an implausible reading and the inspector
       re-measured and confirmed it; exported, never shown
     · baseline — the reading was judged against a figure somebody set at the
       machine rather than the catalogue, which changes what every percentage
       on that position means; exported, never shown

   So the test is not "does the dashboard look right". It is: for every field
   the phone writes, is it on the screen or in the export? Add a field to the
   phone and forget the dashboard, and this goes red.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

/* One inspection carrying every field the phone can put on a position. The
   values are deliberately odd strings so a match cannot happen by accident. */
const REC = {
  equip: 'TK911', date: '2026-07-23', type: 'UC', cls: 'HT',
  by: 'R. Marrero', sup: 'V. Petrov', smu: '7411',
  gps: { lat: 68.1234, lon: 166.5678 }, dev: 'PH1',
  items: [{
    key: 'ROLLER.L1', label: 'Track roller — L1',
    grade: 'C', sev: 'DEG',
    defectCode: 'DT14-03', defect: 'Ferrous debris — heavy',
    iso: '5.1.2', isoMode: '5.1.2',
    causeCode: 'CS7-01', cause: 'Gear wear',
    action: 'SCH', actionLabel: 'Schedule repair',
    prio: 'P2', wo: 'N-4711',
    particle: '317', comp: '4411', oil: '512',
    tempC: '96', ambC: '-38', tempMethod: 'Infrared',
    comment: 'audible growl at low idle',
    detection: 'D-PM', detectionLabel: 'Periodic maintenance check',
    mm: 213, newMM: 250, condemnMM: 210, wearPct: 93, stood: 1,
    baseNew: 248, baseCondemn: 209, baseAll: 1,
    reason: '', reasonLabel: '',
  }],
};
/* A second position that was not measured, so the "why not" path is covered. */
const REC2 = {
  equip: 'TK911', date: '2026-05-19', type: 'UC', cls: 'HT', by: 'R. Marrero', smu: '6100',
  items: [{ key: 'ROLLER.L2', label: 'Track roller — L2', mm: null,
            reason: 'packed', reasonLabel: 'Packed with mud' },
          { key: 'ROLLER.L1', label: 'Track roller — L1', mm: 228,
            newMM: 250, condemnMM: 210, wearPct: 55 }],
};

/* field -> what must appear on screen for it to count as delivered. */
const EXPECT = [
  ['unit',            /TK911/],
  ['inspector',       /R\. Marrero/],
  ['supervisor',      /V\. Petrov/],
  ['hour meter',      /7411/],
  ['gps',             /68\.123|166\.567/],
  ['point name',      /Track roller/],
  ['grade',           /\bC\b/],
  ['defect',          /Ferrous debris/],
  ['defect code',     /DT14-03/],
  ['cause',           /Gear wear/],
  ['action',          /Schedule repair/],
  ['priority',        /P2|Priority/i],
  ['work order',      /N-4711/],
  ['particle count',  /317/],
  ['component hours', /4411/],
  ['oil hours',       /512/],
  ['temperature',     /96/],
  ['ambient',         /-38/],
  ['comment',         /audible growl/],
  ['measured mm',     /213/],
  ['worn %',          /93/],
  ['new / condemn',   /250|210/],
  ['detection method', /Periodic maintenance|D-PM/i],
  ['stood by reading', /challenged|re-?measur/i],
  ['baseline',        /248/],
];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1200 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.evaluate(([a, c]) => {
    CMDash.importRecords([a, c]);
    document.getElementById('dataOv').classList.add('hidden');
    showTab('equipment');
    const s = document.getElementById('equipSel'); s.value = 'TK911';
    s.dispatchEvent(new Event('change'));
  }, [REC, REC2]);
  await p.waitForTimeout(900);

  console.log('every captured field reaches the history screen');
  /* The whole tab, not just the list: the unit code is in the section heading
     above the cards, which is where a reader sees it. Scoping to #history alone
     reported a missing unit on a screen that was showing it in 20px type. */
  const screen = await p.evaluate(() =>
    document.getElementById('tab-equipment').innerText.replace(/\s+/g, ' '));
  note('screen holds', screen.length + ' characters');
  EXPECT.forEach(([name, re]) => ok(name + ' is on screen', re.test(screen),
    re.test(screen) ? '' : 'not found'));

  console.log('\nand the reason a point could not be measured');
  ok('a skipped point says why', /Packed with mud|packed/i.test(screen));

  console.log('\nthe action-register CSV carries them too');
  const csv = await p.evaluate(() => {
    /* Intercept the download rather than writing a file. */
    let out = '';
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = blob => { out = blob; return 'blob:stub'; };
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    document.getElementById('csvBtn').click();
    URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick;
    return out ? out.text() : '';
  });
  note('csv', (csv.split('\r\n')[0] || '').slice(0, 90) + '…');
  [['detection', /FoundBy/], ['stood', /ReMeasured/], ['hour meter', /SMU/],
   ['measured mm', /MeasuredMM/], ['baseline', /BaselineNew/],
   ['not-measured reason', /NotMeasuredReason/], ['photo count', /Photos/],
   ['voided flag', /Voided/]].forEach(([n, re]) =>
     ok('the CSV has a column for ' + n, re.test(csv)));
  ok('and the values are in the row',
     /D-PM|Periodic maintenance/.test(csv) && /7411/.test(csv) && /248/.test(csv),
     (csv.split('\r\n')[1] || '').slice(0, 120));

  console.log('\nthe phone puts the same fields into BOTH ways out');
  /* The server path carried the detection method and the ZIP did not, so which
     route a site used decided whether a field existed. Read the app's own
     export builders rather than trusting that they match. */
  const app = require('fs').readFileSync(REPO + '/mobile/index.html', 'utf8');
  const builders = app.split('tempC:p.tempV||""').length - 1;
  ok('both export builders were found', builders >= 2, builders + ' found');
  const zipHas = /detection:\(p\.detect\|\|DETECT_DEFAULT\)/.test(app);
  ok('the ZIP export carries the detection method', zipHas);
  ok('so does the server path', /detection:det/.test(app));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
