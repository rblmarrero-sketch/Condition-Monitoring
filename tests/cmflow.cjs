/* CM_FLOW_V1 (build 626, Rickie 15.11.2026: "the KPI cards are overwhelming ... look like WO manager, clean with flow";
   decisions 1 overdue = 1C PM work order, 2 compliance against the 1C plan date, 3 findings linked to the 1C defect raised;
   "all tables default show all"). On BOTH office pages, with a planted 1C file (dates relative to today, so it never
   drifts) and the mock's inspections:
   - the Overview has the three flow rows and none of the old KPI tiles;
   - CM rounds row: one order overdue, one due this week, one later, one done this week - exact counts;
   - compliance = orders of the last 30 days walked near the plan date (1 of 2 = 50 %);
   - findings row: a finding with a planted 1C defect on the same system is "Registered", the rest "Not raised", and the
     steps add up to the first;
   - pressing "Not raised in 1C" opens Maintenance Actions filtered to exactly that many rows, nothing paged away;
   - pressing "Overdue" opens Plan vs Actual on overdue orders; the menu badge is the Overdue count;
   - Data & Sync shows old rule beside new rule; Russian labels.
   Run: node tests/cmflow.cjs   (spawns tests/mock.cjs on 8493) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8493;
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/exec')) { const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); });
    pr.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pr); }
  if (u.endsWith('/data/work_orders.js')) { r.writeHead(200, { 'Content-Type': 'application/javascript' }); return r.end('window.CM_WO_DATA={generated:"x",workOrders:[],cmWorkOrders:[]};'); }
  let p = path.join(ROOT, u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); });
});
(async () => {
  await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  for (const file of ['dashboard', 'dashboard-next']) {
    console.log(`\n== ${file}`);
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1');
      localStorage.setItem('cm_dash_window', '0'); localStorage.setItem('cm_dash_lang', 'en'); }, B + '/exec');
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${B}/${file}/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20 && window.CMFlow, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); showTab('overview', true); });
    /* plant: four orders on four machines with no other order, a CM round today on the "done" machine, a 1C defect on one finding */
    const plan = await p.evaluate(() => {
      const t0 = todayISO(), add = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
      const units = [...new Set(RECS.map(r => r.equip))]; const [A, Bu, C, D] = units;
      const rD = RECS.find(r => r.equip === D); rD.date = t0; rD.type = 'MP';
      RECS.filter(r => r.equip === A).forEach(r => { r.date = add(t0, -200); });       /* no CM round near A's plan date */
      const wo = (u, d, n) => ({ equip: u, woNumber: 'WO-T' + n, maintType: '250 Hours service Planned', hours: 250, cmLabel: '250h service', cmTypes: ['MP'], priority: 'P3 Planned (PM)', open: true, planStart: d });
      const fl = CMFlow.flow(filtered()); const x = fl.all.find(x => x.i.key) || fl.all[0];
      const def = { asset: x.r.equip, defect: 'DD-T001', raised: x.r.date, date: x.r.date, system: x.r.equip + '.' + (x.i.key || 'X') + ' (test)', status: 'Registered', priority: 'P4 Planned (Repair)' };
      window.CM_WO_DATA = { generated: 'planted', workOrders: [wo(A, add(t0, -3), 1), wo(Bu, add(t0, 3), 2), wo(C, add(t0, 20), 3), wo(D, t0, 4)], cmWorkOrders: [def] };
      renderAll(); return { A, Bu, C, D, all: fl.all.length };
    });
    await p.waitForTimeout(400);
    const v = await p.evaluate(() => { const g = id => { const e = document.getElementById(id); return e ? Number((e.querySelector('.v') || e).textContent.replace(/\D/g, '')) : null; };
      return { tiles: document.querySelectorAll('#kpis .kpi').length, rows: document.querySelectorAll('#kpis .cfsec').length,
        plan: [g('kpiPlan'), g('kpiWeek'), g('kpiOver'), g('kpiDone')], find: [g('kpiFind'), g('kpiNodef'), g('kpiDreg'), g('kpiDprog'), g('kpiDdone')],
        cond: [5, 4, 3, 2, 1].map(s => g({ 5: 'kpiCrit', 4: 'kpiSev', 3: 'kpiDeg', 2: 'kpiInc', 1: 'kpiNorm' }[s])), comp: complianceNow(),
        badge: (document.getElementById('nbDue') || {}).textContent || '' }; });
    ok('the Overview is three flow rows, no KPI tiles', v.rows === 3 && v.tiles === 0, `${v.rows} rows, ${v.tiles} tiles`);
    ok('CM rounds row: planned later 1 · due in 7 days 1 · overdue 1 · done this week 1', JSON.stringify(v.plan) === '[1,1,1,1]', JSON.stringify(v.plan));
    ok('compliance against the 1C plan date: 1 of 2 orders of the last 30 days = 50 %', v.comp.pct === 50 && v.comp.due === 2 && v.comp.onTime === 1, JSON.stringify(v.comp));
    ok('the menu badge is the Overdue count', String(v.badge).trim() === '1', v.badge);
    ok('findings row: the planted defect is "Registered" and the steps add up to the first', v.find[2] === 1 && v.find[1] + v.find[2] + v.find[3] + v.find[4] === v.find[0] && v.find[0] > 1, JSON.stringify(v.find));
    ok('fleet condition counts machines (one per machine)', v.cond.reduce((a, c) => a + c, 0) === new Set(await p.evaluate(() => filtered().map(r => r.equip))).size, JSON.stringify(v.cond));
    /* Not raised -> Maintenance Actions, exactly that many rows, all of them on the page */
    await p.click('#kpiNodef'); await p.waitForTimeout(500);
    const a = await p.evaluate(() => ({ tab: CUR_TAB, f: aFilterState, n: document.querySelectorAll('#actionTbl tbody tr[data-k], #actionTbl tbody tr.arow, #actionTbl tbody tr').length,
      next: !!document.querySelector('[data-pg^="actions"][data-pg$=":next"]'), chip: (document.querySelector('#aSeg [data-af="all"].on') || {}).textContent || '' }));
    ok('"Not raised in 1C" opens Maintenance Actions on that filter, with a way back', a.tab === 'actions' && a.f === 'f_none' && /Not raised/.test(a.chip), JSON.stringify(a));
    const nRows = await p.evaluate(() => actionRows().filter(({ r, i }) => CMFlow.isFind(r, i) && CMFlow.stage(r, i) === 'none').length);
    ok('  its list has exactly the step\'s count', nRows === v.find[1], `${nRows} vs ${v.find[1]}`);
    ok('  and no page is held back (tables show all)', !a.next);
    await p.evaluate(() => showTab('overview', true)); await p.waitForTimeout(300);
    await p.click('#kpiOver'); await p.waitForTimeout(500);
    const pa = await p.evaluate(() => ({ tab: CUR_TAB, w: (document.getElementById('paWindow') || {}).value }));
    ok('"Overdue" opens Plan vs Actual on overdue orders', pa.tab === 'planact' && pa.w === 'over', JSON.stringify(pa));
    await p.evaluate(() => showTab('sync', true)); await p.waitForTimeout(600);
    const cmp = await p.evaluate(() => { const c = document.getElementById('cfCompare'); return c ? c.querySelectorAll('tbody tr').length : 0; });
    ok('Data & Sync shows the old rule beside the new rule', cmp === 3, cmp);
    await p.evaluate(() => { lang = 'ru'; showTab('overview', true); renderAll(); }); await p.waitForTimeout(300);
    const ru = await p.evaluate(() => document.getElementById('kpis').textContent);
    ok('Russian labels', /Просрочено/.test(ru) && /Не оформлено в 1С/.test(ru) && !/Overdue|Not raised/.test(ru));
    ok('no page errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})();
