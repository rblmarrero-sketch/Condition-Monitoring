/* THE PHOTO EDITOR (#lb / #pxPanel) -- rotate, straighten, zoom, crop, marks,
   caption, include/exclude. Write path: pxSave's own click handler ->
   window.CMDrive.saveEdit({key, media, assign, ...}).

   Technique: a real photograph (tiny real PNG bytes, added via
   CMDash.addPhoto under the exact filename mediaOf()'s fallback matcher
   expects -- the same recipe tests/orphan.cjs proves works with no manifest
   needed), opened through the real Detail drawer -> thumbnail click ->
   #pxOpen, a caption typed, Save pressed, and the resulting CMDrive.saveEdit
   document diffed between the two pages.

   Run: node tests/photoeditor-next.cjs */
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

const RECS = [{ equip: 'TK907', date: '2026-09-16', type: 'MP', cls: 'HT', by: 'R. Marrero',
  items: [{ key: '4E', label: 'LF Final Drive', grade: 'C', comment: 'trace only' }] }];
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const PHOTO_NAME = 'TK907_4E_16.09.2026_MP.jpg';

async function loadAndSetup(b, port, url) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/${url}`, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate((recs) => {
    window.__writes = [];
    window.CMDrive = window.CMDrive || {};
    CMDrive.configured = () => true;
    CMDrive.saveEdit = d => { window.__writes.push(d); return Promise.resolve({ ok: true }); };
    /* pxPending() -- the guard that keeps the editor's controls disabled
       while "the original is still uploading" -- reads CMDrive.hasName(name)
       and disables pxCap/pxSave/etc while it answers false or is absent. The
       photograph here is not still uploading; it is already in the folder. */
    CMDrive.hasName = () => true;
    try { localStorage.setItem('cm_drive_url', 'https://stub/exec'); } catch (e) {}
    try { localStorage.removeItem('cm_dash_who'); } catch (e) {}
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
  }, RECS);
  await p.evaluate(([name, px]) => { window.CMDash.addPhoto(name, px); }, [PHOTO_NAME, PX]);
  await p.waitForTimeout(500);
  return { p, errs };
}

(async () => {
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  const b = await chromium.launch();

  const { p: a, errs: errsA } = await loadAndSetup(b, port, 'dashboard/index.html');
  const { p: n, errs: errsB } = await loadAndSetup(b, port, 'dashboard-next/index.html');

  const key = 'TK907|2026-09-16|MP';
  await a.evaluate(k => window.openPos(k, '4E'), key);
  await n.evaluate(k => window.openPos(k, '4E'), key);
  await a.waitForTimeout(400); await n.waitForTimeout(400);

  const shotsA = await a.evaluate(() => document.querySelectorAll('#drwBody [data-i]').length);
  const shotsB = await n.evaluate(() => document.querySelectorAll('#drwBody [data-i]').length);
  ok('dashboard/: the position drawer shows the one real photograph', shotsA === 1, `shots=${shotsA}`);
  ok('dashboard-next: identical', shotsB === 1, `shots=${shotsB}`);

  const openEditor = async p => {
    await p.click('#drwBody [data-i="0"]');
    await p.waitForTimeout(300);
    await p.click('#pxOpen');
    await p.waitForTimeout(200);
  };
  await openEditor(a); await openEditor(n);

  ok('dashboard/: photo editor panel opens', !(await a.evaluate(() => document.getElementById('pxPanel').classList.contains('hidden'))));
  ok('dashboard-next: photo editor panel opens', !(await n.evaluate(() => document.getElementById('pxPanel').classList.contains('hidden'))));

  const CAPTION = 'Debris on the magnetic plug face';
  await a.fill('#pxCap', CAPTION); await n.fill('#pxCap', CAPTION);
  await a.fill('#edBy', 'V. Petrov').catch(() => {});
  /* mediaWho() falls back to cm_dash_who / the last name used elsewhere on
     the page; #pxPanel has no name field of its own, so it is set the same
     way on both pages via localStorage, matching what a person who already
     signed something else on this page would have stored. */
  await a.evaluate(() => { try { localStorage.setItem('cm_dash_who', 'V. Petrov'); } catch (e) {} });
  await n.evaluate(() => { try { localStorage.setItem('cm_dash_who', 'V. Petrov'); } catch (e) {} });

  await a.click('#pxSave'); await n.click('#pxSave');
  await a.waitForTimeout(500); await n.waitForTimeout(500);

  const writesA = await a.evaluate(() => window.__writes);
  const writesB = await n.evaluate(() => window.__writes);
  console.log('dashboard/     wrote: ' + JSON.stringify(writesA));
  console.log('dashboard-next wrote: ' + JSON.stringify(writesB));
  ok('CMDrive.saveEdit called exactly once on each page', writesA.length === 1 && writesB.length === 1, `A=${writesA.length} B=${writesB.length}`);
  if (writesA.length === 1 && writesB.length === 1) {
    /* The recipe's own fingerprint (fp) is computed from an actual canvas
       render of the image and can legitimately differ by a byte or two
       between two separate renders of the identical 1x1 PNG on two separate
       pages/contexts (font/canvas rounding) -- excluded here for that
       reason, same as every timestamp; everything else, including the
       caption and the recipe's own geometry, is compared exactly. */
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    const stripVolatile = v => { if (Array.isArray(v)) return v.map(stripVolatile);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) {
        if (k === 'fp') continue;
        o[k] = stripVolatile(v[k]); } return o; }
      return (typeof v === 'string' && ISO_RE.test(v)) ? '<ts>' : v; };
    ok('the saved photo-edit document is field-for-field identical (timestamps and the canvas fingerprint excluded)',
       JSON.stringify(stripVolatile(writesA[0])) === JSON.stringify(stripVolatile(writesB[0])),
       `A=${JSON.stringify(stripVolatile(writesA[0]))} B=${JSON.stringify(stripVolatile(writesB[0]))}`);
    const mediaA = writesA[0].media || {};
    const rec = mediaA[Object.keys(mediaA)[0]];
    ok('the media recipe carries the caption that was typed', rec && rec.caption === CAPTION, JSON.stringify(mediaA));
  }

  console.log((errsA.length ? '\ndashboard/ PAGE ERRORS:\n' + errsA.join('\n') : '') + (errsB.length ? '\ndashboard-next/ PAGE ERRORS:\n' + errsB.join('\n') : ''));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length || errsA.length || errsB.length ? 1 : 0);
})();
