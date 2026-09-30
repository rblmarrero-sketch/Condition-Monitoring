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
/* /mobile/sw.js is served here as a STATIC MOCK, pinned to dashboard-next's own
   live ?v= tag (read off the real file, never a copied-in number) -- the same
   fix tests/tablekit-scale-next.cjs and tests/period-filter-next.cjs already
   carry, for the identical reason: dashboard-next's own self-update watcher
   (BUILT/look()/applyIfIdle() near the end of the file) fetches the real
   /mobile/sw.js and reloads the page the moment it reads "newer". dashboard-
   next's own tag is now kept in the same BUILD lockstep dashboard/'s already
   is -- bump.cjs tracks both files, see CLAUDE.md's "TWO OFFICE DASHBOARDS,
   BOTH PERMANENT" entry -- but this mock stays as a backstop for the one
   moment that guarantee can still slip: between a mainline bump landing and
   dashboard-next's own tag catching up in the same commit, which is exactly
   the gap that produced this incident once already. A document-level click
   (capture phase)
   schedules that reload 300ms later, and a plain click on a button or row
   holds no focus busy() recognises, so nothing here held it back -- a real
   navigation mid-test, discarding whatever in-memory state (setDriveRecords,
   a CMDrive stub, window.__writes) the test had just set up. Confirmed via
   tests/period-filter-next.cjs's own investigation: the reload only shows up
   once enough wall-clock time has passed for look()'s first 4-second timer to
   have already fired before a later click, so it is a genuine, if timing-
   dependent, race -- not a one-off flake -- and it can hit ANY -next.cjs
   suite that clicks around dashboard-next without this mock. Pinning it to
   the page's own real tag (now always equal to BUILD, not lower by design)
   makes `newer` false for the length of this run, for both pages --
   dashboard/'s own identical self-update check reads the same mocked file
   and never sees a build higher than its own. */
const nextHtmlForSw = fs.readFileSync(path.join(ROOT, 'dashboard-next', 'index.html'), 'utf8');
const pinnedSwBuild = (nextHtmlForSw.match(/magnetic_plug\.js\?v=([^"&]+)/) || [])[1];
if (!pinnedSwBuild) throw new Error('could not read dashboard-next\'s own ?v= tag to pin the mobile/sw.js mock to');
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end(`const BUILD = "${pinnedSwBuild}";`); return; }
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

  /* dashboard-next's own drawer restyle simplifies the bold title to just
     the position key ("4D") and leads the body with a "Key finding"
     summary card before the full detail block -- the unit (TK905), the
     SMU/hour-meter reading and the inspector's name all still appear,
     just under different labels (SMU -> Hour meter, By -> Inspector) and
     in a different position (a lead summary line, not only the detail
     rows). Compare title+body TOGETHER for the same set of facts, not the
     title alone for exact text -- the earlier version of this check
     required byte-identical text and failed the moment the redesign added
     a summary line ahead of the same detail. */
  const titleA = await a.$eval('#drwTitle', el => el.textContent);
  const titleB = await n.$eval('#drwTitle', el => el.textContent);
  const bodyA = await a.$eval('#drwBody', el => el.textContent.replace(/\s+/g, ' ').trim());
  const bodyB = await n.$eval('#drwBody', el => el.textContent.replace(/\s+/g, ' ').trim());
  const fullB = titleB + ' ' + bodyB;
  ok('the drawer title/body together name the same unit, position and every fact dashboard/\'s title+body do',
     ['TK905', '4D', '2026-09-14'].every(part => fullB.includes(part)),
     `A.title="${titleA}" B.title="${titleB}" B.body="${bodyB}"`);
  ok('the drawer body content (finding, cause, WO, priority, SMU/hour-meter, inspector) all appear on dashboard-next, whatever the label',
     ['Ferrous debris', 'DT14-03', 'Gear wear', 'Repair now', 'P1', 'WO-1234', '15000', 'R. Marrero'].every(part => fullB.includes(part)),
     `missing: ${['Ferrous debris', 'DT14-03', 'Gear wear', 'Repair now', 'P1', 'WO-1234', '15000', 'R. Marrero'].filter(part => !fullB.includes(part)).join(', ') || 'none'}`);
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
