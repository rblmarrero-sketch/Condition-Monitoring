/* THE DASHBOARD AT FLEET SIZE, READ BY A PLANNER — build 271.

   What a maintenance planner sees and does on the pages, checked at 1,128
   machines' worth of fleet rather than at forty-nine:
     · the words on the cards are the trade's, in both languages: "Unassigned
       actions", "Operating hours/day", "Deferral reason", "Inspections
       requiring correction", "Grade and condition do not match";
     · ONE Definitions control per page, and no card carries its own "How
       this is counted"; the reconciliation arithmetic stays under Admin
       diagnostics;
     · every large table pages at 25, offers 50 and 100, never "show all",
       says "N matching · showing a–b", and sorts over the WHOLE list;
     · the action register's rows are read-outs; the drawer the row opens is
       where owner, due, WO, priority, plan and status are edited, and "No
       action required" still has to be reasoned there;
     · the machine pickers are searchable comboboxes over the whole fleet —
       natural order, searched by number, class and model, walked by keyboard,
       and only the rows in view exist as elements;
     · the record filter bar is put away on the support pages, and the three
       searches say which they are.

   Run: node tests/p1ui.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* One round on each of 400 real register machines plus two invented ones
   whose numbers sort wrongly as strings, so natural order is provable. */
const SEED = () => {
  const A = (window.ASSETS || []).slice(0, 400).map(a => a.n).concat(['ZZ9', 'ZZ10']);
  const recs = A.map((u, i) => ({
    equip: u, date: '2026-0' + (1 + (i % 8)) + '-' + String(1 + (i % 27)).padStart(2, '0'), type: ['MP', 'INSP', 'TB'][i % 3],
    cls: (window.ASSET_BY && ASSET_BY[u] && ASSET_BY[u].cls) || 'HT', by: 'R', smu: String(4000 + i),
    items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 + (i % 5), defect: 'Ferrous debris', cause: 'Gear wear',
              action: i % 4 ? 'SCH' : '', actionLabel: i % 4 ? 'Schedule repair' : '', owner: i % 3 ? '' : 'Petrov', due: i % 5 ? '' : '2026-09-30' }] }));
  CMDash.importRecords(recs);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  return recs.length;
};
const key = e => new KeyboardEvent('keydown', { key: e, bubbles: true, cancelable: true });

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
  await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  const n = await p.evaluate(SEED); await p.waitForTimeout(500);
  ok('the fixture is a fleet, not a sample', n === 402, n + ' rounds');

  console.log('\n1. THE WORDS ON THE CARDS, IN BOTH LANGUAGES');
  const W = await p.evaluate(() => {
    const en = I18N.en, ru = I18N.ru;
    return { en: [en.a_k_unowned, en.dd_c_rate, en.dd_c_why, en.sy_k_recs_s, en.sy_k_grade_s, en.sy_quar],
             ru: [ru.a_k_unowned, ru.dd_c_rate, ru.dd_c_why, ru.sy_k_recs_s, ru.sy_k_grade_s],
             gone: [en.how_counted, ru.how_counted, en.pg_show_all, en.pg_all],
             letters: /\b[ABCX]→/.test(en.sy_sev_sub + ru.sy_sev_sub) };
  });
  /* The schedule words come from the shared dictionary (mobile/terms.js): the
     column that was "Deferral reason" is whatever the dictionary calls it. */
  const TERMS = require('../mobile/terms.js');
  ok('Unassigned actions · Operating hours/day · ' + TERMS.en.defer_reason + ' · requiring correction · Grade and condition do not match',
     W.en[0] === 'Unassigned actions' && W.en[1] === TERMS.en.hours_per_day && W.en[2] === TERMS.en.defer_reason
     && /requiring correction/.test(W.en[3]) && W.en[4] === 'Grade and condition do not match' && /requiring correction/.test(W.en[5]), W.en.join(' | '));
  ok('  and every one of them is Russian in Russian', W.ru.every(s => /[А-Яа-я]/.test(s)), W.ru.join(' | '));
  ok('"How this is counted" and "Show all" no longer exist as words', W.gone.every(x => x === undefined), JSON.stringify(W.gone));
  ok('no letter grade is written anywhere in the grade-review definition', !W.letters);

  console.log('\n2. ONE DEFINITIONS CONTROL PER PAGE');
  const D = await p.evaluate(() => {
    const out = {};
    ['overview', 'failure', 'wear', 'actions', 'due', 'lube', 'sync'].forEach(k => { const s = document.querySelector('#tab-' + k);
      out[k] = { defs: s.querySelectorAll('details.defs').length, open: s.querySelectorAll('details.defs[open]').length,
                 cards: [...s.querySelectorAll('details.method')].filter(d => d.id !== 'syAdmin' && !d.closest('#syAdmin')).length,
                 dts: s.querySelectorAll('details.defs dt').length }; });
    out.admin = { inAdmin: document.querySelectorAll('#syAdmin details.method').length, recon: !!document.getElementById('syRecon') };
    return out;
  });
  Object.keys(D).filter(k => k !== 'admin').forEach(k =>
    ok(k + ': one Definitions control, closed, ' + D[k].dts + ' term(s), no card-level disclosure', D[k].defs === 1 && D[k].open === 0 && D[k].cards === 0 && D[k].dts >= 1, JSON.stringify(D[k])));
  ok('the reconciliation method stays under Admin diagnostics', D.admin.inAdmin >= 1 && D.admin.recon);

  console.log('\n3. TABLES PAGE AT 25, OFFER 50 AND 100, NEVER "SHOW ALL"');
  await p.evaluate(() => { showTab('actions', true); actView = 'table'; renderActions(); }); await p.waitForTimeout(300);
  const T = await p.evaluate(() => ({
    rows: document.querySelectorAll('#actionTbl tbody tr.hrow').length, shown: $('actShown').textContent.trim(),
    sizes: [...document.querySelectorAll('#actionTbl .pgsz button')].map(b => b.textContent.trim()),
    all: document.querySelectorAll('[data-pg$=":all"]').length, total: actionRows().filter(x => actionRequired(x.r, x.i)).length }));
  ok('25 rows by default', T.rows === 25, T.rows + ' rows');
  ok('"N matching · showing 1–25"', new RegExp('^' + T.total.toLocaleString('en-US') + ' matching · showing 1–25').test(T.shown), T.shown);
  ok('25 / 50 / 100 offered, no show-all anywhere', T.sizes.join(',') === '25,50,100' && T.all === 0, T.sizes.join(',') + ' · ' + T.all + ' show-all');
  await p.evaluate(() => document.querySelector('#actionTbl [data-pg$=":size:100"]').click()); await p.waitForTimeout(300);
  const T2 = await p.evaluate(() => ({ rows: document.querySelectorAll('#actionTbl tbody tr.hrow').length, shown: $('actShown').textContent.trim(),
    on: (document.querySelector('#actionTbl .pgsz .on') || {}).textContent }));
  ok('100 a page draws 100 and says so', T2.rows === 100 && /showing 1–100/.test(T2.shown) && T2.on === '100', T2.shown);
  /* Sorting is over the whole list: sort by unit and the first page must hold
     the first 100 of ALL matching, not the first 100 of the first page. */
  const S = await p.evaluate(() => { document.querySelector('#actionTbl th[data-asort="unit"]').click();
    const units = [...document.querySelectorAll('#actionTbl tbody tr.hrow td:nth-child(3)')].map(td => td.textContent.trim());
    const all = actionRows().filter(x => actionRequired(x.r, x.i)).map(x => x.r.equip).sort((a, b) => a.localeCompare(b));
    return { first: units[0], last: units[units.length - 1], want0: all[0], want99: all[99] }; });
  ok('sorting by unit sorts the whole register, then pages it', S.first === S.want0 && S.last === S.want99, JSON.stringify(S));
  await p.evaluate(() => { document.querySelector('#actionTbl [data-pg$=":size:25"]').click(); });

  console.log('\n4. ACTION ROWS ARE READ; THE DRAWER IS WHERE THEY ARE EDITED');
  await p.evaluate(() => { window.__w = []; CMDrive.saveEdit = d => { window.__w.push(d); return Promise.resolve({ ok: true }); }; CMDrive.configured = () => true;
    try { localStorage.setItem('cm_dash_who', 'R. Marrero'); } catch (e) {} });
  const R = await p.evaluate(() => ({ fields: document.querySelectorAll('#actionTbl tbody input:not(.asel), #actionTbl tbody select, #actionTbl tbody textarea').length,
    who: document.querySelectorAll('#actionTbl tbody .who').length, st: document.querySelectorAll('#actionTbl tbody .st').length,
    unassigned: (document.querySelector('#actionTbl tbody .who.none span') || {}).textContent }));
  ok('no form control in any row; owner and status are read-outs', R.fields === 0 && R.who === 25 && R.st === 25, R.fields + ' field(s)');
  ok('  an unassigned action says so in words', !!R.unassigned && R.unassigned.length > 2, R.unassigned);
  await p.click('#actionTbl tbody tr.hrow'); await p.waitForTimeout(250);
  const Dr = await p.evaluate(() => ({ open: !$('follOv').classList.contains('hidden'),
    fields: ['follOwner', 'follDue', 'follStatus', 'follWo', 'follPlan'].every(id => !!$(id)), names: $('ownerNames').options.length }));
  ok('the row opens the drawer with owner, due, WO, status and plan', Dr.open && Dr.fields, JSON.stringify(Dr));
  ok('  and offers the names already in use', Dr.names >= 1, Dr.names + ' name(s)');
  await p.fill('#follOwner', 'Sokolov'); await p.fill('#follDue', '2026-10-01'); await p.selectOption('#follStatus', 'PLAN'); await p.fill('#follBy', 'R. Marrero');
  await p.click('#follSave'); await p.waitForTimeout(900);
  const Sv = await p.evaluate(() => ({ writes: window.__w.length, it: window.__w[0] && Object.values(window.__w[0].items)[0],
    row: (document.querySelector('#actionTbl tbody tr.hrow .who span') || {}).textContent, closed: $('follOv').classList.contains('hidden') }));
  ok('one save, one write, carrying owner, due and status', Sv.writes === 1 && Sv.it && Sv.it.owner === 'Sokolov' && Sv.it.due === '2026-10-01' && Sv.it.status === 'PLAN', JSON.stringify(Sv.it));
  ok('  and the row reads it back', Sv.closed && Sv.row === 'Sokolov', Sv.row);
  const NA = await p.evaluate(() => { const tr = document.querySelector('#actionTbl tbody tr.hrow'); openFollow(tr.dataset.fu, tr.dataset.fi);
    window.__w = []; $('follStatus').value = 'NOACT'; $('follStatus').dispatchEvent(new Event('change', { bubbles: true }));
    return { dialog: !$('dispBox').classList.contains('hidden'), reverted: $('follStatus').value !== 'NOACT', writes: window.__w.length }; });
  ok('"No action required" still needs a reason: the disposition dialog opens and nothing is written', NA.dialog && NA.reverted && NA.writes === 0, JSON.stringify(NA));
  await p.evaluate(() => { dispClose(); closeFollow(); });

  console.log('\n5. THE MACHINE PICKER IS A COMBOBOX OVER THE WHOLE FLEET');
  await p.evaluate(() => showTab('equipment', true)); await p.waitForTimeout(300);
  const C0 = await p.evaluate(() => ({ role: $('equipQ').getAttribute('role'), list: !!$('equipSelList'), hiddenSel: $('equipSel').getBoundingClientRect().width === 0,
    label: $('equipQ').getAttribute('aria-label'), text: $('equipQ').value, sel: $('equipSel').value, units: (window.__units || []).length,
    nat: (window.__units || []).indexOf('ZZ9') < (window.__units || []).indexOf('ZZ10') && ['ZZ10', 'ZZ9'].sort().join() === 'ZZ10,ZZ9' }));
  ok('a combobox stands in front of the select, which is out of sight', C0.role === 'combobox' && C0.list && C0.hiddenSel, JSON.stringify(C0));
  ok('  labelled "Search equipment: unit, class, model"', /Search equipment/.test(C0.label), C0.label);
  ok('  showing the chosen machine at rest', C0.text === C0.sel && !!C0.sel, C0.text);
  ok('the fleet is in natural order: ZZ9 before ZZ10, which a string sort gets wrong', C0.nat, C0.units + ' machines');
  await p.click('#equipQ'); await p.waitForTimeout(150);
  const C1 = await p.evaluate(() => ({ open: !$('equipSelList').classList.contains('hidden'), listed: CMB.equipSel.list.length,
    drawn: document.querySelectorAll('#equipSelList .cmbr').length, padH: parseInt($('equipSelList').querySelector('.cmbpad').style.height),
    expanded: $('equipQ').getAttribute('aria-expanded') }));
  ok('opening lists the whole fleet but draws only the rows in view', C1.open && C1.listed === C0.units && C1.drawn < 20 && C1.padH >= C1.listed * 30 && C1.expanded === 'true',
     C1.drawn + ' drawn of ' + C1.listed);
  await p.evaluate(() => { $('equipSelList').querySelector('.cmbs').scrollTop = 200 * 34; $('equipSelList').querySelector('.cmbs').dispatchEvent(new Event('scroll')); });
  const C2 = await p.evaluate(() => { const first = document.querySelector('#equipSelList .cmbr'); return { ix: first ? Number(first.dataset.ix) : -1, drawn: document.querySelectorAll('#equipSelList .cmbr').length }; });
  ok('scrolling deep draws that neighbourhood, not the whole list', C2.ix >= 190 && C2.drawn < 20, 'first drawn row #' + C2.ix + ', ' + C2.drawn + ' drawn');
  /* Search by class and by model, not only by number. */
  const cls = await p.evaluate(() => { const u = (window.__units || []).find(x => ASSET_BY[x] && ASSET_BY[x].cls && ASSET_BY[x].m); const a = ASSET_BY[u]; return { u, cls: a.cls, m: a.m }; });
  await p.fill('#equipQ', cls.cls); await p.waitForTimeout(150);
  const C3 = await p.evaluate(c => ({ n: CMB.equipSel.list.length, every: CMB.equipSel.list.every(it => (ASSET_BY[it.v] || {}).cls === c || it.v.indexOf(c) >= 0), foot: $('equipSelList').querySelector('.cmbf').textContent }), cls.cls);
  ok('typing a class "' + cls.cls + '" lists that class', C3.n > 0 && C3.every, C3.n + ' · ' + C3.foot);
  await p.fill('#equipQ', cls.m.split(' ')[0]); await p.waitForTimeout(150);
  const C4 = await p.evaluate(m => ({ n: CMB.equipSel.list.length, has: CMB.equipSel.list.some(it => (ASSET_BY[it.v] || {}).m === m) }), cls.m);
  ok('typing a model "' + cls.m.split(' ')[0] + '" finds machines of that model', C4.n > 0 && C4.has, C4.n + ' listed');
  /* Keyboard: type a number, arrow down, Enter. */
  const target = await p.evaluate(() => { const u = window.__units || []; return u[Math.floor(u.length * 0.7)]; });
  await p.fill('#equipQ', target); await p.waitForTimeout(150);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const C5 = await p.evaluate(() => ({ sel: $('equipSel').value, text: $('equipQ').value, closed: $('equipSelList').classList.contains('hidden'),
    title: $('histTitle').textContent, hash: location.hash }));
  ok('typing "' + target + '" and pressing Enter chooses it, closes the list and opens its history', C5.sel === target && C5.text === target && C5.closed && new RegExp(target).test(C5.title) && new RegExp('eq=' + target).test(C5.hash), JSON.stringify(C5));
  await p.fill('#equipQ', 'QQQQ'); await p.waitForTimeout(120);
  const C6 = await p.evaluate(() => ({ foot: $('equipSelList').querySelector('.cmbf').textContent, sel: $('equipSel').value }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  const C7 = await p.evaluate(() => ({ text: $('equipQ').value, closed: $('equipSelList').classList.contains('hidden'), sel: $('equipSel').value }));
  ok('a search with no match says so and changes nothing; Escape restores the chosen machine', /No match/.test(C6.foot) && C6.sel === target && C7.closed && C7.text === target && C7.sel === target, C6.foot + ' → ' + C7.text);
  /* The report picker and the lubrication model picker are the same control. */
  await p.evaluate(() => showTab('reports', true)); await p.waitForTimeout(300);
  const Rp = await p.evaluate(() => { $('rScope').value = 'unit'; refreshReportTargets(); return { role: $('rTargetQ').getAttribute('role'), list: !!$('rTargetList'), lbl: $('rTargetLbl').textContent, n: CMB.rTarget.o.items().length }; });
  ok('Reports: the machine picker is the same combobox over every machine', Rp.role === 'combobox' && Rp.list && Rp.n === C0.units && /Equipment/.test(Rp.lbl), JSON.stringify(Rp));
  await p.fill('#rTargetQ', target); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const Rp2 = await p.evaluate(() => ({ v: $('rTarget').value, prev: $('rPreview').innerText }));
  ok('  choosing by keyboard sets the target and the preview follows', Rp2.v === target && new RegExp(target).test(Rp2.prev), Rp2.v);
  await p.evaluate(() => { showTab('lube', true); lubeGo('ref'); }); await p.waitForTimeout(300);
  const Lr = await p.evaluate(() => ({ inp: !!$('lrModelQ'), inLabel: !!($('lrModelQ') && $('lrModelQ').closest('label')), text: ($('lrModelQ') || {}).value, sel: $('lrModel').selectedOptions[0] && $('lrModel').selectedOptions[0].textContent }));
  ok('Lubrication reference: the model picker is a combobox inside its label, showing the chosen model', Lr.inp && Lr.inLabel && Lr.text === Lr.sel && !!Lr.text, Lr.text);

  console.log('\n6. SUPPORT PAGES PUT THE RECORD FILTERS AWAY; THREE SEARCHES, THREE NAMES');
  const Sp = await p.evaluate(() => { const out = {}; ['overview', 'actions', 'equipment', 'due', 'lube', 'sync', 'reports'].forEach(k => { showTab(k, true);
    out[k] = !document.querySelector('main > .controls').classList.contains('hidden'); });
    showTab('overview', true);
    return { bar: out, g: $('gq').getAttribute('aria-label'), f: $('fQ').placeholder, dd: (document.querySelector('label[for="ddQ"], #ddQ') && ($('ddQ').closest('label').querySelector('span') || {}).textContent) || '', eq: $('equipQ').placeholder }; });
  ok('the bar shows on the analysis pages and not on Due, Lubrication, Data & Sync or Reports',
     Sp.bar.overview && Sp.bar.actions && Sp.bar.equipment && !Sp.bar.due && !Sp.bar.lube && !Sp.bar.sync && !Sp.bar.reports, JSON.stringify(Sp.bar));
  ok('Global search / Filter records / Search this table / Search equipment', /^Global search/.test(Sp.g) && /^Filter records/.test(Sp.f) && /Search this table/.test(Sp.dd) && /^Search equipment/.test(Sp.eq),
     [Sp.g, Sp.f, Sp.dd, Sp.eq].join(' | '));

  console.log('\n7. IN RUSSIAN, THE SAME');
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(500);
  const Ru = await p.evaluate(() => { showTab('due', true); const heads = [...document.querySelectorAll('#ddList th')].map(x => x.textContent.trim());
    showTab('actions', true); const k = [...document.querySelectorAll('#actKpis .kpi .k')].map(x => x.textContent.trim());
    return { heads, k, defs: [...document.querySelectorAll('details.defs > summary')].map(s => s.textContent.trim()), eq: $('equipQ').placeholder, shown: $('actShown').textContent.trim() }; });
  ok('Russian headings: ' + TERMS.ru.hours_per_day + ' · ' + TERMS.ru.defer_reason, Ru.heads.includes(TERMS.ru.hours_per_day) && Ru.heads.includes(TERMS.ru.defer_reason), Ru.heads.join(' | '));
  ok('  cards: Работы без ответственного', Ru.k.some(x => /без ответственного/i.test(x)), Ru.k.join(' | '));
  ok('  Definitions → Определения, on every page', Ru.defs.length === 7 && Ru.defs.every(s => s === 'Определения'), Ru.defs.join(','));
  ok('  the picker and the pager speak Russian', /Поиск техники/.test(Ru.eq) && /совпадений/.test(Ru.shown), Ru.eq + ' · ' + Ru.shown);
  await p.click('.lang button[data-lang="en"]');

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
