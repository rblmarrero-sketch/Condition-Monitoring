/* THE SAVED RECORD MUST NOT SHARE A SINGLE BLOB WITH THE DRAFT IT REPLACES.

   Root-cause candidate for the offline photo-loss defect (2026-09-15):
   every time a position is left, draftKeep() writes the WHOLE current
   draft — the same live Blob/File objects a photograph already is — to
   IndexedDB under __draft__ (tests/wakehold.cjs and postsave.cjs already
   cover the read-back and the screen-awake side of that day; this is the
   third leg). A photograph taken early in a round is handed to dbPut()
   several times under that id before Save ever runs; Save then hands the
   SAME objects to dbPut() again under the round's own id and deletes the
   draft record within moments. Confirmed in the field only on iPhone,
   never on an identical Android test, always the FIRST photographs of the
   round and never the last — consistent with WebKit sharing or
   reference-counting IndexedDB blob storage across separate put() calls
   for what is, in memory, the identical object. Unconfirmed as the actual
   WebKit mechanism; Chromium does not exhibit it, so this suite cannot
   reproduce data loss directly. What it CAN prove is the fix's own
   contract: reArmForSave() must hand dbPut() a brand-new File for every
   photograph, one that was never the target of any earlier dbPut() call
   under any other id — so there is nothing left for dbDel(DRAFT_ID) to
   reach through, whatever WebKit's own mechanism turns out to be.

   Run: node tests/redraft.cjs   (starts its own server on 8488) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8488);
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const u = new URL(q.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end('x'); }
  s.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof reArmForSave === 'function' && typeof draftFlush === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  console.log('a two-photo round, drafted between each photo, then saved');
  await p.evaluate(() => {
    /* Every dbPut() call is recorded before it reaches IndexedDB, keyed by
       whether it targeted the draft or the round itself, capturing the
       actual JS object references handed in — the only way to ask "is
       this literally the same Blob" once something has gone through
       structured clone and back. */
    window.__calls = [];
    window.__realDbPut = window.dbPut;
    window.dbPut = async (rec) => {
      window.__calls.push({ draft: rec.id === '__draft__', positions: rec.positions });
      return window.__realDbPut(rec);
    };
  });

  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(200);
  await p.evaluate(() => openHdr());
  await p.waitForTimeout(200);
  await p.fill('#inspector', 'R. Marrero');

  await p.evaluate(async () => {
    const mk = (n) => attWrap(new File([new Uint8Array([n, n, n, n, n])], 'x.jpg', { type: 'image/jpeg' }));
    const posKeys = items().map(x => x.k);
    curItem = posKeys[0];
    let pos = curP(); pos.photos ||= [];
    addPos(pos, mk(1), 'COMPONENT'); pos.grade = 1;
    saveCur();
    await draftFlush();               // force it now rather than wait 400ms

    curItem = posKeys[1];
    pos = curP(); pos.photos ||= [];
    addPos(pos, mk(2), 'COMPONENT'); pos.grade = 1;
    saveCur();
    await draftFlush();
  });

  await p.evaluate(PLANT);
  await p.evaluate(() => goStep(3));
  await p.waitForTimeout(200);
  await p.click('#saveBtn');
  await p.waitForTimeout(800);

  const result = await p.evaluate(() => {
    const calls = window.__calls, draftCalls = calls.filter(c => c.draft);
    const p1Blob = draftCalls.length ? Object.values(draftCalls[0].positions)[0].photos[0] : null;
    const p2Blob = (() => {
      for (let i = draftCalls.length - 1; i >= 0; i--) {
        for (const pos2 of Object.values(draftCalls[i].positions)) {
          if (pos2.photos && pos2.photos[0] && pos2.photos[0] !== p1Blob) return pos2.photos[0];
        }
      }
      return null;
    })();

    const finalCall = calls.find(c => !c.draft);
    let finalP1 = null, finalP2 = null;
    if (finalCall) {
      for (const pos2 of Object.values(finalCall.positions)) {
        for (const ph of (pos2.photos || [])) {
          if (p1Blob && ph.name === p1Blob.name) finalP1 = ph;
          if (p2Blob && ph.name === p2Blob.name) finalP2 = ph;
        }
      }
    }

    window.dbPut = window.__realDbPut;
    return {
      draftCallCount: draftCalls.length,
      hadFinalCall: !!finalCall,
      p1SameObject: !!(p1Blob && finalP1 && p1Blob === finalP1),
      p2SameObject: !!(p2Blob && finalP2 && p2Blob === finalP2),
      p1NamesMatch: !!(p1Blob && finalP1 && p1Blob.name === finalP1.name),
      p2NamesMatch: !!(p2Blob && finalP2 && p2Blob.name === finalP2.name),
      p1SizesMatch: !!(p1Blob && finalP1 && p1Blob.size === finalP1.size),
    };
  });

  ok(result.draftCallCount >= 2, 'the draft was actually flushed at least twice before Save', JSON.stringify(result));
  ok(result.hadFinalCall, 'and the round itself was then saved under its own id', JSON.stringify(result));
  ok(!result.p1SameObject, 'the first photograph is a DIFFERENT object in the final record than in the draft', JSON.stringify(result));
  ok(!result.p2SameObject, 'and so is the second — neither is the object the draft ever put into storage', JSON.stringify(result));
  ok(result.p1NamesMatch && result.p2NamesMatch, 'but the attachment identity (the file name) survives the swap', JSON.stringify(result));
  ok(result.p1SizesMatch, 'and the bytes are the same content, just a fresh object', JSON.stringify(result));

  ok(errs.length === 0, 'no page errors throughout', errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
