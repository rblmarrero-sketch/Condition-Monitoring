/* A NAME ABSENT FROM A CACHE NOBODY HAS CHECKED THIS SESSION IS SILENCE,
   NOT A VERDICT.

   Read live on 2026-09-15: TK115 (2026-08-05) and DZ007 (2026-08-02), weeks
   old and fully synced — every photograph present and correctly sized on
   the server, confirmed directly against the bucket — flashed into "10
   photo file(s) missing" on the Data & Sync tab on every dashboard reload,
   and cleared itself moments later with no other action taken.

   orphanPhotos() built its MISSING placeholders from CMDrive.hasName, which
   answers off whatever was last cached to localStorage. showTab("sync")
   paints once, synchronously, off exactly that cache, and only afterward
   asks the server for a fresh listing (see the comment on that call: "the
   panel that says missing has to ask last, not earliest"). The first paint
   was reading an unconfirmed cache as a confirmed absence.

   The fix does not wait for a SUCCESSFUL refresh — CMDrive.mediaIndexState
   already carries `fresh` for that, and a caller that waited on it would
   wait forever on a failing link, contradicting the "stale beats absent"
   rule the rest of drive.js keeps. It waits for an ATTEMPT: `tried` flips
   the instant refreshMediaIndex() is called, whatever it returns.

   This suite proves both halves: before any attempt, a claimed photograph
   the cache does not yet know about reads as LOADING, not MISSING, and does
   not manufacture a correction task; once an attempt has been made — even
   one that changes nothing, because the cache already agreed — the same
   absence is trusted as MISSING again.

   Run: node tests/quarflash.cjs   (starts its own server on 8484) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8484);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

let INDEXED = false; // whether the mock backend's own index yet lists the round's files
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.pathname === '/live') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    if (u.searchParams.get('action') === 'records') {
      const idx = INDEXED
        ? [1, 2, 3, 4, 5, 6].map(n => ({ name: `TK115._05.08.2026_TB_${n}.jpg`, id: 'x' + n, size: 1000 + n }))
        : [];
      return res.end(JSON.stringify({ ok: true, records: [], edits: [], conflicts: [], deferrals: [],
        cursor: 0, failed: 0, truncated: false, index: idx }));
    }
    return res.end(JSON.stringify({ ok: true, folder: 'test', canDelete: false }));
  }
  const p = path.join(ROOT, u.pathname);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('no'); }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
});

/* The deployed shape: TK115's keyless Dump body liner position, six
   photographs, exactly as tests/orphanphoto.cjs uses it — the same fixture
   the live folder happens to share. */
const RECS = [
  { equip: 'TK115', date: '2026-08-05', type: 'TB', cls: 'AT', by: 'R. Marrero',
    items: [{ key: 'FLOOR.1', label: 'Floor plate 1', grade: 'C', mm: 18 },
            { key: '', label: '', photos: 6, detection: 'DM-02', seq: 3 }] },
];

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); },
    `http://127.0.0.1:${PORT}/live`);
  await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMDrive && typeof CMDrive.mediaIndexState === 'function', null, { timeout: 20000 });

  console.log('BEFORE ANY REFRESH ATTEMPT THIS SESSION');
  const before = await p.evaluate(recs => {
    CMDrive.configured = () => true;
    CMDash.importRecords(recs);
    const rec = RECS.find(r => r.equip === 'TK115');
    const st = CMDrive.mediaIndexState();
    const tally = photoTally(rec);
    showTab('sync'); renderSync();
    const row = [...document.querySelectorAll('#syQuarTbl [data-quargo]')].find(r => /TK115/.test(r.textContent));
    return { tried: st.tried, missing: tally.missing, received: tally.received, expected: tally.expected,
             rowText: row ? row.textContent.replace(/\s+/g, ' ') : '' };
  }, RECS);
  ok(before.tried === false, 'the session has not attempted a refresh yet', JSON.stringify(before));
  ok(before.missing === 0 && before.received === 6, 'the six photographs read as LOADING, not MISSING, before any attempt',
     JSON.stringify(before));
  /* The keyless point still needs an engineer regardless of photo state — the
     round stays on the panel either way. What must NOT happen is the wrong
     accusation: "photo file missing" against a folder nobody has actually
     checked yet this session. */
  ok(!/photo file missing/i.test(before.rowText), 'and it is not accused of a missing file before anyone has checked',
     before.rowText.slice(0, 120));

  console.log('\nAN ATTEMPT IS MADE — AND THE MOCK BACKEND STILL DOES NOT LIST THE FILES');
  const tried = await p.evaluate(async () => {
    await CMDrive.refreshMediaIndex();
    const rec = RECS.find(r => r.equip === 'TK115');
    const st = CMDrive.mediaIndexState();
    const tally = photoTally(rec);
    renderSync();
    const row = [...document.querySelectorAll('#syQuarTbl [data-quargo]')].find(r => /TK115/.test(r.textContent));
    return { tried: st.tried, fresh: st.fresh, missing: tally.missing, received: tally.received,
             rowText: row ? row.textContent.replace(/\s+/g, ' ') : '' };
  });
  ok(tried.tried === true && tried.fresh === true, 'the attempt is recorded, and this one succeeded', JSON.stringify(tried));
  ok(tried.missing === 6 && tried.received === 0,
     'now that the index has genuinely answered, the same absence reads as MISSING', JSON.stringify(tried));
  ok(/photo file missing/i.test(tried.rowText), 'and the row now correctly says the file is missing',
     tried.rowText.slice(0, 120));

  console.log('\nAND ONCE THE FOLDER GENUINELY HOLDS THEM, THE ACCUSATION CLEARS TOO');
  INDEXED = true;
  const cleared = await p.evaluate(async () => {
    await CMDrive.refreshMediaIndex();
    const rec = RECS.find(r => r.equip === 'TK115');
    const tally = photoTally(rec);
    renderSync();
    const row = [...document.querySelectorAll('#syQuarTbl [data-quargo]')].find(r => /TK115/.test(r.textContent));
    return { missing: tally.missing, received: tally.received,
             rowText: row ? row.textContent.replace(/\s+/g, ' ') : '' };
  });
  ok(cleared.received === 6 && cleared.missing === 0, 'all six now read as received', JSON.stringify(cleared));
  ok(!/photo file missing/i.test(cleared.rowText),
     'and the row no longer says a file is missing — it needs a component instead',
     cleared.rowText.slice(0, 120));

  console.log('\nA BUILD WITH NO mediaIndexState AT ALL TRUSTS THE CACHE IMMEDIATELY, SAME AS BEFORE THIS FIX');
  /* Fresh page, fresh CMDrive — the point is a build that never had `tried`
     at all, not this session's own (by-now fully resolved) cache. */
  INDEXED = false;
  const p2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); },
    `http://127.0.0.1:${PORT}/live`);
  await p2.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p2.waitForFunction(() => window.CMDrive && typeof CMDrive.hasName === 'function', null, { timeout: 20000 });
  const noApi = await p2.evaluate(recs => {
    delete CMDrive.mediaIndexState;
    CMDrive.configured = () => true;
    CMDash.importRecords(recs);
    const rec = RECS.find(r => r.equip === 'TK115');
    return photoTally(rec);
  }, RECS);
  ok(noApi.missing === 6 && noApi.received === 0,
     'no mediaIndexState at all trusts hasName immediately, same as always', JSON.stringify(noApi));
  await p2.close();

  console.log('\nNO BACKEND ATTACHED IS SILENCE TOO, NOT A CONFIRMED ABSENCE');
  /* Reported live on 2026-09-15: the sibling KPI tiles already say "no
     backend attached — nothing to compare against" (CMDrive.configured()
     false, the same `linked` guard syncScan() has always used), but this
     panel went on confidently accusing TK115/DZ007 of missing photographs —
     CMDrive.hasName is a function regardless of whether a backend is
     configured, so with nothing to ask, it simply answers false for
     everything and orphanPhotos() read that as a verdict. A backend that
     was never asked is exactly as unconfirmed as one that was asked and
     has not answered yet — `idxTrust` must be false in both. */
  const p3 = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p3.addInitScript(u => { localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); },
    `http://127.0.0.1:${PORT}/live`);
  await p3.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p3.waitForFunction(() => window.CMDrive && typeof CMDrive.mediaIndexState === 'function', null, { timeout: 20000 });
  const noBackend = await p3.evaluate(async recs => {
    CMDrive.configured = () => false;
    await CMDrive.refreshMediaIndex().catch(() => {});
    CMDash.importRecords(recs);
    const rec = RECS.find(r => r.equip === 'TK115');
    const tally = photoTally(rec);
    showTab('sync'); renderSync();
    const row = [...document.querySelectorAll('#syQuarTbl [data-quargo]')].find(r => /TK115/.test(r.textContent));
    return { missing: tally.missing, received: tally.received,
             rowText: row ? row.textContent.replace(/\s+/g, ' ') : '' };
  }, RECS);
  ok(noBackend.missing === 0, 'unconfigured — no photograph is accused of being missing', JSON.stringify(noBackend));
  ok(!/photo file missing/i.test(noBackend.rowText),
     'and the row does not say a file is missing when there is no backend to have checked it against',
     noBackend.rowText.slice(0, 120));
  await p3.close();

  ok(errs.length === 0, 'no page errors', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
