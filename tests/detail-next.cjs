/* POSITION DETAIL DRAWER (#drw / openPos) -- read-only: gallery, key finding,
   readings, comment, and Report/Edit buttons that hand off to other dialogs
   already covered by their own suites. There is no write path of its own
   here, so this suite proves content parity instead: the identical record
   renders the identical drawer body on both pages, and Report/Edit call the
   same underlying functions with the same arguments.

   Run: node tests/detail-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});

const RECS = [{ equip: 'TK905', date: '2026-09-14', type: 'MP', cls: 'HT', by: 'R. Marrero', smu: '15000',
  items: [{ key: '4D', label: 'RR Final Drive', grade: 'X', defect: 'Ferrous debris — heavy', defectCode: 'DT14-03',
            cause: 'Gear wear', causeCode: 'CS7-01', actionLabel: 'Repair now', prio: 'P1', wo: 'WO-1234' }] }];

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.__reportCalls = []; window.__editCalls = [];
    const origReport = window.runReport; window.runReport = (...a) => { window.__reportCalls.push(a); };
    const origEdit = window.openEdit; window.openEdit = (...a) => { window.__editCalls.push(a); };
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
  }, RECS);
  await p.waitForTimeout(500);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const key = 'TK905|2026-09-14|MP';
  await a.evaluate(k => window.openPos(k, '4D'), key);
  await n.evaluate(k => window.openPos(k, '4D'), key);
  await a.waitForTimeout(300); await n.waitForTimeout(300);

  ok('dashboard/: position detail drawer opens', !(await a.evaluate(() => document.getElementById('drw').classList.contains('hidden'))));
  ok('dashboard-next: position detail drawer opens', !(await n.evaluate(() => document.getElementById('drw').classList.contains('hidden'))));

  const titleA = await a.$eval('#drwTitle', el => el.textContent);
  const titleB = await n.$eval('#drwTitle', el => el.textContent);
  ok('the drawer title matches', titleA === titleB, `A="${titleA}" B="${titleB}"`);

  const bodyA = await a.$eval('#drwBody', el => el.textContent.replace(/\s+/g, ' ').trim());
  const bodyB = await n.$eval('#drwBody', el => el.textContent.replace(/\s+/g, ' ').trim());
  ok('the drawer body content (finding, cause, WO, priority, readings) is identical text',
     bodyA === bodyB, `A="${bodyA}" B="${bodyB}"`);
  ok('the content actually names the real finding (not an empty drawer)', /Ferrous debris/.test(bodyA) && /WO-1234/.test(bodyA), bodyA);

  await a.click('#drwRpt'); await n.click('#drwRpt');
  const repA = await a.evaluate(() => window.__reportCalls);
  const repB = await n.evaluate(() => window.__reportCalls);
  ok('Report calls the same function with the same arguments on both pages', JSON.stringify(repA) === JSON.stringify(repB), `A=${JSON.stringify(repA)} B=${JSON.stringify(repB)}`);

  await a.click('#drwEdit'); await n.click('#drwEdit');
  await a.waitForTimeout(200); await n.waitForTimeout(200);
  const edA = await a.evaluate(() => window.__editCalls);
  const edB = await n.evaluate(() => window.__editCalls);
  ok('Edit calls openEdit with the same key on both pages', JSON.stringify(edA) === JSON.stringify(edB), `A=${JSON.stringify(edA)} B=${JSON.stringify(edB)}`);

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
