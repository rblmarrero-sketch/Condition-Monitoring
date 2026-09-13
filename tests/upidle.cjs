/* AN UPLOAD IS DEAD WHEN ITS BYTES STOP MOVING, NOT WHEN A CLOCK RUNS OUT.

   Read off a handset on build 348: "press Sync four times and it goes
   through". fetchT() gave a POST ninety seconds whatever it was doing; a 4 MB
   original at the 55 KB/s that phone measured needs a hundred. The server
   kept the file the client had abandoned; the next press found it already
   there and gave up on the next one. One photograph a press, an error every
   time.

   postT() bounds a POST by silence instead: UP_IDLE with no byte moving while
   the body goes up, UP_REPLY once it is all up and the server is working on
   it, UP_MAX outright. This suite drives the three cases with short clocks:
   · a server that never reads — the idle clock fires and the error is the
     app's own timeout sentence, not "aborted";
   · a server that takes the whole body and then thinks for longer than the
     idle clock before answering — the reply clock covers it and the upload
     SUCCEEDS (the case an idle clock alone would have called dead);
   · a real round of three photographs through putAll — lands, once.

   Run: node tests/upidle.cjs   (starts its own server on 8463) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8463);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
let files = [], hung = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__stat') return send({ files, hung: hung.length });
  /* Never reads the body, never answers: the link that connected and then delivered nothing. */
  if (u.pathname === '/hang') { hung.push(req); return; }
  /* Reads everything, then thinks for `ms` before answering. */
  if (u.pathname === '/think') {
    let n = 0; req.on('data', c => n += c.length);
    return req.on('end', () => setTimeout(() => send({ ok: true, name: 'thought', bytes: n }), Number(u.searchParams.get('ms') || 2500)));
  }
  if (u.pathname === '/exec') {
    if (req.method === 'GET') return send({ ok: true, files: files.map(n => ({ name: n, size: 1 })) });
    let b = ''; req.on('data', c => b += c);
    return req.on('end', () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      if (j && j.op === 'ping') return send({ ok: true, write: true, batch: true });
      if (j && j.op === 'batch') { const saved = (j.files || []).map(f => { files.push(f.name); return { ok: true, req: f.name, name: f.name }; }); return send({ ok: true, batch: true, saved, failed: [] }); }
      if (j && j.name) files.push(j.name);
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
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
      { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
      { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' }]));
    localStorage.removeItem('up_batch');
  }, B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });

  console.log('1. a link that connects and delivers nothing is given up on by the idle clock, and named as a timeout');
  const t0 = Date.now();
  /* Eight megabytes, so the body cannot disappear into the socket buffers and
     the UPLOAD clock is the one that has to fire — a small body is "all up" at
     once and the reply clock takes over, which is case 3's job. */
  const r1 = await p.evaluate(async (u) => { try { await postT(u, 'x'.repeat(8 * 1024 * 1024), 1200, 30000, 30000); return { ok: true }; } catch (e) { return { err: String(e.message || e) }; } }, B + '/hang');
  const dt = Date.now() - t0;
  ok('the POST is abandoned soon after the bytes stop moving', !!r1.err && dt < 8000, JSON.stringify(r1) + ' after ' + dt + ' ms');
  ok('  with the app\'s own timeout sentence, not "aborted"', !!r1.err && r1.err === (await p.evaluate(() => t('up_timeout'))), r1.err);

  console.log('\n2. a server that takes the whole body and thinks past the idle clock still gets its answer through');
  const r2 = await p.evaluate(async (u) => { try { const r = await postT(u, 'y'.repeat(200000), 1200, 30000, 8000); return { ok: r.ok, body: JSON.parse(await r.text()) }; } catch (e) { return { err: String(e.message || e) }; } }, B + '/think?ms=3000');
  ok('the reply arrives although no byte moved for longer than the idle clock', r2.ok && r2.body && r2.body.bytes === 200000, JSON.stringify(r2));

  console.log('\n3. the outright cap still ends a reply that never comes');
  const r3 = await p.evaluate(async (u) => { try { await postT(u, 'z'.repeat(1000), 60000, 2500, 60000); return { ok: true }; } catch (e) { return { err: String(e.message || e) }; } }, B + '/hang');
  ok('UP_MAX abandons it and names it as a timeout', !!r3.err && r3.err === (await p.evaluate(() => t('up_timeout'))), JSON.stringify(r3));

  console.log('\n4. a round goes up through the same door, once');
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(300);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  await p.fill('#inspector', 'R. Marrero');
  await p.evaluate(async () => {
    const pos = curP(); pos.photos ||= [];
    for (let i = 0; i < 3; i++) { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.fillStyle = '#4b4136'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.fillText('p' + i, 20, 20);
      addPos(pos, attWrap(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7))), 'COMPONENT'); }
    pos.grade = 'B'; renderMedia(); renderChips();
  });
  await p.evaluate(require('./overview.cjs').PLANT);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn');
  await p.waitForTimeout(5000);
  const st = await (await fetch(B + '/__stat')).json();
  /* Three position photographs plus the machine overview the seed plants. */
  const jpgs = st.files.filter(n => /\.jpg$/.test(n));
  ok('sidecar and every photograph landed through postT', st.files.some(n => /\.json$/.test(n)) && jpgs.filter(n => /_MP_\d\.jpg$/.test(n)).length === 3 && jpgs.length === 4, JSON.stringify(st.files));
  ok('  each once', new Set(jpgs).size === jpgs.length);

  console.log('\n5. the attempt-by-attempt trace says what that run did, and survives a reload');
  const tr = await p.evaluate(() => ({ evs: (window.__sync || []).map(e => e.ev), text: slogText(80), stored: !!localStorage.getItem('cm_sync_log') }));
  const has = ev => tr.evs.includes(ev);
  ok('the run, the queue, the record, every request and the read-back are on it',
     has('run') && has('queue') && has('record') && (has('one-ok') || has('batch-reply')) && has('record-ok') && has('readback') && has('run-end'),
     tr.evs.slice(-14).join(' '));
  ok('  with durations and byte counts a person can read', /ms=\d+/.test(tr.text) && /bytes=\d+/.test(tr.text) && /rev=/.test(tr.text), tr.text.split('\n').slice(-4).join(' | ').slice(0, 300));
  ok('  and it is kept in storage for the next open', tr.stored);
  /* The trace is under the sync bar only while there is something to say. */
  const diag = await p.evaluate(async () => { lastErr = 'x'; await renderSync(); const d = document.getElementById('syncDiag'); const shown = d && !d.classList.contains('hidden') && /What the last uploads did/.test(d.textContent) && !!d.querySelector('#slogCopy'); lastErr = ''; await renderSync(); return shown; });
  ok('the Sync screen shows it, with a Copy button, when the bar has an error to explain', diag === true);
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  hung.forEach(r => { try { r.destroy(); } catch (e) {} });
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
});
