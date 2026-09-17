/* A PICTURE ALREADY ON THIS DISK STILL NEEDS ITS FIRST REPAINT ON A FRESH TAB.

   ensurePhotos() answers with what it ADDED to `fetched` (this module's own
   in-memory map), not with what the network did — noloop.cjs guards that
   half: everything already in `fetched`, called again, adds and repaints
   nothing, or the office page redraws itself 210 times a second with
   nobody touching it.

   But `fetched` is empty on every fresh page load, while the browser's own
   MEDIA_CACHE (Cache Storage) survives it — a picture fetched in an earlier
   tab is still on this disk. The card that shows it was already built,
   moments before ensurePhotos ever asked the disk anything, so it needs
   the SAME one repaint a network fetch would earn it. Answering 0 for "all
   cache hits, nothing missing" (as this file did until now) is right about
   the network and wrong about the page: read off the field, "it loads only
   when I click report or edit... before it loads fast" — a photo already on
   disk from a prior visit sat on "no photo" until something else forced a
   redraw. `added` counts a name the FIRST time this session sees it,
   whichever store it came from, and 0 only once every name here has
   already been counted once.

   This needs its OWN backend, not tests/mock.cjs on 8099: that fixture
   always serves a fixed 13-byte body ('FAKEJPEGBYTES') for a photo while
   declaring size:90000 in the index, so cacheGet's own size check (a
   deliberate feature — see drive.js's comment on the same lines this test
   is about) throws the cached copy away as "a different file" on every
   single call. That never exercises a disk-cache HIT at all, on this suite
   or on noloop.cjs, which only ever proves the in-memory `fetched` skip.
   A real backend's index reports the real file's size, so this fixture's
   photo bytes and its declared size agree, the way a live folder's do.

   Run: node tests/loadonce.cjs   (spawns its own backend on 8500) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http');

const PHOTO_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkI'
  + 'CQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQ'
  + 'EBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIA'
  + 'AhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEB'
  + 'AQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64');
let seq = 0;
const FILES = [{ name: 'TK101_04.07.2026_MP.json', id: 'j1', isJson: true,
    json: { type: 'cm-inspection-entries', version: 2, records: [{
      equip: 'TK101', date: '2026-07-04', type: 'MP', cls: 'HT', by: 'R. Marrero', smu: '5120',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 1 }] }] } },
  { name: 'TK101_4C_04.07.2026_MP.jpg', id: 'p1', size: PHOTO_BYTES.length }];

function exec(q) {
  const action = q.get('action');
  if (!action) return { ok: true, service: 'mock' };
  if (action === 'records') {
    const after = Number(q.get('after') || 0) || 0;
    const side = FILES.filter(f => f.isJson);
    return { ok: true, records: side.flatMap(f => f.json.records), read: side.length, failed: 0,
      pending: 0, truncated: false, cursor: after < 1 ? 1 : after,
      index: FILES.filter(f => !f.isJson).map(f => ({ name: f.name, id: f.id, size: f.size })) };
  }
  if (action === 'file') {
    const f = FILES.find(x => x.id === q.get('id'));
    if (!f) return { ok: false, error: 'Missing file id' };
    if (f.isJson) return { ok: true, name: f.name, mime: 'application/json',
      data: Buffer.from(JSON.stringify(f.json)).toString('base64') };
    return { ok: true, name: f.name, mime: 'image/jpeg', data: PHOTO_BYTES.toString('base64') };
  }
  return { ok: false, error: 'Unknown action: ' + action };
}

const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.pathname === '/exec') {
    const body = JSON.stringify(exec(u.searchParams));
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(body);
  }
  let p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (u.pathname === '/') p = path.join(ROOT, 'dashboard/index.html');
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

const PORT = 8510;
const BASE = 'http://127.0.0.1:' + PORT;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const openFirstUnit = () => `(function(){
  showTab('equipment', true);
  const s = document.getElementById('equipSel');
  const first = [...s.options].map(o => o.value).filter(Boolean)[0];
  if (first) { s.value = first; s.onchange && s.onchange(); }
  return first || '';
})()`;

(async () => {
  await new Promise(res => server.listen(PORT, res));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_dash_lang', 'en');
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_dash_histview', 'photo');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });

  console.log('1. FIRST VISIT — the network populates the photo and the disk cache');
  const unit = await p.evaluate(openFirstUnit());
  ok('a unit with a photograph is open', !!unit, unit || 'none offered');
  await p.waitForTimeout(1500);
  const firstPass = await p.evaluate(() =>
    Array.from(document.querySelectorAll('#history .pos img.photo'))
      .map(im => im.getAttribute('src') || '').filter(s => s.startsWith('blob:')).length);
  ok('at least one photograph rendered from the network', firstPass > 0, firstPass + ' shown');

  console.log('\n2. A FRESH TAB — nothing in memory, the SAME disk cache underneath it');
  /* Strip the #equipment?eq=TK101 the first visit's own onchange wrote to the
     address bar — a real reload of that link would restore the same unit
     automatically and re-fetch it during BOOT, before this test ever asks,
     which would earn it a repaint for a reason the field case doesn't have. */
  await p.evaluate(() => history.replaceState(null, '', location.pathname));
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const o = document.getElementById('dataOv'); if (o) o.classList.add('hidden'); });
  await p.evaluate(openFirstUnit());
  /* No click into Report or Edit, no second call, no forced re-render below
     — the ordinary settle a technician would actually wait through. */
  await p.waitForTimeout(1200);
  const secondPass = await p.evaluate(() =>
    Array.from(document.querySelectorAll('#history .pos img.photo'))
      .map(im => im.getAttribute('src') || '').filter(s => s.startsWith('blob:')).length);
  ok('THE FIX: the cache-hit photograph shows on its own, without a manual nudge',
     secondPass > 0, secondPass + ' shown (was stuck at 0 before this fix)');
  ok('  the same photograph as the first visit', secondPass === firstPass, `${secondPass} vs ${firstPass}`);

  console.log('\n3. AND A SECOND LOOK AT THE SAME TAB STILL REPAINTS NOTHING (noloop\'s own rule)');
  const watch = await p.evaluate(() => new Promise(res => {
    const t = document.getElementById('history');
    let nodes = 0; const mo = new MutationObserver(list => list.forEach(m => { nodes += m.addedNodes.length + m.removedNodes.length; }));
    mo.observe(t, { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); res(nodes); }, 1500);
  }));
  ok('idle once the cache-hit has been shown once', watch === 0, watch + ' node(s) touched');

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); server.close(); process.exit(1); });
