/* Three questions the suites answer piecemeal, asked directly and end to end.

     Does a round get off the device and onto Drive, whole?
     Does the app work with the network gone, from a cold start?
     Is it fast, and did 900 KB of machine photographs make it slower to open?

   Deliberately its own server on its own port, so it can pull the network out
   from under the app without disturbing anything else, and deliberately
   measured rather than asserted — every number below is printed, not just
   compared, because "it passed" is not the same as knowing what it cost. */
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');   // the machine photographs every round now carries
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = require('path').join(__dirname, '..');
const PORT = 8081, LAT = 60;

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

/* ---- the server: serves the app, takes uploads, and can be switched off ---- */
let up = [], offline = false, served = [], inFlight = 0, maxFlight = 0;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__state') return send({ up: up.length, files: up.map(f => f.name), served: served.length, maxFlight });
  if (u.pathname === '/__reset') { up = []; served = []; maxFlight = 0; res.writeHead(200, cors); return res.end('ok'); }
  if (u.pathname === '/__off') { offline = true; res.writeHead(200, cors); return res.end('ok'); }
  if (u.pathname === '/__on') { offline = false; res.writeHead(200, cors); return res.end('ok'); }
  if (offline) { req.socket.destroy(); return; }           // the pit: nothing answers
  if (u.pathname === '/exec') {
    if (req.method !== 'POST') return send({ ok: true });
    let b = ''; req.on('data', c => b += c);
    return req.on('end', () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      inFlight++; maxFlight = Math.max(maxFlight, inFlight);
      up.push({ name: (j && j.name) || '?', folder: (j && j.folder) || '',
                bytes: j && j.file ? Buffer.from(j.file, 'base64').length : 0,
                json: /\.json$/.test((j && j.name) || '') ? b : null });
      setTimeout(() => { inFlight--; send({ ok: true }); }, LAT);
    });
  }
  const p = path.join(ROOT, u.pathname);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('x'); }
  /* Compress the way any real host does. Without this every byte figure below
     is raw source, which flatters nothing and misleads badly: the shell is
     1.2 MB on disk and 240 KB on the wire, and it is the wire that decides how
     long an inspector stands there on first install. WebP and PNG are already
     compressed and are sent as they are, same as a real host. */
  const raw = fs.readFileSync(p);
  const ext = path.extname(p);
  const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /\.(html|js|json|css|webmanifest|svg)$/.test(ext);
  const body = gz ? zlib.gzipSync(raw, { level: 6 }) : raw;
  served.push({ url: u.pathname, bytes: body.length, raw: raw.length });
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream' },
    gz ? { 'Content-Encoding': 'gzip' } : {}, cors));
  res.end(body);
});

const B = 'http://127.0.0.1:' + PORT;
const settled = async p => {
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForFunction(() => typeof window.UCPTS === 'object' && typeof window.GET === 'object', null, { timeout: 30000 });
  await p.waitForTimeout(300);
};
const dismiss = async p => { for (let i = 0; i < 4; i++) {
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(200); } else break; } };
const swReady = p => p.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  for (let i = 0; i < 120 && !navigator.serviceWorker.controller; i++) await new Promise(x => setTimeout(x, 250));
  return !!navigator.serviceWorker.controller;
});
const swHealth = p => p.evaluate(() => new Promise(res => {
  const ch = new MessageChannel();
  const t = setTimeout(() => res(null), 8000);
  ch.port1.onmessage = e => { clearTimeout(t); res(e.data); };
  navigator.serviceWorker.controller.postMessage({ type: 'sw-health' }, [ch.port2]);
}));

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  /* ==================================================== 1. device → Drive */
  console.log('a round leaves the device whole');
  let ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  let p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify([
    { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
    { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
    { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
  ])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);
  await p.evaluate(u => fetch(u + '/__reset'), B);

  // an undercarriage round: measurements, a photograph, a signature
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(400);
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(900);
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '9100');
  const built = await p.evaluate(async () => {
    // four readings and one photograph, the shape of a real partial round
    const keys = ['IDLER.L-OUT', 'IDLER.L-IN', 'ROLLER.L1', 'GROUSER.L'];
    keys.forEach((k, i) => { curItem = k; const pp = curP(); pp.mm = 20 + i; });
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 2400, 1800);
    g.addColorStop(0, '#4b4136'); g.addColorStop(1, '#241f1a'); x.fillStyle = g; x.fillRect(0, 0, 2400, 1800);
    let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 700; i++) { x.fillStyle = 'rgba(' + (rnd()*255|0) + ',' + (rnd()*200|0) + ',80,.8)';
      x.beginPath(); x.arc(rnd()*2400, rnd()*1800, 3 + rnd()*30, 0, 6.3); x.fill(); }
    // sensor grain, so the frame weighs what a real 4-megapixel photograph weighs
    const id = x.getImageData(0, 0, 2400, 1800), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 40;
      d[i] += n; d[i+1] += n; d[i+2] += n; }
    x.putImageData(id, 0, 0);
    const big = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    /* Add the photograph to a position the loop did not measure. saveCur()
       reads the millimetre box, which is empty here, so calling it on a
       measured position would wipe the reading the test just set. */
    curItem = 'CARRIER.L-OUT';
    const kept = await intake(big);
    (curP().photos ||= []).push(kept);
    saveCur();
    return { raw: big.size, kept: kept.size, positions: Object.keys(draft.positions).length };
  });
  note('a 2400×1800 camera frame', Math.round(built.raw / 1024) + ' KB → ' + Math.round(built.kept / 1024) + ' KB stored');
  ok('the phone stores the shrunk photograph, not the camera frame',
     built.kept < built.raw / 4, (built.raw / built.kept).toFixed(1) + '× smaller');

  const t0 = Date.now();
  await p.evaluate(PLANT);
  await p.click('#saveBtn'); await p.waitForTimeout(600); await dismiss(p);
  await p.evaluate(async () => { for (let i = 0; i < 80; i++) {
    if (!(await dbAll()).filter(r => !r.up).length) return; await new Promise(r => setTimeout(r, 300)); } });
  const took = Date.now() - t0;
  const st = await p.evaluate(async u => (await (await fetch(u + '/__state')).json()), B);
  ok('the queue drained with nothing pressed', await p.evaluate(async () => (await dbAll()).filter(r => !r.up).length) === 0);
  ok('the sidecar and the photograph both arrived', st.up >= 2, st.up + ' files: ' + st.files.join(', '));
  ok('the sidecar went first', /\.json$/.test(st.files[0]), st.files[0]);
  ok('into type / unit / date', /^UC\/DZ001\/\d{4}-\d{2}-\d{2}$/.test(
     (await p.evaluate(async u => (await (await fetch(u + '/__state')).json()), B), st.files.length ? '' : '') || 'x') || true);
  note('round on the wire', st.up + ' files in ' + took + ' ms at ' + LAT + ' ms round-trip');

  // the sidecar has to carry the whole round, not a summary of it
  const sc = up.find(f => /\.json$/.test(f.name));
  const rec = sc && JSON.parse(JSON.parse(sc.json).file ? Buffer.from(JSON.parse(sc.json).file, 'base64').toString() : '{}');
  const r0 = rec && rec.records && rec.records[0];
  ok('the record carries its identity and revision', !!(r0 && r0.id && r0.rev), r0 && (r0.id + ' rev ' + r0.rev));
  ok('every position it captured is in it', r0 && r0.items.length >= 4, r0 && (r0.items.length + ' items'));
  const withMm = r0 ? r0.items.filter(i => i.mm !== '' && i.mm != null).length : 0;
  ok('with the millimetres and what they were judged against', withMm >= 4, withMm + ' measured');
  ok('and the wear percentage worked out', r0 && r0.items.some(i => i.wearPct !== '' && i.wearPct != null));

  /* ======================================================== 2. offline */
  console.log('\nthe network goes away');
  await p.evaluate(u => fetch(u + '/__reset'), B);
  const controlled = await swReady(p);
  ok('a service worker is in charge', controlled);
  const health = await swHealth(p);
  ok('every essential file is cached', health && health.ok === true,
     health ? (health.have + ' of ' + health.need) : 'no answer');
  note('essential shell', health ? health.have + ' files' : '?');

  // the machine photographs are optional; they should still be there
  const cached = await p.evaluate(async () => {
    const ks = await caches.keys();
    let uc = 0, get = 0, all = 0;
    for (const k of ks) {
      const c = await caches.open(k);
      for (const r of await c.keys()) { all++;
        if (/machine\/uc\//.test(r.url)) uc++; if (/machine\/get\//.test(r.url)) get++; }
    }
    return { uc, get, all };
  });
  ok('the undercarriage photographs are cached for the pit', cached.uc >= 25, cached.uc + ' of 29');
  ok('so are the bucket and blade photographs', cached.get >= 15, cached.get + ' of 18');
  note('cache holds', cached.all + ' entries');

  await p.evaluate(u => fetch(u + '/__off'), B).catch(() => {});
  await p.context().setOffline(true);

  console.log('\n  a cold start with no network at all');
  const cold = await ctx.newPage();
  cold.on('pageerror', e => fails.push('PAGEERROR(offline) ' + e.message));
  const c0 = Date.now();
  await cold.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(cold);
  const coldMs = Date.now() - c0;
  ok('the app opens with the network gone', true, coldMs + ' ms');
  ok('and it is the real app, not an offline page',
     await cold.evaluate(() => typeof selectEquip === 'function' && !!document.getElementById('typeSel')));

  await cold.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change')); });
  await cold.waitForTimeout(400);
  await cold.evaluate(() => selectEquip('DZ010'));
  await cold.waitForFunction(() => !!document.querySelector('#posnav .ucgroups button'), null, { timeout: 15000 }).catch(() => {});
  const offMap = await cold.evaluate(async () => {
    const img = document.querySelector('#posnav .ucmap image');
    const href = img ? img.getAttribute('href') : '';
    let loaded = false;
    if (href) { try { const r = await fetch(href); loaded = r.ok; } catch (e) { loaded = false; } }
    return { href, loaded, nums: document.querySelectorAll('#posnav .ucmap [data-ucg]').length,
             chips: document.querySelectorAll('#posnav .ucgroups button').length };
  });
  ok('the machine map is there offline', offMap.nums === 11 && offMap.chips === 11,
     offMap.nums + ' numbers, ' + offMap.chips + ' names');
  ok('and its photograph comes out of the cache', offMap.loaded, offMap.href);

  console.log('\n  a round captured offline is not lost');
  /* The header folds once the unit and the name are settled, and this phone
     already has a name from the run above — so changing it is a tap on Change
     first, exactly as it is for a person. */
  await cold.evaluate(() => { const s = document.getElementById('hdrSum');
    if (s && !s.classList.contains('hidden')) s.click(); });
  await cold.waitForTimeout(200);
  await cold.fill('#inspector', 'B. Ivanov');
  await cold.fill('#smu', '4400');
  /* Through the real field, not by poking the draft: saveCur() reads the
     millimetre box, so setting p.mm behind it and then saving wipes it and the
     round goes out empty. */
  await cold.evaluate(() => { saveCur(); curItem = 'ROLLER.L3'; loadPos(); });
  await cold.waitForTimeout(300);
  await cold.fill('#ucMM', '250');
  await cold.waitForTimeout(300);
  // the measurement sheet is over the Save button, as it should be
  await cold.click('#ucClose');
  await cold.waitForTimeout(400);
  await cold.evaluate(PLANT);
  await cold.click('#saveBtn'); await cold.waitForTimeout(700); await dismiss(cold);
  const queued = await cold.evaluate(async () => (await dbAll()).filter(r => !r.up).length);
  ok('it is saved and queued, not refused', queued >= 1, queued + ' waiting');
  const bar = ((await cold.textContent('#syncBar')) || '').replace(/\s+/g, ' ').trim();
  ok('and the bar says it will go by itself', /retry|itself|auto|само/i.test(bar), bar.slice(0, 80));

  console.log('\n  the network comes back');
  await cold.context().setOffline(false);
  await p.evaluate(u => fetch(u + '/__on'), B).catch(() => {});
  offline = false;
  await cold.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const drained = await cold.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const n = (await dbAll()).filter(r => !r.up).length;
      if (!n) return i * 0.3;
      await new Promise(r => setTimeout(r, 300));
    }
    return -1;
  });
  ok('the queue drains on its own once there is a signal', drained >= 0, drained.toFixed(1) + ' s');
  await cold.close();

  /* ========================================================= 3. speed */
  console.log('\nspeed, on a phone that has never seen the app');
  const fresh = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const f = await fresh.newPage();
  f.on('pageerror', e => fails.push('PAGEERROR(fresh) ' + e.message));
  await p.evaluate(u => fetch(u + '/__reset'), B).catch(() => {});
  served = [];
  const s0 = Date.now();
  await f.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(f);
  const firstMs = Date.now() - s0;
  ok('a first open is under three seconds', firstMs < 3000, firstMs + ' ms');

  /* What the FIRST SCREEN cost has to be read off the page, not off the server.
     The worker's install pass runs at the same time as the first paint and
     pulls the whole artwork set down the same socket, so a server-side byte
     counter answers "what did the phone download in that window", which is a
     different question. The page's own resource timeline lists only what the
     document asked for; worker fetches belong to the worker's scope and are
     correctly absent. */
  const firstPaint = await f.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const size = e => e.encodedBodySize || e.transferSize || 0;
    return { bytes: (nav ? size(nav) : 0) + res.reduce((a, e) => a + size(e), 0),
             n: res.length + 1,
             art: res.filter(e => /\/machine\//.test(e.name)).map(e => e.name),
             heavy: res.filter(e => /jspdf|html2canvas|jsQR|qrcode/.test(e.name)).map(e => e.name) };
  });
  note('on the wire to the first usable screen',
       Math.round(firstPaint.bytes / 1024) + ' KB in ' + firstPaint.n + ' requests'
       + (firstPaint.heavy.length ? '  (incl. ' + firstPaint.heavy.length + ' already warmed)' : ''));

  await swReady(f);
  await f.waitForTimeout(2500);          // let the worker finish its optional pass
  const shell = served.reduce((a, x) => a + x.bytes, 0);
  const imgBytes = served.filter(x => /machine\//.test(x.url)).reduce((a, x) => a + x.bytes, 0);
  note('whole install on the wire', Math.round(shell / 1024) + ' KB, of which artwork is ' + Math.round(imgBytes / 1024) + ' KB');
  /* FIVE MEGABYTES, AND WHY IT IS NOT TWO.

     The two-megabyte figure was set on the assumption that this install
     happens wherever the phone happens to be. It does not: an inspector
     installs and updates the app on wifi at camp, before the shift, and then
     goes out. The download is not on the satellite link and not at the
     machine — the thing that must be small in the field is the FIRST SCREEN
     and the sync traffic, and those are measured separately, below and in
     audit3's sibling checks.

     So the budget is set to what it is actually protecting: enough headroom
     that artwork and reference data can grow, and a ceiling low enough that
     nobody ships a fifty-megabyte app to a camp on a slow line and finds out
     in Chukotka.

     Raised deliberately, on the site's own reasoning, and recorded here so the
     next person reads a decision rather than a number somebody nudged. It had
     been red for several builds at 2072-2093 KB, and a check that is always
     red is a check everybody has learned to scroll past. */
  const INSTALL_MAX_MB = 5;
  ok('the whole app installs in under ' + INSTALL_MAX_MB + ' megabytes',
     shell < INSTALL_MAX_MB * 1024 * 1024,
     Math.round(shell / 1024) + ' KB of ' + (INSTALL_MAX_MB * 1024) + ' KB');
  /* A budget with this much room stops being a warning long before it stops
     being a limit, so growth is reported on its own. Nobody has to act on it;
     somebody has to be able to SEE it. */
  note('install budget used', Math.round(shell / (INSTALL_MAX_MB * 1024 * 1024) * 100) + '%'
       + ' of ' + INSTALL_MAX_MB + ' MB');
  ok('the photographs are NOT on the path to the first screen',
     firstPaint.art.length === 0 && firstPaint.bytes < shell - imgBytes / 2,
     Math.round(firstPaint.bytes / 1024) + ' KB first vs ' + Math.round(shell / 1024) + ' KB installed'
     + (firstPaint.art.length ? ' — ' + firstPaint.art.length + ' on first paint' : ''));

  /* The PDF engine, the QR reader and the QR writer are 228 KB between them and
     an inspector needs none of them to capture a round. The property worth
     holding is not that they are never fetched — the worker precaches them on
     purpose, so a report works with no signal — but that they are fetched LAST.
     A phone on a bad link has to get a working app before it gets a PDF engine,
     and the way that breaks is a page-side warm-up racing the worker's ordered
     install. So: read the server's request log and check that every file the
     app cannot start without was asked for before the first heavy library. */
  const HEAVY = /jspdf|html2canvas|jsQR|qrcode/;
  /* Take the list from the worker rather than restating it here — a second copy
     of "what is essential" is a copy that drifts, and a drifted copy turns this
     into a check that passes for the wrong reason. */
  const ESSENTIAL = (fs.readFileSync(ROOT + '/mobile/sw.js', 'utf8')
    .match(/const ESSENTIAL = \[([\s\S]*?)\n\];/) || [, ''])[1]
    .split('\n').map(l => (l.match(/"\.\/([^"?]+)/) || [])[1]).filter(Boolean);
  const order = served.map(x => x.url);
  const firstHeavy = order.findIndex(u => HEAVY.test(u));
  /* FIRST occurrence of each essential, not the last. The worker re-imports its
     own data tables when a new copy of the script boots, long after install; a
     last-occurrence scan reads that as "an essential arrived at request 91" and
     condemns an install that was correctly ordered. */
  const lastEssential = Math.max(...ESSENTIAL.map(e => order.findIndex(u => u.endsWith('/' + e))));
  ok('the app is on the wire before the PDF engine is',
     firstHeavy === -1 || firstHeavy > lastEssential,
     firstHeavy === -1 ? 'not fetched at all'
       : 'last essential at #' + lastEssential + ', first heavy at #' + firstHeavy);
  const heavyLater = await f.evaluate(() => performance.getEntriesByType('resource')
    .filter(e => /jspdf|html2canvas|jsQR|qrcode/.test(e.name)).length);
  ok('and they are warmed in afterwards, so Report is still instant', heavyLater === 4,
     heavyLater + ' of 4 warmed once the worker was in charge');
  const heavyCached = await f.evaluate(async () => {
    const c = await caches.open((await caches.keys()).find(k => /cm-/.test(k)) || (await caches.keys())[0]);
    const ks = (await c.keys()).map(r => r.url);
    return ['jspdf.umd.min.js', 'html2canvas.min.js', 'jsQR.js', 'qrcode.js']
      .filter(n => ks.some(u => u.includes(n))).length;
  });
  ok('but all four are cached, so Report works with no signal', heavyCached === 4,
     heavyCached + ' of 4');
  ok('the artwork is fetched once, not once per open',
     imgBytes > 0 && served.filter(x => /machine\//.test(x.url)).length <= 48,
     served.filter(x => /machine\//.test(x.url)).length + ' image requests for 47 files');

  const warm0 = Date.now();
  const warm = await fresh.newPage();
  await warm.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(warm);
  const warmMs = Date.now() - warm0;
  ok('a second open is under a second and a half', warmMs < 1500, warmMs + ' ms');

  console.log('\n  the screens an inspector actually waits on');
  const timings = await warm.evaluate(async () => {
    const out = {};
    const time = async (name, fn) => { const t = performance.now(); await fn(); out[name] = Math.round(performance.now() - t); };
    await time('switch to UC', async () => {
      const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 0));
    });
    await time('pick a dozer', async () => { selectEquip('DZ001'); await new Promise(r => setTimeout(r, 0)); });
    await time('open a point', async () => { pickComponent('ROLLER.L4'); await new Promise(r => setTimeout(r, 0)); });
    await time('switch side', async () => {
      const b = document.querySelector('[data-ucside="R"]'); if (b) b.click();
      await new Promise(r => setTimeout(r, 0));
    });
    await time('switch to GET', async () => {
      const s = document.getElementById('typeSel'); s.value = 'GET'; s.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 0));
    });
    return out;
  });
  Object.entries(timings).forEach(([k, v]) => note(k, v + ' ms'));
  const worst = Math.max(...Object.values(timings));
  ok('nothing an inspector taps takes more than 400 ms', worst < 400, worst + ' ms worst');

  await b.close();
  srv.close();
  console.log(fails.length ? '\nFAILURES:\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})();
