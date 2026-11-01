/* A DEFERRAL ENDS AT THE MACHINE'S NEXT 1C PM (build 567, field 02.11.2026).

   Read off a handset: TK149 LUBE and MP "Not being done — equipment not
   provided" on WO-019530, GR015 FC the same. "Not being done" was kept per
   machine and round type with no end, so it also covered the machine's NEXT
   work order, and the one after, until somebody walked the round. And a
   deferred row on a late day kept the red "late" edge, so it read as missed
   work.

   Proves, on the phone's CM agenda with a planted 1C schedule:
   1. the dialog offers "Next PM dd.mm" (the next 1C order for this machine and
      round), and only when 1C has one;
   2. "Not being done" stores pm = that date; the row says it comes back then;
   3. the next PM's own row is work, not covered by the deferral;
   4. from the next PM's date the deferral no longer holds (deferState and the
      shared DUE.status the office uses);
   5. walking the round still ends it at once;
   6. "Next PM" stores until = pm;
   7. a deferred row on a late day has no red edge (computed style);
   8. a server copy without pm (backend not redeployed) keeps this phone's pm;
   9. both office dashboards word it, in English and Russian. */
'use strict';
const pw = require(require('./pw.cjs'));
const fs = require('fs'), path = require('path');
const BASE = 'http://127.0.0.1:8099';
let bad = 0; const ok = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x != null ? '   ' + x : '')); if (!c) bad++; };

(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const perr = []; p.on('pageerror', e => perr.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_lang', 'en'); localStorage.setItem('cm_due_view', 'cm'); localStorage.removeItem('cm_due_defer'); });
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1800);
  const D = await p.evaluate(() => {
    ASSETS.length = 0;
    const day = DUE.today(), late = DUE.shift(day, -3), next = DUE.shift(day, 5);
    SCHED = { generated: new Date().toISOString(), byUnit: {
      TK149: [{ wo: 'WO-PM01', hours: 500, types: ['MP'], plan: late, priority: 'P3 Planned (PM)' },
              { wo: 'WO-PM02', hours: 750, types: ['MP'], plan: next, priority: 'P3 Planned (PM)' }],
      GR015: [{ wo: 'WO-PM03', hours: 2000, types: ['FC'], plan: late, priority: 'P3 Planned (PM)' }] } };
    showPane('paneDue'); dueView = 'cm'; dueSpan = 'all'; renderDue();
    return { day, late, next };
  });

  console.log('1. THE DIALOG OFFERS THE NEXT PM, ONLY WHEN 1C HAS ONE');
  const openFor = (u, wo) => p.evaluate(([u, wo]) => {
    const row = [...document.querySelectorAll('#dueCmList .duerow')].find(r => r.textContent.includes(u) && r.textContent.includes(wo));
    row.querySelector('.dueforget').click();
  }, [u, wo]);
  await openFor('TK149', 'WO-PM01'); await p.waitForTimeout(300);
  const chips = await p.evaluate(() => [...document.querySelectorAll('#dueWhen [data-w]')].map(b => b.dataset.w + '=' + b.textContent.trim()));
  const short = D.next.slice(8, 10) + '.' + D.next.slice(5, 7);
  ok('a Next PM chip with the next order\'s date', chips.some(c => c.startsWith('pm=') && c.includes(short)), chips.join(' | '));

  console.log('2. NOT BEING DONE STORES pm AND SAYS SO');
  await p.click('#dueWhen [data-w="off"]');
  await p.fill('#dueWhy', 'Equipment not provided');
  await p.click('#dueDlgOk'); await p.waitForTimeout(400);
  const d1 = await p.evaluate(() => deferOf('MP', 'TK149'));
  ok('until null, pm = the next PM', d1 && d1.until === null && d1.pm === D.next, JSON.stringify(d1));
  const row1 = await p.evaluate(() => { const r = [...document.querySelectorAll('#dueCmList .agitem')].find(r => r.textContent.includes('WO-PM01')); return r ? { cls: r.className, txt: r.textContent.replace(/\s+/g, ' '), edge: getComputedStyle(r).borderLeftColor, crit: getComputedStyle(document.documentElement).getPropertyValue('--critical').trim() } : null; });
  ok('the row says it comes back at the next PM', row1 && /deferred/.test(row1.cls) && row1.txt.includes('back at next PM ' + short), row1 && row1.txt);

  console.log('7. A DEFERRED ROW ON A LATE DAY HAS NO RED EDGE');
  const red = await p.evaluate(() => { const s = document.createElement('i'); s.style.color = 'var(--critical)'; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; });
  ok('edge is not the critical colour', row1 && row1.edge !== red, row1 && row1.edge + ' vs ' + red);

  console.log('3. THE NEXT PM\'S OWN ROW IS WORK');
  const row2 = await p.evaluate(() => { const r = [...document.querySelectorAll('#dueCmList .agitem')].find(r => r.textContent.includes('WO-PM02')); return r ? r.className : null; });
  ok('WO-PM02 drawn and not deferred', row2 !== null && !/deferred/.test(row2), row2);

  console.log('4. FROM THE NEXT PM DATE THE DEFERRAL NO LONGER HOLDS');
  const st = await p.evaluate(([day, next]) => {
    const d = deferOf('MP', 'TK149');
    const n = { over: true, dueInHours: -10, rate: 20 };
    const before = DUE.status({ type: 'MP', cls: 'HT', n, last: { d: '2026-01-01' }, defer: d, today: day }).st;
    const atPm = DUE.status({ type: 'MP', cls: 'HT', n, last: { d: '2026-01-01' }, defer: d, today: next }).st;
    const noPm = DUE.status({ type: 'MP', cls: 'HT', n, last: { d: '2026-01-01' }, defer: Object.assign({}, d, { pm: null }), today: next }).st;
    return { before, atPm, noPm, stToday: !!deferState('TK149', 'MP'), stPlanNext: !!deferState('TK149', 'MP', next) };
  }, [D.day, D.next]);
  ok('DUE.status: off before, over from the PM date, off with no pm (as before)', st.before === 'off' && st.atPm === 'over' && st.noPm === 'off', JSON.stringify(st));
  ok('deferState: holds today, not for the next PM\'s row', st.stToday && !st.stPlanNext);

  console.log('5. WALKING THE ROUND STILL ENDS IT');
  const walked = await p.evaluate(([day]) => { const h = histAll(); const k = 'MP|TK149'; const keep = h[k]; h[k] = Object.assign({}, keep || {}, { d: day }); try { return !deferState('TK149', 'MP'); } finally { if (keep) h[k] = keep; else delete h[k]; } }, [D.day]);
  ok('a round walked today answers the deferral', walked);

  console.log('6. NEXT PM STORES until = pm');
  await openFor('GR015', 'WO-PM03'); await p.waitForTimeout(300);
  const gChips = await p.evaluate(() => [...document.querySelectorAll('#dueWhen [data-w]')].map(b => b.dataset.w));
  ok('no Next PM chip when 1C has no next order', !gChips.includes('pm'), gChips.join(','));
  await p.click('#dueDlgCancel');
  await p.evaluate(([next]) => { SCHED.byUnit.GR015.push({ wo: 'WO-PM04', hours: 2500, types: ['FC'], plan: next }); renderDue(); }, [D.next]);
  await openFor('GR015', 'WO-PM03'); await p.waitForTimeout(300);
  await p.click('#dueWhen [data-w="pm"]');
  const okTxt = await p.textContent('#dueDlgOk');
  ok('the button names the date', okTxt.includes('next PM') && okTxt.includes(short), okTxt);
  await p.fill('#dueWhy', 'Equipment under repair'); await p.click('#dueDlgOk'); await p.waitForTimeout(300);
  const d2 = await p.evaluate(() => deferOf('FC', 'GR015'));
  ok('until = pm = next order', d2 && d2.until === D.next && d2.pm === D.next, JSON.stringify(d2));

  console.log('8. A SERVER COPY WITHOUT pm KEEPS THIS PHONE\'S');
  const kept = await p.evaluate(() => { const d = deferOf('MP', 'TK149'); teamDefer([{ u: 'TK149', t: 'MP', until: null, why: d.why, whyKey: '', by: d.by, at: d.at }]); return deferOf('MP', 'TK149'); });
  ok('pm survives the merge', kept && kept.pm === D.next, JSON.stringify(kept));

  ok('no page errors', perr.length === 0, perr.join(' | '));
  await b.close();

  console.log('9. BOTH OFFICE DASHBOARDS WORD IT');
  for (const f of ['dashboard/index.html', 'dashboard-next/index.html']) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    ok(f + ': ddDeferWords used, no inline copy left', /function ddDeferWords/.test(s) && !/r\.d\.until\?t\("dd_put_to"/.test(s));
    ok(f + ': EN and RU wording', /dd_pm_end:"back at next PM \{d\}"/.test(s) && /dd_pm_end:"вернётся к след\. ТО \{d\}"/.test(s));
  }
  const gs = fs.readFileSync(path.join(__dirname, '..', 'docs/google-upload.gs'), 'utf8');
  ok('Google script passes pm on (both readers)', (gs.match(/pm: j\.pm \|\| null/g) || []).length === 2);
  console.log(bad ? '\n' + bad + ' FAILED' : '\nALL PASS'); process.exit(bad ? 1 : 0);
})();
