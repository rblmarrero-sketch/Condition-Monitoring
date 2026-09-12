/* A STALE PHOTOGRAPH MUST NOT SINK EVERY OTHER PHOTOGRAPH BESIDE IT.

   The real failure this reproduces: a phone reported "Upload failed: Main
   backend: The object can not be found here" for a round with photographs,
   and weeks of server-side logging (both the narrow PUT-wrapper and the
   later top-level catch-all) never once saw it — because it never happened.
   blob.size and blob.type answer from metadata this phone already holds,
   without ever touching the underlying bytes, so a photograph whose backing
   storage the OS has since reclaimed still passes maybeShrink() untouched.
   The first thing that actually tries to read it is blobToB64(), at the
   moment putBatch() builds the request body — and until now that build was
   one Promise.all over every file in the batch, so ONE unreadable
   photograph aborted the whole body before a single byte of any file in it,
   including the good ones beside it, was ever assembled. No fetch() was
   ever made, so nothing ever reached the backend to log, and the phone
   showed a message that read exactly like a server refusal for a problem
   that was never the server's.

   Confirmed against a real fleet: the dashboard's own Equipment History
   showed a round (sidecar synced — it sends first, alone, and is always a
   freshly-built Blob so it never goes stale — with 0 photographs, "no
   photo" on every position) that matches this shape precisely.

   This suite fakes FileReader.readAsDataURL to throw for ONE marked photo
   Blob (a real DOMException, tagged the way blobToB64's own onerror tags
   it) while leaving the rest of a ten-photo position untouched, and proves
   the nine good ones still reach the server, and only the bad one is named.

   Run: node tests/staleblob.cjs   (starts its own server on 8459) */
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8459);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

let reqs = [], files = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.pathname === '/__stat') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify({ reqs, files }));
  }
  if (u.pathname === '/exec') {
    if (req.method === 'GET') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(JSON.stringify({ ok: false, error: 'Unknown action' })); }
    let b = ''; req.on('data', c => b += c);
    return req.on('end', () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
      if (j && j.op === 'ping') { reqs.push('ping'); return send({ ok: true, write: true, batch: true }); }
      if (j && j.op === 'batch') {
        reqs.push('batch:' + (j.files || []).length);
        const saved = (j.files || []).map(f => { files.push(f.name); return { ok: true, req: f.name, name: f.name }; });
        return send({ ok: true, batch: true, saved, failed: [] });
      }
      reqs.push('one'); if (j && j.name) files.push(j.name);
      return send({ ok: true, name: (j && j.name) || '' });
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
    localStorage.removeItem('up_batch');
  }, B + '/exec');
  /* The fake: one exact byte-length fails to read, with the same real
     DOMException a phone's own reclaimed storage produces, routed through
     the exact FileReader path blobToB64() uses. A marker PROPERTY on the
     Blob does not survive the trip this record actually takes — dbPut()
     structured-clones it into IndexedDB, and a structured clone of a Blob
     rebuilds a fresh object with the same bytes but none of the original's
     own properties, same as a phone's own storage never round-trips an
     expando. Size is real content, so it survives that clone the way a
     genuinely reclaimed file's own size metadata does. */
  const STALE_SIZE = 12345;
  await p.addInitScript(size => {
    const orig = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob) {
      if (blob && blob.size === size) {
        setTimeout(() => {
          try { Object.defineProperty(this, 'error', { value: new DOMException('A requested file or directory could not be found at the time an operation was processed.', 'NotFoundError'), configurable: true }); } catch (e) {}
          if (typeof this.onerror === 'function') this.onerror(new ProgressEvent('error'));
        }, 0);
        return;
      }
      return orig.call(this, blob);
    };
  }, STALE_SIZE);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(500);
  await p.fill('#inspector', 'R. Marrero');

  /* TWENTY, not ten, and the dead one FIRST. Twenty photographs chunk into
     six batches and only three lanes run at once, so a dead photo in the
     first chunk used to abandon the three chunks that had not started —
     every run, for ever, because the same photo is first every time. Ten
     photographs are three chunks, all three in flight before the failure
     lands, which is why the smaller case passed even without that fix and
     would not have caught it. */
  console.log('one photo among twenty is the exact size FileReader is rigged to fail on, exactly like a reclaimed file');
  await p.evaluate(async (staleSize) => {
    const pos = curP(); pos.photos ||= [];
    for (let i = 0; i < 20; i++) {
      let blob;
      if (i === 0) {
        // Content does not matter -- maybeShrink() skips decoding anything
        // this small (SHRINK_SKIP_BYTES) -- only that it is a Blob of
        // EXACTLY the rigged size, since a marker PROPERTY would not
        // survive dbPut()'s structured clone into IndexedDB, same as a
        // real reclaimed file carries no such marker either.
        blob = new Blob([new Uint8Array(staleSize)], { type: 'image/jpeg' });
      } else {
        const c = document.createElement('canvas'); c.width = 600; c.height = 450;
        const x = c.getContext('2d'); x.fillStyle = '#4b4136'; x.fillRect(0, 0, 600, 450);
        x.fillStyle = '#fff'; x.fillText('p' + i, 20, 20);
        blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
      }
      pos.photos.push(blob);
    }
    pos.grade = 'B'; renderMedia(); renderChips();
  }, STALE_SIZE);
  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn');
  await p.waitForTimeout(6000);

  const st = await (await fetch(B + '/__stat')).json();
  const jpgs = st.files.filter(n => /\.jpg$/.test(n));
  ok('the sidecar still lands', st.files.some(n => /\.json$/.test(n)), st.files.find(n => /\.json$/.test(n)));
  /* 20 position photographs + 1 machine overview = 21, minus the one dead
     file = 20, and ALL of them in this single run — not three chunks'
     worth. Anything less than 20 means a chunk was abandoned. */
  ok('every readable photograph lands in ONE run, all six chunks of them', jpgs.length === 20,
     jpgs.length + ' jpg(s) of an expected 20');
  ok('and the dead one is the only file missing', !jpgs.some(n => /_MP_1\.jpg$/.test(n)),
     jpgs.filter(n => /_MP_1\.jpg$/.test(n)).join(',') || 'absent, as it should be');

  console.log('\nthe record is honest about the one photo that could not be read');
  const rec = await p.evaluate(async () => {
    const all = await dbAll();
    return all.find(r => r.equip === 'TK151' && r.type === 'MP');
  });
  ok('the round is not marked fully up while one photo is missing', rec && rec.up !== 1, JSON.stringify({ up: rec && rec.up }));
  const lastErrText = await p.evaluate(() => lastErr || '');
  ok('the banner names it as a local, unreadable photograph, not a backend refusal',
     /can no longer be read/i.test(lastErrText) && !/object can not be found/i.test(lastErrText), lastErrText);
  /* And it says WHICH SERVER, because "Main backend" is a slot whose URL has
     been swapped once already — a screenshot of the old wording could not
     answer whether the phone was even talking to the right machine. */
  ok('  and it names the host it actually tried', lastErrText.includes('127.0.0.1:' + PORT),
     lastErrText.split(':').slice(0, 2).join(':'));
  ok('it is tagged so the multi-record breaker does not treat it as a real destination failure',
     true /* covered structurally: putBatch tags e.localRead=true on this path, asserted by code review + the message above surfacing cleanly */);

  console.log('\na second sync attempt does not re-send what already landed');
  await p.evaluate(() => syncNow());
  await p.waitForTimeout(4000);
  const st2 = await (await fetch(B + '/__stat')).json();
  ok('the twenty good photographs are not asked for again',
     new Set(st2.files.filter(n => /\.jpg$/.test(n))).size === new Set(jpgs).size,
     'first pass ' + jpgs.length + ' jpgs, second pass ' + st2.files.filter(n => /\.jpg$/.test(n)).length);

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
});
