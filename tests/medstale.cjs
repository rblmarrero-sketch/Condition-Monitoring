/* A FILE LISTING THAT COULD NOT BE REFRESHED SAYS SO.

   drive.js keeps the folder's file index between sessions and refreshes it
   on every load. On a failed refresh it handed back the size of the listing
   it already had — the same number, in the same place, as a fresh one — so
   the Data & Sync panel went on measuring "missing evidence" against a
   listing that could be hours old with nothing on screen to say it was.
   Stale is still better than absent, and the index is still kept; what has
   to change is that the panel can tell, and does say.

   Run: node tests/medstale.cjs   (starts its own server on 8533) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8533);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
let FAILING = false, asked = 0;
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.pathname === '/live') {
    asked++;
    if (FAILING) { res.writeHead(500, cors); return res.end('gateway down'); }
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    if (u.searchParams.get('action') === 'records')
      return res.end(JSON.stringify({ ok: true, records: [], edits: [], conflicts: [], deferrals: [], cursor: 0, failed: 0, truncated: false,
        index: [{ name: 'TK151_1A_09.09.2026_MP.jpg', id: 'MP/TK151/2026-09-09/TK151_1A_09.09.2026_MP.jpg', size: 2093 }] }));
    if (u.searchParams.get('action') === 'index') return res.end(JSON.stringify({ ok: false, error: 'Unknown action: index' }));
    return res.end(JSON.stringify({ ok: true, folder: 'test', canDelete: false }));
  }
  const p = path.join(ROOT, u.pathname);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('no'); }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); }, `http://127.0.0.1:${PORT}/live`);
  await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  /* Waits on the function every build has, and reads the state through a
     guard, so on a build WITHOUT mediaIndexState the suite reaches its
     assertions and fails them — that is the reading that proves it was red
     before the fix. */
  await p.waitForFunction(() => window.CMDrive && typeof CMDrive.refreshMediaIndex === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(1500);
  const STATE = `(window.CMDrive.mediaIndexState ? CMDrive.mediaIndexState() : { at: null, fresh: null, err: 'no mediaIndexState on this build' })`;

  console.log('1. A LISTING THAT WAS FETCHED IS FRESH, AND SAYS WHEN');
  const s1 = await p.evaluate(`(async () => { const n = await CMDrive.refreshMediaIndex(); return Object.assign({ n }, ${STATE}, { has: CMDrive.hasName('TK151_1A_09.09.2026_MP.jpg') }); })()`);
  ok('the index came down and is marked fresh', s1.n === 1 && s1.fresh === true && !s1.err && s1.at > 0 && s1.has, JSON.stringify(s1));

  console.log('\n2. THE SERVER STOPS ANSWERING');
  FAILING = true;
  const s2 = await p.evaluate(`(async () => { const n = await CMDrive.refreshMediaIndex(); return Object.assign({ n }, ${STATE}, { has: CMDrive.hasName('TK151_1A_09.09.2026_MP.jpg') }); })()`);
  ok('the listing is kept — stale beats absent', s2.n === 1 && s2.has, JSON.stringify({ n: s2.n, has: s2.has }));
  ok('  but it is marked NOT fresh, with the reason', s2.fresh === false && /500|HTTP|gateway/i.test(s2.err), JSON.stringify({ fresh: s2.fresh, err: s2.err }));
  ok('  and the time is still the time it was actually fetched', s2.at === s1.at, s2.at + ' vs ' + s1.at);
  await p.click('button[data-tab="sync"]');
  await p.waitForTimeout(1500);
  const h2 = await p.evaluate(() => (document.getElementById('syHealth') || {}).textContent || '');
  ok('the Data & Sync panel says the listing could not be refreshed', /NOT refreshed/.test(h2) && /measured against the listing from/.test(h2), h2.replace(/\s+/g, ' ').slice(0, 200));

  console.log('\n3. AND CLEARS THE NOTE ONCE IT CAN');
  FAILING = false;
  const s3 = await p.evaluate(`(async () => { await CMDrive.refreshMediaIndex(); return ${STATE}; })()`);
  ok('fresh again', s3.fresh === true && !s3.err && s3.at > s1.at, JSON.stringify(s3));
  await p.evaluate(() => renderSync());
  const h3 = await p.evaluate(() => (document.getElementById('syHealth') || {}).textContent || '');
  ok('  the panel says refreshed, and no longer warns', /File listing\s*refreshed/.test(h3.replace(/\s+/g, ' ')) && !/NOT refreshed/.test(h3), h3.replace(/\s+/g, ' ').slice(0, 160));
  ok('the server was actually asked each time', asked >= 3, asked + ' requests');
  ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');

  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); srv.close(); process.exit(1); });
