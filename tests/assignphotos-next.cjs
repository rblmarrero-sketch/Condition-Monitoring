/* ASSIGN PHOTOGRAPHS (#opOv) -- photos that arrived with no component are
   assigned to a point, kept as general evidence, or excluded with a reason.
   Write path: saveAssign(patch, ...) -> window.CMDrive.saveEdit(doc) with an
   `assign` block on it.

   This reuses the exact fixture and "found in the folder" recipe
   tests/orphanphoto.cjs already proves works against the real app (a keyless
   position claiming N photographs, CMDrive.names/hasName/fetchByName stubbed
   to answer as if the folder holds them) -- the simplest reliable way to get
   a real, actionable (not merely "missing") photograph in front of the
   dialog without standing up a live Drive/REST backend, which the checkbox
   grid's normal path (mediaAll/serverMediaOf, filled from a browser's own
   scroll-triggered thumbnail fetches) would otherwise require. "Look" then
   "file it" both go through the identical saveAssign() call the checkbox
   grid's own Assign button does.

   Run: node tests/assignphotos-next.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
/* /mobile/sw.js is served here as a STATIC MOCK, pinned to dashboard-next's own
   live ?v= tag (read off the real file, never a copied-in number) -- the same
   fix tests/tablekit-scale-next.cjs and tests/period-filter-next.cjs already
   carry, for the identical reason: dashboard-next's own self-update watcher
   (BUILT/look()/applyIfIdle() near the end of the file) fetches the real
   /mobile/sw.js and reloads the page the moment it reads "newer" -- which,
   since dashboard-next's own tag lags the mainline's constantly-bumped BUILD
   by design, it almost always does. A document-level click (capture phase)
   schedules that reload 300ms later, and a plain click on a button or row
   holds no focus busy() recognises, so nothing here held it back -- a real
   navigation mid-test, discarding whatever in-memory state (setDriveRecords,
   a CMDrive stub, window.__writes) the test had just set up. Confirmed via
   tests/period-filter-next.cjs's own investigation: the reload only shows up
   once enough wall-clock time has passed for look()'s first 4-second timer to
   have already fired before a later click, so it is a genuine, if timing-
   dependent, race -- not a one-off flake -- and it can hit ANY -next.cjs
   suite that clicks around dashboard-next without this mock. Pinning it to
   the page's own real (lower) tag makes `newer` false for the length of this
   run, for both pages -- dashboard/'s own identical self-update check reads
   the same mocked file and never sees a build higher than its own. */
const nextHtmlForSw = fs.readFileSync(path.join(ROOT, 'dashboard-next', 'index.html'), 'utf8');
const pinnedSwBuild = (nextHtmlForSw.match(/magnetic_plug\.js\?v=([^"&]+)/) || [])[1];
if (!pinnedSwBuild) throw new Error('could not read dashboard-next\'s own ?v= tag to pin the mobile/sw.js mock to');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(`const BUILD = "${pinnedSwBuild}";`); return; }
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});

const RECS = [{ equip: 'TK115', date: '2026-08-05', type: 'TB', cls: 'AT', by: 'R. Marrero',
  items: [{ key: 'FLOOR.1', label: 'Floor plate 1', grade: 'C', mm: 18 },
          { key: '', label: '', photos: 1, detection: 'DM-02', seq: 3 }] }];
const FOUND = ['TK115_TRAY.L_05.08.2026_TB_1.jpg'];
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    window.__writes = [];
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    try { localStorage.setItem('cm_dash_who', 'R. Marrero'); } catch (e) {}
    CMDash.importRecords(recs);
    showTab('sync');
  }, RECS);
  await p.waitForTimeout(600);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const openPanel = async p => {
    await p.waitForSelector('#syQuarTbl [data-quargo]', { timeout: 8000 });
    await p.evaluate(() => {
      const row = [...document.querySelectorAll('#syQuarTbl [data-quargo]')].find(r => /TK115/.test(r.textContent));
      if (!row) throw new Error('no TK115 quarantine row');
      row.click();
    });
    await p.waitForTimeout(300);
  };
  await openPanel(a); await openPanel(n);

  ok('dashboard/: Assign photographs dialog opens from the quarantine row', !(await a.evaluate(() => document.getElementById('opOv').classList.contains('hidden'))));
  ok('dashboard-next: Assign photographs dialog opens from the quarantine row', !(await n.evaluate(() => document.getElementById('opOv').classList.contains('hidden'))));

  const findAndLook = async p => {
    await p.evaluate(found => {
      CMDrive.names = () => found;
      CMDrive.hasName = nm => found.indexOf(nm) >= 0;
      CMDrive.fetchByName = () => Promise.resolve(PX);
    }, FOUND);
    // fetchByName needs PX in page scope
    await p.evaluate(([found, px]) => {
      CMDrive.fetchByName = nm => { CMDash.addPhoto(nm, px); return Promise.resolve(px); };
    }, [FOUND, PX]);
    await p.evaluate(() => { document.getElementById('opFindBox').open = true; });
    await p.fill('#opFindQ', 'TK115 05.08');
    await p.click('#opFindGo');
    await p.waitForTimeout(200);
    await p.click('#opFindOut [data-look]');
    await p.waitForTimeout(300);
  };
  await findAndLook(a); await findAndLook(n);

  const rowsA = await a.evaluate(() => document.querySelectorAll('#opFindOut li').length);
  const rowsB = await n.evaluate(() => document.querySelectorAll('#opFindOut li').length);
  ok('the found photograph is listed and viewable on both pages', rowsA === 1 && rowsB === 1, `A=${rowsA} B=${rowsB}`);

  const takeIt = async p => {
    await p.evaluate(() => {
      const opts = [...document.getElementById('opPoint').options].map(o => o.value).filter(Boolean);
      document.getElementById('opPoint').value = opts[0] || '';
    });
    const pt = await p.$eval('#opPoint', e => e.value);
    await p.click('#opFindOut [data-take]');
    await p.waitForTimeout(400);
    return pt;
  };
  const ptA = await takeIt(a), ptB = await takeIt(n);
  ok('the same inspection point was available and chosen on both pages', ptA && ptA === ptB, `A=${ptA} B=${ptB}`);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.saveEdit called exactly once on each page', writesA.length === 1 && writesB.length === 1, `A=${writesA.length} B=${writesB.length}`);
  if (writesA.length === 1 && writesB.length === 1) {
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const stripTimes = v => { if (Array.isArray(v)) return v.map(stripTimes);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = stripTimes(v[k]); return o; }
      return (typeof v === 'string' && ISO_RE.test(v)) ? '<ts>' : v; };
    ok('the saved assignment document is field-for-field identical (timestamps excluded)',
       JSON.stringify(stripTimes(writesA[0])) === JSON.stringify(stripTimes(writesB[0])),
       `A=${JSON.stringify(stripTimes(writesA[0]))} B=${JSON.stringify(stripTimes(writesB[0]))}`);
    const assignKey = Object.keys(writesA[0]).find(k => /assign/i.test(k));
    ok('the photograph is filed against the chosen point in the write', assignKey &&
       writesA[0][assignKey][FOUND[0]] && writesA[0][assignKey][FOUND[0]].point === ptA,
       JSON.stringify(writesA[0][assignKey]));
  }

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
