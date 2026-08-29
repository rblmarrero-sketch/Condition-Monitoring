/* DELETING ONE ROUND MUST NOT UNSCHEDULE ANOTHER.

   Measured on the deployed builds against the live folder, with everything
   else already in agreement:

     office   DZ004 · UC · 2026-08-09  — on the due list
     phone    DZ004 · UC               — no row at all

   The folder holds that round and the backend hands it to both surfaces. What
   the phone did with it was this: teamGone(), the function that applies the
   office's deletion markers, recomputed the unit's last-done entry EVERY time
   a marker for that unit and round type arrived — whatever date the marker was
   about — and rewrote it as {d, h}, dropping the source stamp.

   histFirm() will not schedule on a date the fleet cannot verify, which is
   correct and is what stops side-loaded history planning work. So the stamp
   coming off was the machine coming off the due screen, silently. The marker
   that did it was for 2 August; the round it removed from the schedule was
   9 August. A real value rendered as nothing, one week away from the thing
   that caused it.

   Run: node tests/gonedate.cjs      (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = process.argv[2] && /^http/.test(process.argv[2]) ? process.argv[2] : 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

/* Two undercarriage rounds on one dozer, a week apart, both from the folder. */
const ROWS = [
  { u: 'DZ004', d: '2026-08-02', t: 'UC', s: 26100, by: 'S. Volkov' },
  { u: 'DZ004', d: '2026-08-09', t: 'UC', s: 26437, by: 'S. Volkov' },
];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                   hasTouch: true, timezoneId: 'Asia/Anadyr' });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_hist_full_v1', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1800);

  /* Both rounds arrive the way the folder delivers them, through the same
     merge the sync uses — so the stamps are the real ones, not planted. */
  const seeded = await p.evaluate(rows => {
    teamMerge(rows.map(r => ({ equip: r.u, date: r.d, type: r.t, smu: r.s, by: r.by,
                               dev: 'DM12QM', items: [] })), false);
    const h = histAll();
    return { key: 'UC|DZ004', entry: h['UC|DZ004'] || null,
             rows: dueRows().filter(r => r.unit === 'DZ004').map(r => r.ty + ' ' + r.st) };
  }, ROWS);
  console.log('   seeded: ' + JSON.stringify(seeded));
  ok('both rounds land and the later one is the last done',
     seeded.entry && seeded.entry.d === '2026-08-09', JSON.stringify(seeded.entry));
  ok('stamped as delivered by the folder', seeded.entry && seeded.entry.s === 'f',
     'stamp ' + (seeded.entry || {}).s);
  ok('and the dozer is on the due list', seeded.rows.length === 1, seeded.rows.join(' '));

  console.log('\n── the office deletes the OLDER round');
  const after = await p.evaluate(() => {
    const n = teamGone([{ key: 'DZ004|2026-08-02|UC', by: 'rickie', at: '2026-08-02T09:32:12Z' }]);
    const h = histAll();
    return { removed: n, entry: h['UC|DZ004'] || null,
             rows: dueRows().filter(r => r.unit === 'DZ004').map(r => r.ty + ' ' + r.st),
             team: teamAll().filter(x => x.u === 'DZ004').map(x => x.d) };
  });
  console.log('   after:  ' + JSON.stringify(after));
  ok('the deleted round is gone from the phone\'s rounds', after.removed === 1 &&
     after.team.length === 1 && after.team[0] === '2026-08-09', JSON.stringify(after.team));
  ok('THE LATER ROUND IS STILL THE LAST DONE',
     after.entry && after.entry.d === '2026-08-09', JSON.stringify(after.entry));
  ok('AND IT STILL CARRIES THE FOLDER\'S STAMP', after.entry && after.entry.s === 'f',
     'stamp ' + (after.entry || {}).s);
  ok('so the dozer is still on the due list', after.rows.length === 1, after.rows.join(' ') || 'no row');
  ok('and its hour meter came with it', after.entry && after.entry.h === 26437,
     'smu ' + (after.entry || {}).h);

  console.log('\n── the office deletes the round the due list is actually running on');
  const last = await p.evaluate(() => {
    const n = teamGone([{ key: 'DZ004|2026-08-09|UC', by: 'rickie', at: '2026-08-30T00:00:00Z' }]);
    const h = histAll();
    return { removed: n, entry: h['UC|DZ004'] || null,
             rows: dueRows().filter(r => r.unit === 'DZ004').map(r => r.ty + ' ' + r.st),
             never: (typeof neverRows === 'function')
               ? neverRows().filter(r => r.unit === 'DZ004').length : -1 };
  });
  console.log('   after:  ' + JSON.stringify(last));
  ok('now the last-done date does move', last.removed === 1 && last.entry === null,
     JSON.stringify(last.entry));
  ok('and the machine is not left on the due list against a round that is gone',
     last.rows.length === 0, last.rows.join(' '));
  ok('it is reported as never inspected instead of quietly vanishing',
     last.never === 1, 'never-done rows ' + last.never);

  console.log('\n── a marker whose date this folder writes its own way');
  /* The folder's own filenames are 31.07.2026. teamDate() is the one rule, and
     a marker parsed anywhere else must use it or it matches nothing. */
  const dotted = await p.evaluate(() => {
    teamMerge([{ equip: 'DZ005', date: '2026-08-09', type: 'UC', smu: 100, dev: 'D1', items: [] }], false);
    const before = histAll()['UC|DZ005'];
    const n = teamGone([{ key: 'DZ005|09.08.2026|UC', by: 'rickie', at: '2026-08-30T00:00:00Z' }]);
    return { before: before, removed: n, after: histAll()['UC|DZ005'] || null };
  });
  ok('a marker written 09.08.2026 still matches the round it is about',
     dotted.removed === 1 && dotted.after === null, JSON.stringify(dotted));

  await ctx.close(); await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
})();
