/* FOUR PLACES THE SAME-KEY BLOB WRITE-BACK COULD LOSE OR MISREPORT DATA.

   Found while chasing the NotFoundError photo-loss defect (builds 384-417):
   two field devices (D1ZMK6, DZZ7H3), reinstalled and confirmed with healthy
   storage quota, both showed the SAME code-level symptom on every queued
   round: syncNow()'s own bookkeeping write-back (the dbPut(fresh) that
   records upTo/up/sent) failing with a null-error "storage may be full"
   fallback text on every single attempt. A multi-agent audit of the whole
   upload/draft/manifest pipeline converged on the same handful of real,
   independently-fixable gaps, none of which depend on ever proving the
   underlying platform mechanism:

   1. attNote()'s hash step (sha256Of) used only Blob.arrayBuffer() — every
      other read in this file falls back through FileReader before giving
      up. A photo that failed only that one reader got sha256:"" written
      PERMANENTLY (attNote only fills it "if not already set"), so attSync()
      reported changed=true for that record forever, including on every
      future Share/Export press — directly matching the one fact volunteered
      up front ("we are already doing share and zip, for a long time").

   2. filesForRecord() recomputes each attachment's storedName — a pure,
      deterministic function of equip/date/position/ordinal — on every sync
      attempt, and its caller re-persisted the record's ENTIRE Blob/File
      payload every time regardless of whether any name had actually
      changed. Gated now on whether a name genuinely changed.

   3. buildPackage() (Export/Share ZIP) called dbPut(rec) with no revision
      check at all — unlike syncNow's own two write-backs, which both
      re-read and check (fresh.rev||0)===rev specifically so an edit or an
      upload made during the pass is not silently discarded. Fixed to do
      the same re-read-and-check, merging in only what attSync actually
      touched (photos/video/att) rather than putting the whole stale
      snapshot back.

   4. buildPackage()'s own byte-copy step (readBytes) used a bare
      .arrayBuffer() with no FileReader fallback — the one weaker reader in
      the file, sitting inside the recovery tool the site actually leans on.

   None of these four require a WebKit engine to verify — they are ordinary
   logic bugs, reproducible on Chromium, independent of whatever the deeper
   platform mechanism (still unconfirmed) turns out to be.

   Run: node tests/sync-writeback-race.cjs   (starts its own server) */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8491);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404, cors); return res.end('no'); }
  res.writeHead(200, Object.assign({ 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }, cors));
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // No destinations configured — syncNow()/armRetry's background timer is a
  // no-op (UP.on is false), so the dbFailStreak counting in section 7 isn't
  // perturbed by an unrelated automatic sync attempt landing mid-count.
  await p.addInitScript(() => { localStorage.setItem('up_dests', '[]'); });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof sha256Of === 'function' && typeof filesForRecord === 'function'
    && typeof buildPackage === 'function' && typeof attSync === 'function', null, { timeout: 20000 });
  await p.waitForTimeout(300);

  console.log('1. sha256Of FALLS BACK THROUGH FILEREADER, LIKE EVERY OTHER READ IN THIS FILE');
  const r1 = await p.evaluate(async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const real = { ab: Blob.prototype.arrayBuffer };
    // One reader refuses (arrayBuffer), FileReader still succeeds — the
    // documented "readable, one reader refuses" shape, not "genuinely gone".
    Blob.prototype.arrayBuffer = function () {
      if (this.__rigged) return Promise.reject(new DOMException('nope', 'NotReadableError'));
      return real.ab.call(this);
    };
    const blob = new Blob([bytes], { type: 'image/jpeg' }); blob.__rigged = true;
    const good = await sha256Of(new Blob([bytes], { type: 'image/jpeg' }));
    const viaFallback = await sha256Of(blob);
    Blob.prototype.arrayBuffer = real.ab;
    return { good, viaFallback };
  });
  ok('a blob whose arrayBuffer() refuses still gets a real hash via the FileReader fallback',
     r1.viaFallback && r1.viaFallback.length === 64 && r1.viaFallback === r1.good, JSON.stringify(r1));

  console.log('\n   (control: a blob every reader refuses still comes back "" — not a crash, not a fabricated hash)');
  const r1b = await p.evaluate(async () => {
    const real = { ab: Blob.prototype.arrayBuffer, ra: FileReader.prototype.readAsArrayBuffer, ru: FileReader.prototype.readAsDataURL };
    Blob.prototype.arrayBuffer = function () { return Promise.reject(new DOMException('nope', 'NotReadableError')); };
    FileReader.prototype.readAsArrayBuffer = function () { setTimeout(() => this.onerror && this.onerror(new ProgressEvent('error')), 0); };
    FileReader.prototype.readAsDataURL = function () { setTimeout(() => this.onerror && this.onerror(new ProgressEvent('error')), 0); };
    const out = await sha256Of(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    Blob.prototype.arrayBuffer = real.ab; FileReader.prototype.readAsArrayBuffer = real.ra; FileReader.prototype.readAsDataURL = real.ru;
    return out;
  });
  ok('a blob genuinely unreadable by every reader still returns "", not a crash', r1b === '', JSON.stringify(r1b));

  console.log('\n2. THE MANIFEST SETTLES: attNote no longer leaves a permanently-dirty sha256 behind a single refused reader');
  const r2 = await p.evaluate(async () => {
    const real = Blob.prototype.arrayBuffer;
    let refuseNext = true;
    Blob.prototype.arrayBuffer = function () { if (refuseNext && this.__mark) return Promise.reject(new DOMException('nope', 'NotReadableError')); return real.call(this); };
    const blob = attWrap(new Blob([new Uint8Array([9, 9, 9, 9])], { type: 'image/jpeg' })); blob.__mark = true;
    const rec = { id: 'MANIFEST1', equip: 'TK1', date: '2026-09-01', type: 'MP', rev: 0, positions: { P1: { photos: [blob] } } };
    const changed1 = await attSync(rec);   // arrayBuffer() refuses once here — must still settle via FileReader
    refuseNext = false;
    const changed2 = await attSync(rec);   // nothing left to learn — must report settled
    Blob.prototype.arrayBuffer = real;
    const e = Object.values(attMap(rec.positions.P1))[0];
    return { changed1, changed2, sha256: e && e.sha256, byteSize: e && e.byteSize };
  });
  ok('the first pass, hitting one refused reader, still produces a real sha256 (not "")', r2.changed1 === true && r2.sha256 && r2.sha256.length === 64, JSON.stringify(r2));
  ok('the manifest actually settles on the next pass — attSync no longer reports changed forever', r2.changed2 === false, JSON.stringify(r2));

  console.log('\n3. filesForRecord: A DETERMINISTIC NAME RECOMPUTED IS NOT A NAME THAT CHANGED');
  const r3 = await p.evaluate(async () => {
    const blob = attWrap(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const rec = { id: 'NAMES1', equip: 'TK2', date: '2026-09-01', type: 'MP', rev: 0, positions: { P1: { photos: [blob] } } };
    await attSync(rec);   // Save-time pass: manifest exists, storedName still unset
    const f1 = await filesForRecord(rec);
    const f2 = await filesForRecord(rec);   // an ordinary retry: same equip/date/position, same name
    return { c1: f1.namesChanged, c2: f2.namesChanged, name1: f1[0] && f1[0].name, name2: f2[0] && f2[0].name };
  });
  ok('the first call, which actually assigns the name, reports a change', r3.c1 === true, JSON.stringify(r3));
  ok('a later call recomputing the identical name reports no change', r3.c2 === false && r3.name1 === r3.name2, JSON.stringify(r3));

  console.log('\n   (control: a genuinely different name — e.g. after an edit — is still reported as changed)');
  const r3b = await p.evaluate(async () => {
    const blob = attWrap(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    const rec = { id: 'NAMES2', equip: 'TK2', date: '2026-09-01', type: 'MP', rev: 0, positions: { P1: { photos: [blob] } } };
    await attSync(rec);
    await filesForRecord(rec);
    rec.equip = 'TK3';   // a real change to what the file must be called
    const f = await filesForRecord(rec);
    return f.namesChanged;
  });
  ok('a name that actually changes is still caught', r3b === true, JSON.stringify(r3b));

  console.log('\n4. buildPackage(): A CONCURRENT WRITE-BACK IS NEVER SILENTLY REVERTED');
  const r4 = await p.evaluate(async () => {
    // buildPackage() runs its attSync/write pass over EVERY record in
    // dbAll() — clear what earlier steps left behind so this record is the
    // only one in the loop and the injected race lands on it, not on
    // whichever record the store happens to enumerate first.
    for (const old of await dbAll()) await dbDel(old.id).catch(() => {});
    // No attachment id yet — the "round captured by an older build" shape
    // buildPackage's own comment names, which is exactly what forces its
    // attSync() pass to report changed=true and take the write branch.
    const raw = new Blob([new Uint8Array([5, 5, 5, 5, 5])], { type: 'image/jpeg' });
    const rec = { id: 'RACE1', equip: 'TK9', date: '2026-09-01', type: 'MP', rev: 0, up: 0,
      positions: { P1: { photos: [raw] } } };
    await dbPut(rec);
    const realAttSync = window.attSync;
    // Simulate syncNow's own write-back landing WHILE buildPackage is still
    // working through this record — the exact interleaving the field data
    // implies for a phone whose retry timer and Share/Export both touch the
    // same queue.
    window.attSync = async (r) => {
      const mid = await dbGet(r.id);
      mid.rev = 1; mid.up = 1; mid.upTo = { gas: 1 }; delete mid.sent;
      await dbPut(mid);
      window.attSync = realAttSync;
      return await realAttSync(r);
    };
    await buildPackage();
    const after = await dbGet('RACE1');
    return { rev: after.rev, up: after.up, upTo: after.upTo };
  });
  ok('the concurrent write-back\'s rev/up/upTo survive a Share/Export pass started before it landed',
     r4.rev === 1 && r4.up === 1 && r4.upTo && r4.upTo.gas === 1, JSON.stringify(r4));

  console.log('\n   (control: with no race, buildPackage still does its own job — an old-build photo gets a manifest entry)');
  const r4b = await p.evaluate(async () => {
    for (const old of await dbAll()) await dbDel(old.id).catch(() => {});
    const raw = new Blob([new Uint8Array([6, 6, 6, 6, 6])], { type: 'image/jpeg' });
    const rec = { id: 'RACE2', equip: 'TK9', date: '2026-09-01', type: 'MP', rev: 0, up: 0,
      positions: { P1: { photos: [raw] } } };
    await dbPut(rec);
    await buildPackage();
    const after = await dbGet('RACE2');
    const m = after.positions.P1.att || {};
    return { hasManifest: Object.keys(m).length > 0, hasAid: !!attIdOf(after.positions.P1.photos[0]) };
  });
  ok('buildPackage\'s own manifest-completion effect still lands when nothing raced it — the fix is not a no-op',
     r4b.hasManifest === true && r4b.hasAid === true, JSON.stringify(r4b));

  console.log('\n5. buildPackage()\'s ZIP byte-copy (readBytes) FALLS BACK THROUGH FILEREADER TOO');
  const r5 = await p.evaluate(async () => {
    for (const old of await dbAll()) await dbDel(old.id).catch(() => {});
    // A custom marker property does not survive the structured clone into
    // IndexedDB (the exact reason tests/postsave.cjs keys on byte size
    // instead) and buildPackage() reads its own fresh dbAll() copy, not this
    // in-memory object — so the rig has to key off something that DOES
    // survive the round trip: the blob's own size.
    const DEAD_SIZE = 44444;
    const real = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () { if (this.size === DEAD_SIZE) return Promise.reject(new DOMException('nope', 'NotReadableError')); return real.call(this); };
    const blob = attWrap(new Blob([new Uint8Array(DEAD_SIZE)], { type: 'image/jpeg' }));
    const rec = { id: 'ZIP1', equip: 'TK5', date: '2026-09-01', type: 'MP', rev: 0, up: 0,
      positions: { P1: { photos: [blob] } } };
    await dbPut(rec);
    const pkg = await buildPackage();
    Blob.prototype.arrayBuffer = real;
    return { photos: pkg.photos, skippedCount: (pkg.skipped || []).length };
  });
  ok('a photo readable only via FileReader lands in the ZIP, not in the recovery/skipped list', r5.photos >= 1 && r5.skippedCount === 0, JSON.stringify(r5));

  console.log('\n6. dbPut TAGS WHICH EVENT ACTUALLY FIRED, AND WHETHER A REQUEST-LEVEL ERROR WAS SEEN');
  /* Shipped after D1ZMK6's own build-418 field trace showed the request-level
     capture (added earlier this build) still came back null on every one of
     nineteen writeback-fail lines in one run — meaning whatever fails there
     isn't surfacing as a request error at all. This tags which transaction
     event fired (abort vs error) and whether the request ever reported one,
     so the NEXT field trace can tell those apart instead of everything
     looking like the identical generic guess. */
  const r6 = await p.evaluate(async () => {
    // Force a genuine transaction failure (abort() called mid-flight, the
    // one thing a page script CAN reliably trigger) and confirm the
    // rejection carries which event fired and whether a request-level
    // error was seen — whatever those actually are for this engine, rather
    // than an assumption about spec event ordering this project cannot
    // verify without a real failure to test against.
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v) {
      const rq = realPut.call(this, v);
      this.transaction.abort();
      return rq;
    };
    let threw = null;
    try { await dbPut({ id: 'ABORT1', x: 1 }); }
    catch (e) { threw = { phase: e && e.phase, hadReqErr: !!(e && e.hadReqErr) }; }
    IDBObjectStore.prototype.put = realPut;
    return threw;
  });
  ok('a forced transaction failure is tagged with a real phase, not left blank',
     r6 && (r6.phase === 'abort' || r6.phase === 'error'), JSON.stringify(r6));
  ok('  and hadReqErr reports whether the request itself carried the error', r6 && r6.hadReqErr === true, JSON.stringify(r6));

  console.log('\n7. THREE CONSECUTIVE WRITE FAILURES FORCE A FRESH CONNECTION, AND A SUCCESS RESETS THE COUNT');
  /* D1ZMK6's own field data: the same write failed the same way nineteen
     times in one run, on one connection, after that same shape of write had
     just succeeded minutes earlier on what was then a freshly-opened one.
     Nothing here proves reopening the connection fixes the underlying
     platform issue — that is still unconfirmed — but it is a cheap, safe
     recovery attempt (IDBDatabase.close() waits for in-flight work to
     finish) and it is directly testable: does dbConn actually get replaced,
     and does the phone keep working afterward. */
  const r7 = await p.evaluate(async () => {
    // dbFailStreak is the mechanism's own, directly-readable state — the
    // synchronous, deterministic contract that actually matters. (A
    // close()-call spy was tried first and dropped: dbReconnect's own
    // close() runs off an already-resolved promise's .then(), an async
    // microtask whose exact landing tick relative to a later test section
    // isn't something worth pinning a test to — the streak variable itself
    // is reset synchronously, in the same tick dbReconnect runs, and is
    // what every other behaviour here actually depends on.)
    dbFailStreak = 0;
    const realPut = IDBObjectStore.prototype.put;
    let failing = true;
    IDBObjectStore.prototype.put = function (v) {
      const rq = realPut.call(this, v);
      if (failing) this.transaction.abort();
      return rq;
    };
    // Two failures — below the reconnect threshold — must leave the streak
    // at 2, not reset it early.
    for (let i = 0; i < 2; i++) { try { await dbPut({ id: 'STREAK' + i }); } catch (e) {} }
    const streakAfterTwo = dbFailStreak;
    // A genuine success must reset it to 0, so a later run of failures is
    // never treated as a continuation of an old one.
    failing = false;
    await dbPut({ id: 'STREAK-OK' });
    const streakAfterSuccess = dbFailStreak;
    // Three consecutive failures since that reset must cross the threshold
    // — dbReconnect's own first act is zeroing the streak, so seeing it
    // back at 0 here (not 3) is exactly the evidence a reconnect fired.
    failing = true;
    for (let i = 0; i < 3; i++) { try { await dbPut({ id: 'STREAK2-' + i }); } catch (e) {} }
    const streakAfterThree = dbFailStreak;
    IDBObjectStore.prototype.put = realPut;
    failing = false;
    // However that reconnect actually lands, the phone must still be able
    // to write and read normally afterward — a reconnect that leaves it
    // unable to reopen its own store would be worse than the failure it
    // was meant to recover from.
    let stillWorks = false;
    try { await dbPut({ id: 'AFTER-RECONNECT', ok: 1 }); const back = await dbGet('AFTER-RECONNECT'); stillWorks = !!(back && back.ok === 1); }
    catch (e) { stillWorks = false; }
    return { streakAfterTwo, streakAfterSuccess, streakAfterThree, stillWorks };
  });
  ok('two consecutive failures leave the streak at 2, not reset', r7.streakAfterTwo === 2, JSON.stringify(r7));
  ok('a genuine success resets the streak to 0', r7.streakAfterSuccess === 0, JSON.stringify(r7));
  ok('three consecutive failures cross the threshold — the streak is back at 0, evidence a reconnect fired', r7.streakAfterThree === 0, JSON.stringify(r7));
  ok('the phone can still read and write normally right after', r7.stillWorks === true, JSON.stringify(r7));

  console.log('\n8. visInfo() REPORTS WHETHER THE PHONE WAS FOREGROUNDED');
  const r8 = await p.evaluate(() => {
    const v = visInfo();
    return { hasHidden: v && typeof v.hidden === 'boolean', hasVis: v && typeof v.vis === 'string', hasMs: v && typeof v.msSinceVisChange === 'number' };
  });
  ok('visInfo reports hidden/vis/msSinceVisChange, the three fields the theory needs', r8.hasHidden && r8.hasVis && r8.hasMs, JSON.stringify(r8));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
