/* WHICH COLUMNS THE REGISTER SHOWS.

   Nine columns is the register at its fullest. A planner working a week of
   assignments wants four of them; one working a shutdown wants the work
   orders. The choice is theirs, it is remembered, and two things it may not
   do: hide the machine (a row that does not say which machine it is about
   names nothing), or leave the table with no columns at all.

   Run: node tests/actcols.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const SEED = () => {
  const it = (o) => Object.assign({ key: '4C', label: 'Left Rear Final Drive', defect: 'Ferrous debris', action: 'SCH', actionLabel: 'Schedule repair' }, o);
  CMDash.importRecords([
    { equip: 'TK101', date: '2026-08-20', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 4, owner: 'A. Sokolov', due: '2026-12-01', wo: 'WO-1', prio: 'P2' })] },
    { equip: 'TK102', date: '2026-08-20', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 3 })] },
  ]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  showTab('actions', true); actView = 'table'; renderActions();
};
const INPAGE = () => {
  window.READ = () => ({
  heads: [...document.querySelectorAll('#actionTbl thead th')].map(x => x.textContent.replace(/[▲▼↕]/g, '').trim()).filter(Boolean),
  cells: document.querySelectorAll('#actionTbl tbody tr:first-child td').length,
  badge: document.getElementById('actColsN').textContent,
    saved: localStorage.getItem('cm_dash_actcols'),
  });
  window.set = (k, on) => { const cb = document.querySelector('[data-acol="' + k + '"]'); cb.checked = on; cb.dispatchEvent(new Event('change')); };
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  /* A fresh context has no storage of its own, so the choice this suite makes
     is the only one there is — and clearing the key on every navigation would
     have made "it survives a reload" unprovable. */
  await ctx.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(INPAGE); await p.evaluate(SEED); await p.waitForTimeout(400);

  const all = await p.evaluate(() => READ());
  ok('the register opens with all nine columns', all.heads.join(',') === 'Priority,Unit,Component,Finding,Required action,Owner,Due,Status,Work order', all.heads.join(','));
  ok('  and the control says so', all.badge === '9/9', all.badge);
  ok('  a row has a cell for each, plus the tick box and the chevron', all.cells === 11, String(all.cells));

  const off = await p.evaluate(() => { document.getElementById('actCols').open = true; set('wo', false); set('due', false); return READ(); });
  ok('unticking two columns removes them from the head and from every row',
     off.heads.join(',') === 'Priority,Unit,Component,Finding,Required action,Owner,Status' && off.cells === 9,
     off.heads.join(',') + ' · ' + off.cells + ' cells');
  ok('  the choice is written down', /"sev"/.test(off.saved || '') && !/"wo"/.test(off.saved || ''), off.saved);
  ok('  and counted on the control', off.badge === '7/9', off.badge);

  /* Sorting by a column that is then hidden must not leave the table sorted by
     something nobody can see. */
  const sorted = await p.evaluate(() => { const th = document.querySelector('#actionTbl th[data-asort="owner"]');
    th.click(); const was = actSort.k; set('owner', false); return { was, now: actSort.k }; });
  ok('a sort on a column that is hidden falls back to the queue', sorted.was === 'owner' && sorted.now === 'queue', JSON.stringify(sorted));

  const bare = await p.evaluate(() => { ['sev', 'comp', 'act', 'req', 'st'].forEach(k => set(k, false)); return READ(); });
  ok('the machine can never be hidden', bare.heads.indexOf('Unit') >= 0, bare.heads.join(','));
  ok('  and the last column standing cannot be unticked away', bare.heads.length >= 2, bare.heads.join(','));

  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(INPAGE); await p.evaluate(SEED); await p.waitForTimeout(400);
  const back = await p.evaluate(() => READ());
  ok('the choice survives a reload', back.heads.join(',') === bare.heads.join(','), back.heads.join(','));

  await p.evaluate(() => { localStorage.removeItem('cm_dash_actcols'); });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(INPAGE); await p.evaluate(SEED); await p.waitForTimeout(400);
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(400);
  const ru = await p.evaluate(() => ({ sum: document.querySelector('#actCols summary').textContent.trim(),
    labels: [...document.querySelectorAll('#actColsBody label')].map(x => x.textContent.trim()) }));
  const cyr = x => /[А-Яа-яЁё]/.test(x);
  ok('the control and every column name speak Russian', cyr(ru.sum) && ru.labels.every(cyr), ru.sum + ' · ' + ru.labels.join(', '));

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
