/* A GALLERY BATCH IS ONE GRANT, NOT ONE GRANT PER FILE PROCESSED IN TURN.

   Read off a handset on 2026-09-15: a component photographed from the
   gallery failed to send; the same position retaken with the app's own
   camera synchronised immediately. intakeNoted already reads every
   photograph's bytes into memory before anything is stored (ownBytes, build
   372, tests/ownbytes.cjs) — that much was not the gap.

   The gap was ORDER. addPicked called intakeNoted once per file, in the
   SAME sequence it also decoded and re-encoded them in — so file #1's canvas
   work held up the READ of file #4, and a multi-select gallery pick hands
   every file over behind ONE permission grant. By the time a later file's
   turn came in the loop, real decode-and-encode time had passed for every
   file ahead of it, which is exactly the time a phone's OS needs to decide
   the grant is no longer wanted. The camera path never hit this because it
   is always exactly one file, read the instant it is handed over.

   This suite makes decoding artificially slow (every createImageBitmap call
   costs real wall-clock time, the way a 12 MP frame actually does) and gives
   one file in a five-photo batch a backing store that goes NotFoundError
   after a fixed delay — long enough to survive a parallel read at pick time,
   too short to survive three files' worth of sequential decoding ahead of
   it. The fixed code reads every file's bytes before any decoding starts;
   the old code did not, and this is the one regression test that tells them
   apart (run it against a checkout before this fix and it fails).

   Run: node tests/gallerybatch.cjs   (starts its own server on 8474) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8474);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof addPicked === 'function' && typeof ownBytes === 'function',
                          null, { timeout: 30000 });
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);

  /* Real decode time, without a real 12 MP frame: every createImageBitmap
     call is held for DECODE_MS before it resolves, at every call site
     standardise/reencode already use — and refuses outright, the way the
     native decoder actually would, once the file it was given is the one
     whose backing store the OS has since reclaimed. */
  const DECODE_MS = 180, EXPIRE_MS = 300, N = 5, EXPIRING = 3; // 0-based index of the file that goes stale
  await p.evaluate(() => {
    const origCIB = window.createImageBitmap.bind(window);
    window.__decodeMs = 0; window.__dying = null; window.__dead = () => false;
    window.createImageBitmap = (blob, ...rest) => new Promise((res, rej) => {
      setTimeout(() => {
        if (blob === window.__dying && window.__dead()) {
          const e = new Error('gone'); e.name = 'NotFoundError'; return rej(e);
        }
        origCIB(blob, ...rest).then(res, rej);
      }, window.__decodeMs);
    });
  });

  const result = await p.evaluate(async ({ n, expireIdx, expireMs, decodeMs }) => {
    window.__decodeMs = decodeMs;
    const mk = async (i) => {
      /* Inside photoPx()'s default limit, and already a JPEG — reencode's
         PASS-THROUGH branch, which hands the original blob straight back
         rather than replacing it with one the canvas made. That is the exact
         door DZ002_RIGHT went through in the build-372 report, and the one
         that still leaves ownBytes touching the picker's own reference if it
         runs late — a frame big enough to force a fresh canvas copy would
         mask this suite's regression, not reproduce it. */
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const x = c.getContext('2d'); x.fillStyle = '#365'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#fff'; x.font = '48px sans-serif'; x.fillText('p' + i, 20, 60);
      const real = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      return new File([real], 'IMG_000' + i + '.jpg', { type: 'image/jpeg' });
    };
    const files = [];
    for (let i = 0; i < n; i++) files.push(await mk(i));

    /* The one file whose backing store the OS reclaims mid-batch: fine for
       EXPIRE_MS, then every reader refuses it, permanently, exactly like a
       picker item whose grant has lapsed — arrayBuffer(), both FileReader
       routes AND the native decoder, because a real reclaimed file refuses
       all of them, not only the three JS-visible readers. */
    const dying = files[expireIdx];
    window.__dying = dying;
    const t0 = performance.now();
    const nf = () => { const e = new Error('gone'); e.name = 'NotFoundError'; return e; };
    let dead = false;
    window.__dead = () => dead;
    setTimeout(() => { dead = true; }, expireMs);
    Object.defineProperty(dying, 'arrayBuffer', { value: () => dead ? Promise.reject(nf()) : File.prototype.arrayBuffer.call(dying), configurable: true });
    const OrigFR = window.FileReader;
    window.FileReader = function () {
      const r = new OrigFR();
      const ab = r.readAsArrayBuffer.bind(r), url = r.readAsDataURL.bind(r);
      const kill = (b) => dead && b === dying;
      r.readAsArrayBuffer = (b) => kill(b) ? setTimeout(() => { try { Object.defineProperty(r, 'error', { value: nf(), configurable: true }); } catch (e) {} r.onerror && r.onerror(new ProgressEvent('error')); }, 0) : ab(b);
      r.readAsDataURL = (b) => kill(b) ? setTimeout(() => { try { Object.defineProperty(r, 'error', { value: nf(), configurable: true }); } catch (e) {} r.onerror && r.onerror(new ProgressEvent('error')); }, 0) : url(b);
      return r;
    };

    /* When does ownBytes actually get called for each file? This is the
       structural difference between the two orderings. */
    const calls = [];
    const origOwn = window.ownBytes;
    window.ownBytes = async (blob) => { calls.push(performance.now() - t0); return origOwn(blob); };
    /* And did the file that goes stale actually come through READ, or only
       kept as the picker's own untouched reference with a reason attached?
       "still in p.photos" alone is not the claim — a File whose backing
       store is gone survives in the array either way, because nothing here
       ever discards evidence. The claim is that it survives WITHOUT that
       reason, i.e. actually read. */
    const whys = [];
    const origIntake = window.intakeNoted;
    window.intakeNoted = async (blob) => { const r = await origIntake(blob); whys.push(r.why || ''); return r; };

    const p2 = curP(); p2.photos = [];
    await addPicked(files);
    await new Promise(r => setTimeout(r, 50));

    return {
      calls, whys,
      names: (p2.photos || []).map(b => b.name),
      count: (p2.photos || []).length,
      elapsed: performance.now() - t0,
    };
  }, { n: N, expireIdx: EXPIRING, expireMs: EXPIRE_MS, decodeMs: DECODE_MS });

  console.log('every photograph\'s bytes are secured before any of them is decoded');
  /* intakeNoted takes its own read too (unconditional, tests/ownbytes.cjs) —
     so a securely fixed batch calls ownBytes TWICE per file: once up front,
     in parallel, and once again downstream on what is by then already a
     safe copy. The signature of the fix is not "exactly N calls"; it is that
     the EARLIEST N of them all land together, well before one decode's
     worth of time has passed — the downstream N are free to trail behind,
     spaced by the sequential loop, because by the time each of them runs it
     is no longer touching anything fragile. */
  ok('ownBytes is called for every non-video file, at least once each',
     result.calls.length >= N, result.calls.length + ' call(s)');
  const early = [...result.calls].sort((a, b) => a - b).slice(0, N);
  const spread = Math.max(...early) - Math.min(...early);
  ok('  the earliest N of them within one tick of each other, not spaced by the decode time',
     spread < DECODE_MS, 'spread ' + spread.toFixed(1) + 'ms over ' + early.map(x => x.toFixed(0)).join(','));
  ok('  every one of the earliest N well before the file that goes stale actually does',
     Math.max(...early) < EXPIRE_MS, 'latest of the early batch at ' + Math.max(...early).toFixed(1) + 'ms, expiry at ' + EXPIRE_MS + 'ms');

  console.log('\nthe photograph whose backing store later disappears still reaches the round, READ');
  ok('all five photographs are kept', result.count === N, result.count + ' of ' + N);
  ok('  the one that would have been mid-batch under the old order is among them',
     result.names.some(nm => new RegExp('^a[0-9a-z]+\\.jpg$', 'i').test(nm)) && result.count === N,
     JSON.stringify(result.names));
  ok('  and none of the five needed the "could not be read" fallback',
     result.whys.every(w => w === ''), JSON.stringify(result.whys));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
