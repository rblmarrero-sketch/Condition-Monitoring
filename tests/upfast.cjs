/* Upload speed. Three levers, measured rather than asserted by inspection:
   the bytes leaving the phone, the order they leave in, and how many are in
   the air at once. The server on 8085 holds every request for a fixed 120 ms
   — the pit's round-trip, near enough — and reports what it saw. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8085';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
};
const dismiss = async p => { for (let i = 0; i < 3; i++) {
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(250); } else break; } };

/* A photograph the size and character a phone actually produces: broad shading
   with detail and grain on top. Pure noise would be JPEG's worst case and pure
   gradient its best, and either would make every ratio below a lie. */
const MAKE_BIG = `(async (w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#4b4136'); g.addColorStop(0.5, '#8d8377'); g.addColorStop(1, '#241f1a');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 900; i++) {                 // swarf on a plug, near enough
    x.fillStyle = 'rgba(' + (rnd()*255|0) + ',' + (rnd()*200|0) + ',' + (rnd()*160|0) + ',0.75)';
    x.beginPath(); x.arc(rnd()*w, rnd()*h, 2 + rnd()*26, 0, 6.284); x.fill();
  }
  const img = x.getImageData(0, 0, w, h), d = img.data;   // sensor grain
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    d[i] += n; d[i+1] += n; d[i+2] += n;
  }
  x.putImageData(img, 0, 0);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
})`;

const dims = `(async (blob) => {
  const b = await createImageBitmap(blob);
  const o = { w: b.width, h: b.height, type: blob.type, size: blob.size };
  b.close && b.close(); return o;
})`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));

  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify([
    /* A template nobody ships, so this stays a test of "a folder someone chose
       is honoured" and does not accidentally become a test of the one-time
       upgrade, which rewrites the built-in strings and only those. */
    { id: 'gas',  on: true,  url: u,                      sec: '', folder: 'Uploads/{TYPE}/{YYYY-MM}' },
    { id: 'pa',   on: false, url: 'https://off.invalid/', sec: '', folder: '' },
    { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
  ])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);

  /* ---------------------------------------------------------------- 1 */
  console.log('what the phone does with a photograph, unasked');
  ok('nothing stored means Medium, not Original',
     await p.evaluate(() => photoPx()) === 1600, String(await p.evaluate(() => photoPx())));
  ok('and ⚙ shows Medium selected, so the menu matches the behaviour',
     await p.evaluate(() => { openSettings(); return document.getElementById('upPx').value; }) === '1600');
  await p.evaluate(() => document.getElementById('setOv').classList.add('hidden'));

  const shrunk = await p.evaluate(async ([mk, dm]) => {
    const big = await eval(mk)(3200, 2400);
    const small = await intake(big);
    return { big: await eval(dm)(big), small: await eval(dm)(small) };
  }, [MAKE_BIG, dims]);
  ok('a 3200 px camera frame comes down to 1600 px',
     Math.max(shrunk.small.w, shrunk.small.h) === 1600, shrunk.small.w + '×' + shrunk.small.h);
  ok('it is still a JPEG', shrunk.small.type === 'image/jpeg', shrunk.small.type);
  ok('and it is a fraction of the size', shrunk.small.size < shrunk.big.size / 3,
     Math.round(shrunk.big.size / 1024) + ' KB → ' + Math.round(shrunk.small.size / 1024) + ' KB');

  const already = await p.evaluate(async (mk) => {
    const s = await eval(mk)(700, 520);
    const out = await intake(s);
    return { same: out === s, size: s.size };
  }, MAKE_BIG);
  ok('one that is already small is handed back untouched, not re-encoded',
     already.same, Math.round(already.size / 1024) + ' KB');

  /* ---------------------------------------------------------------- 2 */
  console.log('\nthe choices that are still available');
  const orig = await p.evaluate(async (mk) => {
    localStorage.setItem('up_px', '0');
    const big = await eval(mk)(3200, 2400);
    const out = await intake(big);
    const r = { same: out === big, px: photoPx(), shown: (openSettings(), document.getElementById('upPx').value) };
    document.getElementById('setOv').classList.add('hidden');
    localStorage.removeItem('up_px');
    return r;
  }, MAKE_BIG);
  ok('Original still means original — nothing is re-encoded', orig.same && orig.px === 0);
  ok('and ⚙ shows it selected', orig.shown === '0', orig.shown);

  const slow = await p.evaluate(() => {
    const had = Object.getOwnPropertyDescriptor(navigator, 'connection');
    Object.defineProperty(navigator, 'connection', { value: { effectiveType: '2g' }, configurable: true });
    const r = { px: photoPx(), lanes: uploadLanes(), shown: (openSettings(), document.getElementById('upPx').value) };
    document.getElementById('setOv').classList.add('hidden');
    if (had) Object.defineProperty(navigator, 'connection', had); else delete navigator.connection;
    return r;
  });
  ok('on a 2g link the phone goes smaller by itself', slow.px === 1280, String(slow.px));
  ok('and stops sending three at a time, which would only time out', slow.lanes === 1, String(slow.lanes));
  ok('without the settings menu appearing to change itself', slow.shown === '1600', slow.shown);

  /* ---------------------------------------------------------------- 3 */
  console.log('\nthe capture path is wired to it');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '6100');

  const viaInput = await p.evaluate(async (mk) => {
    const big = await eval(mk)(3200, 2400);
    const f = new File([big], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer(); dt.items.add(f);
    const el = document.getElementById('camera');
    el.files = dt.files;
    await el.onchange({ target: el });            // the real handler, not a copy
    const kept = (curP().photos || [])[0];
    return { orig: big.size, kept: kept ? kept.size : 0, n: (curP().photos || []).length };
  }, MAKE_BIG);
  ok('a photograph taken through the camera input is shrunk on the way in',
     viaInput.n === 1 && viaInput.kept > 0 && viaInput.kept < viaInput.orig / 3,
     Math.round(viaInput.orig / 1024) + ' KB → ' + Math.round(viaInput.kept / 1024) + ' KB');
  ok('so the phone is not storing the full frame either', viaInput.kept < 400 * 1024,
     Math.round(viaInput.kept / 1024) + ' KB held in the record');

  /* three more photographs on other positions, so the round is worth timing */
  const total = await p.evaluate(async (mk) => {
    const big = await eval(mk)(3200, 2400);
    let raw = big.size, kept = 0;
    const ks = items().map(i => i.k);
    for (let n = 0; n < 4; n++) {
      curItem = ks[n % ks.length]; loadPos();
      const pp = curP(); (pp.photos ||= []);
      if (pp.photos.length >= 4) continue;
      const s = await intake(new File([big], 'IMG.jpg', { type: 'image/jpeg' }));
      pp.photos.push(s); kept += s.size;
      pp.grade = 'C'; pp.sev = 'DEG'; pp.defect = 'DT14-03'; pp.cause = 'CA-WEAR'; pp.action = 'RA-04'; pp.prio = 'P2';
      saveCur();
    }
    return { raw, kept };
  }, MAKE_BIG);

  await p.evaluate(u => fetch(u + '/__reset'), B);
  await p.waitForTimeout(200);

  /* ---------------------------------------------------------------- 4 */
  console.log('\nwhat leaves the phone, and in what order');
  await p.click('#saveBtn'); await p.waitForTimeout(600); await dismiss(p);
  await p.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      if (!(await dbAll()).filter(r => !r.up).length) return;
      await new Promise(r => setTimeout(r, 400));
    }
  });
  const seen = await p.evaluate(async (u) => (await (await fetch(u + '/__log')).json()), B);

  ok('every file of the round arrived', seen.log.length >= 5, seen.log.length + ' files');
  if (!seen.log.length) { console.log('\nFAILURES:\n' + fails.join('\n')); await b.close(); process.exit(1); }
  ok('the sidecar went first — the dashboard has the round before the photos land',
     /\.json$/.test(seen.log[0].name), seen.log[0].name);
  ok('and it went on its own, so the folder exists before the rest arrive',
     seen.log[0].alone === true);
  ok('the photographs then overlap instead of queueing one behind the other',
     seen.maxInFlight >= 2, 'up to ' + seen.maxInFlight + ' in flight');
  ok('but never more than three', seen.maxInFlight <= 3, String(seen.maxInFlight));

  const jpg = seen.log.filter(f => /\.jpg$/.test(f.name));
  const wire = jpg.reduce((a, f) => a + f.bytes, 0);
  ok('all five photographs went out', jpg.length === 5, String(jpg.length));
  ok('carrying a fraction of what the camera produced',
     wire < total.raw * jpg.length / 5,
     Math.round(total.raw * jpg.length / 1024) + ' KB at full size → ' + Math.round(wire / 1024) + ' KB sent'
     + ' (' + (total.raw * jpg.length / wire).toFixed(1) + '× less)');
  ok('the folder template was honoured', /^Uploads\/MP\/\d{4}-\d{2}$/.test(seen.log[0].folder), seen.log[0].folder);

  /* ---------------------------------------------------------------- 5 */
  console.log('\nnobody was asked to do anything');
  const bar = ((await p.textContent('#syncBar')) || '').replace(/\s+/g, ' ').trim();
  ok('the round went up on its own and the bar just says so',
     /synced|отправлено/i.test(bar) && !/press|tap|нажм/i.test(bar), bar.slice(0, 70));

  await b.close();
  console.log(fails.length ? '\nFAILURES:\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})();
