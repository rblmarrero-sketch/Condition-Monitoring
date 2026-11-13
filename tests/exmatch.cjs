/* CM_EXMATCH_V1 (Rickie 13.11.2026 "what if its different defects ... build it").
   Day summary -> Existing defect. Another supervisor's open defect on the same unit and system is listed with
   1C's own description; the ones whose description shares words with the inspector's comment come first and
   are marked "similar description", the rest "same system — check". Nothing is hidden, and a number the
   inspector typed in the comment stays "from the comment".
   The fixture is the live case: EX016's seat (three seat defects filed under three 1C types) and its cooling
   system (a "wash the radiator" defect against a rubbing coolant pipe).
   Run: node tests/exmatch.cjs [port]   (needs tests/ed-srv.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const PORT = Number(process.argv[2] || 8093);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const SEED = `(function(){
  window.CMDash.importRecords([
    { equip:"EX016", date:"2026-11-13", type:"INSP", cls:"EXC", by:"Kazhybekov", items:[
      { key:"OC.SE", label:"Seat", grade:3, comment:"Критический износ и разрушение обивки подушки сидения", prio:"P4" },
      { key:"DRS.CS", label:"Cooling System", grade:3, comment:"Трения потрубка ОЖ об рамы.", prio:"P4" },
      { key:"DRS.COO", label:"Cooling", grade:3, comment:"Течь ОЖ с теплообменника ДВС. DD-00016817", prio:"P4" } ] } ]);
  window.CM_WO_DATA = Object.assign({}, window.CM_WO_DATA||{}, { cmSince:"2026-07-01", cmPeople:[], cmColumns:{}, cmWorkOrders:[],
    otherDefects:[
      { asset:"EX016", defect:"DD-00015900", raised:"2026-11-01", system:"EX016.OC.SE (Seat / Сиденье)", defectType:"1.02 Loose", descr:"Требуется проверка креплений", status:"Registered", by:"Ivan P." },
      { asset:"EX016", defect:"DD-00015021", raised:"2026-10-18", system:"EX016.OC.SE (Seat / Сиденье)", defectType:"1.08 Crack", descr:"замена сиденья оператора", status:"Registered", by:"Sergey Gulin" },
      { asset:"EX016", defect:"DD-00002517", raised:"2026-04-07", system:"EX016.OC.SE (Seat / Сиденье)", defectType:"1.10 Rupture", descr:"Порвано сиденье, не работает наклон спинки", status:"Registered", by:"Andrey Taran" },
      { asset:"EX016", defect:"DD-00004804", raised:"2026-05-10", system:"EX016.DRS.CS (Cooling System / Система охлаждения)", defectType:"5.02 Contamination", descr:"Требуется мойка радиатора", status:"Registered", by:"Andrey Taran" },
      { asset:"EX016", defect:"DD-00016817", raised:"2026-11-13", system:"EX016.DRS.COO (Cooling)", defectType:"1.01 Leakage", descr:"Течь ОЖ с теплообменника", status:"Registered", by:"Slam Taganov" } ] });
})()`;
async function run(b, path) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('cm_dash_lang', 'en'); localStorage.setItem('cm_dash_window', '0'); });
  await p.goto(`http://127.0.0.1:${PORT}/${path}`, { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(BUNDLED + '()'); await p.waitForTimeout(200);
  await p.evaluate(SEED); await p.waitForTimeout(200);
  console.log('\n' + path.split('/')[0]);
  await p.evaluate(() => showTab('reports')); await p.waitForTimeout(400);
  await p.evaluate(() => CMDaySum.draw()); await p.waitForTimeout(300);
  const rows = await p.evaluate(() => { const ft = document.querySelector('#dsPrev table[data-ds="find"]');
    return ft ? [...ft.querySelectorAll('tr')].filter(tr => !tr.querySelector('th')).map(tr => [...tr.cells].map(c => c.innerText.replace(/\s+/g, ' ').trim())) : []; });
  const seat = rows.find(r => /OC\.SE/.test(r[3])), cs = rows.find(r => /DRS\.CS/.test(r[3])), coo = rows.find(r => /DRS\.COO/.test(r[3]));
  const ex = seat ? seat[6] : '';
  ok(seat && /DD-00015021/.test(ex) && /DD-00002517/.test(ex) && /DD-00015900/.test(ex), 'every open defect on the same system is still listed (nothing hidden)', ex);
  ok(/замена сиденья оператора/.test(ex) && /Порвано сиденье/.test(ex) && /Требуется проверка креплений/.test(ex), '1C\'s own description is printed under each number', ex);
  ok(ex.indexOf('DD-00015021') < ex.indexOf('DD-00015900') && ex.indexOf('DD-00002517') < ex.indexOf('DD-00015900'), 'the defects whose description matches the comment come first, before a newer one that does not', ex);
  ok((ex.match(/similar description/g) || []).length === 2 && (ex.match(/same system — check/g) || []).length === 1, 'two are marked "similar description", the other "same system — check"', ex);
  ok(/похожее описание/.test(ex) && /та же система — проверьте/.test(ex), 'the marks are in both languages (the e-mail is EN + RU)', ex);
  ok(cs && /DD-00004804/.test(cs[6]) && /Требуется мойка радиатора/.test(cs[6]) && /same system — check/.test(cs[6]) && !/similar description/.test(cs[6]), 'a different defect on the same system (wash the radiator vs a rubbing pipe) is marked "check", with its description', cs && cs[6]);
  ok(coo && /DD-00016817/.test(coo[6]) && /from the comment/.test(coo[6]) && /Течь ОЖ с теплообменника/.test(coo[6]) && !/similar description|same system/.test(coo[6]), 'a number typed in the comment stays "from the comment", now with 1C\'s description', coo && coo[6]);
  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await p.close();
}
(async () => {
  const b = await chromium.launch();
  for (const path of ['dashboard/index.html', 'dashboard-next/index.html']) await run(b, path);
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed'); process.exit(fails.length ? 1 : 0);
})();
