/* ONE FILTER TOOLBAR ON EVERY OPERATIONAL PAGE — Phase 3.

   Type · Class · Grade · Period · Status · Search · More filters · Clear
   all, in that order; every filter a removable chip; the address carries
   every filter; the page says when it is filtered and how many records
   remain; the rarer filters sit behind "More filters" with a count; the
   support pages put the whole bar away; and nothing on a filtered page
   contradicts the filter.

   Run: node tests/toolbar.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const SEED = () => {
  const recs = [];
  for (let i = 0; i < 30; i++) recs.push({ equip: 'TK' + (101 + i), date: '2026-0' + (1 + i % 8) + '-1' + (i % 9), type: ['MP', 'TB', 'INSP'][i % 3], cls: i % 4 ? 'HT' : 'AT', by: i % 2 ? 'Ivanov' : 'Petrov', smu: String(1000 + i),
    items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 + (i % 5), defect: 'Ferrous debris', defectCode: 'DT14-03', action: 'SCH', actionLabel: 'Schedule repair',
              owner: i % 3 === 0 ? 'Sokolov' : '', due: i % 3 === 0 ? '2026-09-30' : '', status: i % 5 === 0 ? 'WIP' : (i % 5 === 1 ? 'DONE' : ''), wo: i % 7 === 0 ? 'WO-' + i : '' }] });
  CMDash.importRecords(recs); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden'); return recs.length;
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
  await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(1000);
  const n = await p.evaluate(SEED); await p.waitForTimeout(400);
  ok('thirty inspections seeded', n === 30);

  console.log('1. THE BAR');
  const bar = await p.evaluate(() => {
    const row = document.querySelector('main > .controls:not(.more)');
    const order = [...row.querySelectorAll('select, input[type=search], button')].map(e => e.id).filter(Boolean);
    return { order, more: document.getElementById('fMoreRow').classList.contains('hidden'), reset: document.getElementById('fReset').textContent.trim(),
             status: [...document.querySelectorAll('#fStatus option')].map(o => o.value), h: Math.round(row.getBoundingClientRect().height) };
  });
  ok('Type · Class · Grade · Period · Status · Search · More · Clear all, in that order', bar.order.join(',') === 'fType,fClass,fGrade,fRange,fStatus,fQ,fMore,fReset', bar.order.join(','));
  ok('  one row at 1366', bar.h <= 70, bar.h + 'px');
  ok('  the Status list: all, open, planned, in progress, done, verified, no action', bar.status.join(',') === ',open,PLAN,WIP,DONE,VERIFIED,NOACT', bar.status.join(','));
  ok('  "Clear all", and the More row is folded until wanted', bar.reset === 'Clear all' && bar.more);

  console.log('\n2. STATUS FILTERS EVERY PAGE, CHIPS, ADDRESS, COUNT');
  const S = await p.evaluate(() => {
    $('fStatus').value = 'WIP'; $('fStatus').dispatchEvent(new Event('change'));
    const recs = filtered();
    showTab('actions', true); actView = 'table'; renderActions();
    const rows = [...document.querySelectorAll('#actionTbl tbody tr.hrow')];
    const statuses = rows.map(tr => { const r = RECS.find(x => ekOf(x) === tr.dataset.fu); const i = r.items.find(x => x.key === tr.dataset.fi); return i.status; });
    showTab('equipment', true);
    const units = [...document.querySelectorAll('#equipSel option')].map(o => o.value);
    return { n: recs.length, allWip: recs.every(r => r.items.some(i => i.status === 'WIP')), rows: rows.length, statuses: [...new Set(statuses)].join(','),
             chips: [...document.querySelectorAll('#chips .chip')].map(c => c.textContent.trim()), hash: location.hash, count: $('fCount').textContent.trim(),
             filtered: document.body.classList.contains('filtered'), units: units.length, unitsOk: units.every(u => RECS.some(r => r.equip === u && r.items.some(i => i.status === 'WIP'))) };
  });
  ok('Status = In progress keeps only inspections with such a finding', S.n === 6 && S.allWip, S.n + ' records');
  ok('  the action register shows only those findings', S.rows === 6 && S.statuses === 'WIP', S.rows + ' rows · ' + S.statuses);
  ok('  the machine picker offers only those machines', S.units === 6 && S.unitsOk, S.units + ' machines');
  ok('  a removable Status chip, the address, the count and the "filtered" mark', S.chips.some(c => /^Status/.test(c)) && /st=WIP/.test(S.hash) && /6/.test(S.count) && S.filtered, S.chips.join(' | ') + ' · ' + S.hash + ' · ' + S.count);
  const X = await p.evaluate(() => { const x = [...document.querySelectorAll('#chips .chip')].find(c => /^Status/.test(c.textContent)); x.querySelector('button, .x, [data-x]') ? x.querySelector('button, .x, [data-x]').click() : x.click();
    return { st: $('fStatus').value, n: filtered().length, filtered: document.body.classList.contains('filtered') }; });
  ok('pressing the chip removes the filter', X.st === '' && X.n === 30 && !X.filtered, JSON.stringify(X));

  console.log('\n3. MORE FILTERS, CLEAR ALL, SEARCH');
  const M = await p.evaluate(() => { $('fMore').click(); const open = !$('fMoreRow').classList.contains('hidden');
    $('fDq').value = 'owner'; $('fDq').dispatchEvent(new Event('change')); renderAll();
    return { open, n: filtered().length, badge: $('fMoreN').textContent, badgeShown: !$('fMoreN').classList.contains('hidden'), on: $('fMore').classList.contains('on'), chip: [...document.querySelectorAll('#chips .chip')].map(c => c.textContent.trim()).join(' | ') }; });
  ok('More filters opens the second row; a data-quality filter set there counts on the button', M.open && M.badge === '1' && M.badgeShown && M.on && /Owner not assigned/.test(M.chip), JSON.stringify(M));
  const C = await p.evaluate(() => { $('fType').value = 'MP'; $('fQ').value = 'Sokolov'; renderAll(); const before = filtered().length; $('fReset').click();
    return { before, after: filtered().length, type: $('fType').value, q: $('fQ').value, dq: $('fDq').value, st: $('fStatus').value, chips: document.querySelectorAll('#chips .chip').length, badge: $('fMoreN').classList.contains('hidden') }; });
  ok('Clear all clears type, search, status and the More filters, and the chips go', C.before < 30 && C.after === 30 && !C.type && !C.q && !C.dq && !C.st && C.chips === 0 && C.badge, JSON.stringify(C));
  const Q = await p.evaluate(() => { const by = q => { $('fQ').value = q; const n = filtered().length; $('fQ').value = ''; return n; };
    return { owner: by('Sokolov'), code: by('DT14-03'), wo: by('WO-7'), insp: by('Petrov'), model: by((ASSET_BY.TK101 || {}).m || 'zzz'), none: by('nothing-here') }; });
  ok('search finds an owner, a failure-mode code, a work order, an inspector and a model', Q.owner === 10 && Q.code === 30 && Q.wo === 1 && Q.insp === 15 && Q.none === 0 && (Q.model > 0 || !ASSET_BY), JSON.stringify(Q));

  console.log('\n4. THE SUPPORT PAGES, AND RUSSIAN');
  const H = await p.evaluate(() => { $('fDq').value = 'owner'; renderAll(); const out = {};
    ['overview', 'lube', 'sync', 'reports', 'due', 'actions'].forEach(k => { showTab(k, true); out[k] = [document.querySelector('main > .controls:not(.more)').classList.contains('hidden'), $('fMoreRow').classList.contains('hidden')].join('/'); });
    showTab('overview', true); $('fDq').value = ''; renderAll(); return out; });
  ok('both rows go away on Lubrication, Data & Sync, Reports and Due, and come back on the analysis pages', H.lube === 'true/true' && H.sync === 'true/true' && H.reports === 'true/true' && H.due === 'true/true' && H.overview === 'false/false' && H.actions === 'false/false', JSON.stringify(H));
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(400);
  const R = await p.evaluate(() => ({ labels: [...document.querySelectorAll('main > .controls:not(.more) label')].map(l => l.textContent.trim()), more: $('fMore').textContent.trim(), reset: $('fReset').textContent.trim(),
    status: [...document.querySelectorAll('#fStatus option')].map(o => o.textContent) }));
  const cyr = x => /[А-Яа-яЁё]/.test(x);
  ok('in Russian: every label, the status list, More and Clear all', R.labels.every(cyr) && cyr(R.more) && cyr(R.reset) && R.status.every(cyr), [R.labels.join(','), R.more, R.reset, R.status.join(',')].join(' | '));
  await p.click('.lang button[data-lang="en"]');
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
