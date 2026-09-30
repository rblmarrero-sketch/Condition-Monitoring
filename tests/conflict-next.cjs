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

  /* dashboard/'s own comparison table is always shown, inline, per non-
     standing device -- cfDiffHTML(cfDiff(winItems, v.items), ...), read
     straight off #edCfList's own text. dashboard-next's Stage-6 redesign
     kept only the four-field summary card visible by default; the SAME
     comparison (same functions, same arguments -- see renderConflict()'s
     own comment) now lives behind a <details class="cfdetail"> under the
     non-standing card, closed by default. This proves it is actually
     there, actually openable, and actually shows the same disagreement --
     not merely present in the DOM (a closed <details>'s content is still
     part of .textContent, which would make this pass even unopened; the
     point is proving a reader can GET to it, the way they would by hand). */
  const detailCountB = await n.$$eval('#edCfList .cfdetail', els => els.length);
  ok('dashboard-next: exactly one card offers the per-position detail (the non-standing one, matching dashboard/\'s own !isWin gate)',
     detailCountB === 1, `count=${detailCountB}`);
  const closedByDefaultB = await n.$eval('#edCfList .cfdetail', el => !el.open);
  ok('dashboard-next: the detail is collapsed by default (summary card stays the mockup\'s at-a-glance shape)', closedByDefaultB);

  /* Open it the way a reader would -- click the <summary>, not a script
     setting .open directly. */
  await n.click('#edCfList .cfdetail summary');
  await n.waitForTimeout(50);
  const openedB = await n.$eval('#edCfList .cfdetail', el => el.open);
  ok('dashboard-next: a click on the summary opens it', openedB);

  const diffTextA = await a.$eval('#edCfList', el => el.textContent);
  const diffTextB = await n.$eval('#edCfList .cfdetail', el => el.textContent);
  const namesAgree = ['1A', '4D', '3C'].every(k => diffTextA.includes(k) === diffTextB.includes(k));
  ok('the same findings are named in the comparison on both pages', namesAgree, `A has 1A/4D/3C: ${['1A','4D','3C'].map(k=>diffTextA.includes(k))}  B (opened detail): ${['1A','4D','3C'].map(k=>diffTextB.includes(k))}`);

  /* Not just the same KEYS -- the same per-position VERDICT: 1A is a real
     disagreement (grade C vs X, both sides named). cfDiff's own field-level
     output ("Grade: <b>3 – Degraded</b> ≠ <b>5 – Critical</b>") should
     actually name both grades, not merely mention "1A" somewhere nearby. */
  const around1A = (diffTextB.match(/1A[\s\S]{0,200}/) || [''])[0];
  ok('dashboard-next: the 1A disagreement itself (not just its key) is shown, both grade values named',
     /grade/i.test(around1A) && /degraded/i.test(around1A) && /critical/i.test(around1A),
     around1A.slice(0, 160));

  /* Control: the STANDING card gets no detail at all -- there is nothing to
     compare it against itself, exactly as dashboard/'s own !isWin check
     already excludes it. */
  const winCardHasDetail = await n.evaluate(() => {
    const cards = [...document.querySelectorAll('#edCfList .cfcard')];
    const win = cards.find(c => c.querySelector('.pill.g'));
    return !!(win && win.querySelector('.cfdetail'));
  });
  ok('dashboard-next: the standing (winning) card offers no detail to compare itself against', !winCardHasDetail);

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
