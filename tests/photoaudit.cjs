/* THE EVIDENCE AUDIT MUST ANSWER ABOUT THE FOLDER, NOT ABOUT THIS TAB.

   What the office was showing, on one screen, from one scan:

     314 field photographs expected
     302 files on the server
     between 4 and 13 received, depending on which history had been opened
     hundreds missing
     zero records waiting
     "every attachment is accounted for"

   Opening TK151's Equipment History pushed the received count up. Reloading
   put it back down. A false alarm and a false reassurance, side by side, out
   of one cause: mediaOf() only lists a photograph once folderPhotos[name] is
   populated, and folderPhotos is browser memory filled by lazy-loading. So
   "received" meant "downloaded into this tab", and the gap list — built from
   the same call — found no gaps at all because it could see no attachments.

   Underneath that, the file index itself was never loaded. loadViaIndex(), the
   path every configured dashboard takes, skipped it deliberately; the slow
   path fetched it into memory and a reload threw it away.

   Three properties, each checked here:

     1. RIGHT       expected is the claim, received is what the folder holds.
     2. STABLE      no figure moves for opening a history, changing tab,
                    printing, changing language or reloading.
     3. HONEST      "accounted for" only when nothing is outstanding, and a
                    record waiting on evidence is counted as waiting.

   Run: node tests/photoaudit.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

const SNAP = `(function(){
  const pop = mediaPopulations(), s = syncScan();
  let mem = 0; try { mem = Object.keys(folderPhotos || {}).length; } catch(e) {}
  return { exp: pop.mobExpected, got: pop.mobReceived, miss: pop.mobMissing,
           sExp: s.expected, sGot: s.present, gaps: s.gaps.length,
           crit: s.critWaiting, held: s.held, linked: s.linked, mem: mem }; })`;

const same = (a, b) => ['exp', 'got', 'miss', 'sExp', 'sGot', 'gaps', 'crit', 'held']
  .filter(k => a[k] !== b[k]).map(k => `${k} ${a[k]}→${b[k]}`);

(async () => {
  /* The mock seeds TK101…TK112, each with one sidecar and one photograph named
     <unit>_4C_<dd.mm.yyyy>_MP.jpg. Its sidecars carry no photo COUNT, so the
     claim is supplied below as records — which is the honest fixture anyway:
     expected is what a phone said it took, and the folder is what arrived. */
  await reset('n=12');

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
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  /* Eleven rounds claiming one photograph each, all of which the folder holds,
     and one claiming three where only one was ever uploaded — so there is a
     real shortfall for "accounted for" to be wrong about. */
  const CLAIMED = await p.evaluate(() => {
    const mine = RECS.filter(r => r.type === 'MP' && /^TK1/.test(r.equip))
                     .sort((a, b) => a.equip.localeCompare(b.equip)).slice(0, 12);
    const recs = mine.map((r, n) => ({
      equip: r.equip, date: r.date, type: 'MP', cls: 'HT', by: 'R. Marrero', smu: '5120',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: n === 0 ? 'X' : 'B',
                photos: n === 0 ? 3 : 1, video: 0 }],
    }));
    CMDash.importRecords(recs);
    return { n: recs.length, short: recs.length ? recs[0].equip : '', claim: recs.length + 2 };
  });
  await p.waitForTimeout(1200);
  console.log('   fixture: ' + CLAIMED.n + ' rounds claiming ' + CLAIMED.claim
            + ' photographs; ' + CLAIMED.short + ' is two short and is Critical');

  console.log('\n1. THE FIGURES ARE RIGHT BEFORE ANYTHING HAS BEEN OPENED');
  const A = await p.evaluate(SNAP + '()');
  console.log('   ' + JSON.stringify(A));
  ok('the file index is loaded without opening a single unit', A.held > 0, 'held ' + A.held);
  ok('nothing has been lazily downloaded yet', A.mem === 0, 'in memory ' + A.mem);
  ok('and evidence is still reported as received', A.got > 0, 'received ' + A.got);
  ok('expected is the claim the phones made', A.exp > 0, 'expected ' + A.exp);
  ok('received never exceeds expected', A.got <= A.exp, `${A.got} of ${A.exp}`);
  ok('missing is the remainder, not a separate opinion', A.miss === A.exp - A.got,
     `${A.exp} − ${A.got} = ${A.miss}`);

  console.log('\n2. AND A RECORD WHOSE FILE NEVER ARRIVED IS COUNTED AS WAITING');
  ok('there is a gap to find', A.gaps > 0, 'records waiting ' + A.gaps);
  ok('and it is the round that is short, not a healthy one',
     A.gaps === 1 && A.miss === 2, `waiting ${A.gaps}, short ${A.miss}`);
  ok('a Critical short of its evidence is counted as Critical waiting', A.crit === 1,
     'critical waiting ' + A.crit);
  ok('"nothing is waiting" is not claimed while photographs are missing',
     !(A.miss > 0 && A.gaps === 0), `missing ${A.miss}, waiting ${A.gaps}`);
  ok('and the scan agrees with itself: every shortfall is on a waiting record',
     (A.sExp - A.sGot) > 0 === (A.gaps > 0), `${A.sExp - A.sGot} short, ${A.gaps} waiting`);
  const perRec = await p.evaluate(() => syncScan().gaps.map(g => g.r.equip + ':' + g.miss.length));
  ok('a waiting record names the files it is waiting for', perRec.every(x => Number(x.split(':')[1]) > 0),
     perRec.slice(0, 4).join(' '));

  console.log('\n3. NOTHING MOVES, WHATEVER ANYBODY DOES TO THE PAGE');
  /* Lazy-loading, simulated exactly: put bytes in memory the way drive.js does
     when a unit is opened. Before the fix this ALONE changed the answer. */
  await p.evaluate(() => {
    let n = 0;
    try { (CMDrive.names() || []).forEach(nm => { n++; CMDash.addPhoto(nm, 'blob:fake/' + n); }); }
    catch (e) {}
  });
  const afterMem = await p.evaluate(SNAP + '()');
  ok('every photograph arriving in memory changes nothing', same(A, afterMem).length === 0,
     same(A, afterMem).join(', ') || 'in memory now ' + afterMem.mem);
  ok('and they really did arrive in memory', afterMem.mem > 0, 'in memory ' + afterMem.mem);

  for (const [what, fn] of [
    ['opening a unit\'s history', () => { showTab('equipment');
        const s = document.getElementById('equipSel');
        if (s && s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); }
        if (typeof renderHistory === 'function') renderHistory(); }],
    ['changing tab', () => showTab('sync')],
    ['re-rendering everything', () => { if (typeof renderAll === 'function') renderAll(); }],
    ['changing language to Russian', () => { try { setLang('ru'); } catch (e) {} }],
    ['changing language back', () => { try { setLang('en'); } catch (e) {} }],
  ]) {
    await p.evaluate(fn);
    await p.waitForTimeout(700);
    const S = await p.evaluate(SNAP + '()');
    const d = same(A, S);
    ok(`unchanged after ${what}`, d.length === 0, d.join(', '));
  }

  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 5, null, { timeout: 60000 });
  await p.waitForTimeout(2500);
  const R = await p.evaluate(SNAP + '()');
  ok('unchanged after a full reload', same(A, R).length === 0, same(A, R).join(', '));
  ok('and the reloaded page has the index without being asked', R.held === A.held,
     `${R.held} vs ${A.held}`);
  ok('with nothing in memory again — so the figures cannot be coming from there',
     R.mem === 0, 'in memory ' + R.mem);

  console.log('\n4. AND IT REFUSES TO ANSWER WHEN IT HAS NOT ASKED');
  /* An unconfigured dashboard reporting "0% of evidence arrived" would be a
     fact about this browser, not about the field. */
  const p2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  const U = await p2.evaluate(SNAP + '()');
  ok('a dashboard with no backend does not call the folder empty', U.linked === false,
     'linked ' + U.linked);

  console.log('\npage errors: ' + (errs.length ? errs.slice(0, 3).join(' | ') : 'none'));
  ok('nothing threw throughout', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
})();
