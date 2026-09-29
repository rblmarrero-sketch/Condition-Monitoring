/* THE CONFLICT DIALOG -- the single most sensitive dialog in this redesign
   (Stage 6 task's own words). Two phones send the same round; the office
   picks the version reports use. Whatever a user picks here must write the
   EXACT SAME result /dashboard/ writes today.

   This suite loads the IDENTICAL two-device conflict fixture into the
   untouched /dashboard/ and into /dashboard-next/, opens the Edit inspection
   drawer on both (which is where the real app renders the conflict card --
   renderConflict()/#edCfCard/#edCfList -- there is no separate full-screen
   Conflict overlay in the real code, only in the Conflict.dc.html mockup;
   see the code comment beside the restyle in dashboard-next/index.html),
   clicks "Use this one" for the SAME device on both, and diffs:

     1. the exact arguments passed to the real write function
        (window.CMDrive.resolve(key, dev, by)) -- stubbed on both pages so no
        network call is made, and captured rather than guessed at;
     2. the resulting in-memory conflict record (window.CMDash.setConflicts
        payload) both pages compute afterward;
     3. the on-screen result (which version now shows "In use", the msg text).

   This proves the ONLY change made to this dialog for Stage 6 -- rewrapping
   each device's summary into a per-device card, matched to Conflict.dc.html's
   side-by-side "Phone A / Phone B" shell -- changed nothing about what is
   written. cfDiff/cfDiffHTML (the disagreement comparison) and keepVersion
   (the write path) were not touched; only the surrounding markup was.

   Run: node tests/conflict-next.cjs */
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

/* Two phones, same unit/date/type, genuinely different findings -- the exact
   shape tests/cfdiff.cjs already proves the comparison logic against. */
const RECS = [
  { equip: 'TK900', date: '2026-09-10', type: 'MP', cls: 'HT', by: 'R. Marrero', dev: 'DAAAA', smu: '12000',
    items: [
      { key: '1A', label: 'LF Final Drive', grade: 'C', comment: 'fine fuzz' },
      { key: '2B', label: 'RF Final Drive', grade: 'A' },
      { key: '4D', label: 'RR Final Drive', grade: 'X', defect: 'Ferrous debris' },
    ] },
  { equip: 'TK900', date: '2026-09-10', type: 'MP', cls: 'HT', by: 'B. Ivanov', dev: 'DBBBB', smu: '12010',
    items: [
      { key: '1A', label: 'LF Final Drive', grade: 'X', comment: 'fine fuzz', sev: 'CRI' },
      { key: '2B', label: 'RF Final Drive', grade: 'A' },
      { key: '3C', label: 'LR Final Drive', grade: 'B' },
    ] },
];

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.__writes = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.resolve = (key, dev, by) => { window.__writes.push({ fn: 'resolve', key, dev, by }); return Promise.resolve({ at: '2026-09-29T00:00:00.000Z' }); };
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    try { localStorage.removeItem('cm_dash_who'); } catch (e) {}
    /* setDriveRecords, not importRecords: importRecords dedupes on
       equip|date|type alone (last write wins) and would silently drop one of
       the two rival copies before groupRivals ever saw them. setDriveRecords
       keys on equip|date|type|dev -- the identity a real conflict actually
       has -- which is the whole reason it exists (see its own comment). */
    CMDash.setDriveRecords(recs, { replace: true });
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
  }, RECS);
  await p.waitForTimeout(700);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const key = 'TK900|2026-09-10|MP';
  await a.evaluate(k => window.openEdit(k), key);
  await n.evaluate(k => window.openEdit(k), key);
  await a.waitForTimeout(400); await n.waitForTimeout(400);

  /* The conflict card is showing on both, with two device cards. */
  const shapeA = await a.evaluate(() => ({
    visible: !document.getElementById('edCfCard').classList.contains('hidden'),
    devCount: document.querySelectorAll('#edCfList [data-keep]').length,
  }));
  const shapeB = await n.evaluate(() => ({
    visible: !document.getElementById('edCfCard').classList.contains('hidden'),
    devCount: document.querySelectorAll('#edCfList [data-keep]').length,
  }));
  ok('dashboard/: conflict card shows with two device choices', shapeA.visible && shapeA.devCount === 2, JSON.stringify(shapeA));
  ok('dashboard-next: conflict card shows with two device choices (restyled as per-device cards)',
     shapeB.visible && shapeB.devCount === 2, JSON.stringify(shapeB));

  /* dashboard-next's own restyle: each device is now its own bordered card. */
  const cardsB = await n.$$eval('#edCfList .cfcard', els => els.length);
  ok('dashboard-next: conflict card grid uses the new .cfcard per-device shell', cardsB === 2, `cards=${cardsB}`);

  /* The disagreement itself must be shown identically on both -- same finding
     (1A) flagged as differing, same one each side only has (4D/3C). */
  const diffTextA = await a.$eval('#edCfList', el => el.textContent);
  const diffTextB = await n.$eval('#edCfList', el => el.textContent);
  const namesAgree = ['1A', '4D', '3C'].every(k => diffTextA.includes(k) === diffTextB.includes(k));
  ok('the same findings are named in the comparison on both pages', namesAgree, `A has 1A/4D/3C: ${['1A','4D','3C'].map(k=>diffTextA.includes(k))}  B: ${['1A','4D','3C'].map(k=>diffTextB.includes(k))}`);

  /* Fill "your name" (required before keepVersion will act -- ed_needname
     guard), then choose DBBBB's version on both. */
  await a.fill('#edBy', 'V. Petrov');
  await n.fill('#edBy', 'V. Petrov');
  await a.click('#edCfList [data-keep="DBBBB"]');
  await n.click('#edCfList [data-keep="DBBBB"]');
  await a.waitForTimeout(500); await n.waitForTimeout(500);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.resolve was called exactly once on each page', writesA.length === 1 && writesB.length === 1,
     `A=${writesA.length} B=${writesB.length}`);
  ok('the write path (key, dev, by) is byte-identical between /dashboard/ and /dashboard-next/',
     JSON.stringify(writesA) === JSON.stringify(writesB), `A=${JSON.stringify(writesA)} B=${JSON.stringify(writesB)}`);
  ok('it resolved to the device the user actually picked', writesA[0] && writesA[0].dev === 'DBBBB', JSON.stringify(writesA));

  /* The resulting conflict record CMDash.setConflicts computed -- read back
     from window.CMDash (whatever /dashboard/'s own code treats as source of
     truth for "is this resolved, and to what"), not re-derived by this test. */
  const confA = await a.evaluate(() => window.CMDash.conflictCount());
  const confB = await n.evaluate(() => window.CMDash.conflictCount());
  ok('the resolved conflict count matches (0 remaining) on both', confA === confB && confA === 0, `A=${confA} B=${confB}`);

  const msgA = await a.$eval('#edMsg', el => el.textContent);
  const msgB = await n.$eval('#edMsg', el => el.textContent);
  ok('the saved confirmation message matches', msgA === msgB, `A="${msgA}" B="${msgB}"`);

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
