/* THE ROUND SAYS WHICH FILES ARE ITS OWN.

   The phone has recorded, per photograph, since build 196: a stable id, the
   point it belongs to, its mime type, its byte size, its SHA-256, when it was
   captured and by whom, how many times it has been sent, and what the server
   said when it took it. Every word of it stayed on the phone. recToExport()
   did not carry it, so the sidecar that reached the folder said only how MANY
   photographs a point claimed.

   The office was therefore left to work out the file names for itself, from
   the point key — and a point with no key has no key to work from. That is
   the whole reason TK115's six photographs and DZ007's four have been
   unresolvable for a month: not lost, not missing, simply unmatchable.

   What this suite holds:

     the manifest travels with the round, per point, with every field
     the office matches by it, and by the server's own object key first
     a point with NO KEY is matched too, which was impossible before
     a round from before this build still works, by the old prediction
     nothing invents a name for a point that cannot have one

   Run: node tests/manifest.cjs      (needs tests/ed-srv.cjs on 8093
                                       and tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const DASH = `http://127.0.0.1:${Number(process.argv[2] || 8093)}/dashboard/index.html`;
const PHONE = 'http://127.0.0.1:8098/mobile/index.html';
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();

  console.log('\n1. THE PHONE PUTS IT IN THE SIDECAR');
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const ph = await ctx.newPage();
  const perr = []; ph.on('pageerror', e => perr.push(e.message));
  await ph.goto(PHONE, { waitUntil: 'load' });
  await ph.waitForTimeout(2500);

  const exported = await ph.evaluate(async () => {
    /* A round with two photographs on a real point and one on a point that
       never got a key — TK115's shape. Built through the app's own path, so
       the ids, hashes and ordinals are the ones it really writes. */
    const px = new Blob([new Uint8Array([255, 216, 255, 219, 0, 1, 2, 3, 4, 5])], { type: 'image/jpeg' });
    const rec = { id: 'test__TK115__2026-08-05__TB', rev: 1, equip: 'TK115', date: '2026-08-05',
                  type: 'TB', cls: 'HT', by: 'S. Volkov', smu: 8100, dev: 'DM12QM',
                  created: '2026-08-05T04:00:00Z',
                  positions: { 'F31': { mm: 12, photos: [] }, '': { grade: 'C', photos: [] } } };
    for (const k of ['F31', '']) {
      const n = k === 'F31' ? 2 : 1;
      for (let i = 0; i < n; i++) rec.positions[k].photos.push(attWrap(px));
    }
    await attSync(rec);
    await filesForRecord(rec);            // this is what decides the stored name
    const out = recToExport(rec);
    return { items: out.items.map(i => ({ key: i.key, photos: i.photos, att: i.att })) };
  });
  ok(perr.length === 0, 'the phone did not throw', perr.slice(0, 2).join(' | '));
  const keyed = exported.items.find(i => i.key === 'F31');
  const keyless = exported.items.find(i => !i.key);
  ok(!!(keyed && Array.isArray(keyed.att)), 'a point carries a manifest', JSON.stringify((keyed || {}).att || []).slice(0, 60));
  ok(keyed && keyed.att.length === 2, 'one entry per photograph', String((keyed || {}).att.length));
  ok(keyed && keyed.photos === 2, 'and the CLAIM is still the claim, separately', String((keyed || {}).photos));

  const FIELDS = ['attachmentId', 'seq', 'inspectionId', 'mediaType', 'mimeType', 'storedName',
                  'byteSize', 'sha256', 'capturedBy', 'capturedAt', 'uploadState', 'uploadAttempts'];
  const e0 = keyed && keyed.att[0];
  FIELDS.forEach(f => ok(e0 && e0[f] !== undefined && e0[f] !== '' || (f === 'uploadAttempts' && e0 && e0[f] === 0),
    `it carries ${f}`, e0 ? JSON.stringify(e0[f]) : 'no entry'));
  ok(e0 && /^[0-9a-f]{16,}$/i.test(String(e0.sha256)), 'the hash is a real digest', (e0 || {}).sha256);
  ok(e0 && e0.storedName && e0.storedName.indexOf('undefined') < 0,
     'and the stored name is the one the file goes up under', (e0 || {}).storedName);
  ok(keyless && keyless.att.length === 1 && keyless.att[0].storedName,
     'A POINT WITH NO KEY CARRIES ONE TOO', JSON.stringify((keyless || {}).att || []).slice(0, 80));
  await ctx.close();

  console.log('\n2. THE OFFICE MATCHES BY IT, AND BY THE SERVER\'S KEY FIRST');
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const derr = []; p.on('pageerror', e => derr.push(e.message));
  await p.goto(DASH, { waitUntil: 'load' });
  await p.waitForFunction(() => !!window.CMDash, null, { timeout: 25000 });
  await p.evaluate(BUNDLED + '()');
  await p.waitForTimeout(300);

  const REC = {
    equip: 'TK115', date: '2026-08-05', type: 'TB', cls: 'HT', by: 'S. Volkov', smu: 8100,
    items: [
      { key: 'F31', label: 'Front floor 31', mm: 12, photos: 2, att: [
        { attachmentId: 'a1', seq: 1, mediaType: 'photo', storedName: 'anything_at_all_1.jpg',
          byteSize: 1000, sha256: 'aa', capturedAt: '2026-08-05T04:00:00Z' },
        { attachmentId: 'a2', seq: 2, mediaType: 'photo', storedName: 'ignored.jpg',
          serverObjectId: 'TB/2026-08/the_server_name_2.jpg',
          byteSize: 1000, sha256: 'bb', capturedAt: '2026-08-05T04:01:00Z' } ] },
      /* The case that could not be answered at all. */
      { grade: 'C', comment: 'plate thinning', photos: 1, att: [
        { attachmentId: 'a3', seq: 1, mediaType: 'photo', storedName: 'keyless_evidence.jpg',
          byteSize: 1000, sha256: 'cc', capturedAt: '2026-08-05T04:02:00Z' } ] },
    ],
  };
  const HELD = ['anything_at_all_1.jpg', 'the_server_name_2.jpg', 'keyless_evidence.jpg'];

  const seen = await p.evaluate(a => {
    const [rec, held] = a;
    CMDash.importRecords([rec]);
    CMDrive.configured = () => true;
    CMDrive.names = () => held;
    CMDrive.hasName = n => held.indexOf(n) >= 0;
    held.forEach((n, i) => CMDash.addPhoto(n, 'blob:fake/' + i));
    const r = RECS.find(x => x.equip === 'TK115' && x.type === 'TB');
    const keyed = (r.items || []).find(i => i && i.key === 'F31');
    const keyless = (r.items || []).find(i => i && !i.key);
    const s = syncScan();
    return {
      keyed: serverMediaOf(keyed, r).map(m => m.name),
      keyless: serverMediaOf(keyless, r).map(m => m.name),
      keyedShown: mediaOf(keyed, r).map(m => m.name),
      keylessShown: mediaOf(keyless, r).map(m => m.name),
      byManifest: serverMediaOf(keyed, r).every(m => m.byManifest),
      tally: photoTally(r),
      expected: s.expected, present: s.present, gaps: s.gaps.length,
    };
  }, [REC, HELD]);
  ok(seen.keyed.includes('anything_at_all_1.jpg'),
     'a file the round names is found, whatever it is called', seen.keyed.join(' '));
  ok(seen.keyed.includes('the_server_name_2.jpg'),
     'and the server\'s own object key outranks the name the phone chose', seen.keyed.join(' '));
  ok(seen.byManifest, 'both are marked as matched by the manifest, not guessed');
  ok(seen.keyless.length === 1 && seen.keyless[0] === 'keyless_evidence.jpg',
     'A KEYLESS POINT IS MATCHED — which was impossible before', seen.keyless.join(' '));
  ok(seen.keylessShown.includes('keyless_evidence.jpg'),
     'and its photograph is on screen, not merely counted', seen.keylessShown.join(' '));
  /* syncScan deliberately does not count a record that is HELD, and TK115 is
     held — its keyless point carries a grade, which is a reading nobody can
     file until somebody names the component. That is right, and it is why the
     audit is asked here about the panel's own tally instead. */
  /* photoTally is scoped to the ORPHAN point — it is what the correction panel
     reads — so it answers about the one photograph on the keyless row. That is
     the one that could not be matched at all before. */
  ok(seen.tally && seen.tally.expected === 1 && seen.tally.received === 1 && seen.tally.missing === 0,
     'and the keyless point\'s photograph is counted as received', JSON.stringify(seen.tally));
  ok(seen.gaps === 0 && seen.expected === 0,
     'while the fleet audit leaves a held record out, as it always has',
     `${seen.present} of ${seen.expected}, ${seen.gaps} waiting`);

  console.log('\n3. A MISSING PHOTOGRAPH IS NAMED, EVEN ON A POINT WITH NO KEY');
  {
    /* One file arrived, one never did, both on a point with no key. Before the
       manifest the panel could only call the second one "#2" — which tells
       somebody chasing it nothing, and is unsearchable. */
    const r = await p.evaluate(() => {
      const rec = { equip: 'DZ007', date: '2026-08-02', type: 'UC', cls: 'DOZ', by: 'S. Volkov',
        items: [{ photos: 2, att: [
          { attachmentId: 'b1', seq: 1, mediaType: 'photo', storedName: 'dz_here.jpg',
            byteSize: 10, sha256: 'aa', capturedAt: '2026-08-02T04:00:00Z' },
          { attachmentId: 'b2', seq: 2, mediaType: 'photo', storedName: 'dz_never_arrived.jpg',
            byteSize: 10, sha256: 'bb', capturedAt: '2026-08-02T04:01:00Z' } ] }] };
      CMDash.importRecords([rec]);
      const held = ['dz_here.jpg'];
      CMDrive.names = () => held;
      CMDrive.hasName = n => held.indexOf(n) >= 0;
      CMDash.addPhoto('dz_here.jpg', 'blob:fake/x');
      const dz = RECS.find(x => x.equip === 'DZ007');
      const rows = orphanPhotos(dz);
      return { names: rows.map(x => x.name),
               unnamed: rows.filter(x => x.unnamed).length,
               tally: photoTally(dz),
               heldFor: (syncScan().quar.find(x => x.r.equip === 'DZ007') || {}).why || [] };
    });
    ok(r.names.includes('dz_here.jpg') && r.names.includes('dz_never_arrived.jpg'),
       'BOTH ARE NAMED — the one that arrived and the one that did not',
       r.names.join(' '));
    ok(r.unnamed === 0, 'neither is a "#2" placeholder any more', String(r.unnamed));
    ok(!r.names.some(n => /undefined|#/.test(n)), 'and nothing is invented', r.names.join(' '));
    ok(r.tally.expected === 2 && r.tally.received === 1 && r.tally.missing === 1,
       'one received, one missing', JSON.stringify(r.tally));
    /* Still held, and rightly: a photograph whose file never arrived is a
       synchronisation job somebody has to pick up. */
    ok(r.heldFor.indexOf('point') >= 0,
       'and the round stays on the correction list while one is outstanding',
       JSON.stringify(r.heldFor));
  }

  console.log('\n4. AND A ROUND FROM BEFORE THIS BUILD STILL WORKS');
  {
    const r = await p.evaluate(() => {
      const old = { equip: 'TK901', date: '2026-08-20', type: 'MP', cls: 'HT', by: 'S. Volkov',
                    items: [{ key: '4C', label: 'LR FD', grade: 'C', photos: 1 }] };
      CMDash.importRecords([old]);
      const rec = RECS.find(x => x.equip === 'TK901');
      const it = rec.items[0];
      const predicted = photoBases(it, rec)[0] + '.jpg';
      CMDrive.names = () => [predicted];
      CMDrive.hasName = n => n === predicted;
      CMDash.addPhoto(predicted, 'blob:fake/old');
      const found = serverMediaOf(it, rec);
      return { predicted, found: found.map(m => m.name), byManifest: found.some(m => m.byManifest) };
    });
    ok(r.found.includes(r.predicted), 'a round with no manifest is still matched by name', r.predicted);
    ok(!r.byManifest, 'and says it was matched by prediction, not by a manifest');
  }

  ok(derr.length === 0, 'nothing threw throughout', derr.slice(0, 2).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
})();
