/* THE REPLY WAS LOST. THE FILE WAS NOT.

   Read off the server for the test round of 2026-09-13 08:44 on build 350:
   the sidecar landed at :00, the photograph batch at :13–:14, and the phone
   reported an error twice before the third press found everything already
   there. A mobile link can carry every byte up and then drop the idle
   connection while the server writes and verifies; the answer goes into a
   dead socket. The phone counted that as a failed upload.

   This suite's server takes the WHOLE body, saves the files, and then
   destroys the connection without answering — for the sidecar and for the
   photograph batch. It proves:
   · one press: the round goes up, every file lands once, the run ends with
     no error, and the read-back confirms the round;
   · the trace says what happened (reply-lost … landed=true);
   · a connection cut BEFORE the body is all up is still a failure, retried
     by the clock, and nothing is invented.

   Run: node tests/replylost.cjs   (starts its own server on 8464) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8464);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
let files = {}, dropReplies = 0, cutEarly = 0, loseReplies = 0, posts = 0, lists = 0, dropped = [], hung = [];
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
  if (u.pathname === '/__stat') return send({ files, posts, lists, dropped });
  if (u.pathname === '/__mode') { dropReplies = Number(u.searchParams.get('drop') || 0); cutEarly = Number(u.searchParams.get('cut') || 0); loseReplies = Number(u.searchParams.get('lose') || 0); files = {}; posts = 0; lists = 0; dropped = []; return send({ ok: true }); }
  if (u.pathname === '/exec') {
    if (req.method === 'GET') {
      if (u.searchParams.get('action') === 'list') { lists++; const folder = u.searchParams.get('folder') || '';
        return send({ ok: true, files: Object.keys(files).filter(n => files[n].folder === folder).map(n => ({ name: n, size: files[n].size })) }); }
      return send({ ok: false, error: 'Unknown action' });
    }
    let b = ''; let cut = false;
    req.on('data', c => { b += c; if (cutEarly > 0 && !cut) { cut = true; cutEarly--; req.socket.destroy(); } });
    return req.on('end', () => {
      if (cut) return;
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      if (j && j.op === 'ping') return send({ ok: true, write: true, batch: true });
      posts++;
      /* The reply is lost AND the server kept nothing (a write that failed
         after the body arrived): the phone must not take this as landed. */
      if (loseReplies > 0) { loseReplies--; dropped.push('lost:' + ((j && (j.op || j.name)) || '?')); hung.push(res); return; }
      const keep = (f, folder) => { const n = Buffer.from(f.file || '', 'base64').length; files[f.name] = { folder, size: n }; return { ok: true, req: f.name, name: f.name }; };
      let reply;
      if (j && j.op === 'batch') reply = { ok: true, batch: true, saved: (j.files || []).map(f => keep(f, j.folder || '')), failed: [] };
      else if (j && j.name) { keep(j, j.folder || ''); reply = { ok: true, name: j.name }; }
      else reply = { ok: false, error: 'missing file name' };
      /* The body is all here and the files are saved; the answer never
         leaves. The socket is HELD OPEN, not destroyed: a destroyed socket
         makes Chromium re-send the POST silently on a fresh connection and
         the page never sees a failure — which is not what a carrier NAT
         does to an idle connection. */
      if (dropReplies > 0) { dropReplies--; dropped.push((j && (j.op || j.name)) || '?'); hung.push(res); return; }
      return send(reply);
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
  let p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
      { id: 'pa', on: false, url: 'https://off.invalid/', sec: '', folder: '' },
      { id: 'post', on: false, url: 'https://off.invalid/', sec: '', folder: '' }]));
    localStorage.removeItem('up_batch'); localStorage.setItem('cm_conf_works', '1');
  }, B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  const seed = async (unit, beforeSave) => {
    await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(300);
    /* The fleet list loads after boot; on a page opened cold the first
       selectEquip can land before it and leave the form unopened. */
    for (let i = 0; i < 8; i++) {
      await p.evaluate(u => selectEquip(u), unit);
      await p.waitForTimeout(500);
      if (await p.evaluate(() => { const e = document.getElementById('inspector'); return !!(e && e.offsetParent); })) break;
    }
    if (process.env.DEBUG) console.log('screen:', await p.evaluate(() => ({ setupHidden: document.getElementById('viewSetup').hidden, panes: [...document.querySelectorAll('main > section, .pane.on, [id^=pane]')].filter(e => e.offsetParent).map(e => e.id).slice(0, 6), dlg: [...document.querySelectorAll('dialog[open], .ov:not(.hidden), .dlg:not(.hidden)')].map(d => d.id + ':' + d.textContent.trim().slice(0, 80)) })));
    /* The name is remembered after the first round and the field folds
       away behind a row; only fill it when the form is asking for it. */
    if (await p.evaluate(() => { const e = document.getElementById('inspector'); return !!(e && e.offsetParent) && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().height > 0; })) await p.fill('#inspector', 'R. Marrero');
    await p.evaluate(async () => {
      const pos = curP(); pos.photos ||= [];
      for (let i = 0; i < 3; i++) { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.fillStyle = '#4b4136'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.fillText('p' + i, 20, 20);
        addPos(pos, attWrap(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7))), 'COMPONENT'); }
      pos.grade = 'B'; renderMedia(); renderChips();
    });
    await p.evaluate(require('./overview.cjs').PLANT);
    await p.evaluate(() => goStep(3)); await p.waitForTimeout(200);
    /* The server mode is set here, after the seeding's own requests, so the
       dropped replies are the round's — the sidecar and the batch. */
    if (beforeSave) await beforeSave();
    await p.click('#saveBtn');
  };

  console.log('1. the server keeps every file and answers nothing — twice (the sidecar, then the batch)');
  await seed('TK151', async () => { await fetch(B + '/__mode?drop=2'); await p.evaluate(() => { UP_CLOCKS.reply = 1500; }); });
  await p.waitForTimeout(9000);
  let st = await (await fetch(B + '/__stat')).json();
  const rec1 = await p.evaluate(async () => { const r = (await dbAll()).find(r => r.equip === 'TK151'); return { up: r && r.up, conf: !!(r && r.conf && r.conf.of > 0 && r.conf.n === r.conf.of), err: lastErr || '' }; });
  const trace = await p.evaluate(() => (window.__sync || []).map(e => e.ev + (e.landed != null ? ':' + e.landed : '')));
  if (process.env.DEBUG) console.log(await p.evaluate(() => slogText(80)));
  ok('every file landed, each once, in ONE run', Object.keys(st.files).length === 5 && st.posts === 2, JSON.stringify({ files: Object.keys(st.files), posts: st.posts, dropped: st.dropped }));
  ok('the run ended with no error on the bar', !rec1.err, rec1.err);
  ok('the round is up and the read-back confirmed it', rec1.up === 1 && rec1.conf === true, JSON.stringify(rec1));
  ok('the trace says the reply was lost and the folder was asked', trace.filter(e => e === 'reply-lost:true').length === 2, trace.filter(e => /reply-lost|one-fail|batch-fail|record-ok/.test(e)).join(' '));
  ok('  and the folder was listed for it (plus the read-back)', st.lists >= 3, st.lists + ' listings');

  console.log('\n2. the reply is lost and the server kept nothing — a failure, retried by the clock, nothing invented');
  await p.evaluate(async () => { for (const r of await dbAll()) await dbDel(r.id); try { await dbDel(DRAFT_ID); } catch (e) {} });
  await p.close();
  p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(800);
  await seed('TK151', async () => { await fetch(B + '/__mode?lose=1'); await p.evaluate(() => { UP_CLOCKS.reply = 1500; }); });
  await p.waitForTimeout(6000);
  st = await (await fetch(B + '/__stat')).json();
  const rec2 = await p.evaluate(async () => { const r = (await dbAll()).find(r => r.equip === 'TK151'); return { up: r && r.up, err: lastErr || '', retry: !!retryTimer }; });
  /* ASKED ABOUT THIS ROUND, NOT ABOUT THE FOLDER'S TOTAL. This counted every
     file the mock held and required zero. The question it is really asking is
     whether TK151's sidecar was taken as landed when the server kept nothing,
     and a count answers that only while nothing else in the system ever writes
     — which stopped being true when the phone began filing its own sync trace
     (build 370, `_meta/diag/<DEV>.json`). On the real backend that is a
     different folder and a round's read-back would never see it; this mock
     puts everything in one bag, so the suite read its own diagnostics as the
     round having landed. Named, the assertion is both correct and immune to
     the next thing that writes. */
  const mine = Object.keys(st.files).filter(n => /TK151/.test(n));
  ok('the sidecar was not taken as landed: nothing of this round is filed and it is not up',
     mine.length === 0 && rec2.up !== 1,
     JSON.stringify({ forThisRound: mine, other: Object.keys(st.files), up: rec2.up }));
  ok('the round waits, the bar names the failure, and the retry clock is armed', rec2.up !== 1 && !!rec2.err && rec2.retry, JSON.stringify(rec2));
  const tr2 = await p.evaluate(() => (window.__sync || []).slice(-12).map(e => e.ev + (e.landed != null ? ':landed=' + e.landed : '')));
  ok('  and the trace records that the folder was asked and did not have it', tr2.some(e => e === 'reply-lost:landed=false'), tr2.join(' '));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  hung.forEach(r => { try { r.socket.destroy(); } catch (e) {} });
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
});
