/* A ROUND SPLIT ACROSS SEVERAL CHUNKS NAMES EVERY UNREADABLE PHOTOGRAPH,
   NOT ONLY THE FIRST CHUNK TO FINISH.

   Read off a live handset on 2026-09-20 (D1ZMK6, build 410): TK109's own
   sync log shows batch-unreadable firing for all eleven of its twelve
   photographs, and the live folder on the server holds only the sidecar —
   confirmed directly against the bucket, zero photographs landed. The
   banner and the sync log the phone actually produced said "3 photo(s)
   could not be read... everything else in this round is sent."

   putAll() splits a round past BATCH_MAX_FILES (4) into several chunks and
   runs them through concurrent lanes (uploadLanes(), normally 3). Each
   chunk's own putBatch() call correctly names every file IT could not
   read — but putAll()'s lane() kept only the FIRST chunk's error
   (`failed = failed || e`), so once more than one chunk failed to read
   anything, every chunk after the first vanished from the story: its
   batch-unreadable line still reached the sync log, but its names never
   reached the sentence a technician actually sees, and "everything else...
   is sent" was said about photographs that were never attempted again
   because the round is done being iterated the moment putAll() throws.

   The upload's own bookkeeping was never wrong — `sent` only ever holds a
   name that actually landed, so nothing here is falsely marked delivered —
   this is purely about what the phone SAYS happened, but for a device
   miles from signal that sentence is the only account of the round an
   inspector has to go on.

   Run: node tests/upload-chunk-merge.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof putAll === 'function' && typeof putBatch === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(300);

  const res = await p.evaluate(async (url) => {
    setBatchCap(url, true);   // skip the network probe canBatch() would otherwise make
    const realB64 = window.blobToB64;
    window.blobToB64 = async (blob) => {
      if (blob && blob.__ok) return 'aGVsbG8=';
      const e = new Error('cannot read'); e.localRead = true; throw e;
    };
    /* putAll() sends files[0] on its own, unconditionally, the moment
       `sent` is empty — the sidecar in the real shape, over a real network
       call this test has no server for. Seeding `sent` with an unrelated
       already-landed name (a resumed attempt, in the real shape) skips
       that step and sends every one of `files` through the chunked path
       instead — the eight photographs split into two chunks of four
       (BATCH_MAX_FILES), which run concurrently. The exact shape TK109's
       own twelve-file round took, minus the one real network call this
       harness does not need to prove the point. */
    const mk = (n) => ({ name: n, blob: { size: 900000, type: 'image/jpeg' }, type: 'image/jpeg', aid: n });
    const files = Array.from({ length: 8 }, (_, i) => mk('p' + (i + 1) + '.jpg'));
    const sent = { 'sidecar.json': 1 };
    let threw = null;
    try {
      await putAll({ id: 'gas', url, folder: '' },
        files, { equip: 'TK109', date: '2026-09-20', type: 'MP', dev: 'D1ZMK6' }, sent);
    } catch (e) { threw = e.message; }
    window.blobToB64 = realB64;
    return { threw, sentKeys: Object.keys(sent).sort() };
  }, URL);

  console.log('an 8-photograph, 2-chunk round where nothing local is readable');
  ok(!!res.threw, 'putAll raises — none of the eight photographs could be read', JSON.stringify(res));
  ok(res.sentKeys.length === 1 && res.sentKeys[0] === 'sidecar.json',
     'the pre-existing sidecar entry is untouched — no photograph is falsely marked sent', JSON.stringify(res.sentKeys));

  const named = (res.threw || '').match(/p\d\.jpg/g) || [];
  const namedSet = new Set(named);
  ok(/^8 /.test(res.threw || '') || /: 8 /.test(res.threw || ''),
     'the count says all eight, not the first chunk\'s four', res.threw);
  ok(namedSet.size === 8, 'every one of the eight is named, from both chunks — not only the first to finish',
     [...namedSet].sort().join(',') || '(none)');
  for (let i = 1; i <= 8; i++) {
    ok(namedSet.has('p' + i + '.jpg'), '  p' + i + '.jpg is named', namedSet.has('p' + i + '.jpg') ? 'named' : 'MISSING');
  }

  ok(errs.length === 0, 'no page errors throughout', errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
