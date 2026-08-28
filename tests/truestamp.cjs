/* A STAMP THAT WAS WRONG WHEN IT WAS WRITTEN, AND THAT NOTHING EVER CORRECTED.

   Builds 183 to 187 marked a date "from the system" whenever the folder
   mentioned the same round on the same machine — even when the date this phone
   held was NEWER than the folder's, which is precisely the case where the
   folder has never seen it. 188 stopped that happening again. It did not, and
   could not, undo what five builds had already written: histPut only ever ADDS
   the stamp.

   So every handset that ran any of those builds still carries strays wearing
   the fleet's colours. histStrays() does not count them, "Keep only what the
   system has" will not remove them, and the due list goes on sending somebody
   to a machine on the strength of a date nobody else in the fleet has. Which
   is exactly what two copies of this app, both on 188, both saying "this phone
   already has every round in the folder", were still disagreeing about.

   A read that covered the WHOLE folder is the one thing that can settle it: it
   knows every round the folder holds, and every date. Anything wearing the
   stamp that the folder did not just deliver is not the system's, whatever it
   says.

   Run: node tests/truestamp.cjs      (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());
const note = p => p.evaluate(() => (document.getElementById('dueBasis') || {}).textContent || '');

/* What a handset off 183-187 is actually holding. The mock's folder is TK101
   at 2026-07-02, TK102 at 2026-07-03, TK103, TK104 — all MP. */
const LAUNDERED = {
  /* The folder HAS this round, at an older date. This phone holds a December
     date it has never sent anybody, wearing the folder's stamp. */
  'MP|TK101': { d: '2026-12-25', s: 'f' },
  /* The folder has never held this pairing at all — one of the five machines
     the migration proved are in neither backend — and it is stamped too. */
  'INSP|CR006': { d: '2026-07-31', s: 'f' },
  /* Genuinely the folder's, and it must survive every part of this. */
  'MP|TK102': { d: '2026-07-03', s: 'f' },
};

async function phone(b, seed) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(s => {
    if (s.offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_hist_full_v1', '1');
    if (s.hist) localStorage.setItem('cm_hist', JSON.stringify(s.hist));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
  }, Object.assign({ url: BASE + '/exec' }, seed));
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(400);
  return { ctx, p };
}
const drain = async p => { await p.click('#dueFull'); await p.waitForTimeout(3000); };
const entry = (p, k) => p.evaluate(k => histAll()[k] || null, k);

(async () => {
  const b = await chromium.launch();

  console.log('this is what a handset off 183-187 is holding');
  {
    /* Offline, so nothing corrects it: this is the state every phone in the
       fleet came up in this morning. All three wear the stamp, so the phone
       believes each is a fleet fact and offers no way to question any of them
       — including the December date it has never sent anybody. */
    await reset('n=4');
    const a = await phone(b, { offline: true, hist: LAUNDERED });
    ok('all three claim to have come from the system',
       await a.p.evaluate(() => ['MP|TK101','INSP|CR006','MP|TK102']
         .every(k => (histAll()[k]||{}).s === 'f')),
       JSON.stringify(await a.p.evaluate(() => ['MP|TK101','INSP|CR006','MP|TK102']
         .map(k => k + '=' + ((histAll()[k]||{}).s || '-')))));
    ok('so nothing is offered for cleanup, and nothing can be',
       await a.p.evaluate(() => histStrays()) === 0);
    ok('and the stray sits on the due list as a fleet fact',
       await a.p.evaluate(() => dueRows().some(r => r.unit === 'CR006')));
    await a.ctx.close();
  }

  console.log('\na full read takes the stamp off what it did not deliver');
  {
    await reset('n=4');
    const a = await phone(b, { hist: LAUNDERED });
    await drain(a.p);

    /* THE TWO CHECKS THAT NAME THE BUG. */
    ok('a date the folder never sent loses the stamp',
       !(await entry(a.p, 'MP|TK101') || {}).s,
       JSON.stringify(await entry(a.p, 'MP|TK101')));
    ok('a round the folder has never held loses it too',
       !(await entry(a.p, 'INSP|CR006') || {}).s,
       JSON.stringify(await entry(a.p, 'INSP|CR006')));
    /* And the one that guards against over-correcting: a real fleet date must
       not be swept up with them. Demoting a true date would turn the cleanup
       button into a way of deleting the fleet's own work. */
    ok('the folder\'s own dates keep it',
       (await entry(a.p, 'MP|TK102') || {}).s === 'f',
       JSON.stringify(await entry(a.p, 'MP|TK102')));
    ok('so the two strays are now countable', await a.p.evaluate(() => histStrays()) === 2,
       JSON.stringify(await a.p.evaluate(() => histSources())));
    ok('the screen says so', (await note(a.p)).includes(await say(a.p, 'due_stray', { n: 2 })),
       (await note(a.p)).slice(-140));
    ok('and the cleanup is offered at last',
       await a.p.evaluate(() => !document.getElementById('dueOnly').classList.contains('hidden')));
    await a.ctx.close();
  }

  console.log('\nand the cleanup then does what it says');
  {
    await reset('n=4');
    const a = await phone(b, { hist: LAUNDERED });
    await drain(a.p);
    const had = await a.p.evaluate(() => dueRows().some(r => r.unit === 'CR006'));
    ok('CR006 is on the due list before the cleanup, on a date nobody else has', had);
    await a.p.click('#dueOnly');
    await a.p.waitForTimeout(500);
    ok('the machine the folder never heard of is gone',
       !(await a.p.evaluate(() => dueRows().some(r => r.unit === 'CR006'))));
    /* TK101's December date goes, and the folder's July date for that same
       round is what is left — not nothing. A machine the folder says was
       walked must not come back as never inspected. */
    ok('and the folder\'s date is what replaces the stray',
       (await entry(a.p, 'MP|TK101') || {}).d === '2026-07-02',
       JSON.stringify(await entry(a.p, 'MP|TK101')));
    ok('nothing is left to clean', await a.p.evaluate(() => histStrays()) === 0);
    ok('and the fleet\'s own rounds are all still here',
       await a.p.evaluate(() => histSources().f) === 4,
       JSON.stringify(await a.p.evaluate(() => histSources())));
    await a.ctx.close();
  }

  console.log('\na read that did NOT cover the folder changes nothing');
  {
    /* THE CHECK THAT PROTECTS THE FLEET. Trueing up against a prefix would
       strip the stamp from every real date beyond it and offer the fleet's own
       history for deletion. Only a read that saw the whole folder may speak. */
    /* Bigger than one call can return, so a read of it is a PREFIX however it
       is asked for — which is the only condition under which this can go
       wrong, and the reason n=40 would prove nothing: forty files fit in one
       call, so every read of them is complete. */
    await reset('n=700');
    const a = await phone(b, { hist: LAUNDERED });
    await a.p.waitForTimeout(2500);
    const trunc = await a.p.evaluate(() => teamLastComplete === false);
    ok('the read really did stop short of the folder', trunc,
       'teamLastComplete=' + await a.p.evaluate(() => teamLastComplete));
    /* CR006 is in no part of this folder. A prefix cannot know that, and must
       not act as though it does. */
    ok('a prefix does not touch the stamp on what it has not seen',
       (await entry(a.p, 'INSP|CR006') || {}).s === 'f',
       JSON.stringify(await entry(a.p, 'INSP|CR006')));
    ok('nor on the fleet\'s own dates beyond where it stopped',
       (await entry(a.p, 'MP|TK102') || {}).s === 'f',
       JSON.stringify(await entry(a.p, 'MP|TK102')));
    ok('so nothing of the fleet\'s is offered for deletion',
       await a.p.evaluate(() => histStrays()) === 0,
       JSON.stringify(await a.p.evaluate(() => histSources())));
    await a.ctx.close();
  }

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED\n' + fails.join('\n') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
