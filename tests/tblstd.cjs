/* Build 630: CM_FIND1C_V1 (findings follow their point and their 1C defect), CM_TBLSTD_V1 (frozen columns, held slider,
   Columns on every long table, every column by default, no cards on a desk) and CM_MISS_V1 (why planned rounds were not
   done). Both office pages. Run: node tests/tblstd.cjs   (spawns tests/mock.cjs on 8491) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), MP = 8491;
let fails = 0; const ok = (n, c, d) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${d !== undefined ? '   ' + d : ''}`); if (!c) fails++; };
const mock = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(MP)], { stdio: 'ignore' }); process.on('exit', () => { try { mock.kill(); } catch (e) {} });
const T = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]);
  if (u.startsWith('/exec')) { const pr = http.request({ host: '127.0.0.1', port: MP, path: q.url, method: q.method, headers: q.headers }, x => { r.writeHead(x.statusCode, x.headers); x.pipe(r); }); pr.on('error', () => { r.writeHead(502); r.end(); }); return q.pipe(pr); }
  let p = path.join(ROOT, u); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
(async () => {
  await new Promise(r => setTimeout(r, 1500)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const B = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  for (const file of ['dashboard', 'dashboard-next']) {
    console.log(`\n== ${file}`);
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_cursor', '0'); localStorage.setItem('cm_swap_off', '1'); localStorage.setItem('cm_dash_window', '0'); localStorage.setItem('cm_dash_lang', 'en'); }, B + '/exec');
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${B}/${file}/index.html`);
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });

    console.log('-- findings follow their point and their 1C defect');
    const F = await p.evaluate(() => {
      const f = findings(filtered()).filter(x => sevOf(x.r, x.i) >= 3); const x = f[0];
      const before = actionState(x.r, x.i), owner = ownerOf(x.r, x.i);
      /* plant a newer round of the same machine and point graded 1 */
      const r2 = JSON.parse(JSON.stringify(x.r)); r2.id = 'later-' + r2.equip; r2.date = '2099-01-01';
      r2.items = [Object.assign({}, x.i, { grade: 1, sev: 'NOF', defect: '', defectCode: '', action: '' })];
      RECS.push(r2); CMFlow.fresh();
      const cleared = actionState(x.r, x.i);
      r2.items[0].grade = 5; r2.items[0].sev = 'CRI'; CMFlow.fresh();
      const carried = actionState(x.r, x.i);
      RECS.pop(); CMFlow.fresh();
      /* a manual office decision still wins */
      const keep = x.i.status; x.i.status = 'DONE'; const manual = actionState(x.r, x.i); x.i.status = keep;
      return { before, owner, cleared, carried, manual, maint: t('own_maint') };
    });
    ok('a finding with no 1C defect is open, the one missing item is the 1C defect', F.before.k === 'triage' && JSON.stringify(F.before.miss) === '["c1"]', JSON.stringify(F.before));
    ok('  and it is owned by Maintenance when nobody is named', F.owner === F.maint, F.owner);
    ok('a newer reading of the same point graded 1 clears it', F.cleared.k === 'closed' && F.cleared.why === 'cleared', JSON.stringify(F.cleared));
    ok('a newer reading graded 5 carries it (one finding per point)', F.carried.k === 'none' && F.carried.why === 'later', JSON.stringify(F.carried));
    ok('an office decision on the finding still wins', F.manual.k === 'closed' && !F.manual.why, JSON.stringify(F.manual));
    const L = await p.evaluate(() => { const x = findings(filtered()).filter(y => sevOf(y.r, y.i) >= 3)[0];
      window.CM_WO_DATA = Object.assign({}, window.CM_WO_DATA || {}, { generated: 'tblstd', cmWorkOrders: [{ asset: x.r.equip, defect: 'DD-0099001', raised: x.r.date, date: x.r.date, system: x.r.equip + '.' + x.i.key + ' (t)', status: 'Completed', by: 'Ivanov I.' }] });
      return { st: actionState(x.r, x.i), owner: ownerOf(x.r, x.i) }; });
    ok('a Completed 1C defect closes it, and its responsible person owns it', L.st.k === 'closed' && L.st.why === '1c' && L.owner === 'Ivanov I.', JSON.stringify(L));

    console.log('-- the table standard');
    await p.evaluate(() => { showTab('actions', true); window.scrollTo(0, 0); }); await p.waitForTimeout(1200);
    const A = await p.evaluate(() => { const t = document.querySelector('#actionTbl table.grid'); const box = t.closest('.tblwrap');
      const unit = [...t.tHead.rows[0].cells].findIndex(th => /^unit/i.test(th.textContent.trim()));
      const cell = () => t.tBodies[0].rows[0].cells[unit].getBoundingClientRect().left;
      const x0 = cell(); box.scrollLeft = 300; const x1 = cell();
      const hd = [...t.tHead.rows[0].cells].map(th => th.textContent.replace(/[▲▼↕]/g, '').trim()).filter(Boolean);
      return { slides: box.scrollWidth > box.clientWidth + 1, frozen: Math.abs(x1 - x0) < 2, edge: !!t.querySelector('.cmfzE'), heads: hd.length, all: ACOL_ALL.length + 1, cards: t.classList.contains('ascards') }; });
    ok('Maintenance Actions shows every column and slides inside its box, not cards', A.heads === A.all && A.slides && !A.cards, JSON.stringify(A));
    ok('  the unit column stays where it is while the table slides, with its edge', A.frozen && A.edge, JSON.stringify(A));
    await p.evaluate(() => { const box = document.querySelector('#actionTbl .tblwrap'); box.scrollLeft = 0; window.scrollTo(0, 200); window.dispatchEvent(new Event('scroll')); }); await p.waitForTimeout(300);
    const H = await p.evaluate(() => { const hs = document.querySelector('.cmhs'); const box = document.querySelector('#actionTbl .tblwrap');
      if (!hs || !hs.classList.contains('on')) return { on: false };
      hs.querySelector('button[data-d="1"]').click(); return new Promise(res => setTimeout(() => res({ on: true, moved: box.scrollLeft > 0, bottom: Math.round(innerHeight - hs.getBoundingClientRect().bottom) }), 700)); });
    ok('a slider is held at the bottom of the window while the box\'s own bar is below it, and ▶ slides the table', H.on && H.moved && H.bottom === 0, JSON.stringify(H));
    await p.evaluate(() => { showTab('failure', true); window.scrollTo(0, 0); }); await p.waitForTimeout(1200);
    const C = await p.evaluate(() => { const t = document.getElementById('failAffTbl'); const bar = document.querySelector('.cmcolbar[data-for$="failAffTbl"] .cmcolbtn');
      if (!bar) return { bar: false }; const txt0 = bar.textContent; bar.click(); const m = bar.parentNode.querySelector('.cmcolmenu'); const cb = m.querySelectorAll('input[data-c]')[1]; cb.checked = false; cb.onchange();
      const vis = [...t.tHead.rows[0].cells].filter(c => c.style.display !== 'none').length; const k = Object.keys(localStorage).find(x => /^cm_tblcols_tab-failure/.test(x));
      return { bar: true, txt0, vis, all: t.tHead.rows[0].cells.length, saved: !!k, after: bar.textContent }; });
    ok('Failure Analysis\' table has ⚙ Columns, every column on by default', C.bar && /(\d+)\/\1$/.test(C.txt0), JSON.stringify(C));
    ok('  unticking one hides it and is kept for this browser', C.vis === C.all - 1 && C.saved && /\d+\/\d+/.test(C.after), JSON.stringify(C));
    await p.reload(); await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 20, null, { timeout: 60000 });
    await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); showTab('failure', true); }); await p.waitForTimeout(1200);
    const C2 = await p.evaluate(() => { const t = document.getElementById('failAffTbl'); return [...t.tHead.rows[0].cells].filter(c => c.style.display === 'none').length; });
    ok('  and still hidden after a reload', C2 === 1, String(C2));

    console.log('-- why planned rounds were not done');
    const M = await p.evaluate(() => { showTab('planact', true); const el = document.getElementById('paMiss'); const s = CMFlow.missStats();
      return { shown: !!(el && el.offsetParent), due: s.due, parts: s.done + s.late + s.miss, rows: el ? el.querySelectorAll('tbody tr').length : 0, none: el ? !!el.querySelector('tr.cmnone') : false, txt: el ? el.textContent.slice(0, 80) : '' }; });
    ok('Plan vs Actual says why planned rounds were not done', M.shown && M.due === M.parts && (M.due === 0 || M.rows >= 1), JSON.stringify(M));
    const M2 = await p.evaluate(() => { const t0 = DUE.today(), d0 = new Date(t0 + 'T00:00:00Z'); d0.setUTCDate(d0.getUTCDate() - 30); const from = d0.toISOString().slice(0, 10);
      const r = paRows().find(x => x.info && x.info.types && x.info.types.length && !x.heldOff && x.w && x.w.planStart && String(x.w.planStart) >= from && String(x.w.planStart) <= t0 && x.status !== 'ontime' && x.status !== 'early' && x.status !== 'late'); if (!r) return { skip: true };
      const u = String(r.w.equip).toUpperCase(), ty = r.info.types[0];
      deferrals[ty + '|' + u] = { u, t: ty, until: null, why: '', whyKey: 'repair', by: 'test', at: new Date().toISOString() };
      CMFlow.renderMiss(document.getElementById('paMiss'));
      const txt = document.getElementById('paMiss').textContent; delete deferrals[ty + '|' + u]; return { skip: false, has: /Equipment under repair/.test(txt) }; });
    ok('  a deferral\'s reason is counted under its own name', M2.skip || M2.has, JSON.stringify(M2));
    ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
    await ctx.close();
  }
  await b.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL harness:', e.message); process.exit(1); });
