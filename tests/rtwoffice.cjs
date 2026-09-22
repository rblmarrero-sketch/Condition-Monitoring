/* THE DASHBOARD'S OWN REPORT NEVER CARRIED RTW'S SCHEDULE ACROSS.

   recToExport0 (mobile/index.html) puts rtwWoType/rtwSchedHours/rtwSchedDate/
   rtwWoPriority/rtwTime on every RTW sidecar so a report can say what 1C
   scheduled a release against, not just which work order it closed —
   report-core.js's rtwHeaderStrip() reads exactly those five fields. The
   phone's OWN report (tests/rtw.cjs) builds its report object by hand from
   the live record and always carried them. dashboard/report.js's
   normalizeRecs() — the ONE place that turns a folder sidecar into what
   report-core.js reads, for both the single-round PDF and the Equipment
   History document — never read any of the five off `rec`. A round captured
   on the phone printed a correct header on that phone; the identical round,
   opened from the folder on the dashboard, printed an EMPTY header strip,
   because rtwHeaderStrip() returns "" once every field it looks for is gone.

   This proves the office's own report object now carries all five, straight
   off a real sidecar sitting in the fake Drive — never a re-derived copy.

   Run: node tests/rtwoffice.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;
const F = 'RTW/TK900/2026-09-20/';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const put = (name, buf) => fetch(B + '/__put?key=' + encodeURIComponent(F + name), { method: 'POST', body: buf });

const sidecar = JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [{
  id: 'RTW__TK900__2026-09-20__DEVXX__1', rev: 1, equip: 'TK900', date: '2026-09-20', type: 'RTW', cls: 'HT',
  by: 'A. Ivanov', sup: 'A. Ivanov', dev: 'DEVXX', signed: true,
  rtwWo: 'WO-900001', rtwResult: 'R', rtwComment: '',
  rtwWoType: '250 Hours service Planned', rtwSchedHours: 250, rtwSchedDate: '2026-09-18',
  rtwWoPriority: 'P3 Planned (PM)', rtwTime: '09:15',
  items: [
    { key: '1.1', label: '1.1', mark: 'pass', general: 0 },
  ],
}] });

(async () => {
  await fetch(B + '/__seed');
  await put('TK900_20.09.2026_RTW.json', Buffer.from(sidecar));

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); }, B + '/exec');
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2000);

  const r = await p.evaluate(async () => {
    await CMDrive.load(() => {});
    const rec = RECS.find(r => r.equip === 'TK900' && r.type === 'RTW');
    if (!rec) return { norec: true, n: RECS.length };
    const secs = await CMReport.sectionsFor('one', ekOf(rec), { photos: true, lang: 'en' });
    const html = (secs && secs.sections ? secs.sections : secs || []).map(s => s.html || '').join('\n');
    return {
      rtwWoType: rec.rtwWoType, rtwSchedHours: rec.rtwSchedHours, rtwSchedDate: rec.rtwSchedDate,
      rtwWoPriority: rec.rtwWoPriority, rtwTime: rec.rtwTime,
      hasStrip: html.includes('class="sstrip"'),
      hasPmService: /PM Service[\s\S]{0,200}250 h Service/.test(html),
      hasPmType: /Type of PM[\s\S]{0,200}P3 Planned/.test(html),
      hasSchedDate: html.includes('2026-09-18'),
      hasActual: /Actual date[\s\S]{0,200}2026-09-20 09:15/.test(html),
    };
  });
  ok('the record found in the folder is the one just seeded', !r.norec);
  ok('normalizeRecs() now carries rtwWoType off the sidecar', r.rtwWoType === '250 Hours service Planned', JSON.stringify(r));
  ok('...and rtwSchedHours', r.rtwSchedHours === 250);
  ok('...and rtwSchedDate', r.rtwSchedDate === '2026-09-18');
  ok('...and rtwWoPriority', r.rtwWoPriority === 'P3 Planned (PM)');
  ok('...and rtwTime', r.rtwTime === '09:15');
  ok('the header strip actually renders on the dashboard-built report, not empty', r.hasStrip);
  ok('PM Service reaches the printed strip', r.hasPmService);
  ok('Type of PM reaches the printed strip', r.hasPmType);
  ok('the scheduled date reaches the printed strip', r.hasSchedDate);
  ok('the actual date AND time reach the printed strip, beside the scheduled date', r.hasActual);
  ok('no page errors throughout', errs.length === 0, errs.join(' | '));

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
