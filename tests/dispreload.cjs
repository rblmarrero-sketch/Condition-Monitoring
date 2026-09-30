/* THE DISPOSITION DIALOG WAS THE SAME "RELOADED OUT FROM UNDER YOU" LOSS
   AS THE LIGHTBOX, THE MACHINE DRAWER, "VIEW ALL EQUIPMENT" AND THE
   COMBOBOX POPUP -- ONE MORE OVERLAY THE SELF-UPDATE CHECK NEVER LEARNED.

   Both dashboard/index.html and dashboard-next/index.html poll mobile/sw.js
   for a newer BUILD and reload the moment the reader is judged "not busy"
   (busy(), a few hundred lines from the end of the inline script). busy()
   already names four earlier instances of this exact defect by comment --
   an overlay, panel or control that opened without setting the ".ov" class
   busy() actually checks for, so a reload ran straight through it. #dispBox
   ("No action required" -- askDisposition()) was a fifth: it is shown and
   hidden with its own plain "hidden" class, not ".ov", and was only ever
   protected by accident when a focused #dispReason/#dispBy/#dispReasonSel
   happened to satisfy the native-control check that comes after it. Found
   writing tests/disposition-next.cjs's own timing (a fill() landing just
   after look()'s first check), not from the field.

   Reproduced here directly, on BOTH files, with the SAME mock-mobile/sw.js
   technique tests/equipment-panel-next.cjs already established -- answering
   with a BUILD far ahead of the page's own tag is the one reliable way to
   force dashWaiting without depending on the mainline's real, constantly
   moving BUILD number, which is what made this intermittent and hard to
   pin down in the first place.

   A negative control matters as much as the fix: with the dialog CLOSED,
   the same newer-build check DOES reload the page -- proving the mechanism
   itself is not simply broken, only its list of what counts as "busy".

   Run: node tests/dispreload.cjs */
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
const RECS = [{ equip: 'TK903', date: '2026-09-13', type: 'MP', cls: 'HT', by: 'R. Marrero',
  items: [{ key: '2B', label: 'RF Final Drive', grade: 'B', comment: 'trace fuzz only' }] }];
const WAIT_MS = 5200; // past look()'s own +4s schedule, with real margin

async function boot(b, port, file) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { Object.defineProperty(navigator, 'onLine', { get: () => true }); });
  await p.goto(`http://127.0.0.1:${port}/${file}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(recs => {
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.saveEdit = () => Promise.resolve({ ok: true });
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
  }, RECS);
  await p.waitForTimeout(400);
  return { p, ctx, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  for (const file of ['dashboard/index.html', 'dashboard-next/index.html']) {
    console.log(`\n${file}`);

    // 1. The dialog is open: the reload must wait for it to close.
    {
      const { p, ctx, errs } = await boot(b, port, file);
      let navs = 0; p.on('load', () => navs++);
      await p.evaluate(() => window.askDisposition([{ rk: 'TK903|2026-09-13|MP', ik: '2B' }]));
      await p.waitForTimeout(300);
      ok('  dialog opens', !(await p.evaluate(() => document.getElementById('dispBox').classList.contains('hidden'))));
      await p.waitForTimeout(WAIT_MS);
      ok('  no reload while the disposition dialog is open', navs === 0, `navigations=${navs}`);
      ok('  the dialog is still open, not reset', !(await p.evaluate(() => document.getElementById('dispBox').classList.contains('hidden'))));
      ok('  no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
      await ctx.close();
    }

    // 2. Control: with nothing open, the same newer-build check DOES reload —
    //    proving this isn't a broken mechanism, only a busy() gap.
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
