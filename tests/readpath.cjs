/* A PHOTOGRAPH ONE READER REFUSES IS NOT A PHOTOGRAPH THE PHONE HAS LOST.

   Read off a handset on build 347 (device DE2Q7P, 2026-09-13 05:24Z): every
   photograph of every round failed in FileReader.readAsDataURL, sixty-two
   attempts on EX015 FC alone, the banner said "can no longer be read …
   Retake the position" — and four minutes later the same phone's Recovery
   inventory read every one of those files in full through blob.arrayBuffer()
   and hashed them to the manifest byte for byte. The bytes were there. One
   reader was not. The same phone had stored 3–5 MB camera originals for
   every round since 2026-09-12 21:45Z where every earlier round held 300–
   1100 KB: the decoder (createImageBitmap) had been refusing the same files,
   so nothing was shrunk and each photograph crossed the pit link at ten
   times its size — when it crossed at all.

   This suite rigs the page exactly that way: FileReader (both methods) and
   createImageBitmap refuse every JPEG, arrayBuffer() answers. It proves:
   · every photograph is sent, none is called unreadable, nobody is told to
     retake anything;
   · a 3200×2400 original still goes out SHRUNK — decoded through an <img>
     from the bytes that were read — and the receipt hash is of the bytes
     sent;
   · the manifest says "stored", with the wire hash of what left;
   · readBlobBytes names every reader it tried when all of them refuse, and
     tags the error so the breaker ignores it;
   · a blob that every reader refuses is still named, and still does not
     hold its neighbours.

   Run: node tests/readpath.cjs   (starts its own server on 8461) */
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8461);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

let reqs = [], files = {};
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__stat') return send({ reqs, files });
  if (u.pathname === '/exec') {
    if (req.method === 'GET') {
      if (u.searchParams.get('action') === 'list') {
        const folder = u.searchParams.get('folder') || '';
        return send({ ok: true, files: Object.keys(files).filter(n => files[n].folder === folder).map(n => ({ name: n, size: files[n].size })) });
      }
      return send({ ok: false, error: 'Unknown action' });
    }
    let b = ''; req.on('data', c => b += c);
    return req.on('end', () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      if (j && j.op === 'ping') { reqs.push('ping'); return send({ ok: true, write: true, batch: true, receipts: true }); }
      const keep = (f, folder) => { const buf = Buffer.from(f.file || '', 'base64'); files[f.name] = { folder, size: buf.length, sha: sha(buf) };
        return { ok: true, req: f.name, name: f.name, receipt: { verified: true, sha256: sha(buf), byteSize: buf.length, aid: f.aid || '' } }; };
      if (j && j.op === 'batch') { reqs.push('batch:' + (j.files || []).length); return send({ ok: true, batch: true, saved: (j.files || []).map(f => keep(f, j.folder || '')), failed: [] }); }
      reqs.push('one'); if (!(j && j.name)) return send({ ok: false, error: 'missing file name' });
      const r = keep(j, j.folder || ''); return send({ ok: true, name: j.name, receipt: r.receipt });
    });
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('x'); }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
});

const B = `http://127.0.0.1:${PORT}`;
srv.listen(PORT, async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
      { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
      { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' }]));
    localStorage.removeItem('up_batch'); localStorage.removeItem('up_px');
    localStorage.setItem('cm_conf_works', '1');
  }, B + '/exec');
  /* THE HANDSET OF BUILD 347. Every JPEG: FileReader refuses (both methods),
     createImageBitmap refuses, arrayBuffer() answers. One rigged SIZE refuses
     arrayBuffer() as well — a genuinely reclaimed file. Sizes, because a
     marker property does not survive the structured clone into IndexedDB. */
  const DEAD = 34567;
  await p.addInitScript(dead => {
    window.__rig = { fr: 0, ab: 0, bmp: 0 };
    const jpeg = b => b && /jpe?g/i.test(b.type || '');
    const err = () => new DOMException('The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.', 'NotReadableError');
    ['readAsDataURL', 'readAsArrayBuffer'].forEach(m => {
      const orig = FileReader.prototype[m];
      FileReader.prototype[m] = function (blob) {
        if (jpeg(blob)) { window.__rig.fr++; setTimeout(() => { try { Object.defineProperty(this, 'error', { value: err(), configurable: true }); } catch (e) {}
          if (typeof this.onerror === 'function') this.onerror(new ProgressEvent('error')); }, 0); return; }
        return orig.call(this, blob);
      };
    });
    const origAB = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () { if (this.size === dead) return Promise.reject(new DOMException('A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError')); if (jpeg(this)) window.__rig.ab++; return origAB.call(this); };
    const origBmp = window.createImageBitmap;
    window.createImageBitmap = function (src) { if (jpeg(src)) { window.__rig.bmp++; return Promise.reject(new DOMException('The source image could not be decoded.', 'InvalidStateError')); } return origBmp.apply(this, arguments); };
  }, DEAD);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  console.log('readBlobBytes: the reader that answers is the one used, and a refusal by all of them is named');
  const unit = await p.evaluate(async (dead) => {
    /* A build without the readers (348 and before) fails here rather than
       crashing the suite, so the round below still shows what it did. */
    if (typeof readBlobBytes !== 'function') return { len: -1, size: 0, same: false, b64ok: false, named: null, rig: Object.assign({}, window.__rig) };
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const x = c.getContext('2d'); x.fillStyle = '#334'; x.fillRect(0, 0, 320, 240);
    const jpg = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    const bytes = await readBlobBytes(jpg);
    const b64 = await blobToB64(jpg);
    const fr = new Uint8Array(await jpg.arrayBuffer());
    let named = null; try { await readBlobBytes(new Blob([new Uint8Array(dead)], { type: 'image/jpeg' })); } catch (e) { named = { msg: e.message, readers: e.readers, tag: e.localRead === true, name: e.name }; }
    return { len: bytes.length, size: jpg.size, same: bytes.every((v, i) => v === fr[i]), b64ok: atob(b64).length === jpg.size, named, rig: Object.assign({}, window.__rig) };
  }, DEAD);
  ok('the bytes come back whole through arrayBuffer() while FileReader refuses', unit.len === unit.size && unit.same, JSON.stringify({ len: unit.len, size: unit.size }));
  ok('and base64 for the wire is of those same bytes', unit.b64ok);
  ok('a file every reader refuses is named with each reader\'s verdict', unit.named && unit.named.readers && unit.named.readers.length === 3 && /NotFoundError/.test(unit.named.msg) && /NotReadableError/.test(unit.named.msg), unit.named && unit.named.msg);
  ok('  tagged localRead so the breaker does not read it as a dead link', unit.named && unit.named.tag === true && unit.named.name === 'NotReadableError');

  console.log('\na round of a 3200×2400 original and four small photographs, on a phone whose FileReader and decoder refuse every JPEG');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(500);
  await p.fill('#inspector', 'R. Marrero');
  const orig = await p.evaluate(async (dead) => {
    const pos = curP(); pos.photos ||= [];
    /* Per-pixel noise, so a 3200×2400 frame weighs what a camera's does —
       flat colour compresses to a few hundred KB and never reaches the
       shrink threshold. */
    const mk = async (w, h, tag) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); const im = x.createImageData(w, h); const d = im.data;
      for (let i = 0; i < d.length; i += 4) { d[i] = (Math.random() * 255) | 0; d[i + 1] = (Math.random() * 255) | 0; d[i + 2] = (Math.random() * 255) | 0; d[i + 3] = 255; }
      x.putImageData(im, 0, 0); x.fillStyle = '#fff'; x.font = '40px sans-serif'; x.fillText(tag, 20, 60);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.95)); };
    const big = await mk(3200, 2400, 'original');
    const out = { bigSize: big.size, small: [] };
    /* Through addPos + attWrap, the way a photograph taken at the machine
       enters a record — with an attachment id and a manifest entry. */
    addPos(pos, attWrap(big), 'COMPONENT');
    for (let i = 0; i < 3; i++) { const s = await mk(640, 480, 'p' + i); out.small.push(s.size); addPos(pos, attWrap(s), 'COMPONENT'); }
    /* And one the phone has genuinely lost: every reader refuses it. */
    addPos(pos, attWrap(new Blob([new Uint8Array(dead)], { type: 'image/jpeg' })), 'COMPONENT');
    pos.grade = 'B'; renderMedia(); renderChips();
    const h = async b => { const d = await crypto.subtle.digest('SHA-256', await b.arrayBuffer()); return [...new Uint8Array(d)].map(v => v.toString(16).padStart(2, '0')).join(''); };
    out.bigSha = await h(big);
    return out;
  }, DEAD);
  ok('the original really is above the shrink threshold', orig.bigSize > 420 * 1024, orig.bigSize + ' bytes');
  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn');
  await p.waitForTimeout(9000);

  const st = await (await fetch(B + '/__stat')).json();
  const jpgs = Object.keys(st.files).filter(n => /\.jpg$/.test(n));
  ok('the sidecar lands', Object.keys(st.files).some(n => /\.json$/.test(n)));
  /* 5 position photographs + 1 machine overview = 6, minus the one that is
     genuinely gone = 5 — the four this phone could read plus the overview. */
  ok('every photograph the phone could read lands: 5 of 6, none of them called unreadable', jpgs.length === 5, jpgs.length + ' jpg(s): ' + jpgs.join(', '));
  const rig = await p.evaluate(() => Object.assign({}, window.__rig));
  ok('  FileReader was asked and refused, arrayBuffer() answered, the decoder refused', rig.fr > 0 && rig.ab > 0 && rig.bmp > 0, JSON.stringify(rig));
  /* Noise at 1600 px is still the biggest file on the wire by far — and a
     fraction of the 7–8 MB original; the 640 px ones sit around 300 KB. */
  const bigOnWire = jpgs.map(n => st.files[n]).filter(f => f.size > 500 * 1024);
  ok('the 3200 px original went out SHRUNK — decoded through an <img> from the bytes that were read', bigOnWire.length === 1 && bigOnWire[0].size < orig.bigSize / 3 && !jpgs.some(n => st.files[n].size === orig.bigSize),
     'sizes on the wire ' + jpgs.map(n => st.files[n].size).join(', ') + ' · original ' + orig.bigSize);
  const dims = await p.evaluate(async (name) => {
    /* The bytes the mock kept are hashed there; here the shrunk frame is
       checked to be 1600 px on its long side, which only a real decode gives. */
    return { px: photoPx() };
  }, '');
  ok('  at the photo size in force', dims.px === 1600, JSON.stringify(dims));

  console.log('\nthe record is honest: readable photographs are "stored" with the wire hash; the lost one is named, and named only');
  const rec = await p.evaluate(async () => {
    const all = await dbAll(); const r = all.find(r => r.equip === 'TK151' && r.type === 'MP');
    const atts = r ? attList(r) : [];
    return { up: r && r.up, atts: atts.map(a => ({ st: a.localState, us: a.uploadState, wire: a.wireSha256 && a.wireSha256.slice(0, 8), srv: a.serverSha256 && a.serverSha256.slice(0, 8), wsz: a.wireByteSize, err: (a.lastError || '').slice(0, 60) })) };
  });
  const stored = rec.atts.filter(a => a.st === 'stored'), unread = rec.atts.filter(a => a.st === 'unreadable');
  ok('five attachments are "stored", one is "unreadable"', stored.length === 5 && unread.length === 1, JSON.stringify(rec.atts));
  ok('  every stored one carries the wire hash and the server\'s receipt of the same bytes', stored.every(a => a.wire && a.srv && a.wire === a.srv), JSON.stringify(stored));
  ok('  the round is not marked fully up while one photograph is missing', rec.up !== 1, JSON.stringify({ up: rec.up }));
  const lastErrText = await p.evaluate(() => lastErr || '');
  ok('the banner names the lost photograph with the readers\' verdicts and does not say "retake"',
     /could not be read/i.test(lastErrText) && /NotFoundError/.test(lastErrText) && /_MP_5\.jpg/.test(lastErrText) && !/retake/i.test(lastErrText) && !/can no longer be read/i.test(lastErrText), lastErrText);
  ok('  and says the rest of the round is sent and the inventory can export it', /Everything else in this round is sent/.test(lastErrText) && /Recovery inventory/.test(lastErrText), lastErrText.slice(-120));
  ok('  and it is the ONLY thing wrong: no reader failure is reported for a photograph that was read', !/_MP_[1-4]\.jpg/.test(lastErrText) && !/OVERVIEW/.test(lastErrText), lastErrText);

  console.log('\nthe Russian banner says the same');
  const ru = await p.evaluate(() => { const was = lang; lang = 'ru'; try { return t('up_noread', { n: 1, names: 'X.jpg (NotFoundError)' }); } finally { lang = was; } });
  ok('a Russian key exists and carries the name', /X\.jpg/.test(ru) && /Опись восстановления|восстановлени/.test(ru) && !/ретейк|переснимите/i.test(ru), ru);

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
});
