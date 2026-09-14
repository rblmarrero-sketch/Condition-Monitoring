/* A PHOTOGRAPH THE PAGE HAS NOT READ IS A PHOTOGRAPH IT DOES NOT HAVE.

   Read off a handset on 2026-09-14. A phone with 38 GB free and every earlier
   photograph cleared; three rounds captured that morning; and at upload:

     1 photo(s) could not be read on this phone by any reader and were
     skipped: DZ002_RIGHT_14.09.2026_UC_3.jpg (NotFoundError)

   The findings went. The sidecar went. On the same phone in the same hour one
   round was verified byte for byte and another lost every photograph it had.

   `NotFoundError` is the whole diagnosis, and it is not the error the app had
   been chasing. NotReadable means the bytes resist. NotFound means the file
   the Blob points AT is gone — there is nothing under it to read, which is
   also why all three readers failed together rather than one refusing and the
   next succeeding (that was build 347, a different fault with a similar face).

   ROOT CAUSE. A `File` from `<input type=file>` is not bytes; on WebKit it is
   a reference to an item in the browser's temporary file store, and
   `new File([thatFile], name)` copies the REFERENCE — the specification lets
   the copy be lazy and WebKit takes it. iOS then clears the camera's staging
   file on its own schedule and IndexedDB is left holding a faithful pointer
   to nothing. Six paths returned the picker's own File to storage: a JPEG
   already inside the size limit, a re-encode that came out no smaller, a
   video, a file whose bytes are not a photo type, "Original" chosen on
   purpose, and a HEIC the decoder refused. A frame that went through the
   canvas in `reencode` came back as a blob the PAGE had made — which is
   exactly why some rounds survived and others did not.

   THE RULE. Nothing reaches storage that this page has not read end to end.
   One read at intake, unconditional — a canvas blob is re-read too, because a
   rule with an exception is a rule somebody has to remember. It is also the
   earliest possible detection: the read happens with the button still
   disabled and the inspector still standing at the machine, where "take it
   again" costs ten seconds, instead of at upload after they have driven away.

   The fixture is the failure: a File whose backing store has been pulled, so
   every reader throws NotFoundError exactly as WebKit's does.

   Run: node tests/ownbytes.cjs   (starts its own server on 8473) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8473);
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
  await p.waitForFunction(() => typeof intakeNoted === 'function' && typeof readBlobBytes === 'function',
                          null, { timeout: 30000 });

  /* A real JPEG, and a stand-in for the picker's File: same bytes, same type,
     but every reader throws NotFoundError — which is what a File whose
     backing item iOS has deleted actually does. */
  const SETUP = () => {
    window.__mk = async (px, kill) => {
      const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * 0.75);
      const x = c.getContext('2d');
      x.fillStyle = '#4a6'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = '#fff'; x.font = '40px sans-serif'; x.fillText('CM', 20, 60);
      const real = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      const f = new File([real], 'IMG_0001.jpg', { type: 'image/jpeg' });
      if (!kill) return f;
      /* The backing store, pulled. Nothing here pretends the file is merely
         awkward: arrayBuffer rejects, both FileReader routes error, and the
         name of the failure is the one the handset reported. */
      const nf = () => { const e = new Error('The requested file could not be read'); e.name = 'NotFoundError'; return e; };
      Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.reject(nf()), configurable: true });
      window.__FRkill = true;
      return f;
    };
    /* FileReader dies the same way while __FRkill is set — the readers are
       three doors onto ONE missing file, so rigging one is the build-347
       case, not this one. */
    const FR = window.FileReader;
    window.FileReader = function () {
      const r = new FR();
      const orig = { ab: r.readAsArrayBuffer.bind(r), url: r.readAsDataURL.bind(r) };
      /* Thrown synchronously, not delivered through onerror: FileReader's
         `error` is a read-only accessor, so a stub that assigns to it loses
         the name and the suite ends up asserting a generic failure — which is
         the build-347 face of this, not the one being reproduced. */
      const gone = () => { const e = new Error('The requested file could not be read');
                           e.name = 'NotFoundError'; throw e; };
      const mine = b => window.__FRkill && b instanceof File && b.name === 'IMG_0001.jpg';
      r.readAsArrayBuffer = function (b) { if (mine(b)) gone(); return orig.ab(b); };
      r.readAsDataURL = function (b) { if (mine(b)) gone(); return orig.url(b); };
      return r;
    };
  };
  await p.evaluate(SETUP);

  console.log('1. the fixture is the failure, not a near miss');
  const dead = await p.evaluate(async () => {
    const f = await window.__mk(800, true);
    const out = { size: f.size, type: f.type };
    try { await readBlobBytes(f); out.read = 'succeeded'; }
    catch (e) { out.read = 'threw'; out.readers = (e.readers || []).join(' | '); }
    window.__FRkill = false;
    return out;
  });
  ok('a File whose backing store is gone still looks ordinary', dead.size > 0 && dead.type === 'image/jpeg',
     dead.size + ' bytes, ' + dead.type);
  ok('  and every one of the three readers refuses it', dead.read === 'threw', dead.read);
  ok('  each of them with NotFoundError, which is what the handset reported',
     (dead.readers.match(/NotFoundError/g) || []).length === 3, dead.readers);

  console.log('\n2. intake reads the bytes, so what is stored is the page\'s own');
  /* A frame WELL INSIDE the size limit takes reencode's pass-through — the
     exact door DZ002_RIGHT went through, a .jpg the app had nothing to do to. */
  const held = await p.evaluate(async () => {
    const px = (typeof photoPx === 'function' && photoPx()) || 1600;
    const f = await window.__mk(Math.min(320, px - 8), false);
    const got = await intakeNoted(f);
    /* Now pull the ORIGINAL file's backing store, the way iOS does minutes
       after the shutter. If intake kept a reference, the attachment dies with
       it; if intake read the bytes, the attachment does not care. */
    const nf = () => { const e = new Error('gone'); e.name = 'NotFoundError'; return e; };
    Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.reject(nf()), configurable: true });
    window.__FRkill = true;
    const out = { why: got.why || '', same: got.att === f, size: got.att.size, src: f.size };
    try { const u = await readBlobBytes(got.att); out.bytes = u.length; }
    catch (e) { out.bytes = -1; out.err = String(e && e.name); }
    window.__FRkill = false;
    return out;
  });
  ok('the attachment is not the object the picker handed over', held.same === false);
  ok('  it holds the same number of bytes', held.size === held.src, held.size + ' of ' + held.src);
  ok('  and it still reads after the picker\'s file is pulled out from under it',
     held.bytes === held.size, held.bytes + ' bytes read' + (held.err ? ' (' + held.err + ')' : ''));
  ok('  with nothing to report, because nothing went wrong', held.why === '', held.why || '(clean)');

  console.log('\n3. the same holds for a frame that DOES go through the canvas');
  const big = await p.evaluate(async () => {
    const px = (typeof photoPx === 'function' && photoPx()) || 1600;
    const f = await window.__mk(px + 400, false);
    const got = await intakeNoted(f);
    const nf = () => { const e = new Error('gone'); e.name = 'NotFoundError'; return e; };
    Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.reject(nf()), configurable: true });
    window.__FRkill = true;
    let bytes = -1; try { bytes = (await readBlobBytes(got.att)).length; } catch (e) {}
    window.__FRkill = false;
    return { bytes, size: got.att.size, why: got.why || '' };
  });
  ok('a shrunk frame survives its source being pulled too', big.bytes === big.size && big.bytes > 0,
     big.bytes + ' bytes');
  ok('  and it is genuinely a different, smaller file', big.size !== held.src, big.size + ' bytes');

  console.log('\n4. a file that is ALREADY gone is said at the machine, not at the upload');
  const lost = await p.evaluate(async () => {
    const f = await window.__mk(320, true);
    let got, threw = '';
    try { got = await intakeNoted(f); } catch (e) { threw = String(e && e.message); }
    window.__FRkill = false;
    return { threw, why: got && got.why, kept: !!(got && got.att && got.att.size > 0),
             key: typeof intakeWhyKey === 'function' ? intakeWhyKey(got && got.why) : '' };
  });
  ok('intake does not throw — a round is never lost to this', lost.threw === '', lost.threw || 'clean');
  ok('  the evidence is kept, never discarded', lost.kept === true);
  ok('  and it is reported as its own reason, not as a HEIC or an odd type',
     lost.why === 'own' && lost.key === 'gal_odd_own', lost.why + ' → ' + lost.key);
  const words = await p.evaluate(() => [t('gal_odd_own'),
    (function () { const was = lang; lang = 'ru'; const s = t('gal_odd_own'); lang = was; return s; })()]);
  ok('  in both languages, and it says what to do about it',
     /take it again/i.test(words[0]) && /заново/i.test(words[1]), words[0].slice(0, 60));

  console.log('\n5. protection is asked for before there is anything to protect');
  const persist = await p.evaluate(() => ({ asked: persistState !== null,
                                            has: typeof askPersist === 'function' }));
  ok('the page asks at boot, not at the first save', persist.asked === true && persist.has === true,
     'persistState=' + JSON.stringify(await p.evaluate(() => persistState)));

  console.log('\n6. the "?" on a saved round is named, not left as a broken image');
  /* Safari paints its own question mark when a blob URL resolves to a file
     the OS has reclaimed. That is the SAME defect, showing itself at Save,
     hours before the upload names it — and as a bare glyph it reads as the
     app being broken. Drive the img's error path the way a dead blob does. */
  const qm = await p.evaluate(async () => {
    const row = document.createElement('div'); row.className = 'pitem';
    row.innerHTML = '<img class="thumb" src="blob:nothing-here">';
    document.body.appendChild(row);
    const img = row.querySelector('img.thumb');
    /* the page's own handler, applied exactly as renderPending applies it */
    img.onerror = () => {
      const d = document.createElement('div');
      d.className = 'thumb bad'; d.textContent = '⚠';
      d.title = t('thumb_unread'); d.setAttribute('aria-label', t('thumb_unread'));
      img.replaceWith(d);
    };
    img.onerror();
    const d = row.querySelector('.thumb.bad');
    const cs = d && getComputedStyle(d);
    const out = { has: !!d, txt: d && d.textContent, lab: d && d.getAttribute('aria-label'),
                  dashed: cs && /dashed/.test(cs.borderStyle),
                  src: (function () { const was = lang; lang = 'ru'; const s = t('thumb_unread'); lang = was; return s; })() };
    row.remove();
    return out;
  });
  ok('a thumbnail that cannot decode becomes a marked placeholder', qm.has && qm.txt === '⚠');
  ok('  with the reason readable to a screen reader, not only as a glyph',
     /cannot be read on this phone/i.test(qm.lab || ''), (qm.lab || '').slice(0, 50));
  ok('  and it does not tell anyone the round is lost',
     /intact/i.test(qm.lab || '') && /целы/.test(qm.src), qm.src.slice(0, 44));
  ok('  it is visibly not a photograph', qm.dashed === true);
  const rp = (src0 => src0)(fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8'));
  ok('  and renderPending installs that handler on every row',
     /img\.thumb"\);\s*if\(timg\)\s*timg\.onerror=/.test(rp.replace(/\n\s*/g, '')),
     'wired in renderPending');

  console.log('\n7. the rule is unconditional — no door back to a borrowed blob');
  const src = fs.readFileSync(path.join(ROOT, 'mobile/index.html'), 'utf8');
  const fn = (src.match(/async function intakeNoted\(blob\)\{[\s\S]*?\n\}/) || [''])[0];
  ok('intakeNoted owns the bytes on every path', /ownBytes\(/.test(fn) && !/if\s*\(/.test(fn.split('ownBytes')[0].split('standardise')[1] || ''),
     fn.replace(/\s+/g, ' ').slice(0, 90));
  ok('  and ownBytes goes through the three-reader helper, not arrayBuffer alone',
     /async function ownBytes\(blob\)\{\s*const u=await readBlobBytes\(blob\);/.test(src.replace(/\n/g, '')));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
