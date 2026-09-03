/* THE SIGNATURE BOX HIDES WHEN IT IS TOLD TO. EVERY TIME.
 *
 * Reported from the field on build 247: after an update the supervisor
 * sign-off box sometimes could not be hidden, and sometimes could.
 *
 * The fold forced itself open whenever the supervisor's name was filled in or
 * a signature had been drawn, and its button then did nothing. The name is put
 * back from storage on every load, and an update is a load — so on any phone
 * that had ever typed a supervisor, every update came back with a box that
 * could not be hidden, and on a phone that had not, it could. Nothing was
 * random about it; the difference was one stored name.
 *
 * What has to be true:
 *   · a stored supervisor name does not pin the box open after a load;
 *   · the button always toggles — with a name, with a signature, with both;
 *   · hiding hides nothing: the row says what the fold holds;
 *   · a signature drawn, hidden and shown again is still there, and still
 *     goes out with the record.
 */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const f = path.join(ROOT, new URL(req.url, 'http://x').pathname);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(f));
});
const fold = p => p.evaluate(() => ({
  hidden: document.getElementById('signBody').classList.contains('hidden'),
  row: document.getElementById('signTog').textContent.trim(),
  name: document.getElementById('supName').value, dirty: signDirty, open: signOpen }));
const tap = p => p.evaluate(() => document.getElementById('signTog').click());
const draw = p => p.evaluate(() => {
  const c = document.getElementById('signPad'), r = c.getBoundingClientRect();
  const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true, isPrimary: true }));
  ev('pointerdown', 20, 40); ev('pointermove', 80, 60); ev('pointermove', 140, 30); ev('pointerup', 140, 30);
});

(async () => {
  await new Promise(r => srv.listen(0, r));
  const APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();

  console.log('a phone that has typed a supervisor before — the name comes back from storage');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); localStorage.setItem('supervisor', 'I. Petrov'); });
    await p.goto(APP, { waitUntil: 'load' });
    await p.waitForTimeout(800);
    let f = await fold(p);
    ok('the name is back', f.name === 'I. Petrov', f.name);
    ok('and the box is NOT pinned open by it', f.hidden === true, JSON.stringify(f));
    ok('the row says whose name it holds, so hiding hid nothing', f.row.indexOf('I. Petrov') >= 0, f.row);
    await tap(p); f = await fold(p);
    ok('tap: it opens', f.hidden === false, f.row);
    await tap(p); f = await fold(p);
    ok('tap: it hides again — with the name still there', f.hidden === true && f.name === 'I. Petrov', JSON.stringify(f));

    console.log('\n  a signature drawn, then hidden, then shown');
    await tap(p); await p.waitForTimeout(150);
    await draw(p);
    f = await fold(p);
    ok('the pad took the stroke', f.dirty === true);
    await tap(p); f = await fold(p);
    ok('it hides with a signature on it', f.hidden === true, JSON.stringify(f));
    ok('and the row says so', f.row.indexOf(await p.evaluate(() => t('sign_signed'))) >= 0, f.row);
    await tap(p); await p.waitForTimeout(200); f = await fold(p);
    const ink = await p.evaluate(() => { const c = document.getElementById('signPad'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++; return dark; });
    ok('shown again, the stroke is still on the pad', f.hidden === false && ink > 20, ink + ' dark px');
    const blob = await p.evaluate(async () => { const bl = await signBlob(); return bl ? bl.size : 0; });
    ok('and it still goes out with the record', blob > 0, blob + ' bytes');

    console.log('\n  the same phone after an update: a reload');
    await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(800);
    f = await fold(p);
    ok('the box comes back hidden, name on the row', f.hidden === true && f.row.indexOf('I. Petrov') >= 0, JSON.stringify(f));
    await tap(p); f = await fold(p); ok('and still opens', f.hidden === false);
    await tap(p); f = await fold(p); ok('and still hides', f.hidden === true);
    await ctx.close();
  }

  console.log('\na phone that never typed one');
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); localStorage.removeItem('supervisor'); });
    await p.goto(APP, { waitUntil: 'load' });
    await p.waitForTimeout(800);
    let f = await fold(p);
    ok('hidden, offering to add one', f.hidden === true && f.row.indexOf(await p.evaluate(() => t('sign_add'))) >= 0, f.row);
    await tap(p); await p.fill('#supName', 'S. Volkov'); f = await fold(p);
    ok('typing a name while open keeps it open', f.hidden === false, JSON.stringify(f));
    await tap(p); f = await fold(p);
    ok('and it still hides afterwards, name on the row', f.hidden === true && f.row.indexOf('S. Volkov') >= 0, f.row);
    await ctx.close();
  }

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
