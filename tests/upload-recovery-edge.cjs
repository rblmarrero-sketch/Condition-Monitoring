/* THREE PLACES THE UPLOAD PATH TRUSTED SILENCE AS SUCCESS.

   Found by an external code investigation of putBatch() and confirmRun(),
   verified here against the actual functions:

   1. putBatch() threw an "unreadable" error naming ZERO files when a chunk
      was already fully reconciled — every file failed to read AND every one
      was already verified on the server via serverHolds(). Both `built` and
      `unreadable` were empty; the guard only checked `built`, so a chunk
      with nothing wrong in it still raised up_noread with n:0.

   2. A batch reply of {ok:true, saved:[...], failed:[...]} that omitted a
      submitted file from BOTH lists was read as complete: putBatch marks
      `sent` only from `saved` and only throws for names in `failed`, so a
      name in neither silently vanished — not sent, not raised. Upstream,
      putAll() and syncNow() take "no throw" as "this destination is done"
      and can set the round's own up:1, while attSettle()'s per-attachment
      state (built from the same `sent` map) correctly stays "pending" — two
      answers to the same question on the same record.

   3. confirmRun() double-counted a file the server lists at 0 bytes when the
      phone also knows what it should weigh: size(n)===0 satisfied BOTH the
      `empty` filter and the `short` filter (0 is never the wanted size), so
      `bad = missing.concat(empty).concat(short)` listed the same name twice
      and `conf.n = names.length - bad.length` went negative for one bad
      file in a one-file round.

   Run: node tests/upload-recovery-edge.cjs   (starts its own server) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8487);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* putBatch() posts through postT(), which is XMLHttpRequest whenever the
   platform has one (real browsers always do) — window.fetchT is never in
   the path, so test 2 needs an actual /exec on the wire, not a stubbed
   fetchT. MODE picks the canned batch reply; set over plain HTTP from the
   Node side before each evaluate, so the page need not know it exists. */
let MODE = 'ack-p1-only';
let LISTING = [];   // what action=list answers with, for the "ask the server by name" tests
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.pathname === '/__mode') { MODE = u.searchParams.get('set') || MODE; res.writeHead(200, cors); return res.end('ok'); }
  if (u.pathname === '/__listing') {
    let raw = ''; req.on('data', c => raw += c);
    return req.on('end', () => { LISTING = JSON.parse(raw || '[]'); res.writeHead(200, cors); res.end('ok'); });
  }
  if (u.pathname === '/exec' && req.method === 'GET' && u.searchParams.get('action') === 'list') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify({ ok: true, files: LISTING }));
  }
  if (u.pathname === '/exec' && req.method === 'POST') {
    let raw = ''; req.on('data', c => raw += c);
    return req.on('end', () => {
      const reply = MODE === 'ack-both'
        ? { ok: true, batch: true, saved: [{ name: 'p1.jpg' }, { name: 'p2.jpg' }], failed: [] }
        : { ok: true, batch: true, saved: [{ name: 'p1.jpg' }], failed: [] };   // p2.jpg acknowledged nowhere
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
      res.end(JSON.stringify(reply));
    });
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('no'); }
  res.writeHead(200, Object.assign({ 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }, cors));
  res.end(fs.readFileSync(p));
});
const setMode = m => new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/__mode?set=${m}`, r => { r.resume(); r.on('end', res); }).on('error', rej);
});
const setListing = files => new Promise((res, rej) => {
  const body = JSON.stringify(files);
  const req = http.request(`http://127.0.0.1:${PORT}/__listing`, { method: 'POST' }, r => { r.resume(); r.on('end', res); });
  req.on('error', rej); req.end(body);
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof putBatch === 'function' && typeof confirmRun === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(300);

  console.log('1. A CHUNK ALREADY FULLY RECONCILED IS NOT A FAILED CHUNK');
  const r1 = await p.evaluate(async () => {
    const realB64 = window.blobToB64, realHolds = window.serverHolds;
    window.blobToB64 = async () => { const e = new Error('cannot read'); e.localRead = true; throw e; };
    window.serverHolds = () => true;         // every file already verified on the server
    const sent = {};
    let threw = null;
    try {
      await putBatch({ url: 'http://x/exec', folder: '' },
        [{ name: 'p1.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a1' },
         { name: 'p2.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a2' }],
        { equip: 'TK1', date: '2026-09-01', type: 'MP' }, sent);
    } catch (e) { threw = e.message; }
    window.blobToB64 = realB64; window.serverHolds = realHolds;
    return { threw, sentKeys: Object.keys(sent).sort() };
  });
  ok(r1.threw === null, 'putBatch does not throw when nothing is actually wrong', JSON.stringify(r1));
  ok(r1.sentKeys.length === 2 && r1.sentKeys.join() === 'p1.jpg,p2.jpg',
     'and both files are marked sent, because the server already held them', JSON.stringify(r1.sentKeys));

  console.log('\n   (control: a genuinely unreadable, unverified file still fails)');
  const r1b = await p.evaluate(async () => {
    const realB64 = window.blobToB64, realHolds = window.serverHolds;
    window.blobToB64 = async () => { const e = new Error('cannot read'); e.localRead = true; throw e; };
    window.serverHolds = () => false;        // nothing on the server confirms this one
    const sent = {};
    let threw = null;
    try { await putBatch({ url: 'http://x/exec', folder: '' },
      [{ name: 'p3.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a3' }],
      { equip: 'TK1', date: '2026-09-01', type: 'MP' }, sent); }
    catch (e) { threw = e.message; }
    window.blobToB64 = realB64; window.serverHolds = realHolds;
    return { threw, sentKeys: Object.keys(sent) };
  });
  ok(!!r1b.threw, 'an unreadable file with nothing to prove it already landed still raises', JSON.stringify(r1b));
  ok(r1b.sentKeys.length === 0, 'and it is not marked sent', JSON.stringify(r1b.sentKeys));

  console.log('\n2. A NAME THE REPLY NEVER MENTIONS IS NOT A NAME THAT LANDED');
  await setMode('ack-p1-only');   // the server acknowledges p1.jpg only — p2.jpg is in neither saved nor failed
  const r2 = await p.evaluate(async (url) => {
    const sent = {};
    let threw = null;
    try {
      await putBatch({ url, folder: '' },
        [{ name: 'p1.jpg', blob: new Blob(['a'], { type: 'image/jpeg' }), type: 'image/jpeg' },
         { name: 'p2.jpg', blob: new Blob(['b'], { type: 'image/jpeg' }), type: 'image/jpeg' }],
        { equip: 'TK1', date: '2026-09-01', type: 'MP' }, sent);
    } catch (e) { threw = e.message; }
    return { threw, sentKeys: Object.keys(sent).sort() };
  }, `http://127.0.0.1:${PORT}/exec`);
  ok(!!r2.threw, 'putBatch raises when a submitted file is acknowledged nowhere in the reply', JSON.stringify(r2));
  ok(r2.sentKeys.join() === 'p1.jpg', 'only the file the server actually acknowledged is marked sent', JSON.stringify(r2.sentKeys));

  console.log('\n   (control: a reply that accounts for every file still succeeds)');
  await setMode('ack-both');
  const r2b = await p.evaluate(async (url) => {
    const sent = {};
    let threw = null;
    try { await putBatch({ url, folder: '' },
      [{ name: 'p1.jpg', blob: new Blob(['a'], { type: 'image/jpeg' }), type: 'image/jpeg' },
       { name: 'p2.jpg', blob: new Blob(['b'], { type: 'image/jpeg' }), type: 'image/jpeg' }],
      { equip: 'TK1', date: '2026-09-01', type: 'MP' }, sent); }
    catch (e) { threw = e.message; }
    return { threw, sentKeys: Object.keys(sent).sort() };
  }, `http://127.0.0.1:${PORT}/exec`);
  ok(r2b.threw === null, 'an ordinary, fully-acknowledged batch is unaffected', JSON.stringify(r2b));
  ok(r2b.sentKeys.join() === 'p1.jpg,p2.jpg', 'and both files land', JSON.stringify(r2b.sentKeys));

  console.log('\n3. A ZERO-BYTE FILE IS COUNTED ONCE, NOT TWICE');
  const r3 = await p.evaluate(async () => {
    const dest = [{ id: 'gas', on: 1, url: 'https://x.example/exec', sec: 's', folder: '' }];
    const mk = id => ({ id, equip: 'TK1', type: 'MP', date: '2026-09-01', by: 'R',
      cls: 'HT', created: new Date(2026, 8, 1).toISOString(), rev: 0, up: 1,
      upAt: '2026-09-01T09:00:00.000Z', upTo: { gas: 1 } });
    const realFetch = window.fetchT;
    const run = async (id, names, sizes, serverSize) => {
      const rec = mk(id); await dbPut(rec);
      window.fetchT = async () => ({ ok: true, text: async () => JSON.stringify({ ok: true,
        files: names.map(n => ({ name: n, size: serverSize })) }) });
      await confirmRun([{ rec, names, sizes }], dest);
      const back = await dbGet(id);
      return back.conf || null;
    };
    // The phone sent 500,000 bytes; the server lists the same name at 0.
    const zeroKnownSize = await run('EDGE-ZERO', ['p1.jpg'], { 'p1.jpg': 500000 }, 0);
    // Same shape, but the phone never recorded a wire size (older build) —
    // must still land on "missing", by the old empty-only rule, not crash.
    const zeroNoSize = await run('EDGE-ZERO-NOSIZE', ['p1.jpg'], {}, 0);
    window.fetchT = realFetch;
    return { zeroKnownSize, zeroNoSize };
  });
  ok(r3.zeroKnownSize && r3.zeroKnownSize.n === 0,
     'a zero-byte file the phone knows the real size of counts as ONE missing file, not minus one',
     JSON.stringify(r3.zeroKnownSize));
  ok(r3.zeroKnownSize && r3.zeroKnownSize.miss.length === 1 && r3.zeroKnownSize.miss[0] === 'p1.jpg',
     'and is named once, not twice', JSON.stringify(r3.zeroKnownSize && r3.zeroKnownSize.miss));
  ok(r3.zeroNoSize && r3.zeroNoSize.n === 0,
     'a zero-byte file with no known wire size still reads as missing, by the empty check alone',
     JSON.stringify(r3.zeroNoSize));

  console.log('\n4. A NAME serverHolds() CANNOT VOUCH FOR MAY STILL BE ON THE SERVER — ASKED BY NAME, NOT ASSUMED GONE');
  /* Read off two trucks on 2026-09-16: TK161's TB round sat at "1 photo(s)
     could not be read… will retry by itself" through a full app restart,
     unchanged, on the phone that captured it — while the identical
     photograph had already landed on the server minutes earlier, sent by
     a DIFFERENT phone the round had been shared to. serverHolds() only
     ever answers for a receipt THIS device recorded, so the capturing
     phone had no way to know the file was already there and would have
     reported it unreadable, and left the round below up:1, forever. */
  /* Every case below shares a record whose manifest already knows what
     THIS attachment weighs (byteSize, recorded at intake from the File's
     own .size — before anything about the bytes could go wrong) and when
     it was captured — the two facts serverListedAsCurrent checks a listing
     hit against, because filesForRecord's names are stable across
     revisions and a bare "name present, size>0" would accept an OLDER
     revision's upload sitting under the same name. */
  const recWith = (byteSize, capturedAt) => ({
    equip: 'TK161', date: '2026-09-16', type: 'TB',
    positions: { p1: { att: { a1: { byteSize, capturedAt } } } },
  });
  const CAPTURED = '2026-09-16T10:00:00.000Z';

  await setListing([{ name: 'p1.jpg', size: 12345, updated: '2026-09-16T10:05:00.000Z' }]);   // the server already has it — put there by another device, written AFTER this photo was captured
  const r4 = await p.evaluate(async ({ url, rec }) => {
    const realB64 = window.blobToB64, realHolds = window.serverHolds;
    window.blobToB64 = async () => { const e = new Error('cannot read'); e.localRead = true; throw e; };
    window.serverHolds = () => false;   // this phone recorded no receipt of its own
    const sent = {};
    let threw = null;
    try {
      await putBatch({ id: 'gas', url, folder: '' },
        [{ name: 'p1.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a1' }],
        rec, sent);
    } catch (e) { threw = e.message; }
    window.blobToB64 = realB64; window.serverHolds = realHolds;
    return { threw, sentKeys: Object.keys(sent) };
  }, { url: `http://127.0.0.1:${PORT}/exec`, rec: recWith(12345, CAPTURED) });
  ok(r4.threw === null, 'putBatch does not throw once the server listing shows the file is already there, at this attachment\'s own size', JSON.stringify(r4));
  ok(r4.sentKeys.join() === 'p1.jpg', 'and marks it sent, so the round can reach up:1', JSON.stringify(r4.sentKeys));

  console.log('\n   (control: the same file genuinely absent from the listing still raises, exactly as before)');
  await setListing([]);   // the server does not have it — a real, unrecovered loss
  const r4b = await p.evaluate(async ({ url, rec }) => {
    const realB64 = window.blobToB64, realHolds = window.serverHolds;
    window.blobToB64 = async () => { const e = new Error('cannot read'); e.localRead = true; throw e; };
    window.serverHolds = () => false;
    const sent = {};
    let threw = null;
    try {
      await putBatch({ id: 'gas', url, folder: '' },
        [{ name: 'p1.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a1' }],
        rec, sent);
    } catch (e) { threw = e.message; }
    window.blobToB64 = realB64; window.serverHolds = realHolds;
    return { threw, sentKeys: Object.keys(sent) };
  }, { url: `http://127.0.0.1:${PORT}/exec`, rec: recWith(12345, CAPTURED) });
  ok(!!r4b.threw, 'a name genuinely absent from the listing still raises the ordinary unreadable error', JSON.stringify(r4b));
  ok(r4b.sentKeys.length === 0, 'and is not marked sent', JSON.stringify(r4b.sentKeys));

  console.log('\n   (control: a destination that cannot be listed skips the check and behaves as before)');
  await setListing([{ name: 'p1.jpg', size: 12345, updated: '2026-09-16T10:05:00.000Z' }]);
  const r4c = await p.evaluate(async ({ url, rec }) => {
    const realB64 = window.blobToB64, realHolds = window.serverHolds;
    window.blobToB64 = async () => { const e = new Error('cannot read'); e.localRead = true; throw e; };
    window.serverHolds = () => false;
    const sent = {};
    let threw = null;
    try {
      // No id: 'gas'/'mirror' — listCapable() is false, so no listing is ever asked.
      await putBatch({ url, folder: '' },
        [{ name: 'p1.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a1' }],
        rec, sent);
    } catch (e) { threw = e.message; }
    window.blobToB64 = realB64; window.serverHolds = realHolds;
    return { threw, sentKeys: Object.keys(sent) };
  }, { url: `http://127.0.0.1:${PORT}/exec`, rec: recWith(12345, CAPTURED) });
  ok(!!r4c.threw, 'a destination this phone cannot list is never asked, and the file still raises as before', JSON.stringify(r4c));

  console.log('\n   (control: a name at a DIFFERENT size than this attachment is an OLDER revision\'s upload, not this one — still raises)');
  await setListing([{ name: 'p1.jpg', size: 99999, updated: '2026-09-16T10:05:00.000Z' }]);   // some earlier revision's bytes, still sitting under the stable name
  const r4d = await p.evaluate(async ({ url, rec }) => {
    const realB64 = window.blobToB64, realHolds = window.serverHolds;
    window.blobToB64 = async () => { const e = new Error('cannot read'); e.localRead = true; throw e; };
    window.serverHolds = () => false;
    const sent = {};
    let threw = null;
    try {
      await putBatch({ id: 'gas', url, folder: '' },
        [{ name: 'p1.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a1' }],
        rec, sent);
    } catch (e) { threw = e.message; }
    window.blobToB64 = realB64; window.serverHolds = realHolds;
    return { threw, sentKeys: Object.keys(sent) };
  }, { url: `http://127.0.0.1:${PORT}/exec`, rec: recWith(12345, CAPTURED) });
  ok(!!r4d.threw, 'a listed size that does not match what THIS attachment weighs is not treated as landed', JSON.stringify(r4d));
  ok(r4d.sentKeys.length === 0, 'and is not marked sent', JSON.stringify(r4d.sentKeys));

  console.log('\n   (control: a name at the SAME size but written BEFORE this photo was even captured is an older revision too — still raises)');
  /* The harder case: a retaken photo can coincidentally re-encode to the
     exact byte count an earlier revision's upload had. Size alone would
     accept it; the listing's own `updated` — earlier than this attachment's
     `capturedAt`, by more than a phone clock could explain (LANDED_SKEW) —
     is what tells them apart. */
  await setListing([{ name: 'p1.jpg', size: 12345, updated: '2026-09-16T08:00:00.000Z' }]);
  const r4e = await p.evaluate(async ({ url, rec }) => {
    const realB64 = window.blobToB64, realHolds = window.serverHolds;
    window.blobToB64 = async () => { const e = new Error('cannot read'); e.localRead = true; throw e; };
    window.serverHolds = () => false;
    const sent = {};
    let threw = null;
    try {
      await putBatch({ id: 'gas', url, folder: '' },
        [{ name: 'p1.jpg', blob: { size: 10, type: 'image/jpeg' }, type: 'image/jpeg', aid: 'a1' }],
        rec, sent);
    } catch (e) { threw = e.message; }
    window.blobToB64 = realB64; window.serverHolds = realHolds;
    return { threw, sentKeys: Object.keys(sent) };
  }, { url: `http://127.0.0.1:${PORT}/exec`, rec: recWith(12345, CAPTURED) });
  ok(!!r4e.threw, 'a listing written before this photo was even taken is not treated as landed, same size or not', JSON.stringify(r4e));
  ok(r4e.sentKeys.length === 0, 'and is not marked sent', JSON.stringify(r4e.sentKeys));

  ok(errs.length === 0, 'no page errors throughout', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
