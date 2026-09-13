/* THE FIELD EVIDENCE COMES OFF THE PHONE WHOLE, AND THE APP SAYS WHAT IT HOLDS.

   An iPhone on build 327 showed "15 inspection(s) waiting" and, on one of
   them, "1 photo(s) on this phone can no longer be read … EX001_HYD_
   08.09.2026_FC.jpg" beside "Verified byte for byte — 3 file(s)". The
   server holds that photograph today, byte for byte what the receipt on
   the phone's own manifest says it kept. Every mechanism that let a phone
   get there — and stay there — is reproduced here against the current
   build, and each fix is held to what it actually does:

     1. ONE UNREADABLE PHOTOGRAPH MUST NOT FAIL THE EXPORT. The ZIP read
        every file with a bare arrayBuffer(); the first reclaimed file
        rejected the whole build. First, middle and last, because a
        loop that survives the first can still die on the last.
     2. A DRAFT THAT COULD NOT BE SAVED MUST NOT BE RELOADED AWAY. The
        update reloaded on a flush that had failed. The update is held.
     3. A QUEUE THAT CANNOT BE READ IS NOT EMPTY. pendingCount() said 0,
        armRetry() disarmed, the pill said "All sent".
     4. A FILE THE SERVER DOES NOT HAVE GOES BACK ON THE SEND LIST — and
        only that file. A file the server holds LARGER than what was sent
        is a different file and is never overwritten from here.
     5. A PHOTOGRAPH THE PHONE CAN NO LONGER READ, WHOSE RECEIPT PROVES THE
        SERVER HOLDS IT, DOES NOT HOLD THE ROUND. Without the receipt it
        still does — the rule needs the proof.
     6. The production-shaped pass: NINETEEN rounds with real JPEG bytes,
        one of them carrying a reclaimed photograph, sent in one run and
        exported in one ZIP, with the counts read back rather than assumed.

   And after all of it: every record still there, every photograph still
   on it, every stored name unchanged — nothing was deleted or renamed to
   make a count come out.

   Run: node tests/recovery.cjs   (starts its own server on 8531) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8531);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

/* ---- the backend: batch, single, receipts, and a listing that can be told to lie ---- */
let store = {};            // "folder/name" -> {bytes, sha}
let posted = [];           // every file name accepted, in order
let DROP = new Set();      // names the listing leaves out
let SIZES = {};            // name -> size the listing reports instead of the truth
let RIVAL = new Set();     // names another device already owns: filed as <name>~RIVAL, like the backend does
let MAXBODY = 0;           // a link with a size limit: any POST body larger than this is cut off mid-request
let cut = 0;
let reqs = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__stat') return send({ posted, reqs, store: Object.keys(store), cut });
  if (u.pathname === '/__reset') { store = {}; posted = []; reqs = []; DROP = new Set(); SIZES = {}; return send({ ok: true }); }
  if (u.pathname === '/__drop') { DROP = new Set(String(u.searchParams.get('n') || '').split(',').filter(Boolean)); return send({ ok: true }); }
  if (u.pathname === '/__size') { SIZES = {}; const n = u.searchParams.get('n'); if (n) SIZES[n] = Number(u.searchParams.get('s')); return send({ ok: true }); }
  if (u.pathname === '/__rival') { RIVAL = new Set(String(u.searchParams.get('n') || '').split(',').filter(Boolean)); return send({ ok: true }); }
  if (u.pathname === '/__maxbody') { MAXBODY = Number(u.searchParams.get('n') || 0); cut = 0; return send({ ok: true }); }
  if (u.pathname === '/exec') {
    if (req.method === 'GET') {
      reqs.push('get:' + u.searchParams.get('action'));
      if (u.searchParams.get('action') === 'list') {
        const folder = String(u.searchParams.get('folder') || '').replace(/^\/+|\/+$/g, '');
        const files = Object.keys(store).filter(k => k.startsWith(folder + '/')).map(k => {
          const name = k.slice(folder.length + 1);
          return { name, path: k, id: k, size: SIZES[name] != null ? SIZES[name] : store[k].bytes.length, updated: Date.now() };
        }).filter(f => !DROP.has(f.name));
        return send({ ok: true, count: files.length, truncated: false, files });
      }
      return send({ ok: false, error: 'Unknown action' });
    }
    let b = ''; req.on('data', c => { b += c; if (MAXBODY && b.length > MAXBODY) { cut++; try { req.socket.destroy(); } catch (e) {} } });
    return req.on('end', () => {
      if (MAXBODY && b.length > MAXBODY) return;           // cut off above: no reply
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      const save = (f, folder) => {
        const bytes = Buffer.from(String(f.file || ''), 'base64');
        const sha = crypto.createHash('sha256').update(bytes).digest('hex');
        /* The backend's own rule: a name another device owns is kept for
           that device, and this phone's copy is filed as <name>~<DEV>. */
        const stored = RIVAL.has(f.name) ? f.name.replace(/(\.[^.]+)$/, '~RIVAL$1') : f.name;
        const key = (folder ? folder + '/' : '') + stored;
        store[key] = { bytes, sha }; posted.push(f.name);
        return { ok: true, req: f.name, name: stored, id: key,
          receipt: { receiptId: 'r' + sha.slice(0, 24), attachmentId: String(f.aid || ''), objectId: key,
                     byteSize: bytes.length, sha256: sha, at: new Date().toISOString(), duplicate: false, verified: true } };
      };
      if (j && j.op === 'ping') { reqs.push('ping'); return send({ ok: true, write: true, batch: true }); }
      if (j && j.op === 'batch') { reqs.push('batch:' + (j.files || []).length);
        return send({ ok: true, batch: true, saved: (j.files || []).map(f => save(f, j.folder)), failed: [] }); }
      reqs.push('one'); if (j && j.name) return send(save(j, j.folder));
      return send({ ok: false, error: 'Missing file name' });
    });
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('x'); }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
});
const B = `http://127.0.0.1:${PORT}`;
const stat = () => fetch(B + '/__stat').then(r => r.json());
const ctl = q => fetch(B + q).then(r => r.text());

/* Sizes no real canvas JPEG below will land on. A blob of exactly this many
   bytes cannot be read — through FileReader (the upload path) and through
   arrayBuffer() (the export and the hash) — with the real DOMException a
   reclaimed file produces. Rigged by SIZE because a marker property does
   not survive the structured clone into IndexedDB; size does. */
const BAD = [12347, 23459, 34571];

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  let navs = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
      { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
      { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' }]));
    localStorage.removeItem('up_batch');
    localStorage.setItem('cm_conf_works', '1');
  }, B + '/exec');
  await p.addInitScript(() => {
    window.__badSizes = [];
    const bad = b => b && window.__badSizes.indexOf(b.size) >= 0;
    const err = () => new DOMException('A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError');
    ['readAsDataURL', 'readAsArrayBuffer'].forEach(m => {
      const origRead = FileReader.prototype[m];
      FileReader.prototype[m] = function (blob) {
        if (bad(blob)) { setTimeout(() => { try { Object.defineProperty(this, 'error', { value: err(), configurable: true }); } catch (e) {}
          if (typeof this.onerror === 'function') this.onerror(new ProgressEvent('error')); }, 0); return; }
        return origRead.call(this, blob);
      };
    });
    const origAB = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () { if (bad(this)) return Promise.reject(err()); return origAB.call(this); };
  });
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(800);
  navs = 0;

  /* Real JPEG bytes from a canvas, distinct per call; or a blob of a rigged size. */
  const SEED = `
    window.__jpg = async (tag) => { const c=document.createElement('canvas'); c.width=640; c.height=480;
      const x=c.getContext('2d'); x.fillStyle='#'+((Math.random()*0xffffff)|0).toString(16).padStart(6,'0'); x.fillRect(0,0,640,480);
      x.fillStyle='#fff'; x.font='28px sans-serif'; x.fillText(String(tag), 30, 60);
      return await new Promise(r=>c.toBlob(r,'image/jpeg',0.8)); };
    window.__seed = async (unit, photos) => {
      const rec={ id:'MP__'+unit+'__2026-09-10__'+DEVICE+'__'+(Date.now()+Math.floor(Math.random()*1000)), equip:unit, cls:'HT', type:'MP',
        date:'2026-09-10', by:'Tester', dev:DEVICE, created:new Date().toISOString(), rev:1, up:0, positions:{} };
      for(let i=0;i<photos.length;i++){ const ph=photos[i]; rec.positions['P'+(i+1)]={ grade:2, photos:[ph] }; }
      await attSync(rec); await dbPut(rec); return rec.id; };
    window.__badBlob = (n) => new Blob([new Uint8Array(n)], {type:'image/jpeg'});
    window.__rec = async id => { const r=await dbGet(id); return r ? { id:r.id, rev:r.rev, up:r.up, upTo:r.upTo||{}, conf:r.conf||null, sent:r.sent||null,
      atts: attList(r).map(e=>({ name:e.storedName, st:e.uploadState, local:e.localState||'', held:e.serverHeld||0, srvSha:e.serverSha256||'', wire:e.wireSha256||'', sha:e.sha256||'' })),
      photos: positionsOf(r).reduce((n,[,q])=>n+photosOf(q).length,0) } : null; };
  `;
  await p.evaluate(SEED);
  const syncOnce = async () => { await p.evaluate(() => syncNow()); await p.waitForTimeout(300); };
  const rec = id => p.evaluate(id => window.__rec(id), id);

  console.log('\n1. THE ZIP SURVIVES AN UNREADABLE PHOTOGRAPH — FIRST, MIDDLE AND LAST');
  const zipId = await p.evaluate(async b => window.__seed('TK901', [window.__badBlob(b[0]), window.__badBlob(b[1]), window.__badBlob(b[2])]), BAD);
  for (const [label, i] of [['first', 0], ['middle', 1], ['last', 2]]) {
    await p.evaluate(s => { window.__badSizes = [s]; }, BAD[i]);
    const r = await p.evaluate(async () => {
      try {
        const r = await buildPackage();
        const zip = makeZip(r.files);
        const rep = new TextDecoder().decode(r.files.find(f => f.name === 'RECOVERY_REPORT.txt').data);
        return { ok: true, count: r.count, photos: r.photos, skipped: r.skipped.map(s => s.file), names: r.files.map(f => f.name),
                 pk: zip[0] === 0x50 && zip[1] === 0x4b, rep, msg: exportedMsg(r)[1] };
      } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
    });
    ok(`${label}: the ZIP is still built`, r.ok && r.pk, r.ok ? r.names.length + ' entries' : r.err);
    if (!r.ok) continue;
    ok(`  the two readable photographs are in it and the dead one is named, not faked`,
       r.photos === 2 && r.skipped.length === 1 && /_MP_?\d*\.jpg$/.test(r.skipped[0]) && !r.names.includes(r.skipped[0]),
       JSON.stringify({ photos: r.photos, skipped: r.skipped }));
    ok(`  the dead one is the ${label} position`, r.skipped[0] && r.skipped[0].includes('_P' + (i + 1) + '_'), r.skipped[0]);
    ok(`  RECOVERY_REPORT.txt says so in numbers`, /1 inspection record\(s\) saved; 2 photo\(s\) saved; 1 photo\(s\) still require recovery/.test(r.rep), r.rep.split('\n')[1]);
    ok(`  and the dialog reports the same counts`, /1 inspection record\(s\) saved; 2 photo\(s\) saved; 1 photo\(s\) still require recovery/.test(r.msg), r.msg);
  }
  await p.evaluate(() => { window.__badSizes = []; });
  const zipAfter = await rec(zipId);
  ok('the three photographs are still on the record — nothing was pruned to make the count work', zipAfter && zipAfter.photos === 3, JSON.stringify(zipAfter && zipAfter.photos));
  await p.evaluate(async id => { await dbDel(id); }, zipId);

  console.log('\n2. A DRAFT THAT CANNOT BE SAVED HOLDS THE UPDATE');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  await p.evaluate(async () => { draft.positions['1A'] = { comment: 'a reading somebody typed' }; await draftFlush(); });
  const flushed = await p.evaluate(async () => { const d = await dbGet(DRAFT_ID); return !!(d && d.positions && d.positions['1A']); });
  ok('the round on screen is on disk to begin with', flushed);
  await p.evaluate(() => {
    window.__origPut = dbPut;
    dbPut = async r => { if (r && r.id === DRAFT_ID) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return window.__origPut(r); };
    draft.positions['1A'].comment = 'changed since the last save';
    window.__updateWaiting = true; window.__idleSince(400000);
  });
  await p.evaluate(() => applyUpdateIfIdle());
  await p.waitForTimeout(1500);
  const held = await p.evaluate(() => ({ waiting: !!window.__updateWaiting, hold: UPD.hold || '', diag: (document.getElementById('updDiag') || {}).textContent || '' }));
  ok('the page did not reload', navs === 0, navs + ' navigations');
  ok('  the update is still waiting, with the reason recorded', held.waiting && /quota/i.test(held.hold), JSON.stringify(held.hold));
  ok('  and the diagnostic line says the update is held and why', held.diag.includes(await p.evaluate(() => t('ud_hold', { why: '' }).split('(')[0].trim())), held.diag.slice(-120));
  /* Guarded: on a build with the defect the page has ALREADY reloaded here
     and window.__origPut is gone — the suite must go on to the next case
     and report that one on its own merits (tests are also run against the
     pre-fix build to prove they were red there). */
  await p.evaluate(() => { if (window.__origPut) dbPut = window.__origPut; });
  await p.evaluate(() => applyUpdateIfIdle());
  await p.waitForFunction(() => document.readyState === 'complete' && typeof BUILD !== 'undefined', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1500);
  ok('once the draft can be written the update lands — one reload', navs === 1, navs + ' navigations');
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(600);
  const back = await p.evaluate(async () => { const d = await dbGet(DRAFT_ID); return d && d.positions && d.positions['1A'] && d.positions['1A'].comment; });
  ok('  and the changed reading went with it', back === 'changed since the last save', String(back));
  await p.evaluate(SEED);
  navs = 0;

  console.log('\n3. A QUEUE THAT CANNOT BE READ IS NOT AN EMPTY QUEUE');
  const q1 = await p.evaluate(async () => {
    const ids = [await window.__seed('TK902', [await window.__jpg('q')])];
    window.__origAll = dbAll;
    dbAll = async () => { throw new DOMException('Internal error opening backing store for indexedDB.open.', 'UnknownError'); };
    const n = await pendingCount();
    await armRetry();
    const st = await netState();
    renderTabs(); await new Promise(r => setTimeout(r, 200));
    const badge = (document.getElementById('tabQ') || {}).textContent;
    let screenErr = ''; try { await renderPending(); } catch (e) { screenErr = String(e && e.message || e); }
    const screen = (document.getElementById('pending') || {}).textContent || '';
    dbAll = window.__origAll;
    const n2 = await pendingCount();
    await armRetry();
    /* The pre-fix build has no net_qbad string; t() answers with the key. */
    return { n, armed: retryTimer !== null, st, badge, screen, screenErr, n2, qbad: t('net_qbad'), ids };
  }).catch(e => ({ thrown: String(e && e.message || e), ids: [] }));
  if (q1.thrown) ok('the queue-read case ran at all', false, q1.thrown);
  ok('pendingCount() answers null, not zero', q1.n === null, String(q1.n));
  ok('  the retry clock stays armed', q1.armed);
  ok('  the pill says the queue could not be read — never "All sent"', q1.st && q1.st.cls === 'err' && q1.st.txt === q1.qbad, JSON.stringify(q1.st));
  ok('  the tab badge shows "?" rather than a stale number', q1.badge === '?', JSON.stringify(q1.badge));
  ok('  the queue screen says so too, rather than throwing or going blank', !q1.screenErr && q1.screen.includes(q1.qbad), q1.screenErr || q1.screen.slice(0, 80));
  ok('  and once the store answers again the count is real', q1.n2 === 1, String(q1.n2));
  await p.evaluate(async ids => { for (const id of ids) await dbDel(id); }, q1.ids);

  console.log('\n4. A FILE THE SERVER DOES NOT HAVE IS SENT AGAIN — AND ONLY THAT FILE');
  await ctl('/__reset');
  const r4 = await p.evaluate(async () => window.__seed('TK903', [await window.__jpg('a'), await window.__jpg('b')]));
  await p.evaluate(() => { retryAt = 20000; });
  /* The listing leaves out the second photograph from the start. */
  await ctl('/__drop?n=TK903_P2_10.09.2026_MP.jpg');
  await syncOnce();
  let s4 = await rec(r4), st4 = await stat();
  ok('the round went up — the sidecar and both photographs were accepted', st4.posted.length === 3, JSON.stringify(st4.posted));
  ok('  the read-back put it back in the queue and named the missing file',
     s4.up === 0 && s4.conf && Array.isArray(s4.conf.resend) && s4.conf.resend[0] === 'TK903_P2_10.09.2026_MP.jpg', JSON.stringify({ up: s4.up, conf: s4.conf }));
  const row4 = await p.evaluate(async () => { await renderPending(); return [...document.querySelectorAll('#pending .pitem .up')].map(e => e.textContent).find(x => /TK903|missing/i.test(x)) || [...document.querySelectorAll('#pending .pitem .up')].map(e => e.textContent).join(' | '); });
  ok('  and the row says so', /missing 1 file/.test(row4) && /TK903_P2/.test(row4), row4);
  await ctl('/__drop?n=');
  await syncOnce();
  s4 = await rec(r4); st4 = await stat();
  ok('the next send carried ONE file', st4.posted.length === 4 && st4.posted[3] === 'TK903_P2_10.09.2026_MP.jpg', JSON.stringify(st4.posted.slice(3)));
  ok('  and the round is confirmed whole', s4.up === 1 && s4.conf && s4.conf.n === s4.conf.of && !s4.conf.resend, JSON.stringify({ up: s4.up, conf: s4.conf }));

  console.log('\n   a file the server holds SHORTER than what was sent is a cut-off upload — sent again');
  await ctl('/__size?n=TK903_P1_10.09.2026_MP.jpg&s=40');
  await p.evaluate(async id => { const r = await dbGet(id); r.rev = 2; r.up = 0; delete r.upTo; delete r.sent; delete r.upAt; await dbPut(r); }, r4);
  await syncOnce();
  s4 = await rec(r4);
  ok('the truncated file is on the send list again', s4.up === 0 && s4.conf && s4.conf.resend && s4.conf.resend[0] === 'TK903_P1_10.09.2026_MP.jpg', JSON.stringify(s4.conf));
  await ctl('/__size?n=');
  await syncOnce();
  s4 = await rec(r4);
  ok('  and confirmed once the listing agrees', s4.up === 1 && s4.conf.n === s4.conf.of, JSON.stringify(s4.conf));

  console.log('\n   a file the server holds LARGER than what was sent is a DIFFERENT file — named, never overwritten');
  const before5 = (await stat()).posted.length;
  await ctl('/__size?n=TK903_P1_10.09.2026_MP.jpg&s=999999');
  await p.evaluate(async id => { const r = await dbGet(id); r.rev = 3; r.up = 0; delete r.upTo; delete r.sent; delete r.upAt; await dbPut(r); }, r4);
  await syncOnce();
  s4 = await rec(r4);
  const st5 = await stat();
  ok('the round stays sent, with the difference recorded', s4.up === 1 && s4.conf && s4.conf.differs && s4.conf.differs[0].name === 'TK903_P1_10.09.2026_MP.jpg'
     && s4.conf.differs[0].server === 999999, JSON.stringify(s4.conf));
  await syncOnce();
  ok('  and nothing was sent to replace it', (await stat()).posted.length === st5.posted.length, (await stat()).posted.length - before5 + ' file(s) in that send');
  const row5 = await p.evaluate(async () => { await renderPending(); return [...document.querySelectorAll('#pending .pitem .up')].map(e => e.textContent).find(x => /different copy/.test(x)) || ''; });
  ok('  the row names the file and says it was not overwritten', /different copy of 1 file/.test(row5) && /TK903_P1/.test(row5), row5);
  await ctl('/__size?n=');

  console.log('\n   a file the server filed under a RIVAL device\'s variant name is found under that name — not re-sent');
  await ctl('/__rival?n=TK903_P2_10.09.2026_MP.jpg');
  await p.evaluate(async id => { const r = await dbGet(id); r.rev = 4; r.up = 0; delete r.upTo; delete r.sent; delete r.upAt; delete r.conf; await dbPut(r); }, r4);
  const before7 = (await stat()).posted.length;
  await syncOnce();
  s4 = await rec(r4);
  const st7b = await stat();
  ok('the round is confirmed whole under the stored name', s4.up === 1 && s4.conf && s4.conf.n === s4.conf.of && !s4.conf.resend, JSON.stringify(s4.conf));
  ok('  the variant is what the server holds', st7b.store.some(k => /TK903_P2_10\.09\.2026_MP~RIVAL\.jpg$/.test(k)), st7b.store.filter(k => /TK903_P2/.test(k)).join(', '));
  await syncOnce();
  ok('  and nothing was sent again', (await stat()).posted.length === st7b.posted.length, (await stat()).posted.length - before7 + ' file(s) after the send');
  await ctl('/__rival?n=');
  await p.evaluate(async id => { await dbDel(id); }, r4);

  console.log('\n4b. A LINK THAT REFUSES A BATCH STILL TAKES THE PHOTOGRAPHS ONE AT A TIME');
  /* Read off the affected handset on 347: fourteen sidecars in one minute,
     not one photograph. A link with a size limit passes 70 KB and cuts 2 MB. */
  await ctl('/__reset');
  /* Photographs with real entropy — noise compresses to ~150 KB, the size a
     field photograph actually is — so a single one fits the limit and a
     batch of three does not. */
  await p.evaluate(() => { window.__jpgBig = async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const x = c.getContext('2d'); const im = x.createImageData(640, 480); for (let i = 0; i < im.data.length; i++) im.data[i] = (Math.random() * 256) | 0; x.putImageData(im, 0, 0);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); }; });
  await ctl('/__maxbody?n=400000');           // the sidecar and one photograph pass; a batch of three is cut off
  const r4b = await p.evaluate(async () => window.__seed('TK905', [await window.__jpgBig(), await window.__jpgBig(), await window.__jpgBig()]));
  const reqs0 = (await stat()).reqs.length;
  await syncOnce();
  const s4b = await rec(r4b), st4b = await stat();
  const after4b = st4b.reqs.slice(reqs0);
  /* A cut-off request never reaches the mock's log, so the cut counter is
     the evidence, and no batch appears among the requests that completed. */
  ok('the batch was cut off by the link', st4b.cut >= 1 && !after4b.some(x => /^batch/.test(x)), 'cut ' + st4b.cut + ' · ' + after4b.join(','));
  ok('  and the round still went up — the photographs went one at a time', s4b.up === 1 && st4b.posted.filter(n => /TK905_P\d/.test(n)).length === 3 && after4b.filter(x => x === 'one').length >= 4,
     JSON.stringify({ up: s4b.up, posted: st4b.posted.filter(n => /TK905/.test(n)), reqs: after4b }));
  ok('  every one verified byte for byte', s4b.atts.length === 3 && s4b.atts.every(a => a.srvSha && a.srvSha === a.wire), JSON.stringify(s4b.atts.map(a => a.st)));
  await ctl('/__maxbody?n=0');
  await p.evaluate(async id => { await dbDel(id); }, r4b);

  console.log('\n5. A PHOTOGRAPH THE PHONE CANNOT READ, THAT THE SERVER VERIFIABLY HOLDS, DOES NOT HOLD THE ROUND');
  await ctl('/__reset');
  /* The photograph that will "go bad" is a rigged size from the start, but
     readable on the first send: the rig is off until the round is up. */
  const r5 = await p.evaluate(async b => window.__seed('TK904', [await window.__jpg('keep'), window.__badBlob(b[0])]), BAD);
  await syncOnce();
  let s5 = await rec(r5);
  ok('the round is up and every attachment carries a verified receipt', s5.up === 1 && s5.atts.length === 2 && s5.atts.every(a => a.srvSha && a.srvSha === a.wire), JSON.stringify(s5.atts));
  /* Now the phone cannot read it, and an edit sends the round again. */
  await p.evaluate(s => { window.__badSizes = [s]; }, BAD[0]);
  await p.evaluate(async id => { const r = await dbGet(id); r.rev = 2; r.up = 0; delete r.upTo; delete r.sent; delete r.upAt; await dbPut(r); }, r5);
  const posted5 = (await stat()).posted.length;
  await syncOnce();
  s5 = await rec(r5);
  const st6 = await stat();
  const held5 = s5.atts.find(a => a.local === 'unreadable');
  ok('the round completes', s5.up === 1, JSON.stringify({ up: s5.up, lastErr: await p.evaluate(() => lastErr) }));
  ok('  the dead photograph was NOT sent — the server already had it', !st6.posted.slice(posted5).includes('TK904_P2_10.09.2026_MP.jpg'), JSON.stringify(st6.posted.slice(posted5)));
  ok('  the manifest records that this phone can no longer read it, and that the server holds it', held5 && held5.name === 'TK904_P2_10.09.2026_MP.jpg' && held5.held === 1, JSON.stringify(s5.atts));
  ok('  no "cannot be read" alarm is raised for it', !/could not be read/.test(await p.evaluate(() => lastErr)), await p.evaluate(() => lastErr));
  const row6 = await p.evaluate(async () => { await renderPending(); return [...document.querySelectorAll('#pending .pitem .up')].map(e => e.textContent).find(x => /TK904|no longer be read/.test(x)) || [...document.querySelectorAll('#pending .pitem .up')].map(e => e.textContent).join(' | '); });
  ok('  the row says exactly that', /1 photo\(s\) can no longer be read on this phone/.test(row6) && /verified copy stands/.test(row6), row6);
  ok('  and the read-back still lists it whole', s5.conf && s5.conf.n === s5.conf.of, JSON.stringify(s5.conf));

  console.log('\n   without the receipt the rule does not apply — the round waits and the photograph is named');
  await p.evaluate(async id => { const r = await dbGet(id); r.rev = 3; r.up = 0; delete r.upTo; delete r.sent; delete r.upAt;
    for (const [, q] of positionsOf(r)) for (const aid of Object.keys(attMap(q) || {})) { const e = attMap(q)[aid]; delete e.serverSha256; delete e.serverByteSize; delete e.serverHeld; }
    await dbPut(r); }, r5);
  await syncOnce();
  s5 = await rec(r5);
  ok('the round is not marked up', s5.up !== 1, JSON.stringify({ up: s5.up }));
  ok('  and the alarm names the photograph', /could not be read/.test(await p.evaluate(() => lastErr)) && /TK904_P2/.test(await p.evaluate(() => lastErr)), await p.evaluate(() => lastErr));
  await p.evaluate(() => { window.__badSizes = []; });
  await p.evaluate(async id => { await dbDel(id); }, r5);

  console.log('\n6. NINETEEN ROUNDS, REAL BYTES, ONE RECLAIMED PHOTOGRAPH — ONE SEND, ONE ZIP');
  await ctl('/__reset');
  await p.evaluate(() => { lastErr = ''; });
  const ids = await p.evaluate(async b => {
    const out = [];
    for (let i = 0; i < 19; i++) {
      const ph = [await window.__jpg('r' + i + 'a'), (i === 7) ? window.__badBlob(b[2]) : await window.__jpg('r' + i + 'b')];
      out.push(await window.__seed('TK' + (920 + i), ph));
    }
    window.__badSizes = [b[2]];
    return out;
  }, BAD);
  const t0 = Date.now();
  await p.evaluate(() => syncNow());
  await p.waitForTimeout(500);
  const st7 = await stat();
  const recs7 = []; for (const id of ids) recs7.push(await rec(id));
  const upN = recs7.filter(r => r.up === 1).length;
  ok('eighteen rounds are up and one is waiting', upN === 18 && recs7.filter(r => r.up !== 1).length === 1, upN + ' up, in ' + Math.round((Date.now() - t0) / 100) / 10 + ' s');
  ok('  19 sidecars and 37 photographs crossed the wire — the dead one did not', st7.posted.filter(n => /\.json$/.test(n)).length === 19 && st7.posted.filter(n => /\.jpg$/.test(n)).length === 37,
     st7.posted.filter(n => /\.json$/.test(n)).length + ' json, ' + st7.posted.filter(n => /\.jpg$/.test(n)).length + ' jpg');
  const waiting = recs7.find(r => r.up !== 1);
  ok('  the waiting one is TK927 and its dead photograph is named', waiting && /TK927/.test(waiting.id) && /TK927_P2/.test(await p.evaluate(() => lastErr)), await p.evaluate(() => lastErr));
  /* The pill reads "Needs attention" — a photograph that cannot be read IS
     attention — and the badge carries the number. */
  const pill = await p.evaluate(async () => { renderTabs(); await new Promise(r => setTimeout(r, 200));
    return { txt: (await netState()).txt, want: t('net_failing'), badge: (document.getElementById('tabQ') || {}).textContent }; });
  ok('  the pill says attention is needed and the badge counts one waiting', pill.txt === pill.want && pill.badge === '1', JSON.stringify(pill));
  const z7 = await p.evaluate(async () => { const r = await buildPackage(); return { count: r.count, photos: r.photos, skipped: r.skipped.map(s => s.file), msg: exportedMsg(r)[1],
    rep: new TextDecoder().decode(r.files.find(f => f.name === 'RECOVERY_REPORT.txt').data), n: r.files.length }; });
  ok('the ZIP holds 19 records and 37 photographs and names the one it could not read', z7.count === 19 && z7.photos === 37 && z7.skipped.length === 1 && /TK927_P2/.test(z7.skipped[0]), JSON.stringify({ count: z7.count, photos: z7.photos, skipped: z7.skipped }));
  ok('  and says so: ' + z7.msg.split('.')[0], /19 inspection record\(s\) saved; 37 photo\(s\) saved; 1 photo\(s\) still require recovery/.test(z7.msg));
  ok('  the report names the record the dead photograph belongs to', /TK927 MP 2026-09-10/.test(z7.rep), z7.rep.split('\n').slice(3, 5).join(' / '));

  console.log('\n6b. ONE ROUND WHOSE PROGRESS CANNOT BE WRITTEN DOES NOT END THE OTHERS\' TURN');
  /* The affected handset's own shape: the loop reached its second round,
     that round's write-back was refused, and seventeen rounds behind it were
     never attempted — for days — behind a banner about something else. */
  await ctl('/__reset');
  const ids6 = await p.evaluate(async () => { const out = []; for (let i = 0; i < 4; i++) out.push(await window.__seed('TK' + (940 + i), [await window.__jpg('w' + i)])); return out; });
  const posted6 = (await stat()).posted.length;
  await p.evaluate(async id => {
    window.__origPut2 = dbPut;
    /* The second round in key order cannot be written back — a full phone. */
    dbPut = async r => { if (r && r.id === id) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return window.__origPut2(r); };
  }, ids6[1]);
  await syncOnce();
  await p.evaluate(() => { dbPut = window.__origPut2; });
  const st6b = await stat();
  const recs6 = []; for (const id of ids6) recs6.push(await rec(id));
  ok('every round was attempted — all four sidecars and photographs crossed the wire',
     st6b.posted.length - posted6 === 8, (st6b.posted.length - posted6) + ' files');
  ok('  the three whose bookkeeping could be written are up', recs6.filter((r, i) => i !== 1).every(r => r.up === 1), JSON.stringify(recs6.map(r => r.up)));
  ok('  the one that could not be written is still waiting, and the banner says why in its own words',
     recs6[1].up !== 1 && /Could not record TK941/.test(await p.evaluate(() => lastErr)) && /quota/i.test(await p.evaluate(() => lastErr)), await p.evaluate(() => lastErr));
  await syncOnce();
  ok('  and once the phone can write again it is marked up without re-sending a byte', (await rec(ids6[1])).up === 1 && (await stat()).posted.length === st6b.posted.length,
     ((await stat()).posted.length - st6b.posted.length) + ' file(s) re-sent');
  await p.evaluate(async ids => { for (const id of ids) await dbDel(id); }, ids6);

  console.log('\n7. NOTHING WAS DELETED OR RENAMED ALONG THE WAY');
  const after = []; for (const id of ids) after.push(await rec(id));
  ok('all nineteen records are still on the phone with both photographs', after.every(r => r && r.photos === 2), after.filter(r => !r || r.photos !== 2).length + ' short');
  ok('  every stored name is the app\'s own, unchanged', after.every(r => r.atts.every(a => /^TK9\d\d_P[12]_10\.09\.2026_MP\.jpg$/.test(a.name))), JSON.stringify(after[0].atts.map(a => a.name)));
  await p.evaluate(() => { window.__badSizes = []; });

  console.log('\n8. THE READINESS CARD ROUTES EACH FAILURE TO ITS OWN ACTION');
  /* The 19-round queue above left TK927 waiting with an unreadable, un-
     receipted photograph. "19 waiting — Send now" is the wrong sentence for
     it: a retry cannot read a file. */
  const y1 = await p.evaluate(async () => { await yardCheck(); await new Promise(r => setTimeout(r, 300));
    return { v: lastYard && lastYard.v, list: (document.getElementById('yardList') || {}).textContent || '',
             want: t('rdy_q_recover', { n: 1 }), fix: t('rdy_fix_recover'), verdict: t('rdy_v_recover') }; });
  ok('a photograph that needs recovery is said in those words, with the inventory as the action',
     y1.list.includes(y1.want) && y1.list.includes(y1.fix), y1.list.slice(0, 160));
  /* The verdict is read with the offline-copy row set aside: a test page with
     the worker blocked reports "not installed for offline use", which on a
     real phone rightly outranks everything — so the verdict is measured on
     the rows this case is about. */
  const yv = await p.evaluate(() => { const rows = (lastYard && lastYard.rows) || []; return yardVerdict(rows.filter(r => r.key !== 'offline' && r.key !== 'build')); });
  ok('  and it is the card\'s verdict, loud', yv && yv.s === 'rdy_v_recover' && yv.k === 'bad', JSON.stringify(yv));
  /* A queue nobody has tried for seven hours while the server answers is
     not "waiting"; it is stuck, and the card says so. Every pending round's
     last attempt is pushed back seven hours — including TK927's, which the
     19-round send touched a moment ago. */
  const y2 = await p.evaluate(async ids => {
    const old = new Date(Date.now() - 7 * 3600000).toISOString();
    const r = await dbGet(ids[0]); r.up = 0; delete r.upTo; delete r.sent; delete r.upAt;
    for (const [, q] of positionsOf(r)) for (const aid of Object.keys(attMap(q) || {})) { attMap(q)[aid].lastAttemptAt = old; attMap(q)[aid].localState = 'stored'; }
    await dbPut(r);
    const r2 = await dbGet(ids[7]);
    for (const [, q] of positionsOf(r2)) for (const aid of Object.keys(attMap(q) || {})) { attMap(q)[aid].lastAttemptAt = old; delete attMap(q)[aid].localState; }
    await dbPut(r2);
    window.__upd.okAt = Date.now();
    await yardCheck(); await new Promise(r => setTimeout(r, 300));
    const rows = (lastYard && lastYard.rows) || [];
    return { v: yardVerdict(rows.filter(x => x.key !== 'offline' && x.key !== 'build')), list: (document.getElementById('yardList') || {}).textContent || '' };
  }, ids);
  ok('a queue with nothing attempted for hours while the server answers is called stalled', y2.list.includes('Uploads have not moved since') && y2.v && y2.v.k === 'bad' && y2.v.s === 'rdy_v_photos',
     JSON.stringify(y2.v) + ' ' + (y2.list.match(/Uploads have not moved[^.]*/) || ['(no stalled line)'])[0]);

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
