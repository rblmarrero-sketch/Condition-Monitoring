/* CM_DAYSUM_V1 + CM_PLAIN_V1 (Rickie 04.11.2026). On BOTH office pages, in English and Russian:
   1. Reports -> "Day summary for the e-mail": pick a day, tick rounds, one row per recorded position
      (date, unit, component, type of defect, description, defect/WO no., priority, severity); a Normal
      position carries the severity only; a position nothing was recorded on is left out; unticking a
      round takes its rows away; the copied table is plain inline-styled HTML a mail program keeps.
   2. Defects raised: the stage chips (All / Registered / In progress / Completed) count and filter, the
      Work order column shows the number, an In-progress defect with no number says "WO missing", and
      "Raised by" shows the name 1C has for whoever raised it (falling back to the CM name).
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
    { equip:"DZ011", date:"2026-11-01", type:"FC", cls:"DOZ", by:"Rayanov", items:[
      { key:"ENG", label:"Engine oil filter", grade:2, defect:"Fine particles", comment:"Watch" } ] }
  ]);
  window.CM_WO_DATA = Object.assign({}, window.CM_WO_DATA||{}, { cmSince:"2026-07-01", cmPeople:["Slam","Irek"],
    cmColumns:{}, cmWorkOrders:[
      { date:"2026-11-02", raised:"2026-11-02", asset:"TK150", defect:"DD-004512", system:"TK150.DRV.FD (Final drives)", defectType:"1.03 Wear", status:"Registered", by:"Slam", raisedBy:"Petrov A.", priority:"P2 Urgent" },
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
  const ds = await p.evaluate(() => { const b = document.getElementById('daySum'); if (!b) return null;
    const trs = [...b.querySelectorAll('#dsPrev tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim()));
    return { day: (document.getElementById('dsDay') || {}).value, chips: b.querySelectorAll('[data-dsk]').length, trs,
      th: [...b.querySelectorAll('#dsPrev thead th')].map(t => t.textContent), intro: (b.querySelector('#dsPrev p') || {}).textContent || '' }; });
  ok(ds && ds.day === '2026-11-02', 'opens on the newest day with rounds', ds && ds.day);
  ok(ds && ds.chips === 2, 'both rounds of that day are offered', ds && ds.chips);
  ok(ds && ds.th.length === 8, 'eight columns', ds && ds.th.join(' | '));
  ok(ds && ds.trs.length === 5, 'one row per recorded position; the empty plug 1 is left out', ds && ds.trs.length);
  const f = ds && ds.trs.find(r => /4E/.test(r[2])), n = ds && ds.trs.find(r => /4F/.test(r[2]));
  ok(f && /Wear/.test(f[3]) && /Heavy flakes/.test(f[4]) && f[5] === 'DD-004512' && /^P2/.test(f[6]), 'a plug finding is paired with the one defect raised on its unit', f && f.join(' | '));
  const eng = ds && ds.trs.find(r => /DRS\.ENG/.test(r[2])), mp = ds && ds.trs.find(r => /HS\.MP/.test(r[2]));
  ok(eng && eng[5] === 'DD-00016300' && /Leakage/.test(eng[3]) && /^P3/.test(eng[6]), 'a finding takes the defect raised for its system code, with 1C type and priority', eng && eng.join(' | '));
  ok(mp && /Not raised in 1C|Нет в 1С/.test(mp[5]), 'a Degraded finding with no defect in 1C says so', mp && mp[5]);
  ok(ds && !ds.trs.some(r => /WO-0/.test(r[5])), 'the round work order is never shown as the defect number', ds && ds.trs.map(r => r[5]).join(','));
  ok(n && n[3] === '—' && n[4] === '—' && n[5] === '—' && n[7].length > 2, 'a Normal position carries the severity only', n && n.join(' | '));
  await p.evaluate(() => { const c = document.querySelector('#daySum [data-dsk*="EX016"]') || [...document.querySelectorAll('#daySum [data-dsk]')].find(x => /EX016/.test(x.parentNode.textContent)); c.click(); });
  await p.waitForTimeout(200);
  const after = await p.evaluate(() => document.querySelectorAll('#dsPrev tbody tr').length);
  ok(after === 2, 'unticking a round takes its rows away', after);
  const mail = await p.evaluate(() => CMDaySum.mailHtml(CMDaySum.rowsFor(RECS.filter(r => r.date === '2026-11-02')), RECS.filter(r => r.date === '2026-11-02')));
  ok(/<table style="border-collapse:collapse">/.test(mail) && !/class="/.test(mail), 'the e-mail table has inline styles only', mail.length);
  if (lng === 'ru') ok(/Дата осмотра/.test(ds.th.join(' ')) && /Критичность/.test(ds.th.join(' ')), 'Russian headings', ds.th.join(' | '));
  console.log(tag + ' - defects raised');
  await p.evaluate(() => { showTab('cmwo'); renderCmWoTab(); }); await p.waitForTimeout(300);
  const cw = await p.evaluate(() => ({ chips: [...document.querySelectorAll('#cwStageF [data-cwst]')].map(b => b.textContent.trim()),
    rows: [...document.querySelectorAll('#cwList table.cwtbl tbody tr')].map(tr => [...tr.cells].map(c => c.textContent.trim())),
    nowo: (document.querySelector('#cwStageF .cwnowo') || {}).textContent || '' }));
  ok(cw.chips.length === 4 && /5$/.test(cw.chips[0]) && /2$/.test(cw.chips[1]) && /2$/.test(cw.chips[2]) && /1$/.test(cw.chips[3]), 'stage chips: all 5, registered 2, in progress 2, completed 1', cw.chips.join(' | '));
  ok(/1/.test(cw.nowo), 'one defect in progress without a WO number is counted', cw.nowo);
  const r1 = cw.rows.find(r => r.includes('TK150')), r2 = cw.rows.find(r => r.includes('TK151')), r3 = cw.rows.find(r => r.includes('TK152'));
  ok(r1 && r1.includes('Petrov A.'), 'Raised by shows the name 1C has', r1 && r1.slice(-3).join(' | '));
  ok(r2 && r2.includes('WO-9001') && r2.includes('Irek'), 'In progress shows its WO; no initiator falls back to the CM name', r2 && r2.slice(-3).join(' | '));
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
