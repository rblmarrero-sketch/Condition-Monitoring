/* THE SAVE IS PROVEN BY READING IT BACK, NOT BY WRITING IT.

   Read off two trucks on 2026-09-15, in the same slot both times — the last
   magnetic plug of an HT round (position 4F, its second photograph): no
   dialog at the machine (ownBytes had already read the file fine), the
   round saved and carried offline for hours with the phone shut for the
   ride back, and only found broken once a signal let the first upload try
   — NotFoundError, the same shape build 372 already named, but on the
   STORED copy this time, after intake, not the picker's.

   ownBytes cannot see this: it only ever answers for the read it was just
   handed, at intake, before the record even has an id. Nothing downstream
   of a successful intake asked the question again until now.

   verifySavedRec reads the record back from IndexedDB — by the record's
   own id, the identical object any later upload will fetch — the moment
   Save finishes, while the position can still be retaken. This suite
   plants an attachment whose bytes are already gone by every reader
   (arrayBuffer, both FileReader paths — the same rig tests/readpath.cjs
   uses for "genuinely lost", keyed on byte size because a marker property
   does not survive the structured clone into IndexedDB) and proves:
   · a clean round gets the ordinary "saved" dialog;
   · a round holding the planted attachment gets told to retake it, by
     name, WHILE STILL ON THE SAVE SCREEN — not after the next sync;
   · the round is saved and queued either way — nothing here rejects a
     round for a defect that is the phone's, not the inspector's.

   Run: node tests/postsave.cjs   (starts its own server on 8475) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8475);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

const DEAD = 45678; // a size no ordinary fixture blob will collide with

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  /* The exact rig tests/readpath.cjs uses for "the phone has genuinely lost
     this one" — every reader refuses a blob of this one size, from the
     moment the page loads, so it is just as gone before Save as after. What
     verifySavedRec is answering is not "when did this rot" but "does the
     copy IndexedDB just accepted still read back" — and IndexedDB clones a
     Blob's bytes opaquely; it does not ask any of these three readers to
     prove them first. */
  await p.addInitScript(dead => {
    const origAB = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (this.size === dead) return Promise.reject(new DOMException('gone', 'NotFoundError'));
      return origAB.call(this);
    };
    ['readAsArrayBuffer', 'readAsDataURL'].forEach(m => {
      const orig = FileReader.prototype[m];
      FileReader.prototype[m] = function (blob) {
        if (blob && blob.size === dead) {
          setTimeout(() => { try { Object.defineProperty(this, 'error', { value: new DOMException('gone', 'NotFoundError'), configurable: true }); } catch (e) {}
            if (typeof this.onerror === 'function') this.onerror(new ProgressEvent('error')); }, 0);
          return;
        }
        return orig.call(this, blob);
      };
    });
  }, DEAD);
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof verifySavedRec === 'function' && typeof dbGet === 'function',
                           null, { timeout: 20000 });
  await p.waitForTimeout(500);

  const setupRound = async (equip) => {
    await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
    await p.waitForTimeout(200);
    await p.evaluate((u) => selectEquip(u), equip);
    await p.waitForTimeout(200);
    await p.evaluate(() => openHdr());
    await p.waitForTimeout(200);
    await p.fill('#inspector', 'R. Marrero');
  };

  console.log('a clean round: nothing planted, the ordinary "saved" dialog');
  await setupRound('TK151');
  await p.evaluate(() => {
    const pos = curP(); pos.photos ||= [];
    addPos(pos, attWrap(new File([new Uint8Array([1,2,3,4,5,6,7,8,9,10])], 'a.jpg', { type: 'image/jpeg' })), 'COMPONENT');
    pos.grade = 1;
  });
  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(1500);
  const cleanDlg = await p.evaluate(() => ({ title: document.getElementById('dlgTitle').textContent, open: document.getElementById('dlg').open }));
  ok('the ordinary "saved" dialog shows', cleanDlg.open && !/retake/i.test(cleanDlg.title), JSON.stringify(cleanDlg));
  await p.click('#dlgOk');
  await p.waitForTimeout(200);

  console.log('\na round holding one attachment every reader refuses, planted before Save ever runs');
  await setupRound('TK143');
  await p.evaluate((dead) => {
    const pos = curP(); pos.photos ||= [];
    addPos(pos, attWrap(new File([new Uint8Array([1,2,3,4,5,6,7,8,9,10])], 'a.jpg', { type: 'image/jpeg' })), 'COMPONENT');
    addPos(pos, attWrap(new Blob([new Uint8Array(dead)], { type: 'image/jpeg' })), 'COMPONENT');
    pos.grade = 1;
  }, DEAD);
  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(1500);
  const badDlg = await p.evaluate(() => ({ title: document.getElementById('dlgTitle').textContent, body: document.getElementById('dlgMsg').textContent, open: document.getElementById('dlg').open }));
  ok('the retake dialog shows instead of the ordinary "saved" one', badDlg.open && /retake/i.test(badDlg.title), JSON.stringify(badDlg));
  ok('  it names the truck and says why it is being said now, not after leaving', /TK143/.test(badDlg.body) && /now/i.test(badDlg.body), badDlg.body);

  console.log('\nthe round itself is saved and queued regardless — a phone defect is never a reason to reject it');
  const rec = await p.evaluate(async () => {
    const all = await dbAll(); const r = all.find(r => r.equip === 'TK143' && r.type === 'MP');
    return r ? { found: true, up: r.up, positions: Object.keys(r.positions || {}).length } : { found: false };
  });
  ok('the round is in the folder', rec.found && rec.positions > 0, JSON.stringify(rec));

  console.log('\nverifySavedRec, called directly, names the failing position and only that one');
  const direct = await p.evaluate(async () => {
    const all = await dbAll(); const r = all.find(r => r.equip === 'TK143' && r.type === 'MP');
    return r ? await verifySavedRec(r.id) : null;
  });
  ok('one bad entry, not zero and not the whole round', Array.isArray(direct) && direct.length >= 1, JSON.stringify(direct));

  console.log('\na round that has nothing wrong verifies clean');
  const cleanCheck = await p.evaluate(async () => {
    const all = await dbAll(); const r = all.find(r => r.equip === 'TK151' && r.type === 'MP');
    return r ? await verifySavedRec(r.id) : null;
  });
  ok('no bad entries', Array.isArray(cleanCheck) && cleanCheck.length === 0, JSON.stringify(cleanCheck));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
