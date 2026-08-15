/* The app has to work in the pit with no signal. This installs it online, then
   cuts the network completely and checks the lists are still there — and times
   how long a cold offline start takes. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = require('path').join(__dirname, '..');

let requests = 0;
const srv = http.createServer((req, res) => {
  requests++;
  const u = new URL(req.url, 'http://x');
  const f = path.join(ROOT, u.pathname);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  const ct = f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'application/javascript'
           : f.endsWith('.webmanifest') ? 'application/manifest+json'
           : f.endsWith('.png') ? 'image/png' : 'text/plain';
  res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'max-age=600' });
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => srv.listen(8191, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const fails = [];
  const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  const U = 'http://127.0.0.1:8191/mobile/index.html';

  // ---- install while online ----
  await p.goto(U, { waitUntil: 'load' });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(1500);                       // let the precache finish
  await p.goto(U, { waitUntil: 'load' });             // reload so the SW controls the page
  const online = await p.evaluate(() => ({ assets: ASSETS.length, defects: HME.defectTypes.length,
                                           causes: HME.directCauses.length, tree: Object.keys(CX.c).length }));
  console.log('online   :', JSON.stringify(online));

  // ---- cut the network entirely ----
  await ctx.setOffline(true);
  requests = 0;
  const t0 = Date.now();
  await p.goto(U, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof ASSETS !== 'undefined', null, { timeout: 15000 }).catch(() => {});
  const coldMs = Date.now() - t0;

  const off = await p.evaluate(() => ({
    assets: (typeof ASSETS !== 'undefined' ? ASSETS : []).length,
    defects: (typeof HME !== 'undefined' ? (HME.defectTypes || []) : []).length,
    causes: (typeof HME !== 'undefined' ? (HME.directCauses || []) : []).length,
    tree: (typeof CX !== 'undefined' ? Object.keys(CX.c) : []).length,
    warn: !document.getElementById('dataWarn').classList.contains('hidden'),
  }));
  console.log('\noffline  :', JSON.stringify(off));
  ok('equipment register available offline', off.assets === online.assets, `${off.assets}/${online.assets}`);
  ok('defect list available offline', off.defects === online.defects, `${off.defects}/${online.defects}`);
  ok('cause list available offline', off.causes === online.causes, `${off.causes}/${online.causes}`);
  ok('component tree available offline', off.tree === online.tree, `${off.tree}/${online.tree}`);
  ok('no "data missing" warning shown', off.warn === false);
  ok('cold offline start is quick', coldMs < 4000, `${coldMs} ms`);

  // ---- the pickers themselves must be populated ----
  await p.click('#equipBtn'); await p.waitForTimeout(400);
  const units = await p.$$eval('#pickList .pickitem', a => a.length);
  ok('equipment picker lists units offline', units > 100, `${units} rows`);
  await p.fill('#pickSearch', 'TK146'); await p.waitForTimeout(250);
  const found = await p.$$eval('#pickList .pickitem', a => a.map(x => x.textContent.trim()).slice(0, 2));
  ok('search works offline', found.some(x => x.includes('TK146')), JSON.stringify(found));

  // ---- adding a unit that is not in the register ----
  await p.fill('#pickSearch', 'TK999X'); await p.waitForTimeout(250);
  const addRow = await p.$$eval('#pickList .pickitem', a => a.map(x => x.textContent.trim())[0] || '');
  ok('offers to add an unknown unit', /TK999X/.test(addRow), addRow);
  await p.click('#pickList .pickitem');
  await p.waitForTimeout(300);
  ok('the added unit is selected', (await p.textContent('#equipBtn')).includes('TK999X'),
     await p.textContent('#equipBtn'));

  // ---- defect picker offline ----
  await p.evaluate(() => { const ts = document.getElementById('typeSel'); ts.value = 'MP'; ts.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(250);
  await p.click('#posnav button[data-pos]'); await p.waitForTimeout(200);
  await p.click('#defectBtn'); await p.waitForTimeout(350);
  const defs = await p.$$eval('#pickList .pickitem', a => a.length);
  ok('defect picker populated offline', defs > 5, `${defs} rows`);
  await p.click('#pickCancel');

  console.log(`\nnetwork requests while offline: ${requests}`);
  console.log(fails.length ? '\nFAILURES: ' + fails.join(' | ') : '\nall offline checks passed');
  await b.close(); srv.close(); process.exit(fails.length ? 1 : 0);
})();
