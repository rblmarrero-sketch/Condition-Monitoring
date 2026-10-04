/* THE FRAMED CAMERA: WHAT IS IN THE SQUARE IS WHAT IS SAVED, EITHER WAY UP.

   Asked from the field on 2026-10-04: "put a square or frame when they take
   photo so sizes will be good, not expanded or distorted ... it looks the same
   from photo to report ... even when they take photos in landscape or portrait."
   The report prints every photograph in one square tile, cropped to fill it, so
   what the inspector composed in a landscape or portrait frame lost a different
   part of the picture to that crop. framedPhoto() is a camera screen whose
   viewfinder IS a square and which saves the centre square of the stream.

   Chromium's fake camera (640x480 test pattern) stands in for a handset. Proved:
   the viewfinder is square and fits the screen portrait AND landscape; the saved
   photograph is square (decoded, not read off a name); the stream is released;
   cancel adds nothing; "Phone camera" and a refused permission both go to the
   phone's own camera input, and a refusal is not asked again; the machine
   photographs take the same path; Russian labels.
   Run: node tests/framecam.cjs   (starts its own server on 8490) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8490);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});
const ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
async function open(b, vp, perms) {
  const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, permissions: perms });
  const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); localStorage.setItem('cm_lang', 'en'); });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof framedPhoto === 'function' && typeof takePhoto === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(150);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(150);
  await p.evaluate(() => { curItem = items()[0].k; });
  return p;
}
const dims = (p) => p.evaluate(async () => {
  const f = Object.values(draft.positions).flatMap(x => x.photos || []).slice(-1)[0];
  if (!f) return null;
  const bm = await createImageBitmap(f); return { w: bm.width, h: bm.height, type: f.type };
});
const live = (p) => p.evaluate(() => (window.__tracks || []).filter(t => t.readyState === 'live').length);

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch({ args: ARGS });

  for (const [name, vp] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]]) {
    console.log('1. ' + name + ': the viewfinder is a square that fits the screen, and the photograph saved is square');
    const p = await open(b, vp, ['camera']);
    await p.evaluate(() => {   // watch every track the page opens, to prove it lets go
      window.__tracks = []; const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async c => { const s = await g(c); s.getTracks().forEach(t => window.__tracks.push(t)); return s; };
      window.__st = undefined; window.__tp = takePhoto().then(x => { window.__st = 'done'; }, e => { window.__st = 'err:' + e.message; });
    });
    await p.waitForSelector('#camOv:not(.hidden)', { timeout: 8000 });
    await p.waitForSelector('#camShutter:not([disabled])', { timeout: 8000 });
    ok('the shutter is enabled once the camera is live', await p.evaluate(() => !document.getElementById('camShutter').disabled));
    await p.waitForTimeout(300);
    const geo = await p.evaluate(() => { const r = document.getElementById('camBox').getBoundingClientRect(), v = document.getElementById('camVideo');
      return { w: Math.round(r.width), h: Math.round(r.height), l: r.left, t: r.top, b: r.bottom, rt: r.right, vw: innerWidth, vh: innerHeight, playing: v.videoWidth > 0 && !v.paused }; });
    ok('the box is square', Math.abs(geo.w - geo.h) <= 1, JSON.stringify(geo));
    ok('and fits the screen', geo.l >= -1 && geo.t >= -1 && geo.rt <= geo.vw + 1 && geo.b <= geo.vh + 1, JSON.stringify(geo));
    ok('and is big enough to compose in (at least 150 px)', geo.w >= 150, String(geo.w));
    ok('the camera is running behind it', geo.playing);
    const btn = await p.evaluate(() => { const r = document.getElementById('camShutter').getBoundingClientRect(); return { w: r.width, h: r.height, onScreen: r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.top >= -1 && r.left >= -1 }; });
    ok('the shutter is a glove-sized target and on the screen', btn.w >= 64 && btn.h >= 64 && btn.onScreen, JSON.stringify(btn));
    ok('a camera is open before the shot', await live(p) >= 1);
    await p.click('#camShutter');
    await p.waitForFunction(() => window.__st !== undefined, null, { timeout: 15000 });
    const d = await dims(p);
    ok('a photograph was added', !!d, JSON.stringify(d));
    ok('and it is exactly square', d && d.w === d.h && d.w >= 100, JSON.stringify(d));
    ok('and it is a JPEG', d && d.type === 'image/jpeg');
    ok('the overlay is gone and the camera is released', await p.evaluate(() => document.getElementById('camOv').classList.contains('hidden')) && await live(p) === 0);
    ok('no page errors', p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }

  console.log('2. cancel adds nothing and lets the camera go');
  {
    const p = await open(b, { width: 390, height: 844 }, ['camera']);
    const before = await p.evaluate(() => Object.values(draft.positions).flatMap(x => x.photos || []).length);
    await p.evaluate(() => { window.__tracks = []; const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async c => { const s = await g(c); s.getTracks().forEach(t => window.__tracks.push(t)); return s; }; window.__st = undefined; window.__tp = takePhoto().then(x => { window.__st = 'done'; }, e => { window.__st = 'err:' + e.message; }); });
    await p.waitForSelector('#camOv:not(.hidden)');
    await p.click('#camClose'); await p.waitForFunction(() => window.__st !== undefined, null, { timeout: 15000 });
    const after = await p.evaluate(() => Object.values(draft.positions).flatMap(x => x.photos || []).length);
    ok('no photograph was added', before === after, before + ' -> ' + after);
    ok('overlay closed, camera released', await p.evaluate(() => document.getElementById('camOv').classList.contains('hidden')) && await live(p) === 0);
    await p.context().close();
  }

  console.log("3. 'Phone camera' goes to the phone's own camera input");
  {
    const p = await open(b, { width: 390, height: 844 }, ['camera']);
    await p.evaluate(() => { window.__tracks = []; const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async c => { const s = await g(c); s.getTracks().forEach(t => window.__tracks.push(t)); return s; };
      window.__native = []; window.oneFileFrom = async id => { window.__native.push(id); return null; }; window.__st = undefined; window.__tp = takePhoto().then(x => { window.__st = 'done'; }, e => { window.__st = 'err:' + e.message; }); });
    await p.waitForSelector('#camOv:not(.hidden)');
    await p.click('#camNative'); await p.waitForFunction(() => window.__st !== undefined, null, { timeout: 15000 });
    ok("the native input named 'camera' was asked for the file", JSON.stringify(await p.evaluate(() => window.__native)) === '["camera"]');
    ok('and the app camera let go first', await live(p) === 0 && await p.evaluate(() => document.getElementById('camOv').classList.contains('hidden')));
    await p.context().close();
  }

  console.log('4. a refused permission goes straight to the phone camera, and is not asked again');
  {
    const p = await open(b, { width: 390, height: 844 }, []);
    await p.evaluate(() => { window.__asks = 0; navigator.mediaDevices.getUserMedia = async () => { window.__asks++; const e = new Error('no'); e.name = 'NotAllowedError'; throw e; };
      window.__native = []; window.oneFileFrom = async id => { window.__native.push(id); return null; }; });
    await p.evaluate(async () => { await takePhoto(); await takePhoto(); });
    const r = await p.evaluate(() => ({ asks: window.__asks, native: window.__native }));
    ok('the overlay never opened and the native camera was used both times', JSON.stringify(r.native) === '["camera","camera"]' && !(await p.evaluate(() => !document.getElementById('camOv').classList.contains('hidden'))), JSON.stringify(r));
    ok('the permission was asked once, not twice', r.asks === 1, String(r.asks));
    await p.context().close();
  }

  console.log('5. no camera API at all: the phone camera, and no error');
  {
    const p = await open(b, { width: 390, height: 844 }, []);
    await p.evaluate(() => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
      window.__native = []; window.oneFileFrom = async id => { window.__native.push(id); return null; }; });
    await p.evaluate(() => takePhoto());
    ok('went to the native input', JSON.stringify(await p.evaluate(() => window.__native)) === '["camera"]');
    ok('no page errors', p.errs.length === 0, p.errs.join(' | '));
    await p.context().close();
  }

  console.log('6. the machine photographs take the same square, through the machine input name');
  {
    const p = await open(b, { width: 390, height: 844 }, ['camera']);
    await p.evaluate(() => { window.chooseSource = async () => 'live'; window.__st = undefined; window.__tp = takeMachinePhoto('OVERVIEW').then(x => { window.__st = 'done'; }, e => { window.__st = 'err:' + e.message; }); });
    await p.waitForSelector('#camOv:not(.hidden)', { timeout: 8000 });
    await p.click('#camShutter'); await p.waitForFunction(() => window.__st !== undefined, null, { timeout: 15000 });
    const d = await p.evaluate(async () => { const g = (draft.positions[GEN_KEY] || {}).photos || []; if (!g.length) return null; const bm = await createImageBitmap(g[g.length - 1]); return { n: g.length, w: bm.width, h: bm.height }; });
    ok('an overview photograph was filed on the machine, square', !!d && d.w === d.h, JSON.stringify(d));
    await p.context().close();
  }

  console.log('7. Russian, on the screen itself');
  {
    const p = await open(b, { width: 390, height: 844 }, ['camera']);
    await p.evaluate(() => { document.querySelector('.lang button[data-lang="ru"]').click(); window.__st = undefined; window.__tp = takePhoto().then(x => { window.__st = 'done'; }, e => { window.__st = 'err:' + e.message; }); });
    await p.waitForSelector('#camOv:not(.hidden)');
    const tx = await p.evaluate(() => ({ hint: document.querySelector('.cam-hint').textContent, nat: document.getElementById('camNative').textContent, aria: document.getElementById('camShutter').getAttribute('aria-label') }));
    const cyr = x => /[А-Яа-яЁё]/.test(x);
    ok('hint, button and shutter label are Russian', cyr(tx.hint) && cyr(tx.nat) && cyr(tx.aria), JSON.stringify(tx));
    await p.click('#camClose'); await p.waitForFunction(() => window.__st !== undefined, null, { timeout: 15000 });
    await p.context().close();
  }

  console.log('8. quality: scaled once to the photo limit, one lossy pass, and the pixels are printed on the screen');
  for (const [label, px] of [['default limit', null], ['limit 800', '800'], ['Original (no limit)', '0']]) {
    const p = await open(b, { width: 390, height: 844 }, ['camera']);
    await p.evaluate(v => { if (v !== null) localStorage.setItem('up_px', v); else localStorage.removeItem('up_px');
      window.__re = []; const orig = window.reencode; window.reencode = async (blob, m) => { const r = await orig(blob, m); window.__re.push(r === blob); return r; };
      window.__st = undefined; window.__tp = takePhoto().then(() => { window.__st = 'done'; }, e => { window.__st = 'err:' + e.message; }); }, px);
    await p.waitForSelector('#camShutter:not([disabled])', { timeout: 8000 });
    const shown = await p.evaluate(() => document.getElementById('camRes').textContent);
    await p.click('#camShutter'); await p.waitForFunction(() => window.__st !== undefined, null, { timeout: 15000 });
    const r = await p.evaluate(async () => { const f = Object.values(draft.positions).flatMap(x => x.photos || []).slice(-1)[0]; const bm = await createImageBitmap(f);
      return { shot: window.__camShot, w: bm.width, h: bm.height, re: window.__re, lim: photoPx() }; });
    const want = (r.lim > 0 && r.shot.srcSide > r.lim) ? r.lim : r.shot.srcSide;
    ok(label + ': the camera gave ' + r.shot.vw + 'x' + r.shot.vh + ', saved ' + r.w + 'x' + r.h, r.w === want && r.h === want, JSON.stringify(r));
    ok(label + ': the screen said ' + want + ' px before the shot', shown.indexOf(String(want) + ' px') >= 0, JSON.stringify(shown));
    ok(label + ': the shrink handed the photograph back untouched (no second lossy pass)', r.lim === 0 ? r.re.length === 0 : (r.re.length >= 1 && r.re.every(x => x === true)), JSON.stringify(r.re));
    ok(label + ': encoded at the framed-photo quality, above the shrink quality', r.shot.q === 0.92 && r.shot.q > 0.78);
    await p.context().close();
  }

  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
