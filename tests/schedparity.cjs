/* THE OFFICE AND THE FIELD SCHEDULE FROM THE SAME ARITHMETIC.

   One dataset, read by both applications, and every category has to come back
   identical: Overdue, Due soon, Deferred, Never inspected and Completed — as
   lists of unit-and-round, not just as totals, because two lists of the same
   length can still name different machines.

   That means the inputs have to be shared too, and this suite reads each of
   them from BOTH surfaces rather than keeping its own copy: the inspection
   history, the interval per round AND class, the operating-hours assumption,
   the cutoff date, the timezone the cutoff is computed in, the rule that
   drops voided records, and the rule that says which classes a round applies
   to. A difference in any one of them is a machine somebody drives out to
   twice, or one nobody drives out to at all.

   Run: node tests/schedparity.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : (process.env.CM_BASE || 'http://127.0.0.1:8099');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());
const diff = (a, b) => ({ onlyOffice: a.filter(x => !b.includes(x)), onlyField: b.filter(x => !a.includes(x)) });

(async () => {
  /* A fixture with something in every category: rounds walked long ago, rounds
     walked yesterday, a deferral, and a fleet far larger than the rounds
     recorded — so "never inspected" is a real population, not an empty set. */
  await reset('n=60');
  /* …plus rounds dated from today, spread across the plug round's own interval
     (250 h at 20 h/day is 12.5 days), so Completed and Due soon are real
     populations and the match below is not a match of two empty lists. */
  await reset('fresh=14&span=20');
  const b = await chromium.launch();

  /* ── the office ────────────────────────────────────────────────────── */
  const d = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const derrs = []; d.on('pageerror', e => derrs.push(e.message));
  await d.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); localStorage.setItem('cm_dash_lang', 'en'); }, BASE + '/exec');
  await d.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await d.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await d.waitForTimeout(1500);
  const D = await d.evaluate(() => {
    showTab('due', true); renderDueTab();
    const rows = dueTabRows(), never = dueNeverRows();
    const key = r => r.unit + '|' + r.ty;
    return {
      records: RECS.filter(r => !r._void).length,
      voided: RECS.filter(r => r._void).length,
      over: rows.filter(r => r.st === 'over').map(key).sort(),
      soon: rows.filter(r => r.st === 'soon').map(key).sort(),
      put: rows.filter(r => r.st === 'put' || r.st === 'off').map(key).sort(),
      done: rows.filter(r => r.st === 'ok').map(key).sort(),
      never: never.map(key).sort(),
      /* the inputs, asked of the page rather than assumed */
      today: DUE.today(), hpd: DUE.HOURS_PER_DAY,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      every: JSON.stringify(DUE.EVERY),
      spec: ['MP|HT', 'UC|DOZ', 'UC|EXC', 'TB|AT', 'FC|HT'].map(x => {
        const [ty, cls] = x.split('|'); const s = DUE.spec(ty, cls); return x + '=' + (s.h || ('d' + s.d)); }).join(' '),
    };
  });

  /* ── the field ─────────────────────────────────────────────────────── */
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(u => { localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '' }]));
    localStorage.setItem('cm_swap_off', '1'); localStorage.setItem('lang', 'en'); }, BASE + '/exec');
  const m = await ctx.newPage();
  const merrs = []; m.on('pageerror', e => merrs.push(e.message));
  await m.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await m.waitForTimeout(2500);
  const M = await m.evaluate(async () => {
    try { await teamPull(true, true); } catch (e) { return { err: String(e && e.message || e) }; }
    histCache = null;
    const rows = dueRows(), never = neverRows();
    const key = r => r.unit + '|' + r.ty;
    return {
      records: teamAll().filter(r => !r.void).length,
      over: rows.filter(r => r.st === 'over').map(key).sort(),
      soon: rows.filter(r => r.st === 'soon').map(key).sort(),
      put: rows.filter(r => r.st === 'put' || r.st === 'off').map(key).sort(),
      done: rows.filter(r => r.st === 'ok').map(key).sort(),
      never: never.map(key).sort(),
      today: DUE.today(), hpd: DUE.HOURS_PER_DAY,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      every: JSON.stringify(DUE.EVERY),
      spec: ['MP|HT', 'UC|DOZ', 'UC|EXC', 'TB|AT', 'FC|HT'].map(x => {
        const [ty, cls] = x.split('|'); const s = DUE.spec(ty, cls); return x + '=' + (s.h || ('d' + s.d)); }).join(' '),
    };
  });
  ok('the phone read the folder', !M.err, M.err || 'ok');
  if (M.err) { await b.close(); console.log('\nFAILED: 1'); process.exit(1); }

  console.log('1. THE INPUTS BOTH SCHEDULE FROM');
  ok('the same cutoff date', D.today === M.today, D.today + ' / ' + M.today);
  ok('the same timezone behind it', D.tz === M.tz, D.tz + ' / ' + M.tz);
  ok('the same operating-hours assumption', D.hpd === M.hpd, D.hpd + ' / ' + M.hpd);
  ok('the same interval table, byte for byte', D.every === M.every, D.every === M.every ? 'identical' : 'DIFFERENT');
  ok('the same interval for a round AND a class', D.spec === M.spec, D.spec);
  ok('the same history, with voided records dropped by both', D.records === M.records,
     D.records + ' office / ' + M.records + ' field' + (D.voided ? ' (' + D.voided + ' voided, excluded)' : ''));

  console.log('\n2. THE CATEGORIES, AS LISTS AND NOT ONLY AS TOTALS');
  for (const [k, label] of [['over', 'Overdue'], ['soon', 'Due soon'], ['put', 'Deferred'], ['done', 'Completed'], ['never', 'Never inspected']]) {
    const x = diff(D[k], M[k]);
    ok(label + ': the same ' + D[k].length + ' unit-rounds on both',
       !x.onlyOffice.length && !x.onlyField.length,
       (x.onlyOffice.length || x.onlyField.length)
         ? 'office only: ' + x.onlyOffice.slice(0, 4).join(', ') + ' · field only: ' + x.onlyField.slice(0, 4).join(', ')
         : D[k].length + ' matching');
  }
  ok('there is something in every category, so the match is not an empty one',
     D.over.length > 0 && D.done.length > 0 && D.never.length > 0,
     ['over ' + D.over.length, 'soon ' + D.soon.length, 'put ' + D.put.length, 'done ' + D.done.length, 'never ' + D.never.length].join(' · '));
  /* No unit-round may be in two categories, on either surface. */
  const dup = s => { const all = [].concat(s.over, s.soon, s.put, s.done, s.never); return all.length - new Set(all).size; };
  ok('no unit-round is counted twice, office or field', dup(D) === 0 && dup(M) === 0, dup(D) + ' / ' + dup(M));

  console.log('\n3. AND THE SCREEN SAYS WHAT THE ENGINE SAYS');
  const tabs = await d.evaluate(() => { showTab('due', true); renderDueTab();
    const o = {}; document.querySelectorAll('#ddSeg [role=tab]').forEach(b => o[b.dataset.dd] = Number(b.querySelector('.n').textContent)); return o; });
  ok('the schedule tabs count what the engine counted',
     tabs.over === D.over.length && tabs.soon === D.soon.length && tabs.put === D.put.length
     && tabs.done === D.done.length && tabs.never === D.never.length,
     JSON.stringify(tabs));
  ok('and All is the sum of the five', tabs.all === D.over.length + D.soon.length + D.put.length + D.done.length + D.never.length,
     tabs.all + ' vs ' + (D.over.length + D.soon.length + D.put.length + D.done.length + D.never.length));
  ok('no page errors on either surface', derrs.length === 0 && merrs.length === 0,
     [...derrs, ...merrs].slice(0, 3).join(' | ') || 'none');

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
