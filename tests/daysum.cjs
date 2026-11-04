/* CM_DAYSUM_V1 + CM_PLAIN_V1 (Rickie 04.11.2026). On BOTH office pages, in English and Russian:
   1. Reports -> "Day summary for the e-mail" (CM_DAYMAIL_V1): From/To days, tick rounds; the e-mail is
      EN + RU (or one), headings in both, findings worst first with the 1C defect number, a Critical point
      in an ACTION REQUIRED box, a repeat flagged, Normal points on one line per round, links to the
      dashboard; inline styles only, so a mail program keeps it.
   2. Defects raised: the stage chips (All / Registered / In progress / Completed) count and filter, the
      Work order column shows the number, an In-progress defect with no number says "WO missing", and
      "Responsible" shows the person 1C has as responsible (04.11; the initiator field holds the organisation).
   3. The Condition trend says what its two numbers are.
   Run: node tests/daysum.cjs [port]   (needs tests/ed-srv.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const PORT = Number(process.argv[2] || 8093);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const SEED = `(function(){
  window.CMDash.importRecords([
    { equip:"TK150", date:"2026-11-02", type:"MP", cls:"HT", by:"Rayanov", items:[
      { key:"1", label:"Engine" },
      { key:"4E", label:"Left Rear Final Drive", grade:4, defect:"Metal particles", defectCode:"DT-12", comment:"Heavy flakes on plug", wo:"DD-004512", prio:"P2" },
      { key:"4F", label:"Right Rear Final Drive", grade:1, comment:"" } ] },
    { equip:"EX016", date:"2026-11-02", type:"INSP", cls:"EXC", by:"Ospanov", items:[
      { key:"HS.DL", label:"Hydraulic lines", grade:1 },
      { key:"DRS.ENG", label:"Engine", grade:3, comment:"Oil leak at the head gasket", wo:"WO-021099", prio:"P4" },
      { key:"HS.MP", label:"Hydraulic pumps", grade:3, comment:"Pump gasket weeping", wo:"WO-021099", prio:"P4" } ] },
    { equip:"TK160", date:"2026-11-02", type:"TB", cls:"HT", by:"Rayanov", items:
      Array.from({length:30},(_,n)=>({ key:"F"+(31+n), label:"Floor liner", grade: n<4?5:(n<20?4:1) })) },
    { equip:"DZ012", date:"2026-11-02", type:"UC", cls:"DOZ", by:"Ospanov", items:
      Array.from({length:20},(_,n)=>({ key:"ROLLER.L"+(n+1), label:"Track roller", grade: n<3?2:1 })) },
    { equip:"DZ011", date:"2026-11-01", type:"FC", cls:"DOZ", by:"Rayanov", items:[
      { key:"ENG", label:"Engine oil filter", grade:2, defect:"Fine particles", comment:"Watch" } ] }
  ]);
  window.CM_WO_DATA = Object.assign({}, window.CM_WO_DATA||{}, { cmSince:"2026-07-01", cmPeople:["Slam","Irek"],
    cmColumns:{}, cmWorkOrders:[
      { date:"2026-11-02", raised:"2026-11-02", asset:"TK150", defect:"DD-004512", system:"TK150.DRV.FD (Final drives)", defectType:"1.03 Wear", status:"Registered", by:"Slam", raisedBy:"Petrov A.", priority:"P2 Urgent" },
      { date:"2026-11-03", raised:"2026-11-03", asset:"TK160", defect:"DD-00016249", system:"TK160.CH.BY (Dump Body / Самосвальный кузов)", defectType:"1.08 Crack / fracture", descr:"Limit wear in the unloading zone", status:"Registered", by:"Slam", priority:"P4 Planned (Repair)" },
      { date:"2026-11-03", raised:"2026-11-03", asset:"EX016", defect:"DD-00016300", system:"EX016.DRS.ENG (Engine / Двигатель)", defectType:"1.01 Leakage", status:"Registered", by:"Irek", priority:"P3 Planned (PM)" },
      { date:"2026-11-01", asset:"TK151", defect:"DD-2", status:"Elimination scheduled", by:"Irek", woNumber:"WO-9001", priority:"P2 Urgent" },
      { date:"2026-11-01", asset:"TK152", defect:"DD-3", status:"In Progress", by:"Irek", priority:"P3" },
      { date:"2026-10-30", asset:"TK153", defect:"DD-4", status:"Completed", by:"Slam", raisedBy:"Ivanov B.", woNumber:"WO-9002", priority:"P4" } ] });
  return {};
})()`;
async function run(b, path, lng) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(l => { localStorage.setItem('cm_dash_lang', l); localStorage.setItem('askpi_lang', l); }, lng);
  await p.goto(`http://127.0.0.1:${PORT}/${path}`, { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(BUNDLED + '()'); await p.waitForTimeout(200);
  await p.evaluate(SEED); await p.waitForTimeout(200);
  const tag = path.split('/')[0] + ' ' + lng;
  console.log('\n' + tag + ' - day summary');
  await p.evaluate(() => showTab('reports')); await p.waitForTimeout(400);
  await p.evaluate(() => { try { localStorage.removeItem('cm_daymail_lang'); localStorage.removeItem('cm_daymail_every'); } catch (x) {} CMDaySum.state.lang = 'both'; CMDaySum.state.every = false; CMDaySum.draw(); });
  await p.evaluate(() => CMDash.importRecords([{ equip:"TK150", date:"2026-10-15", type:"MP", cls:"HT", by:"Rayanov", items:[{ key:"4E", label:"Left Rear Final Drive", grade:3, defect:"Metal particles", comment:"flakes" }] }]));
  await p.evaluate(() => CMDaySum.draw()); await p.waitForTimeout(200);
  const read = () => p.evaluate(() => { const b = document.getElementById('daySum'); if (!b) return null;
    const ft = b.querySelector('#dsPrev table[data-ds="find"]'), ct = b.querySelector('#dsPrev table[data-ds="clean"]');
    return { to: (document.getElementById('dsDay') || {}).value, from: (document.getElementById('dsFrom') || {}).value, chips: b.querySelectorAll('[data-dsk]').length,
      th: ft ? [...ft.querySelectorAll('thead th')].map(t => t.textContent.trim()) : [],
      trs: ft ? [...ft.querySelectorAll('tr')].filter(tr => !tr.querySelector('th')).map(tr => [...tr.cells].map(c => c.textContent.trim())) : [],
      clean: ct ? [...ct.querySelectorAll('tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()) : [],
      crit: ((b.querySelector('#dsPrev [data-ds="crit"]') || {}).textContent || '').replace(/\s+/g, ' '),
      html: (b.querySelector('#dsPrev') || {}).innerHTML || '', subj: (document.getElementById('dsSubjTxt') || {}).textContent || '' }; });
  let ds = await read();
  ok(ds && ds.to === '2026-11-02' && ds.from === '2026-11-02', 'opens on the newest day with rounds (From = To)', ds && ds.from + '..' + ds.to);
  ok(ds && ds.chips === 4, 'every round of that day is offered', ds && ds.chips);
  ok(ds && ds.th.length === 6 && ds.th.every(t => /[A-Za-z]/.test(t) && /[А-Яа-я]/.test(t)), 'six column headings, each in English and Russian', ds && ds.th.join(' | '));
  const g = ds.trs.map(r => Number((r[0].match(/^(\d)/) || [])[1]));
  ok(g.length && g.every((x, i) => !i || g[i - 1] >= x), 'findings are worst first', g.join(','));
  ok(ds.trs.length === 5, 'the findings: the tray, the plug, two engine/pump points, the undercarriage line', ds.trs.length);
  const tb = ds.trs.find(r => /TK160/.test(r[2])), uc = ds.trs.find(r => /DZ012/.test(r[2]));
  ok(tb && /^5/.test(tb[0]) && /DD-00016249/.test(tb[5]) && /CH\.BY/.test(tb[3]) && /Crack/.test(tb[4]) && /P4/.test(tb[5]), 'a dump body round is one row: the defect raised for CH.BY, at its worst severity', tb && tb.join(' | '));
  ok(uc && /20/.test(uc[3]) && /ROLLER\.L1/.test(uc[4]) && uc[5] === '—', 'an undercarriage round with no defect is one line: points measured, the worst ones', uc && uc.join(' | '));
  const f = ds.trs.find(r => /4E/.test(r[3]));
  ok(f && /Wear/.test(f[4]) && /Heavy flakes/.test(f[4]) && /DD-004512/.test(f[5]) && /P2/.test(f[5]), 'a plug finding is paired with the one defect raised on its unit', f && f.join(' | '));
  ok(f && /Repeat/.test(f[4]) && /Повтор/.test(f[4]) && /15\.10/.test(f[4]), 'a point graded before in the last 180 days is flagged as a repeat, with the grade and the day', f && f[4]);
  ok(tb && !/Repeat|Повтор/.test(tb[4]), 'a point with no earlier finding is not flagged', tb && tb[4]);
  const eng = ds.trs.find(r => /DRS\.ENG/.test(r[3])), mp = ds.trs.find(r => /HS\.MP/.test(r[3]));
  ok(eng && /DD-00016300/.test(eng[5]) && /Leakage/.test(eng[4]) && /P3/.test(eng[5]), 'a finding takes the defect raised for its system code, with 1C type and priority', eng && eng.join(' | '));
  ok(mp && /Not raised in 1C/.test(mp[5]) && /Нет в 1С/.test(mp[5]), 'a Degraded finding with no defect in 1C says so, in both languages', mp && mp[5]);
  ok(!ds.trs.some(r => /WO-0/.test(r[5])), 'the round work order is never shown as the defect number', ds.trs.map(r => r[5]).join(','));
  ok(ds.clean.some(r => /TK150/.test(r) && /4F/.test(r)) && !ds.trs.some(r => /4F/.test(r[3])), 'a Normal point is on one line under "no findings", not in the findings table', ds.clean.join(' // '));
  ok(/TK160/.test(ds.crit) && /ACTION REQUIRED/.test(ds.crit) && /ТРЕБУЮТСЯ/.test(ds.crit), 'a Critical point gets the ACTION REQUIRED box', ds.crit.slice(0, 90));
  ok(/dashboard-next\/#equipment\?eq=TK150/.test(ds.html) && /dashboard-next\/#overview/.test(ds.html), 'unit numbers link to their Equipment History and the box links to the dashboard', '');
  ok(/1 Critical/.test(ds.subj) && /Критическ/.test(ds.subj) && /02\.11\.2026/.test(ds.subj), 'the subject counts the worst grades in both languages', ds.subj);
  const mail = await p.evaluate(() => { const L = RECS.filter(r => r.date === '2026-11-02'); return CMDaySum.mailHtml(CMDaySum.rowsFor(L), L); });
  ok(!/class="/.test(mail) && /style="/.test(mail) && !/<style/.test(mail), 'the e-mail has inline styles only', mail.length);
  await p.evaluate(() => document.querySelector('#dsLang [data-v="en"]').click()); await p.waitForTimeout(200);
  ds = await read();
  ok(ds.th.length === 6 && ds.th.every(t => !/[А-Яа-я]/.test(t)) && !/[А-Яа-я]/.test(ds.subj), 'E-mail language EN: no Russian in the headings or the subject', ds.th.join(' | '));
  await p.evaluate(() => document.querySelector('#dsLang [data-v="ru"]').click()); await p.waitForTimeout(200);
  ds = await read();
  ok(ds.th[0] === 'Критичность' && /Отчёт МС/.test(ds.subj), 'E-mail language RU: Russian headings and subject', ds.th[0] + ' / ' + ds.subj);
  await p.evaluate(() => document.querySelector('#dsLang [data-v="both"]').click()); await p.waitForTimeout(200);
  await p.evaluate(() => { const s = document.getElementById('dsFrom'); s.value = '2026-11-01'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(250);
  ds = await read();
  ok(ds.chips === 5 && ds.trs.some(r => /DZ011/.test(r[2])) && /01–02\.11\.2026/.test(ds.subj), 'a From date takes in several days of rounds', ds.chips + ' ' + ds.subj);
  await p.evaluate(() => { const c = [...document.querySelectorAll('#daySum [data-dsk]')].find(x => /EX016/.test(x.parentNode.textContent)); c.click(); });
  await p.waitForTimeout(200);
  ds = await read();
  ok(!ds.trs.some(r => /EX016/.test(r[2])) && !ds.clean.some(r => /EX016/.test(r)), 'unticking a round takes its rows away', ds.trs.length);
  if (lng === 'ru') { const lab = await p.evaluate(() => [...document.querySelectorAll('#daySum .dsBar .fld>span')].map(x => x.textContent).join(' | '));
    ok(/С/.test(lab) && /По/.test(lab) && /Язык письма/.test(lab), 'the controls speak Russian on a Russian page', lab); }
  console.log(tag + ' - defects raised');
  await p.evaluate(() => { showTab('cmwo'); renderCmWoTab(); }); await p.waitForTimeout(300);
  const cw = await p.evaluate(() => ({ chips: [...document.querySelectorAll('#cwStageF [data-cwst]')].map(b => b.textContent.trim()),
    rows: [...document.querySelectorAll('#cwList table.cwtbl tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim())),
    nowo: (document.querySelector('#cwStageF .cwnowo') || {}).textContent || '' }));
  ok(cw.chips.length === 4 && /6$/.test(cw.chips[0]) && /3$/.test(cw.chips[1]) && /2$/.test(cw.chips[2]) && /1$/.test(cw.chips[3]), 'stage chips: all 6, registered 3, in progress 2, completed 1', cw.chips.join(' | '));
  ok(/1/.test(cw.nowo), 'one defect in progress without a WO number is counted', cw.nowo);
  const r1 = cw.rows.find(r => r.includes('TK150')), r2 = cw.rows.find(r => r.includes('TK151')), r3 = cw.rows.find(r => r.includes('TK152'));
  ok(r1 && r1.includes('Slam') && !r1.includes('Petrov A.'), 'Responsible shows 1C\'s responsible person, not the initiator (04.11)', r1 && r1.slice(-3).join(' | '));
  ok(r2 && r2.includes('WO-9001') && r2.includes('Irek'), 'In progress shows its WO and its responsible person', r2 && r2.slice(-3).join(' | '));
  ok(r3 && r3.some(c => /WO missing|Нет наряда/.test(c)), 'In progress with no WO says so', r3 && r3.slice(-3).join(' | '));
  await p.evaluate(() => document.querySelector('#cwStageF [data-cwst="prog"]').click()); await p.waitForTimeout(200);
  const nprog = await p.evaluate(() => document.querySelectorAll('#cwList table.cwtbl tbody tr').length);
  ok(nprog === 2, 'In progress chip filters to its 2 rows', nprog);
  await p.evaluate(() => { showTab('overview'); }); await p.waitForTimeout(300);
  const key = await p.evaluate(() => (document.querySelector('#trendChart .trkey') || {}).textContent || '');
  ok(/2[.,]4/.test(key), 'the trend says what its numbers are', key.slice(0, 70));
  ok(!errs.length, 'no page error', errs.join(' | '));
  await p.close();
}
(async () => {
  const b = await chromium.launch();
  for (const path of ['dashboard/index.html', 'dashboard-next/index.html']) for (const l of ['en', 'ru']) await run(b, path, l);
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})();
