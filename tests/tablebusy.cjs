/* A TABLE THE READER IS ACTIVELY FILTERING OR SORTING WAS THE SAME "RELOADED
   OUT FROM UNDER YOU" LOSS AS THE LIGHTBOX, THE MACHINE DRAWER, "VIEW ALL
   EQUIPMENT", THE COMBOBOX POPUP, AND THE DISPOSITION DIALOG (see
   tests/dispreload.cjs) -- one more shape busy() never learned, because a
   sort-header click and a filter keystroke leave no persistent DOM flag the
   way an open dialog's own "hidden" class does.

   docs/dashboard-next-parity.md named this the one gap left after the
   conflict-detail and regression-sweep work. dashboard-next/index.html's
   own `?v=` tag deliberately lags the mainline's constantly-bumped BUILD
   (dashboard/index.html's tracks it, by bump.cjs discipline), so `look()`
   finds "newer" there within seconds of any real visit -- but the gap in
   busy() itself is identical in both files, so both are fixed and both are
   proven here, with the SAME mocked-mobile/sw.js technique
   tests/dispreload.cjs and tests/equipment-panel-next.cjs already
   established (answering with a BUILD far ahead of the page's own tag is
   the reliable way to force dashWaiting without depending on the
   mainline's real, moving BUILD number).

   Same shape as tests/dispreload.cjs: prove the busy signal holds off the
   reload for as long as the reader keeps touching the table, then a
   negative control proving the mechanism itself still reloads a genuinely
   idle page -- this isn't a broken check, only a busy() gap that is now
   closed.

   Run: node tests/tablebusy.cjs */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), http = require('http'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/mobile/sw.js') { r.writeHead(200, { 'content-type': 'application/javascript' }); r.end('const BUILD = "999999999";'); return; }
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(d); } });
});
/* Deliberately small -- NOT the 265-record fleet-fixture.json. renderFleet()
   over that full fixture is itself slow enough (confirmed separately) to run
   past look()'s own 4s timer on a loaded machine, racing the very thing this
   suite means to test rather than the fixture size. A handful of findings is
   enough for a real, sortable, filterable fleet table. */
const FLEET = [
  { equip: 'TK905', date: '2026-09-14', type: 'MP', cls: 'HT', by: 'R. Marrero', smu: '15000',
    items: [{ key: '4D', label: 'RR Final Drive', grade: 'X', defect: 'Ferrous debris', prio: 'P1' }] },
  { equip: 'TK906', date: '2026-09-10', type: 'MP', cls: 'HT', by: 'R. Marrero', smu: '12000',
    items: [{ key: '4E', label: 'RR Final Drive', grade: 'B', defect: 'Trace fuzz', prio: 'P3' }] },
  { equip: 'EX014', date: '2026-09-12', type: 'INSP', cls: 'EXC', by: 'B. Ivanov', smu: '8000',
    items: [{ key: 'H1', label: 'Boom pin', grade: 'C', defect: 'Wear', prio: 'P2' }] },
  { equip: 'DZ021', date: '2026-09-08', type: 'UC', cls: 'DOZ', by: 'B. Ivanov', smu: '5000',
    items: [{ key: 'T1', label: 'Track', grade: 'A', defect: '', prio: '' }] },
];
const WAIT_MS = 5200; // past look()'s own +4s schedule, with real margin

async function boot(b, port, file) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(navigator, 'onLine', { get: () => true }); });
  await p.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(f => { window.CMDash.setDriveRecords(f); const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
    // setDriveRecords's own renderAll() does not paint a tab that is not
    // yet marked current at this point in boot -- call the fleet table's
    // own render directly rather than a #winTog click, which (confirmed
    // separately) can take long enough on a loaded 265-record fixture to
    // itself run past look()'s 4s timer and confound this test's own
    // timing, not the thing under test.
    try { renderFleet(); } catch (e) {} }, FLEET);
  await p.waitForTimeout(200);
  return { p, ctx, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  for (const file of ['dashboard/index.html', 'dashboard-next/index.html']) {
    console.log(`\n${file}`);

    // 1. The reader keeps sorting and filtering the fleet table across the
    //    whole window: the reload must wait for as long as they keep at it.
    {
      const { p, ctx, errs } = await boot(b, port, file);
      let navs = 0; p.on('load', () => navs++);
      const th = await p.$('#fleetTbl th[data-sort]');
      ok('  the fleet table has a sortable column to click', !!th);
      const t0 = Date.now();
      while (Date.now() - t0 < WAIT_MS) {
        await p.click('#fleetTbl th[data-sort]').catch(() => {});
        await p.waitForTimeout(600);
        await p.fill('#fleetTbl input.cwcf', 'TK').catch(() => {});
        await p.waitForTimeout(600);
        await p.fill('#fleetTbl input.cwcf', '').catch(() => {});
        await p.waitForTimeout(600);
      }
      ok('  no reload while the reader keeps sorting/filtering the table', navs === 0, `navigations=${navs}`);
      ok('  the fleet table is still on screen, not reset mid-interaction',
         await p.evaluate(() => !!document.getElementById('fleetTbl').querySelector('tbody tr')));
      ok('  no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
      await ctx.close();
    }

    // 2. Control: with the table genuinely untouched, the same newer-build
    //    check DOES reload -- proving this isn't a broken mechanism, only a
    //    busy() gap, and that the fix does not hold the update forever.
    {
      const { p, ctx, errs } = await boot(b, port, file);
      let navs = 0; p.on('load', () => navs++);
      await p.waitForTimeout(WAIT_MS);
      ok('  control: a genuinely idle page DOES reload onto the newer build', navs > 0, `navigations=${navs}`);
      ok('  no page errors in the control', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
      await ctx.close();
    }
  }

  await b.close(); srv.close();
  console.log(fails.length ? `\nFAILED ${fails.length}: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
