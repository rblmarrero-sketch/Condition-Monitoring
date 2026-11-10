/* DEFECTS RAISED: 1C'S DESCRIPTION AND CAUSE IN ENGLISH ON THE ENGLISH PAGE (TR_WO_V1, Rickie 11.11.2026).

   The texts are the same WO.xlsx cells the Work Order Manager shows; PECHANKA's translation library writes their
   English to /tr/wo_en.json and both office pages read it. What this suite guards:
   1. Served by PECHANKA (/cm/...) on the English page: a description / cause that has an English is shown in
      English, 1C's Russian on the title; one with no English yet stays Russian (never blank).
   2. Nothing else moves: the same rows, the same headline count, the same per-person counts; the CSV keeps 1C's text.
   3. The search and the column filter find a row by its English; the Russian still finds it too.
   4. The Russian page shows 1C's own Russian, nothing swapped.
   5. Not served by PECHANKA (Firebase, GitHub Pages, every other test): the list is not even asked for.
   Run: node tests/cwen.cjs   (starts its own server) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..'), PORT = Number(process.argv[2] || 8471);
const fails = []; const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const RU1 = 'Течь масла с бортового редуктора', RU2 = 'Износ  уплотнений', RU3 = 'Трещина рамы, требуется сварка';
const LIST = { marker: 'TR_WO_V1', generated: '2026-11-11T00:00:00Z', texts: 3, translated: 2,
  map: { [RU1]: 'Oil leak from the final drive', 'Износ уплотнений': 'Seal wear' }, pre: {} };
const CM = { cmSince: '2026-07-01', cmPeople: ['Irek', 'Zhomart'],
  cmColumns: { date: 'Date', asset: 'Asset', desc: 'Defect description', cause: 'WODefect cause' },
  cmWorkOrders: [
    { date: '2026-11-05', asset: 'EX021', defect: 'DD-000456', requestNo: 'DD-000456', eqType: 'EXCAVATOR', system: 'PT.FD', priority: 'P2',
      defectType: 'Leak', descr: RU1, cause: RU2, status: 'Registered', by: 'Irek', planned: false },
    { date: '2026-11-04', asset: 'TK156', defect: 'DD-000123', requestNo: 'DD-000123', eqType: 'HAUL TRUCK', system: 'CH.FR', priority: 'P1',
      defectType: 'Crack', descr: RU3, cause: 'Усталость металла', status: 'In progress', by: 'Zhomart', woNumber: 'WO-1', planned: false }] };
let asked = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/tr/wo_en.json') { asked++; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(LIST)); }
  const rel = u.pathname.replace(/^\/cm\//, '/'); const p = path.join(ROOT, decodeURIComponent(rel));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.end(fs.readFileSync(p));
});
const rows = p => p.$$eval('#cwList tbody tr', rs => rs.map(r => { const td = [...r.querySelectorAll('td')];
  const c = i => { const s = td[i] && td[i].querySelector('span'); return { t: (td[i] ? td[i].textContent : '').replace(/\s+/g, ' ').trim(), title: s ? s.title : '' }; };
  const hd = [...document.querySelectorAll('#cwList thead tr:first-child th')].map(h => h.dataset.sort);
  return { asset: c(hd.indexOf('asset')).t, descr: c(hd.indexOf('descr')), cause: c(hd.indexOf('cause')) }; }));
async function page(b, file, prefix) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('cm_dash_lang', 'en'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}${prefix}${file}`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof renderCmWoTab === 'function', null, { timeout: 25000 });
  await p.evaluate(() => { try { document.getElementById('dataOv').classList.add('hidden'); } catch (e) {} });
  await p.evaluate(() => { const b = document.querySelector('[data-tab="cmwo"]'); if (b) b.click(); else showTab('cmwo'); }); await p.waitForTimeout(400);
  await p.evaluate(d => { window.CM_WO_DATA = Object.assign(window.CM_WO_DATA || {}, d); renderCmWoTab(); }, CM); await p.waitForTimeout(800);
  return { ctx, p, errs };
}
(async () => {
  await new Promise(r => server.listen(PORT, r)); const b = await chromium.launch();
  for (const file of ['dashboard/index.html', 'dashboard-next/index.html']) {
    console.log(`\n== ${file}`);
    const A = await page(b, file, '/cm/'); const p = A.p;
    const R = await rows(p); const e = R.find(x => x.asset === 'EX021'), k = R.find(x => x.asset === 'TK156');
    console.log('1. ENGLISH PAGE, SERVED BY PECHANKA');
    ok('the translation list was read', asked > 0 && await p.evaluate(() => !!(CW_EN && CW_EN.map)));
    ok('description shown in English', e && e.descr.t === 'Oil leak from the final drive', e && e.descr.t);
    ok('  1C\'s Russian on its title', e && e.descr.title === RU1, e && e.descr.title);
    ok('cause shown in English (spaces in 1C\'s cell do not stop the match)', e && e.cause.t === 'Seal wear', e && e.cause.t);
    ok('a text with no English yet stays Russian, never blank', k && k.descr.t === RU3 && k.cause.t === 'Усталость металла');
    console.log('2. NOTHING ELSE MOVES');
    const kp = await p.evaluate(() => [...document.querySelectorAll('#cwKpis .kpi .v, #cwKpis .cwpbtn .n')].map(x => x.textContent).join('/'));
    ok('the same rows and counts (2 defects, 1 + 1 per person)', R.length === 2 && kp === '2/1/1', R.length + ' rows, ' + kp);
    const csv = await p.evaluate(() => { const a = cwAll(); return a.map(r => r.descr + '|' + r.cause).join('#'); });
    ok('the data keep 1C\'s own text (CSV / counts read it)', csv.includes(RU1) && csv.includes(RU2));
    console.log('3. SEARCH AND COLUMN FILTER');
    await p.fill('#cwQ', 'final'); await p.evaluate(() => renderCmWoTab()); let n = (await rows(p)).map(x => x.asset).join();
    ok('the search finds the row by its English', n === 'EX021', n);
    await p.fill('#cwQ', 'течь'); await p.evaluate(() => renderCmWoTab()); n = (await rows(p)).map(x => x.asset).join();
    ok('  and still by 1C\'s Russian', n === 'EX021', n);
    await p.fill('#cwQ', ''); await p.evaluate(() => { cwColQ.cause = 'seal'; renderCmWoTab(); }); n = (await rows(p)).map(x => x.asset).join();
    ok('the Cause column filter reads what the cell shows', n === 'EX021', n);
    await p.evaluate(() => { cwColQ.cause = ''; renderCmWoTab(); });
    console.log('4. RUSSIAN PAGE');
    await p.evaluate(() => { lang = 'ru'; applyLang(); renderCmWoTab(); }); await p.waitForTimeout(300);
    const r2 = (await rows(p)).find(x => x.asset === 'EX021');
    ok('1C\'s own Russian, nothing swapped', r2 && r2.descr.t === RU1 && /Износ/.test(r2.cause.t), r2 && r2.descr.t);
    ok('no page error', !A.errs.length, A.errs.join(' | '));
    await A.ctx.close();
    console.log('5. NOT SERVED BY PECHANKA');
    const before = asked; const B = await page(b, file, '/');
    const r3 = (await rows(B.p)).find(x => x.asset === 'EX021');
    ok('the list is not asked for and the panel is as before', asked === before && r3 && r3.descr.t === RU1, `${asked - before} requests`);
    await B.ctx.close();
  }
  await b.close(); server.close();
  console.log(fails.length ? `\nFAILED ${fails.length}: ${fails.join(' | ')}` : '\nALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('crashed: ' + (e.stack || e)); process.exit(1); });
