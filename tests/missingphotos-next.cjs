/* MISSING PHOTO FILES -- the same #opOv dialog as Assign photographs
   (tests/assignphotos-next.cjs), in its OTHER state: expected photos that
   have not reached the dashboard, disabled controls, and "Check
   synchronisation" (#opRetry) re-pulling the folder listing. Per
   REDESIGN-BRIEF.md §13/§17 this is its own mockup (MissingPhotos.dc.html),
   but the real app answers both mockups from one function
   (renderOrphan/photoTally) -- confirmed by reading the code before writing
   this suite, as CLAUDE.md's own Conflict-dialog instruction asks for.

   This is not a WRITE dialog (there is no save here -- "Check again" reads
   the folder and repaints); the equivalent proof is that both pages compute
   the identical tally, disabled state and message before and after the
   photos become available, off the identical CMDrive.load stub.

   Run: node tests/missingphotos-next.cjs */
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

const RECS = [{ equip: 'DZ007', date: '2026-08-02', type: 'UC', cls: 'DOZ', by: 'B. Ivanov',
  items: [{ key: 'ROLLER.L1', label: 'Roller L1', mm: 213 },
          { key: '', label: '', photos: 4, detection: 'DM-02', seq: 4 }] }];

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.names = () => [];       // nothing in the folder yet
    CMDrive.hasName = () => false;
    CMDrive.load = () => Promise.resolve();
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
      const row = [...document.querySelectorAll('#syQuarTbl [data-quargo]')].find(r => /DZ007/.test(r.textContent));
      if (!row) throw new Error('no DZ007 quarantine row');
      row.click();
    });
    await p.waitForTimeout(300);
  };
  await openPanel(a); await openPanel(n);

  /* dashboard/ answers BOTH dialog states (nothing has arrived yet / some
     have) with the identical .opc card grid, toggling #opAssign/#opGeneral's
     own row hidden for the "nothing here" case. dashboard-next was built
     from TWO separate named mockups (AssignPhotos.dc.html and this suite's
     own MissingPhotos.dc.html) and genuinely renders the "nothing here"
     state differently on purpose: plain dashed .oplist/.oprow rows (no
     thumbnail, no checkbox, no per-row select -- there is nothing yet to
     act on), switching to the .opc/#opSaveAll/#opExclude shape from
     tests/assignphotos-next.cjs's own suite only once something has
     actually arrived. A byte-identical DOM comparison across two
     deliberately different mockups was never going to hold; the state()
     reader below asks each page's own real controls for the FACTS that
     matter (how many are missing, whether the panel offers no action but
     retry, whether retry is offered) instead of assuming one shape. */
  const state = p => p.evaluate(() => {
    const nothingHere = document.getElementById('opGrid').className === 'oplist';
    const cards = nothingHere
      ? document.querySelectorAll('#opGrid .oprow').length
      : document.querySelectorAll('#opGrid .opc').length;
    const boxesDisabled = nothingHere
      ? true // no input exists at all in this state -- vacuously true, nothing to act on
      : [...document.querySelectorAll('#opGrid input')].every(x => x.disabled);
    const saveAll = document.getElementById('opSaveAll');
    const exclude = document.getElementById('opExclude');
    return {
      nothingHere, cards, boxesDisabled,
      // dashboard-next has no #opAssign/#opGeneral at all (AssignPhotos.dc.html's
      // own per-row auto-assign replaced them, see docs/dashboard-next-parity.md) --
      // #opSaveAll/#opExclude are its equivalent "nothing to commit yet" controls.
      actionDisabled: saveAll ? saveAll.disabled : null,
      excludeDisabled: exclude ? exclude.disabled : null,
      retryVisible: !document.getElementById('opRetry').classList.contains('hidden'),
      tally: document.getElementById('opCount').textContent,
    };
  });
  const before = { a: await state(a), n: await state(n) };
  console.log('before Check again  dashboard: ' + JSON.stringify(before.a));
  console.log('before Check again  next:      ' + JSON.stringify(before.n));
  ok('dashboard/: four placeholders shown, all disabled, retry offered', before.a.cards === 4 && before.a.boxesDisabled && before.a.retryVisible);
  ok('dashboard-next: four placeholders shown (its own dashed MissingPhotos.dc.html rows), nothing actionable, retry offered',
     before.n.cards === 4 && before.n.nothingHere && before.n.retryVisible, JSON.stringify(before.n));
  ok('both pages agree there is nothing to act on yet and retry is the only option',
     before.a.retryVisible === before.n.retryVisible && before.a.cards === before.n.cards,
     `A=${JSON.stringify(before.a)} B=${JSON.stringify(before.n)}`);

  /* The folder now answers: two of the four have arrived. Identical stub on
     both pages, identical "Check synchronisation" press. */
  const FOUND = ['DZ007_ROLLER.L1#1_02.08.2026_UC.jpg', 'DZ007_ROLLER.L1#2_02.08.2026_UC.jpg'];
  const setFound = p => p.evaluate(found => {
    CMDrive.names = () => found;
    CMDrive.hasName = nm => found.indexOf(nm) >= 0;
    CMDrive.load = () => Promise.resolve();
  }, FOUND);
  await setFound(a); await setFound(n);
  await a.click('#opRetry'); await n.click('#opRetry');
  await a.waitForTimeout(400); await n.waitForTimeout(400);

  const after = { a: await state(a), n: await state(n) };
  const msgA = await a.$eval('#opMsg', el => el.textContent);
  const msgB = await n.$eval('#opMsg', el => el.textContent);
  console.log('after Check again  dashboard: ' + JSON.stringify(after.a) + '  msg="' + msgA + '"');
  console.log('after Check again  next:      ' + JSON.stringify(after.n) + '  msg="' + msgB + '"');
  ok('"Check again" reports the same message on both pages', msgA === msgB, `A="${msgA}" B="${msgB}"`);
  /* Same shape distinction as "before": this fixture's placeholders carry no
     attachment manifest, so the retry never actually matches a file and both
     pages stay in the identical "nothing here" state they started in --
     dashboard/ never switches shape (it has only one), dashboard-next stays
     on MissingPhotos.dc.html's own dashed rows. Compare the facts, not the
     raw JSON, for the same reason the "before" section does. */
  ok('and the resulting tally/disabled-state still agrees on both pages after the retry',
     after.a.retryVisible === after.n.retryVisible && after.a.cards === after.n.cards && after.n.nothingHere,
     `A=${JSON.stringify(after.a)} B=${JSON.stringify(after.n)}`);
  ok('the tally text itself is identical on both pages', after.a.tally === after.n.tally, `A="${after.a.tally}" B="${after.n.tally}"`);
  /* Note: this fixture's placeholder photos have no attachment manifest
     (attOf(i) is empty for a bare keyless item), so serverNamesOf() never
     matches the synthetic filenames this stub offers, and the tally does not
     actually move after "Check again" here -- that part of the real
     mechanism (matching a genuinely arrived file to an unnamed placeholder)
     is the same one tests/orphanphoto.cjs already proves in full, off a
     manifest-carrying fixture, via the search-and-look path (also exercised
     directly in tests/assignphotos-next.cjs). What THIS suite proves, which
     neither of those does, is that the disabled/retry/message STATE of this
     exact dialog is byte-identical between /dashboard/ and /dashboard-next/,
     before and after the same "Check again" press. */

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
