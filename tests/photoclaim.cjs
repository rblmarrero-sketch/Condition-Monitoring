/* ONE RECONCILIATION, OR THE PAGE CONTRADICTS ITSELF.

   The deployed dashboard said both of these at once, computed from the same
   records, seconds apart, on one screen:

     314 of 314 field photographs received · 0 missing · 0 waiting ·
     "every attachment accounted for"

     two inspections on hold · ten photo files missing ·
     TK115 six expected, zero received · DZ007 four expected, zero received

   The folder held all ten. Asked directly it listed every one of them, and
   serverMediaOf() — the resolver the sync tab counts with — found all six
   TK115 files by name on the very same render that showed six grey
   placeholders labelled "#1 … #6, photo file missing".

   The difference between the two answers was the SOURCE:

     syncScan()      asked CMDrive's object index — what the store holds
     orphanPhotos()  asked mediaAll(), which reads folderPhotos — a cache
                     filled lazily when a thumbnail scrolls into view

   So on a freshly loaded page the correction panel believed nothing had ever
   arrived, and said so in the strongest words the app has. A false alarm and a
   false reassurance, side by side, from one pass over one set of records.

   Underneath it, photoState() answered two questions with one word: "no src"
   meant "expected, never received", when it also meant "the picture has not
   been fetched yet". Received is a fact about the FOLDER; displayable is a
   fact about THIS SCREEN. They are now separate, and the invariant holds:

     expected = received + missing
     received = assigned + general + awaiting assignment + still loading

   Run: node tests/photoclaim.cjs      (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

(async () => {
  /* Two rounds shaped exactly like the ones that started this: photographs on
     a keyless point. TK115 is the case where the folder holds all six and the
     panel said none had arrived; TK900 is the control where they genuinely
     never did, so the guard has to tell them apart rather than simply stop
     reporting. */
  await reset('n=4');
  await reset('keyless=TK115,2026-08-05,TB,6,have');
  await reset('keyless=TK900,2026-08-05,TB,3,none');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 2, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  /* THE EXACT SHAPE OF THE TWO RECORDS THAT STARTED THIS: photographs on a
     point with NO KEY, so they cannot be named from the point and have to be
     resolved from the folder. The mock holds <unit>_4C_<date>_MP.jpg for each
     seeded unit, so a keyless claim against a unit whose file exists is the
     case that was being called "missing". */
  const held = await p.evaluate(() => {
    const names = [];
    try { for (const n of (CMDrive.mediaNames ? CMDrive.mediaNames() : [])) names.push(n); }
    catch (e) {}
    return names;
  });
  console.log('   store holds ' + held.length + ' media name(s)');

  const fx = { here: 'TK115', gone: 'TK900' };
  const seen = await p.evaluate(f => ({
    here: !!RECS.find(r => r.equip === f.here),
    gone: !!RECS.find(r => r.equip === f.gone) }), fx);
  ok('the fixture round whose files exist is on the board', seen.here);
  ok('and the one whose files never arrived is too', seen.gone);
  console.log('   ' + fx.here + ' claims 6 and the folder has them; '
            + fx.gone + ' claims 3 and the folder has none');

  console.log('\n1. THE TWO PANELS AGREE, BECAUSE THEY ASK THE SAME SOURCE');
  const A = await p.evaluate(u => {
    const r = RECS.find(x => x.equip === u);
    const tl = photoTally(r);
    const s = syncScan();
    /* What the sync tab believes about this same record. */
    let sHeld = 0, sClaim = 0;
    (r.items || []).forEach(i => {
      const claim = window.CMNorm ? CMNorm.photoCount(i.photos) : 0;
      if (!claim) return;
      sClaim += claim;
      sHeld += Math.min(serverMediaOf(i, r).filter(m => m.kind === 'photo').length, claim);
    });
    return { tally: tl, syncClaim: sClaim, syncHeld: sHeld,
             waiting: s.gaps.some(g => g.r.equip === u),
             onHold: s.quar.some(q => (q.r || {}).equip === u) };
  }, fx.here);
  console.log('   ' + JSON.stringify(A));
  ok('the sync tab finds the files the folder holds', A.syncHeld === 6, A.syncHeld + ' of ' + A.syncClaim);
  ok('  and the correction panel agrees they were received',
     A.tally.received === 6, JSON.stringify(A.tally));
  ok('  neither of them calls a file the store holds missing',
     A.tally.missing === 0 && !A.waiting, 'missing ' + A.tally.missing + ', waiting ' + A.waiting);

  console.log('\n2. A FILE THAT REALLY IS ABSENT IS STILL REPORTED');
  const G = await p.evaluate(u => {
    const r = RECS.find(x => x.equip === u);
    const s = syncScan();
    return { tally: photoTally(r),
             waiting: s.gaps.some(g => g.r.equip === u),
             miss: (s.gaps.find(g => g.r.equip === u) || {}).miss || [] };
  }, fx.gone);
  console.log('   ' + JSON.stringify(G.tally));
  ok('the round whose files never arrived is short', G.tally.missing === 3,
     G.tally.missing + ' missing');
  ok('  received nothing', G.tally.received === 0, G.tally.received + ' received');
  ok('  and the sync tab lists it as waiting', G.waiting, 'waiting ' + G.waiting);
  ok('  naming the files it is waiting for', G.miss.length === 3, G.miss.length + ' named');

  console.log('\n3. THE INVARIANT HOLDS FOR EVERY RECORD ON THE BOARD');
  /* expected = received + missing, and received breaks down with nothing left
     over. Checked across the whole board, not on the fixture, because the
     failure was two counters disagreeing and one record is not enough to catch
     that. */
  const inv = await p.evaluate(() => {
    const bad = [];
    RECS.forEach(r => {
      if (r._void) return;
      const t = photoTally(r);
      if (t.expected !== t.received + t.missing)
        bad.push(r.equip + ' exp' + t.expected + ' != rec' + t.received + '+miss' + t.missing);
      const parts = t.assigned + t.needs + t.loading;
      if (t.received !== parts)
        bad.push(r.equip + ' rec' + t.received + ' != assigned+awaiting+loading=' + parts);
    });
    return bad;
  });
  ok('expected = received + missing, on every record', inv.length === 0, inv.slice(0, 3).join(' | '));

  console.log('\n4. A PLACEHOLDER IS NEVER COUNTED AS A RECEIVED FILE');
  const ph = await p.evaluate(u => {
    const r = RECS.find(x => x.equip === u);
    const all = orphanPhotos(r);
    return { unnamed: all.filter(x => x.unnamed).length,
             countedReceived: all.filter(x => x.unnamed && photoState(x) !== 'missing').length,
             assignable: all.filter(x => x.unnamed && photoActionable(x)).length };
  }, fx.gone);
  ok('the shortfall is shown as placeholders', ph.unnamed === 3, ph.unnamed + '');
  ok('  none of which counts as received', ph.countedReceived === 0, ph.countedReceived + '');
  ok('  and none of which can be assigned', ph.assignable === 0, ph.assignable + '');

  console.log('\n5. RECEIVED IS ABOUT THE FOLDER; DISPLAYABLE IS ABOUT THIS SCREEN');
  /* The distinction the old code did not have. A photograph the store holds
     whose thumbnail has not been fetched is RECEIVED and not yet assignable —
     it must never read as "never arrived". */
  const ld = await p.evaluate(() => {
    const p1 = { name: 'x.jpg', onServer: 1 };                 // held, no picture yet
    const p2 = { name: 'y.jpg' };                              // nothing at all
    const p3 = { name: 'z.jpg', src: 'blob:1' };               // picture in hand
    const p4 = { name: 'w.jpg', onServer: 1, a: { point: '4C' } };  // filed, no picture
    return { held: photoState(p1), none: photoState(p2), shown: photoState(p3), filed: photoState(p4),
             heldRec: photoReceived(p1), noneRec: photoReceived(p2),
             heldAct: photoActionable(p1), shownAct: photoActionable(p3) };
  });
  ok('a file the store holds is "loading", not "missing"', ld.held === 'loading', ld.held);
  ok('  and counts as received', ld.heldRec === true, String(ld.heldRec));
  ok('  but cannot be assigned until it can be seen', ld.heldAct === false, String(ld.heldAct));
  ok('a file nowhere at all is missing', ld.none === 'missing', ld.none);
  ok('  and does not count as received', ld.noneRec === false, String(ld.noneRec));
  ok('a picture in hand is assignable', ld.shown === 'viewable' && ld.shownAct === true, ld.shown);
  /* A decision already made outranks whether the picture happens to be loaded —
     otherwise an assignment reverts to "missing" on the next page load. */
  ok('and a photograph already filed stays filed with no picture loaded',
     ld.filed === 'point', ld.filed);

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
