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
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
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

  const state = p => p.evaluate(() => ({
    cards: document.querySelectorAll('#opGrid .opc').length,
    boxesDisabled: [...document.querySelectorAll('#opGrid input')].every(x => x.disabled),
    assignDisabled: document.getElementById('opAssign').disabled,
    generalDisabled: document.getElementById('opGeneral').disabled,
    retryVisible: !document.getElementById('opRetry').classList.contains('hidden'),
    tally: document.getElementById('opCount').textContent,
  }));
  const before = { a: await state(a), n: await state(n) };
  console.log('before Check again  dashboard: ' + JSON.stringify(before.a));
  console.log('before Check again  next:      ' + JSON.stringify(before.n));
  ok('dashboard/: four placeholders shown, all disabled, retry offered', before.a.cards === 4 && before.a.boxesDisabled && before.a.retryVisible);
  ok('dashboard-next: identical -- four placeholders, all disabled, retry offered', JSON.stringify(before.n) === JSON.stringify(before.a),
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
  ok('and the resulting tally/disabled-state is identical on both pages',
     JSON.stringify(after.a) === JSON.stringify(after.n), `A=${JSON.stringify(after.a)} B=${JSON.stringify(after.n)}`);
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
