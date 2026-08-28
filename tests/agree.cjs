/* TWO COPIES OF ONE APP ON ONE PHONE MUST NOT PLAN DIFFERENT WORK.

   The whole hunt, in one suite. A reliability engineer's handset showed, on
   the same build, at the same minute, on the same site:

     Safari          Missed 5   covering 47 of 1128   7 dates not in the system
     installed app   Missed 0   covering 43 of 1128   1 date  not in the system

   Both had just synced. Both truthfully reported "this phone already has every
   round in the folder" — because both did. They disagreed about the FLEET
   because each ALSO held dates the folder never had, and the schedule was
   built on whatever a copy happened to be carrying.

   iOS gives an installed app and the same page in Safari separate storage, so
   one handset is two databases that never meet. cm_hist is written by four
   different things and nothing ever pruned it. Those two facts together mean
   divergence is not a bug that happens, it is the guaranteed steady state.

   The elimination is not to delete anything. It is that a date may drive the
   schedule only if the fleet can verify it — the folder delivered it, or this
   device captured it and is carrying it. Then every copy's schedule is a
   function of the folder plus its own unsent work, and two copies cannot
   disagree however different their piles are.

   Run: node tests/agree.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

/* What the browser copy was carrying and the installed one was not. Mixed on
   purpose: some laundered into "from the system" by builds 183-187, some never
   stamped at all — a phone in the field has both. */
const PILE = {
  'MP|BS001':   { d: '2026-07-31', s: 'f' },
  'FC|CR002':   { d: '2026-07-31', s: 'f' },
  'INSP|CR006': { d: '2026-07-31' },
  'INSP|DZ003': { d: '2026-07-31' },
  'INSP|DZ005': { d: '2026-07-31', s: 'f' },
};

async function copy(b, hist) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(s => {
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_hist_full_v1', '1');
    if (s.hist) localStorage.setItem('cm_hist', JSON.stringify(s.hist));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
  }, { url: BASE + '/exec', hist });
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => showPane('paneDue'));
  await p.click('#dueFull');
  await p.waitForTimeout(3000);
  return { ctx, p };
}
const shape = p => p.evaluate(() => ({
  missed: dueRows().filter(r => r.st === 'over').length,
  soon:   dueRows().filter(r => r.st === 'soon').length,
  never:  neverRows().length,
  noprog: unclassedCount(),
  /* Every machine in the register is on a row of work or in the no-programme
     count. If the two copies agree on both, no machine can be on one screen
     and missing from the other. */
  seen:   new Set(neverRows().concat(dueRows()).map(r => r.unit)).size + unclassedCount(),
  cover:  (document.getElementById('dueBasis').textContent.match(/covering (\d+) of/) || [])[1],
}));

(async () => {
  const b = await chromium.launch();
  await reset('n=6');

  /* The installed app: a clean store, everything in it came from the folder. */
  const clean = await copy(b, null);
  /* Safari: the same folder, plus months of residue that syncs nowhere. */
  const dirty = await copy(b, PILE);

  const a = await shape(clean.p), d = await shape(dirty.p);
  console.log('   installed ' + JSON.stringify(a));
  console.log('   browser   ' + JSON.stringify(d));

  /* THE CHECK THE WHOLE HUNT WAS ABOUT. */
  ok('the two copies plan the same overdue work', a.missed === d.missed,
     'installed ' + a.missed + ' vs browser ' + d.missed);
  ok('and the same work coming up', a.soon === d.soon,
     'installed ' + a.soon + ' vs browser ' + d.soon);
  ok('and report the same coverage of the fleet', a.cover === d.cover,
     'installed ' + a.cover + ' vs browser ' + d.cover);
  ok('and the same machines never inspected', a.never === d.never,
     'installed ' + a.never + ' vs browser ' + d.never);
  ok('and the same machines with no programme', a.noprog === d.noprog,
     'installed ' + a.noprog + ' vs browser ' + d.noprog);
  /* THE CHECK THAT NOTHING IS SILENTLY ABSENT. Every machine the register
     knows is accounted for once, on both copies. */
  ok('and every machine accounted for, on both', a.seen === d.seen && a.seen >= 1128,
     'installed ' + a.seen + ' vs browser ' + d.seen + ' of 1128');

  /* NOT by throwing the residue away. Somebody typed it, or loaded it, and
     this app does not destroy that — it declines to plan on it. */
  ok('the browser copy still holds every date it had',
     await dirty.p.evaluate(k => k.every(x => (histAll()[x] || {}).d === '2026-07-31'),
                            Object.keys(PILE)),
     JSON.stringify(await dirty.p.evaluate(k => k.map(x => x + '=' + ((histAll()[x] || {}).d || '-')),
                            Object.keys(PILE))));
  ok('and says how many it is declining to plan on',
     /not in the system/.test(await dirty.p.evaluate(() => document.getElementById('dueBasis').textContent)),
     (await dirty.p.evaluate(() => document.getElementById('dueBasis').textContent)).slice(-120));
  /* And the machines are still work. Declining to trust a date must never take
     a machine off the list — that is the same failure wearing the other face. */
  ok('every one of those machines is accounted for on both copies',
     await dirty.p.evaluate(() => ['BS001','CR002','CR006','DZ003','DZ005'].every(u => {
       const onList = neverRows().concat(dueRows()).some(r => r.unit === u);
       const a = (window.ASSET_BY||{})[u];
       const k = a ? PTS.classOf(a.cls || a.cat || '') : '';
       const noProg = !k || k === 'GEN' || k === 'ALL' || !(roundsOnClass()[k]||{}).size;
       return onList || noProg;                      // one place, never neither
     })),
     JSON.stringify(await dirty.p.evaluate(() => ['BS001','CR002','CR006','DZ003','DZ005']
       .map(u => u + ':' + (neverRows().concat(dueRows()).filter(r => r.unit === u)
                              .map(r => r.ty).join('/') || 'no-programme')))));

  console.log('\nand a copy that has never reached the folder judges nothing');
  {
    /* THE CHECK THAT PROTECTS THE FLEET. Before any folder read, every entry
       on every handset is unstamped. A rule that only trusts stamped dates
       would, on that phone, trust nothing and report the whole fleet as never
       inspected — a false alarm across 1,128 machines, on the strength of an
       upgrade. */
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    /* Nothing stamped: this is every handset in the fleet the moment it takes
       a build, before its first sync. A stamp is what proves the folder has
       spoken, so a pile carrying one is a phone that HAS heard from it. */
    const VIRGIN = Object.fromEntries(Object.keys(PILE).map(k => [k, { d: '2026-07-31' }]));
    await p.addInitScript(h => {
      Object.defineProperty(navigator, 'onLine', { get: () => false });
      localStorage.setItem('cm_hist', JSON.stringify(h));
      localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
    }, VIRGIN);
    await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    await p.evaluate(() => showPane('paneDue'));
    await p.waitForTimeout(400);
    ok('an unsynced phone still plans on everything it holds',
       await p.evaluate(() => dueRows().filter(r => r.st === 'over').length) === 5,
       'missed ' + await p.evaluate(() => dueRows().filter(r => r.st === 'over').length));
    ok('and raises no warning about it',
       await p.evaluate(() => histStrays()) === 0);
    await ctx.close();
  }

  await clean.ctx.close(); await dirty.ctx.close();
  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED\n' + fails.join('\n') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
