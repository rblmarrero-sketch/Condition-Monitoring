/* ONE SHAPE GOES INTO THE SYSTEM, WHATEVER SHAPE CAME OUT OF THE GALLERY.

   A photograph taken with the app's own camera button arrives as a
   well-formed image/jpeg and has been shrunk on the way in since build 300.
   A photograph CHOSEN OUT OF THE GALLERY does not always: some Android file
   managers hand over an empty `type`, some hand over
   application/octet-stream, and an iPhone gallery hands over image/heic
   whenever the camera is set to High Efficiency. Every one of those failed
   `isPhotoType(blob.type)`, skipped the shrink entirely, and went into the
   queue as the camera's own multi-megabyte frame — the slow upload the field
   reports, and in the HEIC case a file the office cannot display at all
   while the name the phone gave it says ".jpg".

   Since build 354 the BYTES are asked (sniffType) and every photograph is
   re-encoded to JPEG at the size setting (standardise/reencode). What cannot
   be converted on this phone is still KEPT — nothing here ever discards
   evidence — but it is named truthfully and said out loud.

   Run: node tests/intake.cjs   (starts its own server on 8465) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8465);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
  res.end(fs.readFileSync(p));
});
const B = `http://127.0.0.1:${PORT}`;
srv.listen(PORT, async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });

  /* Every file below is built in the page so the bytes are real: a genuine
     JPEG and PNG out of a canvas, and a genuine HEIC container header. */
  await p.evaluate(() => {
    window.__mk = {
      /* Detail, not a flat fill: a flat 4000x3000 JPEG compresses to almost
         nothing and would pass the "already small" door for the wrong reason.
         Photographic detail rather than pixel noise, because pure noise is
         incompressible and no real camera produces it — a JPEG of noise can
         be larger than a PNG of it, which is a fact about the fixture and not
         about the app. */
      async canvas(w, h, type, q) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d');
        const g = x.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#6b5a3e'); g.addColorStop(0.5, '#9fb0bd'); g.addColorStop(1, '#22303a');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) {
          x.fillStyle = 'rgba(' + ((i * 37) % 255) + ',' + ((i * 53) % 255) + ',' + ((i * 91) % 255) + ',.5)';
          x.beginPath(); x.arc((i * 137) % w, (i * 251) % h, 4 + (i % 23), 0, 6.284); x.fill();
        }
        return await new Promise(r => c.toBlob(r, type, q));
      },
      /* An ISO base media container declaring the HEIC brand — enough for the
         sniffer, and genuinely undecodable by this browser, which is exactly
         the Android case. */
      heic(bytes) {
        const head = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
                      0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63];
        const a = new Uint8Array(head.length + bytes);
        a.set(head, 0);
        for (let i = head.length; i < a.length; i++) a[i] = (i * 31) & 255;
        return new Blob([a], { type: 'image/heic' });
      },
      px(blob) {
        return new Promise(res => {
          const u = URL.createObjectURL(blob), i = new Image();
          i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); };
          i.onerror = () => { res(null); URL.revokeObjectURL(u); };
          i.src = u;
        });
      },
    };
  });

  console.log('1. the size setting, read from the page, is what a photograph is held to');
  const setting = await p.evaluate(() => ({ px: photoPx(), dflt: PHOTO_PX_DEFAULT, skip: SHRINK_SKIP_BYTES }));
  ok('the phone standardises to its own default', setting.px === setting.dflt && setting.px > 0, JSON.stringify(setting));

  console.log('\n2. a big JPEG out of the gallery');
  const r2 = await p.evaluate(async () => {
    const src = await __mk.canvas(4000, 3000, 'image/jpeg', 0.92);
    const got = await intakeNoted(new File([src], 'IMG_4021.JPG', { type: 'image/jpeg' }));
    return { was: src.size, now: got.att.size, type: got.att.type, name: got.att.name,
             why: got.why, dim: await __mk.px(got.att) };
  });
  ok('it is scaled to the long-side limit', r2.dim && Math.max(r2.dim.w, r2.dim.h) === setting.px, JSON.stringify(r2.dim));
  ok('  and comes out smaller than it went in', r2.now < r2.was, Math.round(r2.was / 1024) + ' KB -> ' + Math.round(r2.now / 1024) + ' KB');
  ok('  still a JPEG, named .jpg, and nothing is reported wrong', /jpeg/.test(r2.type) && /\.jpg$/.test(r2.name) && !r2.why, r2.type + ' ' + r2.name + ' ' + (r2.why || '—'));

  console.log('\n3. the two shapes that used to slip past the type test entirely');
  const r3 = await p.evaluate(async () => {
    const src = await __mk.canvas(4000, 3000, 'image/jpeg', 0.92);
    const out = {};
    for (const [k, type] of [['blank', ''], ['octet', 'application/octet-stream']]) {
      const got = await intakeNoted(new File([src], '20260913_0912.jpg', { type }));
      out[k] = { now: got.att.size, type: got.att.type, why: got.why, dim: await __mk.px(got.att) };
    }
    out.was = src.size;
    return out;
  });
  ok('a gallery pick with NO type is sniffed and standardised', r3.blank.dim && Math.max(r3.blank.dim.w, r3.blank.dim.h) === setting.px && r3.blank.now < r3.was, JSON.stringify(r3.blank.dim) + ' ' + Math.round(r3.blank.now / 1024) + ' KB');
  ok('  and so is one typed application/octet-stream', r3.octet.dim && Math.max(r3.octet.dim.w, r3.octet.dim.h) === setting.px, JSON.stringify(r3.octet.dim));
  ok('  neither is reported as a problem', !r3.blank.why && !r3.octet.why, (r3.blank.why || '—') + ' / ' + (r3.octet.why || '—'));

  console.log('\n4. a big PNG — a screenshot, or an Android "edit" export — becomes a JPEG');
  const r4 = await p.evaluate(async () => {
    const src = await __mk.canvas(3000, 2000, 'image/png');
    const got = await intakeNoted(new File([src], 'Screenshot.png', { type: 'image/png' }));
    return { was: src.size, now: got.att.size, type: got.att.type, name: got.att.name, why: got.why, dim: await __mk.px(got.att) };
  });
  ok('the format is converted, not merely resized', /jpeg/.test(r4.type) && /\.jpg$/.test(r4.name), r4.type + ' ' + r4.name);
  ok('  and it is far smaller than the PNG was', r4.now < r4.was / 2, Math.round(r4.was / 1024) + ' KB -> ' + Math.round(r4.now / 1024) + ' KB');

  console.log('\n5. the sniffer reads the bytes, not the label');
  const r5 = await p.evaluate(async () => {
    const jpg = await __mk.canvas(20, 20, 'image/jpeg', 0.8);
    const png = await __mk.canvas(20, 20, 'image/png');
    return {
      jpg: await sniffType(new Blob([jpg], { type: 'application/octet-stream' })),
      png: await sniffType(new Blob([png], { type: '' })),
      heic: await sniffType(__mk.heic(4096)),
      junk: await sniffType(new Blob([new Uint8Array(64)], { type: '' })),
    };
  });
  ok('JPEG, PNG and HEIC are each recognised from their first bytes',
     r5.jpg === 'image/jpeg' && r5.png === 'image/png' && r5.heic === 'image/heic', JSON.stringify(r5));
  ok('  and something that is no image at all is not guessed at', r5.junk === '', JSON.stringify(r5.junk));

  console.log('\n6. HEIC this phone cannot convert: KEPT, named for what it is, and said');
  const r6 = await p.evaluate(async () => {
    const src = __mk.heic(300 * 1024);
    const got = await intakeNoted(new File([src], 'IMG_0007.HEIC', { type: 'image/heic' }));
    return { was: src.size, now: got.att.size, type: got.att.type, name: got.att.name, why: got.why,
             msg: t('gal_odd_heic', { n: 1, names: 'IMG_0007.HEIC' }), title: t('gal_odd_t') };
  });
  ok('the file is kept whole — evidence is never discarded', r6.now === r6.was, r6.was + ' -> ' + r6.now);
  ok('  it is NOT passed off as a .jpg', !/\.jpg$/i.test(r6.name), r6.name);
  ok('  and the round says which one and what to change', r6.why === 'heic' && /HEIC/.test(r6.msg) && /Most Compatible/.test(r6.msg) && !!r6.title, r6.why + ' · ' + r6.msg.slice(0, 90));

  console.log('\n7. a photograph already in the system\'s shape is not opened again');
  const r7 = await p.evaluate(async () => {
    const src = await __mk.canvas(600, 400, 'image/jpeg', 0.7);
    const got = await intakeNoted(new File([src], 'small.jpg', { type: 'image/jpeg' }));
    return { same: got.att.size === src.size, size: src.size, skip: SHRINK_SKIP_BYTES, why: got.why };
  });
  ok('a small JPEG comes back byte for byte', r7.same && r7.size < r7.skip, JSON.stringify(r7));

  console.log('\n8. "Original" is still a choice somebody can make');
  const r8 = await p.evaluate(async () => {
    const before = localStorage.getItem('up_px');
    localStorage.setItem('up_px', '0');
    const src = await __mk.canvas(2400, 1800, 'image/jpeg', 0.92);
    const got = await intakeNoted(new File([src], 'orig.jpg', { type: 'image/jpeg' }));
    if (before == null) localStorage.removeItem('up_px'); else localStorage.setItem('up_px', before);
    return { px: 0, same: got.att.size === src.size, why: got.why };
  });
  ok('with the size set to Original the bytes are left exactly as they are', r8.same && !r8.why, JSON.stringify(r8));

  console.log('\n9. a video is not touched by any of this');
  const r9 = await p.evaluate(async () => {
    const v = new Blob([new Uint8Array(2048)], { type: 'video/mp4' });
    const got = await standardise(v);
    return { same: got.blob === v, why: got.why || '' };
  });
  ok('standardise hands a clip straight back', r9.same && !r9.why, JSON.stringify(r9));

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
});
