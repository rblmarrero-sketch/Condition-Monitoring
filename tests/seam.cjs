/* Phase 1 — the seam between the web app and a native shell.

   The thing being protected here is not a feature, it is a property: the app
   must behave identically whether it is a browser tab, a home-screen PWA, or
   the same HTML inside a Capacitor container. So this suite runs the same
   checks twice — once as the web, once with a fake Capacitor bridge installed —
   and insists the observable result matches.

   A fake bridge is the honest way to test this here. The real one only exists
   inside a built app on a device; what CAN be verified without a phone is that
   the seam calls the plugin when there is one, falls back when there is not,
   and hands the rest of the app the same shapes in both cases. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* A stand-in for the Capacitor bridge: enough of the real shape that native.js
   cannot tell, and instrumented so the test can see what was called. */
const FAKE_BRIDGE = () => {
  const calls = [];
  const px = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  window.__calls = calls;
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: {
      Camera: {
        getPhoto: async (o) => { calls.push(['Camera.getPhoto', o]); return { base64String: px, format: 'png' }; },
        /* The platform library picker. Hands back more than one, the way a real
           one does when the inspector shot the crack from four angles. */
        pickImages: async (o) => { calls.push(['Camera.pickImages', o]);
          const n = Math.min(3, o && o.limit || 3);
          return { photos: Array.from({length:n}, () => ({ base64String: px, format: 'png' })) }; },
      },
      Geolocation: {
        getCurrentPosition: async (o) => { calls.push(['Geolocation', o]);
          return { coords: { latitude: 68.04213, longitude: 167.33184, accuracy: 4 } }; },
      },
      Network: {
        getStatus: async () => { calls.push(['Network.getStatus']); return { connected: true, connectionType: 'cellular' }; },
        addListener: (ev, fn) => { calls.push(['Network.addListener', ev]);
          window.__fireNet = (connected, t) => fn({ connected, connectionType: t || 'wifi' });
          return { remove() {} }; },
      },
      Filesystem: {
        writeFile: async (o) => { calls.push(['Filesystem.writeFile', o.path]); return { uri: 'file:///tmp/' + o.path }; },
        readFile: async (o) => { calls.push(['Filesystem.readFile', o.path]); return { data: px }; },
        deleteFile: async (o) => { calls.push(['Filesystem.deleteFile', o.path]); },
      },
      Share: {
        share: async (o) => { calls.push(['Share.share', (o.files || [])[0]]); },
      },
      App: {
        addListener: (ev, fn) => { calls.push(['App.addListener', ev]);
          window.__fireUrl = (url) => fn({ url }); return { remove() {} }; },
        getLaunchUrl: async () => null,
      },
    },
  };
};

async function boot(ctx, native) {
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  if (native) await p.addInitScript(FAKE_BRIDGE);
  await p.addInitScript(() => { window.__galleryClicks = 0; addEventListener('DOMContentLoaded', () => {
    const g = document.getElementById('gallery'); if (g) g.click = () => { window.__galleryClicks++; }; }); });
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  for (const native of [false, true]) {
    const what = native ? 'inside the shell' : 'in a browser';
    console.log('\n  ' + what);
    const p = await boot(ctx, native);

    ok(what + ': the seam loaded', await p.evaluate(() => !!window.CMNative));
    const where = await p.evaluate(() => CMNative.where());
    ok(what + ': and knows where it is', where.native === native, where.label);

    // photograph — same shape, whichever path
    await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(250);
    await p.evaluate(() => selectEquip('TK151'));
    await p.waitForTimeout(400);

    if (native) {
      await p.evaluate(() => { const k = items()[0].k; curItem = k; loadPos(); });
      /* Add photo asks where it comes from before it does anything — the shell
         has two real sources and neither is the escape hatch. Choose the live
         one; the picker gets its own check below. */
      await p.click('#takeBtn');
      await p.waitForTimeout(200);
      const asked = await p.evaluate(() => document.getElementById('srcDlg').open);
      ok(what + ': the shutter asks live or gallery first', asked === true, String(asked));
      await p.click('#srcLive');
      await p.waitForTimeout(500);
      const shot = await p.evaluate(() => ({
        n: (curP().photos || []).length,
        isBlob: (curP().photos || [])[0] instanceof Blob,
        type: ((curP().photos || [])[0] || {}).type,
        called: window.__calls.filter(c => c[0] === 'Camera.getPhoto').length,
        opts: (window.__calls.find(c => c[0] === 'Camera.getPhoto') || [])[1],
      }));
      ok(what + ': the shutter goes to the platform camera', shot.called === 1, String(shot.called));
      ok(what + ': and asks it to fix the orientation',
        shot.opts && shot.opts.correctOrientation === true, JSON.stringify(shot.opts));
      ok(what + ': what comes back is a Blob, like everywhere else',
        shot.n === 1 && shot.isBlob, shot.n + ' / ' + shot.type);

      /* The other half of the same button. A photograph taken on the walk back,
         before the app would open, has to reach the record — and inside the
         shell that means the platform picker, not the WebView file input, which
         loses the orientation and takes them one at a time. */
      await p.click('#takeBtn');
      await p.waitForTimeout(200);
      await p.click('#srcGal');
      await p.waitForTimeout(700);
      const gal = await p.evaluate(() => ({
        n: (curP().photos || []).length,
        allBlobs: (curP().photos || []).every(x => x instanceof Blob),
        called: window.__calls.filter(c => c[0] === 'Camera.pickImages').length,
        opts: (window.__calls.find(c => c[0] === 'Camera.pickImages') || [])[1],
        input: window.__galleryClicks || 0,
      }));
      ok(what + ': From gallery goes to the platform picker', gal.called === 1, String(gal.called));
      ok(what + ': and not to the file input behind it', gal.input === 0, String(gal.input));
      ok(what + ': it asks for only the room that is left',
        gal.opts && gal.opts.limit === 9, JSON.stringify(gal.opts));
      ok(what + ': several arrive at once, all of them Blobs',
        gal.n === 4 && gal.allBlobs, gal.n + ' photos');
    } else {
      const wired = await p.evaluate(() => typeof takePhoto === 'function'
        && !!document.getElementById('camera'));
      ok(what + ': the file input is still the implementation', wired);
    }

    // GPS — same shape
    const g = await p.evaluate(async () => { const r = await getGps(true); return r && { lat: r.lat, acc: r.acc }; });
    if (native) {
      ok(what + ': GPS came from the plugin', g && Math.abs(g.lat - 68.04213) < 1e-6, JSON.stringify(g));
      ok(what + ': and was recorded', await p.evaluate(() => !!gps && !!gps.at));
    } else {
      ok(what + ': GPS is asked for and answered or refused, not crashed',
        g === null || typeof g.lat === 'number', JSON.stringify(g));
    }

    // network
    const net = await p.evaluate(async () => await CMNative.net.status());
    ok(what + ': the network can be asked', typeof net.online === 'boolean',
      net.type + (net.real ? ' (from the OS)' : ' (navigator.onLine)'));
    if (native) ok(what + ': and the answer is the real one, not navigator.onLine', net.real === true);

    // deep link
    await p.evaluate(() => selectEquip('TK146'));
    await p.waitForTimeout(300);
    if (native) {
      await p.evaluate(() => window.__fireUrl && window.__fireUrl('cm://unit/TK151?type=MP'));
      await p.waitForTimeout(600);
      ok(what + ': cm://unit/TK151 lands on that machine',
        await p.evaluate(() => curEquip) === 'TK151', await p.evaluate(() => curEquip));
    }
    await p.close();
  }

  console.log('\n  the query-string form works everywhere, shell or not');
  for (const native of [false, true]) {
    const p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
    if (native) await p.addInitScript(FAKE_BRIDGE);
  await p.addInitScript(() => { window.__galleryClicks = 0; addEventListener('DOMContentLoaded', () => {
    const g = document.getElementById('gallery'); if (g) g.click = () => { window.__galleryClicks++; }; }); });
    await p.goto(B + '/mobile/index.html?unit=TK149&type=MP', { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({ unit: curEquip, type: type, clean: location.search === '' }));
    ok((native ? 'shell' : 'browser') + ': ?unit=TK149 opens TK149', r.unit === 'TK149', r.unit);
    ok((native ? 'shell' : 'browser') + ': and the type came with it', r.type === 'MP', r.type);
    ok((native ? 'shell' : 'browser') + ': the parameter does not linger', r.clean);
    await p.close();
  }

  console.log('\n  a shell with the plugins missing still works');
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  // says it is native, offers nothing — the worst case, and it must not crash
  await p.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} }; });
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(600);
  ok('the app still starts', await p.evaluate(() => !!document.getElementById('saveBtn')));
  ok('the network falls back rather than throwing',
    await p.evaluate(async () => { const s = await CMNative.net.status(); return typeof s.online === 'boolean' && s.real === false; }));
  ok('GPS falls back to the browser',
    await p.evaluate(async () => { const g = await CMNative.geo.here(1200); return g === null || typeof g.lat === 'number'; }));
  ok('and the camera falls back to the file input',
    await p.evaluate(() => typeof takePhoto === 'function'));
  await p.close();

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
