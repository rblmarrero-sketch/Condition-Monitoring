/* A SIGNATURE THE INSPECTOR ACTUALLY DREW CANNOT BECOME NOTHING, SILENTLY.
 *
 * Reported from the field, CN002 (INSP, 2026-09-24, device DMYLFQ): a
 * signature was drawn on the phone's pad, and it is on neither the phone's
 * own PDF nor the dashboard's — confirmed directly against the server, which
 * holds signed:0 and no _SIGN.png for that round at all. Every other theory
 * (filename, date format, media-index filtering, a fetch race, touch-action)
 * was ruled out against the real code and the real server data. What was
 * left: signBlob() (mobile/index.html) handed `canvas.toBlob()` a callback
 * and trusted whatever it got back, including nothing — the one capture in
 * this app with no read-back of what it produced, unlike every photograph,
 * which is read end to end by ownBytes/readBlobBytes before it is ever
 * trusted (CLAUDE.md's own "nothing reaches storage that this page has not
 * read end to end" rule).
 *
 * The fix: signBlob() tries toDataURL() as a second reader over the same
 * pixels when toBlob() comes back empty, the same "more than one reader"
 * rule readBlobBytes already holds every photograph to; and if a pad the
 * inspector actually drew on still produces nothing usable, Save refuses
 * and says so (m_sign_fail_t/m_sign_fail_m) instead of filing the round
 * with sign:null.
 *
 * What has to be true:
 *   · the ordinary case — toBlob() works — still saves a real signature;
 *   · a toBlob() failure alone is invisible: toDataURL() rescues it and the
 *     round saves with a real signature, no dialog, nothing lost;
 *   · when BOTH readers fail on a pad that was actually drawn on, Save
 *     refuses with the new dialog and no record is created with a null or
 *     missing signature;
 *   · a pad that was never drawn on (no signature offered) is untouched —
 *     Save proceeds with sign:null exactly as it always has, because there
 *     is nothing to lose there.
 */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const { PHOTOS } = require('./overview.cjs');
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

// Patches HTMLCanvasElement so the SIGNATURE pad specifically can be made to
// fail toBlob()/toDataURL() on command, while any other canvas on the page
// (there are none in this flow, but the guard costs nothing) is untouched.
const RIG = () => {
  const origBlob = HTMLCanvasElement.prototype.toBlob;
  const origData = HTMLCanvasElement.prototype.toDataURL;
  window.__sigRig = { blobFail: false, dataFail: false };
  HTMLCanvasElement.prototype.toBlob = function (cb, type) {
    if (window.__sigRig.blobFail && this.id === 'signPad') return cb(null);
    return origBlob.call(this, cb, type);
  };
  HTMLCanvasElement.prototype.toDataURL = function (type) {
    if (window.__sigRig.dataFail && this.id === 'signPad') throw new Error('simulated toDataURL failure');
    return origData.call(this, type);
  };
};

const draw = p => p.evaluate(() => {
  const c = document.getElementById('signPad'), r = c.getBoundingClientRect();
  const ev = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true, isPrimary: true }));
  ev('pointerdown', 20, 40); ev('pointermove', 80, 60); ev('pointermove', 140, 30); ev('pointerup', 140, 30);
});

async function newPage(b) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.addInitScript(RIG);
  await p.goto(APP, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof signBlob === 'function');
  return { ctx, p };
}

async function setUp(p, equip) {
  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'INSP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(e => selectEquip(e), equip);
  await p.waitForTimeout(400);
  await p.evaluate(() => { const k = items()[0].k; pickComponent(k); });
  await p.fill('#inspector', 'R. Marrero');
  await p.fill('#smu', '6100');
  await p.evaluate(() => document.querySelector('#gradeSeg [data-g="1"]')?.click());
  await p.waitForTimeout(100);
  await p.evaluate(PHOTOS);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#signTog');
  await p.waitForTimeout(200);
}

let APP;

(async () => {
  await new Promise(r => srv.listen(0, r));
  APP = 'http://127.0.0.1:' + srv.address().port + '/mobile/index.html';
  const b = await chromium.launch();

  console.log('the ordinary case: toBlob() works, exactly as before');
  {
    const { ctx, p } = await newPage(b);
    await setUp(p, 'TK146');
    await draw(p);
    ok('the pad took the stroke', await p.evaluate(() => signDirty));
    const blob = await p.evaluate(async () => { const b = await signBlob(); return b ? { size: b.size, isBlob: b instanceof Blob } : null; });
    ok('signBlob() returns a real, non-empty blob', !!(blob && blob.isBlob && blob.size > 0), JSON.stringify(blob));
    await ctx.close();
  }

  console.log('\na pad never drawn on: sign stays null, nothing changes');
  {
    const { ctx, p } = await newPage(b);
    await setUp(p, 'TK146');
    const blob = await p.evaluate(async () => await signBlob());
    ok('signBlob() is null with no stroke', blob === null, blob);
    await ctx.close();
  }

  console.log('\ntoBlob() fails alone: toDataURL() rescues it, invisibly');
  {
    const { ctx, p } = await newPage(b);
    await setUp(p, 'TK146');
    await draw(p);
    await p.evaluate(() => { window.__sigRig.blobFail = true; });
    const blob = await p.evaluate(async () => { const b = await signBlob(); return b ? { size: b.size, isBlob: b instanceof Blob } : null; });
    ok('the toDataURL() fallback still produces a real blob', !!(blob && blob.isBlob && blob.size > 0), JSON.stringify(blob));

    await p.fill('#supName', 'A. Ivanov');
    await p.click('#saveBtn');
    await p.waitForTimeout(800);
    const dlgText = await p.evaluate(() => (document.getElementById('dlg') || {}).textContent || '');
    ok('the ordinary save confirmation, not the failure dialog', dlgText.indexOf(await p.evaluate(() => t('m_sign_fail_t'))) < 0, dlgText.replace(/\s+/g, ' ').trim().slice(0, 120));
    if (await p.evaluate(() => document.getElementById('dlg')?.open)) { await p.click('#dlgOk'); await p.waitForTimeout(150); }
    const saved = await p.evaluate(async () => {
      const r = (await dbAll()).find(x => x.equip === 'TK146');
      return r ? { found: true, hasSign: !!r.sign, size: r.sign ? r.sign.size : 0 } : { found: false };
    });
    ok('the round is saved with a real signature', saved.found && saved.hasSign && saved.size > 0, JSON.stringify(saved));
    await ctx.close();
  }

  console.log('\nboth readers fail on a pad that WAS drawn on: Save refuses, nothing is lost');
  {
    const { ctx, p } = await newPage(b);
    await setUp(p, 'TK146');
    await draw(p);
    await p.evaluate(() => { window.__sigRig.blobFail = true; window.__sigRig.dataFail = true; });
    const blob = await p.evaluate(async () => await signBlob());
    ok('signBlob() itself comes back null when both readers fail', blob === null, blob);

    await p.fill('#supName', 'A. Ivanov');
    await p.click('#saveBtn');
    await p.waitForTimeout(800);
    const dlgText = await p.evaluate(() => (document.getElementById('dlg') || {}).textContent || '');
    ok('Save refuses and names the problem', dlgText.indexOf(await p.evaluate(() => t('m_sign_fail_t'))) >= 0, dlgText.replace(/\s+/g, ' ').trim().slice(0, 160));
    const savedBad = await p.evaluate(async () => (await dbAll()).find(x => x.equip === 'TK146'));
    ok('no record was ever created with the failed signature', !savedBad);

    if (await p.evaluate(() => document.getElementById('dlg')?.open)) { await p.click('#dlgOk'); await p.waitForTimeout(150); }

    console.log('\n  the same round, redrawn, with the readers restored: save succeeds');
    await p.evaluate(() => { window.__sigRig.blobFail = false; window.__sigRig.dataFail = false; });
    await draw(p);
    await p.click('#saveBtn');
    await p.waitForTimeout(800);
    const saved = await p.evaluate(async () => {
      const r = (await dbAll()).find(x => x.equip === 'TK146');
      return r ? { found: true, hasSign: !!r.sign, size: r.sign ? r.sign.size : 0 } : { found: false };
    });
    ok('recovers cleanly once the pad can be read again', saved.found && saved.hasSign && saved.size > 0, JSON.stringify(saved));
    await ctx.close();
  }

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); srv.close(); process.exit(1); });
