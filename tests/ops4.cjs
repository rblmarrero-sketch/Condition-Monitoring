/* THE OPERATIONAL PAGES — Phase 4.

   Overview ranks attention in one stated order (Critical, Severe, Overdue
   action, Unassigned action, Degraded, Incipient) and says which; the action
   register carries Priority · Unit · Component · Finding · Required action ·
   Owner · Due · Status · Work order, names what is missing on each row, and
   edits owner, due, status and work order IN THE CELL through the same
   audited write the drawer uses — with no form control resident in the table;
   the schedule has Overdue · Due soon · Never inspected · Deferred ·
   Completed · All and the six add up; every operational page opens with a
   title and its purpose; every Data & Sync exception says what still counts,
   who corrects it, what to do and what it affects, and carries the button.

   Run: node tests/ops4.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const TERMS = require('../mobile/terms.js');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const SEED = () => {
  const it = (o) => Object.assign({ key: '4C', label: 'Left Rear Final Drive', defect: 'Ferrous debris', action: 'SCH', actionLabel: 'Schedule repair' }, o);
  /* Walked two days ago: inside every interval, so the schedule reads them
     as completed. Only TK108's plug round, from January, is overdue. */
  const d = new Date(DUE.today() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 2); const recent = d.toISOString().slice(0, 10);
  const recs = [
    { equip: 'TK101', date: recent, type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 2, owner: 'A', due: '2026-12-01' })] },                    // incipient
    { equip: 'TK102', date: recent, type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 5, owner: 'A', due: '2026-12-01', prio: 'P1' })] },        // critical
    { equip: 'TK103', date: recent, type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 3, owner: 'A', due: '2026-01-01', prio: 'P2' })] },        // overdue action
    { equip: 'TK104', date: recent, type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 3 })] },                                                     // unassigned action
    { equip: 'TK105', date: recent, type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 4, owner: 'A', due: '2026-12-01', status: 'WIP', prio: 'P2' })] }, // severe, WIP without WO
    { equip: 'TK106', date: recent, type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [it({ grade: 3, owner: 'A', due: '2026-12-01', prio: 'P2', wo: 'WO-6' })] },     // degraded
    { equip: 'TK107', date: recent, type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 }] },              // nothing
    { equip: 'TK108', date: '2026-01-01', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '100', items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 }] },              // overdue round
    { equip: 'TK108', date: recent, type: 'INSP', cls: 'HT', by: 'Ivanov', smu: '100', items: [{ key: '4C', label: 'x', grade: 1, _needsPoint: true, photos: 1 }] },   // exception
  ];
  CMDash.importRecords(recs); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  window.CMDrive.saveEdit = () => Promise.resolve({ ok: 1 }); window.CMDrive.configured = () => true;
  return recs.length;
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); localStorage.setItem('cm_dash_who', 'Planner'); });
  await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(1000);
  const n = await p.evaluate(SEED); await p.waitForTimeout(400);
  ok('nine inspections seeded', n === 9);

  console.log('1. OVERVIEW — ONE ATTENTION ORDER, STATED');
  const O = await p.evaluate(() => { showTab('overview', true); renderAll();
    const rows = [...document.querySelectorAll('#fleetTbl tbody tr')].map(tr => ({ u: tr.querySelector('td b').textContent, why: (tr.querySelector('.attn') || {}).textContent || '' }));
    const head = document.querySelector('#fleetTbl thead th[data-sort="prio"]');
    return { order: rows.map(r => r.u).join(','), whys: rows.map(r => r.why.replace(/^\d/, '')).join(' | '), sort: fleetSort.k + fleetSort.dir, head: head ? head.textContent.replace(/[▲▼↕]/g, '').trim() : '' }; });
  ok('Critical, Severe, Overdue action, Unassigned action, Degraded, Incipient — then the rest', O.order.indexOf('TK102,TK105,TK103,TK104,TK106,TK101') === 0, O.order);
  ok('  each row says why it is where it is', /Critical \| Severe \| Overdue action \| Unassigned action \| Degraded \| Incipient/.test(O.whys), O.whys);
  ok('  that order is the default sort, under a column called ' + O.head, O.sort === 'prio1' && O.head === TERMS.en.priority, O.sort + ' · ' + O.head);
  const O2 = await p.evaluate(() => { document.querySelector('#fleetTbl thead th[data-sort="date"]').click(); const k = fleetSort.k; document.querySelector('#fleetTbl thead th[data-sort="prio"]').click(); return { k, back: fleetSort.k + fleetSort.dir }; });
  ok('  another column sorts as before, and the Priority head restores the order', O2.k === 'date' && O2.back === 'prio1', JSON.stringify(O2));

  console.log('\n2. THE REGISTER — NINE COLUMNS, WHAT IS MISSING NAMED, NO RESIDENT CONTROLS');
  const A = await p.evaluate(() => { showTab('actions', true); actView = 'table'; renderActions();
    const heads = [...document.querySelectorAll('#actionTbl thead th')].map(x => x.textContent.replace(/[▲▼↕]/g, '').trim()).filter(Boolean);
    const row = u => [...document.querySelectorAll('#actionTbl tbody tr')].find(tr => tr.textContent.includes(u));
    const cell = (u, f) => (row(u).querySelector('td[data-ed="' + f + '"] .who span') || row(u).querySelector('td[data-ed="' + f + '"]')).textContent.replace(/\s+/g, ' ').trim();
    return { heads: heads.join(','),
      wo: cell('TK106', 'wo'), needWo: cell('TK105', 'wo'), noOwner: cell('TK104', 'owner'), noDue: cell('TK104', 'due'), st104: cell('TK104', 'status'),
      prio: row('TK102').querySelector('td:nth-child(2)').textContent.replace(/\s+/g, ' ').trim(),
      req: row('TK106').querySelectorAll('td')[5].textContent.trim(),
      resident: [...document.querySelectorAll('#actionTbl tbody tr')].reduce((s, tr) => s + tr.querySelectorAll('input:not(.asel), select, textarea').length, 0),
      plan: /Planning required|triage/i.test(document.getElementById('actionTbl').textContent) }; });
  ok('Priority · Unit · Component · Finding · Required action · Owner · Due · Status · Work order', A.heads === 'Priority,Unit,Component,Finding,Required action,Owner,Due,Status,Work order', A.heads);
  ok('  the work order shows, and a job in progress without one says "' + TERMS.en.need_wo + '"', A.wo === 'WO-6' && A.needWo === TERMS.en.need_wo, A.wo + ' · ' + A.needWo);
  ok('  an unassigned row says "' + TERMS.en.owner_unassigned + '" and "' + TERMS.en.need_due + '"', A.noOwner === TERMS.en.owner_unassigned && A.noDue === TERMS.en.need_due, A.noOwner + ' · ' + A.noDue);
  ok('  the status cell names the rest (priority), never "planning required"', /Priority required/.test(A.st104) && !A.plan, A.st104);
  ok('  Priority carries the grade and the stoppage priority', /Critical/.test(A.prio) && /P1/.test(A.prio), A.prio);
  ok('  the required action is its own column', A.req === 'Schedule repair', A.req);
  ok('  and not one form control lives in the rows', A.resident === 0, A.resident + ' controls');

  console.log('\n3. EDIT IN THE CELL — OWNER, DUE, STATUS, WORK ORDER; ESCAPE; AUDIT');
  const rowOf = u => p.locator('#actionTbl tbody tr', { hasText: u });
  await rowOf('TK104').locator('td[data-ed="owner"]').click();
  const E1 = await p.evaluate(() => ({ eds: document.querySelectorAll('#actionTbl .celled').length, drawer: !document.getElementById('follOv').classList.contains('hidden'), list: !!document.querySelector('#actionTbl .celled[list="ownerNames"]') }));
  ok('pressing the owner cell opens one editor there, with the names already used, and not the drawer', E1.eds === 1 && !E1.drawer && E1.list, JSON.stringify(E1));
  await p.keyboard.type('Sokolov'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  const E2 = await p.evaluate(() => { const r = RECS.find(x => x.equip === 'TK104'); const i = r.items[0];
    const tr = [...document.querySelectorAll('#actionTbl tbody tr')].find(x => x.textContent.includes('TK104'));
    return { owner: i.owner, by: i.planBy, at: !!i.planAt, cell: tr.querySelector('td[data-ed="owner"]').textContent.trim(), eds: document.querySelectorAll('#actionTbl .celled').length }; });
  ok('Enter saves the owner through the audited write (who, when) and the read-out returns', E2.owner === 'Sokolov' && E2.by === 'Planner' && E2.at && /Sokolov/.test(E2.cell) && E2.eds === 0, JSON.stringify(E2));
  await rowOf('TK104').locator('td[data-ed="due"]').click();
  await p.evaluate(() => { const e = document.querySelector('#actionTbl .celled'); e.value = '2026-10-15'; });
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  const E3 = await p.evaluate(() => RECS.find(x => x.equip === 'TK104').items[0].due);
  ok('the due date the same way', E3 === '2026-10-15', E3);
  await rowOf('TK104').locator('td[data-ed="wo"]').click(); await p.keyboard.type('WO-4104'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  const E4 = await p.evaluate(() => RECS.find(x => x.equip === 'TK104').items[0].wo);
  ok('and the work order', E4 === 'WO-4104', E4);
  await rowOf('TK104').locator('td[data-ed="status"]').click();
  const E5 = await p.evaluate(() => { const s = document.querySelector('#actionTbl select.celled'); return s ? [...s.options].map(o => o.value).join(',') : ''; });
  await p.selectOption('#actionTbl select.celled', 'WIP'); await p.waitForTimeout(400);
  const E6 = await p.evaluate(() => { const r = RECS.find(x => x.equip === 'TK104'); return { st: r.items[0].status, state: actionState(r, r.items[0]).k, eds: document.querySelectorAll('#actionTbl .celled').length }; });
  ok('the status is a list of the same states the drawer offers, and choosing one saves it', E5 === ',PLAN,WIP,DONE,VERIFIED,NOACT' && E6.st === 'WIP' && E6.eds === 0, JSON.stringify(E6));
  await rowOf('TK101').locator('td[data-ed="owner"]').click(); await p.keyboard.type('Nobody'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const E7 = await p.evaluate(() => ({ owner: RECS.find(x => x.equip === 'TK101').items[0].owner, eds: document.querySelectorAll('#actionTbl .celled').length }));
  ok('Escape cancels: nothing written, no editor left behind', E7.owner === 'A' && E7.eds === 0, JSON.stringify(E7));
  await rowOf('TK101').locator('td[data-ed="status"]').click(); await p.selectOption('#actionTbl select.celled', 'NOACT'); await p.waitForTimeout(300);
  const E8 = await p.evaluate(() => ({ disp: !document.getElementById('dispBox').classList.contains('hidden'), st: RECS.find(x => x.equip === 'TK101').items[0].status || '' }));
  ok('"No action needed" from the cell opens the disposition dialog — it is never written without an author and a reason', E8.disp && E8.st === '', JSON.stringify(E8));
  await p.click('#dispCancel'); await p.waitForTimeout(200);
  await rowOf('TK101').locator('td:nth-child(3)').click(); await p.waitForTimeout(200);
  const E9 = await p.evaluate(() => !document.getElementById('follOv').classList.contains('hidden'));
  ok('any other cell still opens the drawer', E9);
  await p.evaluate(() => closeFollow());

  console.log('\n4. THE SCHEDULE — SIX VIEWS THAT ADD UP');
  const D = await p.evaluate(() => { showTab('due', true); renderDueTab();
    const tabs = [...document.querySelectorAll('#ddSeg [role="tab"]')].map(b => ({ k: b.dataset.dd, n: +b.querySelector('.n').textContent, l: b.textContent.replace(/\d+$/, '').trim() }));
    const by = {}; tabs.forEach(t => by[t.k] = t);
    document.getElementById('ddScope').value = 'never'; renderDueTab();
    const first = document.querySelector('#ddList tbody tr');
    const cells = first ? [...first.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim()) : [];
    const count = ((document.querySelector('#ddList .pager') || {}).textContent || '').match(/(\d[\d,]*)\s*matching/);
    const opts = [...document.querySelectorAll('#ddScope option')].map(o => o.value);
    return { keys: tabs.map(t => t.k).join(','), labels: tabs.map(t => t.l).join(' | '), by, cells, never: count ? +count[1].replace(/,/g, '') : -1, opts: opts.join(','),
             sum: by.over.n + by.soon.n + by.never.n + by.put.n + by.done.n, all: by.all.n }; });
  ok('Overdue · Due soon · Never inspected · Deferred · Completed · All', D.keys === 'over,soon,never,put,done,all', D.keys);
  ok('  in the dictionary\'s words', D.labels === [TERMS.en.overdue, TERMS.en.due_soon, TERMS.en.never_inspected, TERMS.en.deferred, TERMS.en.completed, 'All'].join(' | '), D.labels);
  ok('  the five add up to All', D.sum === D.all && D.all > 0, D.sum + ' = ' + D.all);
  ok('  Overdue 1 (TK108\'s plug) · Completed 8 (walked within their interval)', D.by.over.n === 1 && D.by.done.n === 8, JSON.stringify({ over: D.by.over.n, done: D.by.done.n }));
  ok('  never inspected: every machine on a round with nothing recorded, one row per round', D.never > 100 && D.by.never.n === D.never, D.never + ' rows');
  ok('  a never-inspected row says so, has no last date and no clock, and still offers Start and Defer', D.cells.length === 7 && D.cells[2] === TERMS.en.never_inspected && D.cells[3] === '—' && /Start/.test(D.cells[6]) && /Defer/.test(D.cells[6]), D.cells.join(' | '));
  ok('  the address can name every view', D.opts === 'over,soon,due,never,put,done,all', D.opts);
  const csv = await p.evaluate(() => { let n = 0; const U = URL.createObjectURL; URL.createObjectURL = () => { n++; return 'blob:x'; };
    const C = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {};
    try { dueCsv(); } catch (e) { return 'threw ' + e.message; } finally { URL.createObjectURL = U; HTMLAnchorElement.prototype.click = C; }
    return n; });
  ok('  the CSV export of the never view does not throw', csv === 1, csv);

  console.log('\n5. EVERY OPERATIONAL PAGE OPENS WITH ITS TITLE AND PURPOSE');
  const H = await p.evaluate(() => { const out = {};
    ['overview', 'failure', 'wear', 'actions', 'equipment', 'due', 'lube', 'sync'].forEach(k => { showTab(k, true);
      const h = document.querySelector('#tab-' + k + ' .pagehd h1'), s = document.querySelector('#tab-' + k + ' .pagehd .pgsub');
      const h1s = document.querySelectorAll('#tab-' + k + ' h1').length;
      out[k] = { h: h ? h.textContent.trim() : '', s: s ? s.textContent.trim().length : 0, h1s, dup: h && [...document.querySelectorAll('#tab-' + k + ' h2')].some(x => x.textContent.trim() === h.textContent.trim()) }; });
    return out; });
  const pages = Object.keys(H);
  ok('a title on all eight', pages.every(k => H[k].h && H[k].h1s === 1), pages.map(k => k + ':' + H[k].h).join(' · '));
  ok('  a purpose line under Wear, Actions, Equipment and Due', ['wear', 'actions', 'equipment', 'due'].every(k => H[k].s > 20), ['wear', 'actions', 'equipment', 'due'].map(k => H[k].s).join(','));
  ok('  and no section heading repeats the page title', pages.every(k => !H[k].dup), pages.filter(k => H[k].dup).join(',') || 'none');

  console.log('\n6. DATA & SYNC — EVERY EXCEPTION SAYS FIVE THINGS AND CARRIES THE BUTTON');
  const X = await p.evaluate(() => { showTab('sync', true); renderSync();
    const tr = document.querySelector('#syQuarTbl tbody tr'); if (!tr) return null;
    const dts = [...tr.querySelectorAll('dt')].map(x => x.textContent.trim());
    const dds = [...tr.querySelectorAll('dd')].map(x => x.textContent.trim());
    const btn = tr.querySelector('button.syfix');
    return { what: (tr.querySelector('.tri') || {}).textContent || '', dts: dts.join(' | '), ddsOk: dds.length === 4 && dds.every(x => x.length > 10), btn: btn ? btn.textContent.trim() : '', key: btn && btn.dataset.quargo }; });
  ok('what is wrong, then: still counted · who corrects it · action · affects', X && X.dts === 'Still counted | Who corrects it | Action | Affects' && X.ddsOk, X && X.dts);
  ok('  a correction button on the row', X && X.btn === 'Correct' && !!X.key, X && X.btn);
  await p.click('#syQuarTbl button.syfix'); await p.waitForTimeout(500);
  const X2 = await p.evaluate(() => ({ edit: !document.getElementById('editOv').classList.contains('hidden'), open: [...document.querySelectorAll('.ov')].filter(x => !x.classList.contains('hidden')).map(x => x.id) }));
  ok('  and it opens the correction', X2.open.length > 0, JSON.stringify(X2));
  await p.evaluate(() => { const c = document.getElementById('opClose'); if (c) c.click(); document.querySelectorAll('.ov').forEach(x => x.classList.add('hidden')); });
  const jarg = await p.evaluate(() => TERMS.offends(document.getElementById('tab-sync').textContent + document.getElementById('tab-actions').textContent + document.getElementById('tab-due').textContent));
  ok('  no internal word on Sync, Actions or Due', !jarg, jarg || 'clean');

  console.log('\n7. RUSSIAN');
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(400);
  const R = await p.evaluate(() => { showTab('actions', true); actView = 'table'; renderActions();
    const heads = [...document.querySelectorAll('#actionTbl thead th')].map(x => x.textContent.replace(/[▲▼↕]/g, '').trim()).filter(Boolean);
    showTab('overview', true); renderAll();
    const whys = [...document.querySelectorAll('#fleetTbl .attn')].map(x => x.textContent.replace(/^\d|—/, '').trim());
    showTab('due', true); renderDueTab();
    const tabs = [...document.querySelectorAll('#ddSeg [role="tab"]')].map(b => b.textContent.replace(/\d+$/, '').trim());
    const subs = ['wear', 'actions', 'equipment', 'due'].map(k => (document.querySelector('#tab-' + k + ' .pagehd .pgsub') || {}).textContent || '');
    return { heads, whys, tabs, subs }; });
  const cyr = x => /[А-Яа-яЁё]/.test(x);
  ok('register heads, attention reasons, schedule tabs and purpose lines are all Russian', R.heads.every(cyr) && R.whys.every(cyr) && R.tabs.every(cyr) && R.subs.every(cyr), [R.heads.join(','), R.whys.join(','), R.tabs.join(',')].join(' | '));
  await p.click('.lang button[data-lang="en"]');
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
