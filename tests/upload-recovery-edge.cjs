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
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.pathname === '/__mode') { MODE = u.searchParams.get('set') || MODE; res.writeHead(200, cors); return res.end('ok'); }
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

  ok(errs.length === 0, 'no page errors throughout', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
