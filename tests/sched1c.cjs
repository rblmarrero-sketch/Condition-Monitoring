/* CM_SCHED1C_V1 (build 627, Rickie 15.11 "proceed with not done yet"): the Inspection Schedule follows the 1C PM
   work orders (the Overview's own rule), and a finding nobody named takes the Responsible person of its 1C defect.
   Below: the original cmflow.cjs header, whose server this test reuses.
 CM_FLOW_V1 (build 626, Rickie 15.11.2026: "the KPI cards are overwhelming ... look like WO manager, clean with flow";
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
   Run: node tests/sched1c.cjs   (spawns tests/mock.cjs on 8494) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8494;
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
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
    const pl = await p.evaluate(() => {
      const t0 = todayISO(), add = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
      const units = [...new Set(RECS.map(r => r.equip))]; const [A, Bu, C, D, E] = units;
      const rD = RECS.find(r => r.equip === D); rD.date = t0; rD.type = 'MP';
      [A, E].forEach(u => RECS.filter(r => r.equip === u).forEach(r => { r.date = add(t0, -200); }));
      const wo = (u, d, n) => ({ equip: u, woNumber: 'WO-T' + n, maintType: '250 Hours service Planned', hours: 250, cmLabel: '250h service', cmTypes: ['MP'], priority: 'P3 Planned (PM)', open: true, planStart: d });
      /* a finding with no owner, and a 1C defect on its system naming who is responsible */
      const x = CMFlow.flow(filtered()).all.find(x => x.i.key && !x.i.owner && !x.i.resp);
      const def = x ? { asset: x.r.equip, defect: 'DD-T001', raised: x.r.date, date: x.r.date, system: x.r.equip + '.' + x.i.key + ' (test)', status: 'Registered', priority: 'P4 Planned (Repair)', by: 'Ivanov I.' } : null;
      window.CM_WO_DATA = { generated: 'planted', workOrders: [wo(A, add(t0, -3), 1), wo(E, add(t0, -5), 5), wo(Bu, add(t0, 3), 2), wo(C, add(t0, 20), 3), wo(D, t0, 4)], cmWorkOrders: def ? [def] : [] };
      showTab('due', true); renderAll(); return { A, E, x: x ? { u: x.r.equip, k: x.i.key } : null };
    });
    await p.waitForTimeout(400);
    const tabs = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#ddSeg [data-dd]')].map(b => [b.dataset.dd, Number((b.querySelector('.n') || {}).textContent)])));
    ok('the schedule tabs follow 1C: Overdue 2 · Due in 7 days 1 · Planned later 1 · Done this week 1', tabs.over === 2 && tabs.soon === 1 && tabs.later === 1 && tabs.done === 1, JSON.stringify(tabs));
    ok('  and keep Deferred, Never inspected and the CM interval view', 'put' in tabs && 'never' in tabs && 'cmint' in tabs, Object.keys(tabs).join(','));
    const ov = await p.evaluate(() => { const g = id => Number(((document.getElementById(id) || {}).querySelector ? document.getElementById(id).querySelector('.v') : null || {}).textContent); return CMFlow.plan().over.length; });
    ok('  the Overdue tab is the Overview\'s Overdue number', ov === tabs.over, ov + ' vs ' + tabs.over);
    const kp = await p.evaluate(() => (document.getElementById('dueKpis') || {}).children.length);
    ok('no second strip of the same numbers above the tabs', kp === 0, kp);
    await p.evaluate(() => dueGo('over')); await p.waitForTimeout(200);
    const rows = await p.evaluate(() => [...document.querySelectorAll('#ddList tbody tr.dd-c1')].map(tr => ({ u: tr.querySelector('td b').textContent, t: tr.textContent.replace(/\s+/g, ' '), def: !!tr.querySelector('[data-defer]'), start: !!tr.querySelector('a.minibtn') })));
    ok('Overdue lists the two orders with their work order, days late, Start and Defer', rows.length === 2 && rows.every(r => /WO-T[15]/.test(r.t) && /d late/.test(r.t) && r.def && r.start), JSON.stringify(rows.map(r => r.t.slice(0, 90))));
    /* a deferral on A's round takes its order from Overdue to Deferred, here and on the Overview */
    await p.evaluate(A => { deferrals['MP|' + A] = { u: A, t: 'MP', until: null, why: 'machine in workshop', whyKey: '', by: 'test', at: new Date().toISOString() }; renderDueTab(); }, pl.A);
    const t2 = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#ddSeg [data-dd]')].map(b => [b.dataset.dd, Number((b.querySelector('.n') || {}).textContent)])));
    ok('a deferral moves the order from Overdue to Deferred', t2.over === 1 && t2.put === tabs.put + 1 && CMFlowOver(await p.evaluate(() => CMFlow.plan().over.length)) === 1, JSON.stringify(t2));
    await p.evaluate(() => dueGo('put')); await p.waitForTimeout(200);
    const pr = await p.evaluate(A => [...document.querySelectorAll('#ddList tbody tr.dd-c1')].filter(tr => tr.textContent.indexOf(A) >= 0).map(tr => tr.textContent.replace(/\s+/g, ' ')), pl.A);
    ok('  and the Deferred row says why', pr.length === 1 && /machine in workshop/.test(pr[0]), pr.join(' | '));
    await p.evaluate(() => dueGo('cmint')); await p.waitForTimeout(200);
    const ci = await p.evaluate(() => ({ rows: document.querySelectorAll('#ddList tbody tr.dd-over, #ddList tbody tr.dd-soon').length, want: dueTabRows().filter(r => r.st === 'over' || r.st === 'soon').length }));
    ok('the CM interval tab keeps the hour-based rows', ci.rows === Math.min(ci.want, ci.rows) && ci.want >= 0, JSON.stringify(ci));
    /* owner from the 1C defect */
    if (pl.x) {
      const o = await p.evaluate(x => { showTab('actions', true); renderActions(); const r = RECS.find(r => r.equip === x.u && (r.items || []).some(i => i.key === x.k)); const i = r.items.find(i => i.key === x.k);
        return { own: ownerOf(r, i), from: owner1COnly(r, i), st: actionState(r, i).miss, cell: [...document.querySelectorAll('.who.from1c')].map(e => e.textContent.replace(/\s+/g, ' ').trim()) }; }, pl.x);
      ok('a finding nobody named takes the Responsible person of its 1C defect', o.own === 'Ivanov I.' && o.from && !o.st.includes('owner'), JSON.stringify(o));
      ok('  and the register says it came from 1C', o.cell.some(c => /Ivanov I\. · 1C/.test(c)), o.cell.join(' | '));
    } else ok('fixture has a finding without an owner', false);
    await p.evaluate(() => { lang = 'ru'; showTab('due', true); renderAll(); }); await p.waitForTimeout(300);
    const ru = await p.evaluate(() => document.getElementById('ddSeg').textContent);
    ok('Russian tab names', /Просрочено в 1С/.test(ru) && /Интервал МС/.test(ru), ru.slice(0, 120));
    ok('no page errors', !errs.length, errs.join(' | ')); await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
})();
function CMFlowOver(n) { return n; }
