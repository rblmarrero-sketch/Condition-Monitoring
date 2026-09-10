/* v3: TWO SMALL, CONCRETE FIXES, AND THE BIG ONE THEY SIT BESIDE.

   1. Recent Reports named every scope's entry by its translated label except
      "summary" — an Equipment Condition Summary run showed the literal word
      "summary" on the list, in both languages, because the map that names a
      scope had never heard of it.

   2. "Include complete inspection sheets as appendix" is the template's own
      escape hatch from the compact default: off unless asked for, and it only
      means anything on Equipment History and Trend — every other scope either
      already IS the full sheet (one inspection) or already has its own
      compact shape (Condition Summary, Round, Fleet).

   Run: node tests/rptappx.cjs   (needs tests/ed-srv.cjs on 8093)
*/
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  const recs = [
    { equip: 'TK149', date: '2026-08-24', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '19004',
      items: [{ key: '1', label: 'Engine', grade: 2 }] },
    { equip: 'TK149', date: '2026-08-24', type: 'FC', cls: 'HT', by: 'S. Volkov', smu: '19004',
      items: [{ key: 'ENG', label: 'Engine filter', grade: 1 }] },
    { equip: 'TK149', date: '2026-07-01', type: 'FC', cls: 'HT', by: 'S. Volkov', smu: '18500',
      items: [{ key: 'ENG', label: 'Engine filter', grade: 1 }] },
  ];
  CMDash.importRecords(recs);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(SEED); await p.waitForTimeout(300);

  console.log('Recent Reports names every scope, including "summary"');
  const label = await p.evaluate(() => {
    window.CM_DATA = null;
    rememberReport('summary', 'TK149', 2, 'prov');
    const li = document.querySelector('#rRecent li');
    return li ? li.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  ok('the entry shows the translated scope name, not the internal word "summary"',
     /condition summary/i.test(label) && !/\bsummary\b(?!.*condition)/i.test(label.toLowerCase().replace(/condition summary/, '')),
     label);
  await p.evaluate(() => { lang = 'ru'; applyLang(); renderRecentReports(); });
  const labelRu = await p.evaluate(() => (document.querySelector('#rRecent li') || {}).textContent.replace(/\s+/g, ' ').trim());
  ok('and in Russian too', /сводка состояния/i.test(labelRu), labelRu);
  await p.evaluate(() => { lang = 'en'; applyLang(); });

  console.log('\nthe appendix option exists only where it means something');
  await p.evaluate(() => { $('rScope').value = 'unit'; refreshReportTargets(); });
  await p.waitForTimeout(200);
  let hidden = await p.evaluate(() => $('rAppendixField').hidden);
  ok('shown for Equipment History and Trend (unit)', hidden === false);
  for (const sc of ['one', 'summary', 'round', 'month']) {
    await p.evaluate((sc) => { $('rScope').value = sc; refreshReportTargets(); }, sc);
    await p.waitForTimeout(150);
    hidden = await p.evaluate(() => $('rAppendixField').hidden);
    ok('  hidden for scope "' + sc + '"', hidden === true);
  }

  console.log('\nunchecked by default, and reportOpts() carries the choice through');
  await p.evaluate(() => { $('rScope').value = 'unit'; refreshReportTargets(); });
  await p.waitForTimeout(150);
  const checked = await p.evaluate(() => $('rAppendix').checked);
  ok('off by default', checked === false);
  let o = await p.evaluate(() => reportOpts());
  ok('  reportOpts().appendix is false', o.appendix === false);
  await p.evaluate(() => { $('rAppendix').checked = true; $('rAppendix').dispatchEvent(new Event('change')); });
  o = await p.evaluate(() => reportOpts());
  ok('  and true once checked', o.appendix === true);

  console.log('\nchecking it actually changes what the report contains');
  await p.evaluate(() => { $('rTarget').value = 'TK149'; if (typeof selectReportTarget === 'function') selectReportTarget('TK149'); });
  const compact = await p.evaluate(() => {
    const secs = CMReport.sectionsFor('unit', 'TK149', { lang: 'en', appendix: false });
    return { n: secs.length, hasAppendixNote: secs.some(s => /Appendix/.test(s.html)) };
  });
  const withAppx = await p.evaluate(() => {
    const secs = CMReport.sectionsFor('unit', 'TK149', { lang: 'en', appendix: true });
    return { n: secs.length, hasAppendixNote: secs.some(s => /Appendix/.test(s.html)) };
  });
  ok('unchecked: the compact document only, no appendix marker', !compact.hasAppendixNote, compact.n + ' sections');
  ok('checked: the appendix is there, and the document is longer for it',
     withAppx.hasAppendixNote && withAppx.n > compact.n,
     compact.n + ' → ' + withAppx.n + ' sections');

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
