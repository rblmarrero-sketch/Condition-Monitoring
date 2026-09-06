/* THE CAMERA ROW ON THE READINESS CARD — Phase 6.

   A phone that lists a camera, or has granted it, gets a green row; a phone
   that lists its devices and has no camera gets an amber one; a browser that
   cannot say gets no row — the card never claims what it cannot verify.

   Run: node tests/camready.cjs   [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = process.argv[2] || process.env.CMPHONE || '8093';
const M = 'http://127.0.0.1:' + PORT + '/mobile/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const cyr = x => /[А-Яа-яЁё]/.test(x);
const rowOf = p => p.evaluate(async () => { await yardCheck(); const r = (window.__yard.rows || []).find(x => x.key === 'camera'); return r ? { k: r.k, title: r.title, text: r.text } : null; });
(async () => {
  console.log('1. A PHONE WITH A CAMERA');
  {
    const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] });
    await ctx.addInitScript(() => { localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', url: 'http://127.0.0.1:9/exec', on: 1 }])); localStorage.setItem('cm_lang', 'en'); });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(M, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => cameraState());
    ok('the phone says it has a camera', st.k === 'ok', JSON.stringify(st));
    const r = await rowOf(p);
    ok('  and the card has a green Camera row', r && r.k === 'ok' && r.title === 'Camera' && /Photographs/.test(r.text), JSON.stringify(r));
    await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(300);
    const rr = await rowOf(p);
    ok('  in Russian too', rr && cyr(rr.title) && cyr(rr.text), JSON.stringify(rr));
    ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');
    await b.close();
  }
  console.log('\n2. A BROWSER THAT CANNOT SAY');
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', url: 'http://127.0.0.1:9/exec', on: 1 }])); localStorage.setItem('cm_lang', 'en');
      /* no devices listed at all, permission never asked */
      Object.defineProperty(navigator, 'mediaDevices', { value: { enumerateDevices: async () => [] }, configurable: true }); });
    const p = await ctx.newPage();
    await p.goto(M, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => cameraState());
    const r = await rowOf(p);
    ok('an empty device list is "unknown", and the card says nothing about the camera', st.k === 'unknown' && r === null, JSON.stringify({ st, r }));
    await b.close();
  }
  console.log('\n3. A PHONE THAT LISTS A MICROPHONE AND NO CAMERA — BEFORE ANY GRANT, THAT IS NOT "NO CAMERA"');
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', url: 'http://127.0.0.1:9/exec', on: 1 }])); localStorage.setItem('cm_lang', 'en');
      Object.defineProperty(navigator, 'mediaDevices', { value: { enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'x', label: '' }] }, configurable: true }); });
    const p = await ctx.newPage();
    await p.goto(M, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => cameraState());
    const r = await rowOf(p);
    const v = await p.evaluate(() => window.__yard.v);
    ok('a list without a camera is still "unknown" — browsers hide the camera until a grant — and the card says nothing', st.k === 'unknown' && r === null, JSON.stringify({ st, r, v: v.k }));
    await b.close();
  }
  console.log('\n4. A PHONE THAT WAS ASKED AND SAID NO');
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', url: 'http://127.0.0.1:9/exec', on: 1 }])); localStorage.setItem('cm_lang', 'en'); localStorage.setItem('cm_cam_asked', '1');
      Object.defineProperty(navigator, 'permissions', { value: { query: async () => ({ state: 'denied' }) }, configurable: true }); });
    const p = await ctx.newPage();
    await p.goto(M, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => cameraState());
    const r = await rowOf(p);
    const v = await p.evaluate(() => window.__yard.v);
    ok('a refusal after the scanner asked is an amber row that names Settings and the scanner', st.k === 'denied' && r && r.k === 'warn' && /Settings/.test(r.text) && /scanning/.test(r.text), JSON.stringify({ st, r }));
    ok('  and the verdict is not green', v.k !== 'ok', JSON.stringify(v));
    await b.close();
  }
  console.log('\n5. THE SAME ANSWER FROM A PHONE THAT WAS NEVER ASKED IS NOT A REFUSAL');
  {
    const b = await chromium.launch();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', url: 'http://127.0.0.1:9/exec', on: 1 }])); localStorage.setItem('cm_lang', 'en'); localStorage.removeItem('cm_cam_asked');
      Object.defineProperty(navigator, 'permissions', { value: { query: async () => ({ state: 'denied' }) }, configurable: true });
      Object.defineProperty(navigator, 'mediaDevices', { value: { enumerateDevices: async () => [] }, configurable: true }); });
    const p = await ctx.newPage();
    await p.goto(M, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const st = await p.evaluate(() => cameraState());
    const r = await rowOf(p);
    ok('"denied" before any question is "cannot say", and the card says nothing', st.k === 'unknown' && r === null, JSON.stringify({ st, r }));
    await b.close();
  }
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
