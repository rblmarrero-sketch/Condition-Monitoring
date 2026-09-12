/* A PHONE IN THE STATE THAT FROZE MUST STILL SEND ITS WORK.

   The freeze fixed in build 326 did not only stop the screen: a pegged
   main thread cannot run an upload, a team pull or a build check either,
   so rounds stopped reaching the office while the phone sat there looking
   merely slow. Fixing the loop is therefore only half the claim. The other
   half — the half that matters to somebody with fifteen rounds on a
   handset — is that a phone carrying that exact remembered state, on the
   exact link that triggers it, still gets its work away.

   So this suite puts a phone in the worst honest version of that state:

     · "Show 1C schedule" remembered ON and the Due tab remembered on This
       week, which is what turns the branch on at all;
     · schedule_slim.json answering 404, which is the pit's normal
       condition and also what any phone sees an hour after its last good
       fetch, once the cached copy goes stale and the retry gap starts
       suppressing the refetch;

   and then requires the ordinary things to happen anyway: the app boots,
   the Due screen opens and stays answerable, a round saves, and the round
   AND ITS PHOTOGRAPHS ARRIVE AT THE ENDPOINT.

   Run: node tests/thawsync.cjs   (starts its own server on 8512) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8512);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

let got = [];                       // every file the endpoint actually received
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  /* The file whose absence is the whole trigger. */
  if (/schedule_slim\.json/.test(u.pathname)) { res.writeHead(404, cors); return res.end('nope'); }
  if (u.pathname === '/__got') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify(got));
  }
  if (u.pathname === '/exec') {
    if (req.method === 'GET') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(JSON.stringify({ ok: false, error: 'Unknown action' })); }
    let b = ''; req.on('data', c => b += c);
    return req.on('end', () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
      if (j && j.op === 'ping') return send({ ok: true, write: true, batch: true });
      if (j && j.op === 'batch') {
        const saved = (j.files || []).map(f => { got.push(f.name); return { ok: true, req: f.name, name: f.name }; });
        return send({ ok: true, batch: true, saved, failed: [] });
      }
      if (j && j.name) got.push(j.name);
      return send({ ok: true, name: (j && j.name) || '' });
    });
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('x'); }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
});

const within = (pr, ms, late) => Promise.race([
  pr.catch(e => 'ERR ' + String(e && e.message).slice(0, 40)),
  new Promise(r => setTimeout(() => r(late), ms)),
]);

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    /* Exactly the state that froze: both switches remembered. */
    localStorage.setItem('cm_due_sched', '1');
    localStorage.setItem('cm_due_view', 'week');
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' }]));
    localStorage.removeItem('up_batch');
  }, `http://127.0.0.1:${PORT}/exec`);

  console.log('1. IT BOOTS AT ALL');
  await within(p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' }), 30000, 'late');
  const ver = await within(p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 })
    .then(() => p.evaluate(() => (document.getElementById('verNum') || {}).textContent)), 22000, 'FROZEN');
  ok('the app comes up with both switches remembered and no schedule file', ver && ver !== 'FROZEN', String(ver));

  console.log('\n2. THE DUE SCREEN OPENS AND KEEPS ANSWERING');
  await within(p.evaluate(() => showPane('paneDue')), 10000, 'late');
  const alive = await within(p.evaluate(() => 1 + 1), 8000, 'FROZEN');
  ok('the screen that froze is answerable', alive === 2, String(alive));
  const weekOpen = await within(p.evaluate(() => !!document.getElementById('dueWeekWrap')
    && !document.getElementById('dueWeekWrap').classList.contains('hidden')), 8000, 'FROZEN');
  ok('  and it is genuinely on This week, so the branch really was entered', weekOpen === true, String(weekOpen));

  console.log('\n3. AND THE WORK STILL GETS AWAY');
  await within(p.evaluate(() => showPane('paneCapture')), 8000, 'late');
  await p.waitForTimeout(300);
  await within(p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); }), 8000, 'late');
  await p.waitForTimeout(300);
  await within(p.evaluate(() => selectEquip('TK151')), 8000, 'late');
  await p.waitForTimeout(500);
  await within(p.fill('#inspector', 'R. Marrero'), 8000, 'late');
  await within(p.evaluate(async () => {
    const pos = curP(); pos.photos ||= [];
    for (let i = 0; i < 3; i++) {
      const c = document.createElement('canvas'); c.width = 400; c.height = 300;
      const x = c.getContext('2d'); x.fillStyle = '#4b4136'; x.fillRect(0, 0, 400, 300);
      pos.photos.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)));
    }
    pos.grade = 'B'; renderMedia(); renderChips();
  }), 15000, 'late');
  await within(p.evaluate(PLANT), 10000, 'late');
  await within(p.evaluate(() => goStep(3)), 8000, 'late');
  await p.waitForTimeout(300);
  await within(p.click('#saveBtn'), 10000, 'late');
  await p.waitForTimeout(9000);

  const arrived = await (await fetch(`http://127.0.0.1:${PORT}/__got`)).json();
  ok('the round reached the endpoint', arrived.some(n => /\.json$/.test(n)), arrived.find(n => /\.json$/.test(n)) || 'nothing');
  ok('  and so did its photographs', arrived.filter(n => /\.jpg$/i.test(n)).length >= 3,
     arrived.filter(n => /\.jpg$/i.test(n)).length + ' photo(s)');
  const up = await within(p.evaluate(async () => {
    const all = await dbAll(); const r = all.find(x => x.equip === 'TK151' && x.type === 'MP');
    return r ? (r.up === 1 ? 'sent' : 'still queued') : 'no record';
  }), 10000, 'FROZEN');
  ok('  and the phone knows it is away', up === 'sent', String(up));
  ok('no page errors throughout', errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');

  await within(ctx.close(), 8000, 'late');
  await within(b.close(), 8000, 'late');
  srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
