/* Two photographs dropped straight into the Drive folder, named exactly the way
   the phone would have named them. Reported: "I uploaded them but they are not
   counting." They are named correctly — a photograph is simply not an
   inspection. The count is of rounds, and a round is the .json sidecar; the
   photographs hang off it by name. Prove both halves. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 960 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);

  console.log('  the name the dashboard looks for');
  const names = await p.evaluate(() => {
    const rec = { equip: 'TK152', date: '2026-07-31', type: 'MP' };
    const base = window.CMDash.photoBase({ key: '4C' }, rec);
    return { base, tries: window.CMDash.photoNames(base, rec, ['']) };
  });
  ok('it is exactly what was uploaded', names.base === 'TK152_4C_31.07.2026_MP', names.base);
  ok('and .jpg is among the extensions it tries',
    names.tries.some(n => n === 'TK152_4C_31.07.2026_MP.jpg'), names.tries.join(' '));
  ok('an extension is required — a file with none is never found',
    !names.tries.includes('TK152_4C_31.07.2026_MP'));

  /* TK152 is in the bundled sample, so it already has rounds. For "does a
     photograph create an inspection?" the unit has to be one nothing knows. */
  console.log('\n  a photograph on its own is not an inspection');
  await p.evaluate(() => {
    localStorage.removeItem('cm_dash_records'); localStorage.removeItem('cm_dash_drive');
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const alone = await p.evaluate(() => {
    window.CMDash.addPhoto('TK900_4C_31.07.2026_MP.jpg', 'data:image/png;base64,AAA=');
    window.CMDash.addPhoto('TK900_4D_31.07.2026_MP.jpg', 'data:image/png;base64,BBB=');
    return { recs: window.CMDash.allRecs().filter(r => r.equip === 'TK900').length };
  });
  ok('the round count does not move', alone.recs === 0, alone.recs + ' rounds for TK900');

  console.log('\n  add the sidecar and both photographs attach themselves');
  const paired = await p.evaluate(() => {
    window.CMDash.importRecords([{ equip: 'TK900', date: '2026-07-31', type: 'MP', cls: 'HT',
      by: 'R. Marrero', smu: '5120', items: [
        { key: '4C', label: 'Left Rear Final Drive',  grade: 'C', sev: 'DEG' },
        { key: '4D', label: 'Right Rear Final Drive', grade: 'B', sev: 'INC' }] }]);
    const rec = window.CMReport.recsForScope('unit', 'TK900')[0];
    const n = window.CMReport.normalise([rec], { photos: true })[0];
    return { recs: window.CMDash.allRecs().filter(r => r.equip === 'TK900').length,
      found: n.items.map(i => (i.photos || []).length) };
  });
  ok('now it counts as one inspection', paired.recs === 1, String(paired.recs));
  ok('and each position picks up its own photograph',
    JSON.stringify(paired.found) === '[1,1]', JSON.stringify(paired.found));

  console.log('\n  a date that does not match finds nothing, silently');
  const wrong = await p.evaluate(() => {
    window.CMDash.addPhoto('TK901_4C_2026-07-31_MP.jpg', 'data:image/png;base64,CCC=');   // ISO, not DD.MM.YYYY
    window.CMDash.importRecords([{ equip: 'TK901', date: '2026-07-31', type: 'MP', cls: 'HT',
      by: 'x', items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'C' }] }]);
    const rec = window.CMReport.recsForScope('unit', 'TK901')[0];
    return window.CMReport.normalise([rec], { photos: true })[0].items[0].photos.length;
  });
  ok('the date has to be DD.MM.YYYY, not the ISO form', wrong === 0, String(wrong));

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
