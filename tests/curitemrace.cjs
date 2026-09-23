/* addPicked() AND acceptVideo() ATTACHED EVIDENCE TO WHATEVER POSITION WAS
   OPEN WHEN THE SLOW PART FINISHED, NOT THE ONE THE PICKER WAS OPENED FOR —
   AND, ONE LEVEL DEEPER, COULD LOSE IT ENTIRELY.

   takePhoto() has always captured curP() the instant its own one async gap
   (the picker itself) closes, and never re-reads curItem after that. addPicked
   did not: it called ownBytes() on the whole batch first — genuinely slow on
   several files (build 372's own "gallery batch" fix, tests/gallerybatch.cjs)
   — and only read curItem once that settled. A phone is fully interactive
   again the instant the OS picker hands control back, so an inspector who
   taps a different position while a multi-file batch is still being secured
   had every one of those photographs, and the one clip through acceptVideo(),
   land on whatever position they had since moved to — silently mislabelling
   evidence onto the wrong machine position, the exact failure mode the
   camera-only single-file path (takePhoto) never had a window for.

   acceptVideo() had the identical shape one level down: it read curP() AGAIN
   inside its own async metadata-load callback, which fires only once the
   clip's duration is known — real time on a real clip.

   Capturing the POSITION OBJECT early (curP()) rather than re-reading curItem
   late fixes the misattribution — but not by itself. saveCur() (called by
   pickComponent on every navigation) deletes an EMPTY position's own entry
   the instant the inspector taps away from it — including the position this
   batch belongs to, mid-securing, before anything has actually landed on it.
   An object captured before that delete still exists in memory, but under no
   key draft.positions can ever be reached from again — the evidence is
   secured, decoded, and then orphaned: this project's "real value rendered as
   nothing" defect one level further down than the misattribution itself.

   The fix captures the KEY (curItem, a string) rather than the object, and
   derives draft.positions[key] ||= {} again AFTER the securing await — which
   both fixes the misattribution (the key is frozen before the slow part) and
   self-heals the delete (a missing key is simply recreated, and a key the
   inspector has meanwhile revisited and typed something real into is found
   and added to rather than clobbered). acceptVideo(f, posKey) carries the
   same key through its own async gap the same way.

   Run: node tests/curitemrace.cjs (starts its own server) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8493);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((q, s) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
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
  await p.waitForFunction(() => typeof addPicked === 'function' && typeof acceptVideo === 'function', null, { timeout: 30000 });

  await p.evaluate(() => { const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(200);
  await p.evaluate(() => selectEquip('TK151'));
  await p.waitForTimeout(400);
  const codes = await p.evaluate(() => [...document.querySelectorAll('#posnav [data-pos]')].map(b => b.dataset.pos));
  ok('at least two positions exist to switch between', codes.length >= 2, codes.join(','));
  const [posA, posB] = codes;

  console.log('\n1. addPicked(): a photograph lands on the position open when the picker was used, not wherever curItem drifted to while it was being secured');
  const photoResult = await p.evaluate(async ({ a, b: bCode }) => {
    /* Position A is given something real BEFORE the race, so saveCur()'s own
       "nothing recorded here yet" cleanup does not delete it when the
       inspector taps away — isolating the misattribution from the orphaning
       case, which section 2 below tests on its own. */
    pickComponent(a);
    (draft.positions[a] ||= {}).comment = 'already has real evidence';
    const origOwn = window.ownBytes;
    let releaseSecuring;
    const gate = new Promise(res => { releaseSecuring = res; });
    window.ownBytes = async (blob) => { await gate; return origOwn(blob); };
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    c.getContext('2d').fillRect(0, 0, 64, 64);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    const file = new File([blob], 'race.jpg', { type: 'image/jpeg' });
    const runner = addPicked([file]);
    /* addPicked is now blocked inside ownBytes(), mid-securing — exactly the
       window a real inspector has on a real multi-file batch. Switch curItem
       here, the way a real tap would, before releasing the gate. */
    const beforeA = (draft.positions[a].photos || []).length, beforeB = ((draft.positions[bCode] || {}).photos || []).length;
    pickComponent(bCode);
    releaseSecuring();
    await runner;
    window.ownBytes = origOwn;
    /* intakeNoted renames every photograph onto the app's own equip/position/
       date/ordinal scheme (see CLAUDE.md's own "A NAME PRESENT AT A NONZERO
       SIZE..." entry) — the picked file's own name never survives, so the
       proof is which position's photo COUNT grew, not a name match. */
    return {
      onA: (draft.positions[a].photos || []).length > beforeA,
      onB: ((draft.positions[bCode] || {}).photos || []).length > beforeB,
    };
  }, { a: posA, b: posB });
  ok('the photograph landed on the position the picker was opened for', photoResult.onA, JSON.stringify(photoResult));
  ok('  not on the position curItem drifted to while securing was in flight', !photoResult.onB, JSON.stringify(photoResult));

  console.log('\n2. addPicked(): a batch started on a position that is still EMPTY is not orphaned when saveCur() deletes that entry mid-securing');
  const orphanResult = await p.evaluate(async ({ a, b: bCode }) => {
    delete draft.positions[a]; delete draft.positions[bCode];
    pickComponent(a);   // position A exists now, but carries nothing real yet
    /* loadPos() may have stamped a live 1C work order onto it (roundWO()) —
       real on this equipment, and by itself enough to keep saveCur() from
       ever cleaning it up (its guard is "!hasData(p) && !p.wo"). Cleared on
       BOTH the model and the #wo field itself, or saveCur() (which reads the
       screen, not the model) would just read the stale DOM value straight
       back onto p.wo the moment it next runs — to test the genuinely-empty
       case a machine with no open order is actually in. */
    delete draft.positions[a].wo;
    const woEl = document.getElementById('wo'); if (woEl) woEl.value = '';
    const origOwn = window.ownBytes;
    let releaseSecuring;
    const gate = new Promise(res => { releaseSecuring = res; });
    window.ownBytes = async (blob) => { await gate; return origOwn(blob); };
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    c.getContext('2d').fillRect(0, 0, 64, 64);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
    const file = new File([blob], 'orphan.jpg', { type: 'image/jpeg' });
    const runner = addPicked([file]);
    /* pickComponent(bCode) calls saveCur() FIRST, on the still-current
       position A — which is still genuinely empty, so its own cleanup rule
       (hasData(p) false, no p.wo) deletes draft.positions[a] right here,
       while addPicked's captured reference to it (pre-fix) would already be
       holding a now-orphaned object. */
    pickComponent(bCode);
    const deletedMidFlight = !draft.positions[a];
    releaseSecuring();
    await runner;
    window.ownBytes = origOwn;
    return {
      deletedMidFlight,
      onA: (draft.positions[a] && (draft.positions[a].photos || []).length) === 1,
      onB: !!((draft.positions[bCode] || {}).photos || []).length,
    };
  }, { a: posA, b: posB });
  ok('the empty position really was deleted mid-flight, so this is testing the real gap',
     orphanResult.deletedMidFlight, JSON.stringify(orphanResult));
  ok('the photograph still reaches the round — recreated under its own position, not lost in memory',
     orphanResult.onA, JSON.stringify(orphanResult));
  ok('  and not attached to the position the inspector moved to instead',
     !orphanResult.onB, JSON.stringify(orphanResult));

  console.log('\n3. acceptVideo(f, posKey): the clip reaches the position by NAME, never a stale object handed across its own async gap');
  const videoResult = await p.evaluate(async ({ a, b: bCode }) => {
    delete draft.positions[a]; delete draft.positions[bCode];
    pickComponent(a);
    delete draft.positions[a].wo;   // see section 2's own comment on why
    const woEl = document.getElementById('wo'); if (woEl) woEl.value = '';
    const key = curItem;        // captured the instant the caller starts, exactly as the fix does
    pickComponent(bCode);       // curItem drifts, and saveCur() deletes the still-empty position A
    const deletedMidFlight = !draft.positions[a];
    const file = new File([new Uint8Array([1, 2, 3])], 'clip.mp4', { type: 'video/mp4' });
    await acceptVideo(file, key);
    return {
      deletedMidFlight,
      onA: !!(draft.positions[a] && draft.positions[a].video && draft.positions[a].video.name === 'clip.mp4'),
      onB: !!(draft.positions[bCode] && draft.positions[bCode].video),
    };
  }, { a: posA, b: posB });
  ok('position A really was deleted mid-flight here too', videoResult.deletedMidFlight, JSON.stringify(videoResult));
  ok('the clip landed on the captured position, recreated under its own name', videoResult.onA, JSON.stringify(videoResult));
  ok('  not on whatever curItem had drifted to by the time metadata settled', !videoResult.onB, JSON.stringify(videoResult));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await ctx.close(); await b.close(); srv.close();
  console.log(fails.length ? `\nFAILED ${fails.length}: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
