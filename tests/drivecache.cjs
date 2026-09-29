/* THE DRIVE CACHE SURVIVES PAST WHAT LOCALSTORAGE COULD EVER HOLD.

   Read live on 2026-09-28: a fleet at ~70 inspections/day for three months is
   ~75 MB of JSON once every record is counted — many times a browser's 5-10 MB
   localStorage ceiling for one origin. Every save past that ceiling used to
   fail, and its own catch clause deleted the sync cursor along with the cache
   ("losing this cache is survivable, it only means a re-read" — true only
   while a fresh pull still fits, which stopped being true the day the fleet's
   own history crossed the ceiling). The result: a full re-download on every
   single reload, for ever, with nothing on screen saying why.

   This suite proves the fix — driveRecs now persists in IndexedDB, whose quota
   is the disk, not the origin — at a size the old mechanism could never have
   survived, and that a browser already carrying the old localStorage-shaped
   cache is carried across once rather than silently discarded.

   Run: node tests/drivecache.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* ~12 KB per record, matching what a live sample averaged. 900 of them is
   ~10.8 MB, comfortably past a 5 MB localStorage ceiling and enough to prove
   the point without a multi-minute test run; tablekit-scale.cjs already
   covers render performance at a much larger row count. */
function bigRecords(n) {
  const pad = 'x'.repeat(11000);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      equip: 'TK' + String(1 + (i % 900)).padStart(4, '0'), date: '2026-0' + (1 + i % 9) + '-1' + (i % 9),
      type: 'MP', cls: 'HT', by: 'R. Marrero', dev: 'DEV' + (i % 5),
      items: [{ key: '4C', label: 'LR Final Drive', grade: 1 + (i % 5), defect: '', comment: pad }],
    });
  }
  return out;
}

(async () => {
  const b = await chromium.launch();

  console.log('a cache many times past the old localStorage ceiling');
  {
    const p = await b.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await p.goto(B, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const RECS = bigRecords(900);
    const totalBytes = JSON.stringify(RECS).length;
    ok('the fixture itself is past a 5 MB localStorage ceiling', totalBytes > 8 * 1024 * 1024, (totalBytes / 1024 / 1024).toFixed(1) + ' MB');

    await p.evaluate(recs => { window.CMDash.setDriveRecords(recs, { replace: true }); }, RECS);
    await p.waitForTimeout(600);
    const afterSave = await p.evaluate(() => ({ len: RECS.length, errs: (window.__errs || []).map(e => e.where) }));
    ok('every record renders immediately from memory', afterSave.len === 900, afterSave.len + ' records');
    ok('saving that many did not raise a drive-cache error', !afterSave.errs.includes('drive-cache-save'), JSON.stringify(afterSave.errs));

    /* Give the fire-and-forget IndexedDB write time to actually land before
       the reload — setDriveRecords() never awaits it, on purpose (the render
       already happened from memory), so a test that reloads immediately after
       would race the write it is trying to prove survived. */
    await p.waitForTimeout(800);

    const lsSize = await p.evaluate(k => (localStorage.getItem(k) || '').length, 'cm_dash_drive');
    ok('localStorage itself was never asked to hold it', lsSize === 0, lsSize + ' bytes in localStorage');

    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 0, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
    const afterReload = await p.evaluate(() => ({ len: RECS.length, oneEquip: (RECS[0] || {}).equip }));
    ok('a refresh restores every record automatically, with no source to reconnect', afterReload.len === 900, afterReload.len + ' records');
    ok('and the content is the real cache, not a bundled fallback', /^TK\d{4}$/.test(afterReload.oneEquip || ''), afterReload.oneEquip);

    /* A SECOND plain refresh, same page, nothing saved in between — proving
       the read path (ddbGet finding data already there) settles again rather
       than the migration path being some one-off fluke of the first reload. */
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 0, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
    const again = await p.evaluate(() => RECS.length);
    ok('a second plain refresh still restores the cache, unattended', again === 900, again + ' records');
    ok('no page errors across the whole cycle', errs.length === 0, errs.slice(0, 3).join(' | '));
    await p.close();
  }

  console.log('\na browser upgrading from the old localStorage cache is carried across once');
  {
    const p = await b.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B, { waitUntil: 'load' });
    await p.waitForTimeout(800);
    /* Each b.newPage() is its own isolated context, so this page's storage is
       already empty — the deleteDatabase below is defensive, not load-bearing,
       in case that ever stops being true. Simulate the state a browser had
       BEFORE this fix: nothing in IndexedDB, a real cache already sitting in
       the old localStorage key — set directly (not via addInitScript, which
       would re-fire on every reload below and erase the very migration this
       block means to prove). */
    const legacy = [{ equip: 'TK900', date: '2026-08-01', type: 'MP', cls: 'HT', by: 'B. Ivanov',
      items: [{ key: '4C', label: 'LR Final Drive', grade: 3, defect: 'Ferrous debris' }] }];
    await p.evaluate(recs => new Promise((res, rej) => {
      try { localStorage.clear(); } catch (e) {}
      localStorage.setItem('cm_dash_drive', JSON.stringify(recs));
      const rq = indexedDB.deleteDatabase('cm_dash_idb');
      rq.onsuccess = rq.onerror = rq.onblocked = () => res();
    }), legacy);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 0, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(500);
    const migrated = await p.evaluate(() => ({
      recsLen: RECS.length, equip: (RECS.find(r => r.equip === 'TK900') || {}).equip,
      lsStillThere: !!localStorage.getItem('cm_dash_drive'),
    }));
    ok('the old cache is read on the first boot after the upgrade', migrated.equip === 'TK900', JSON.stringify(migrated));
    ok('and localStorage is cleared of it once migrated', !migrated.lsStillThere);

    /* A SECOND reload must read the migrated IndexedDB copy, not re-migrate
       (localStorage is now empty) and not lose the record either way. */
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 0, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
    const stillThere = await p.evaluate(() => (RECS.find(r => r.equip === 'TK900') || {}).equip);
    ok('and the migrated record survives a further reload on its own', stillThere === 'TK900', stillThere);
    ok('no page errors across the migration', errs.length === 0, errs.slice(0, 3).join(' | '));
    await p.close();
  }

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall pass');
  process.exit(fails.length ? 1 : 0);
})();
