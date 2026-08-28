/* FOUR WAYS A WALKED ROUND REACHES NOBODY, AND NOTHING SAYS A WORD.

   The whole "why do three copies disagree" hunt was about rounds that go
   missing between the folder and the number on the Due screen. Every fix so
   far closed a path where the phone LOST one. These four are the paths where
   the phone never had it, or had it and threw it away, and in each case the
   screen reads exactly as it does when all is well.

   1  A sidecar the backend opens and cannot parse. It is skipped, the cursor
      moves past it, the reply carries `failed: n` — and nothing in the app has
      ever read that field. The inspection exists in the folder, so a migration
      reports it as "already there", and it reaches no client, for ever.

   2  The round type arrives in a case nothing here expects. The unit is
      uppercased on the way in; the type is not. "insp" and "INSP" are two
      different rounds to every index in this app.

   3  A round type the programme does not know is dropped by dueRows without a
      word — right to skip it, there is no interval to schedule it against, but
      the machine simply falls off the screen.

   4  A stray date NEWER than the folder's got stamped "from the system" while
      keeping the stray's date, so the one control that exists to remove it
      would not, and the due list kept planning against a date the folder has
      never heard of. That one was mine, shipped in 183.

   Run: node tests/foldbad.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());
const note = p => p.evaluate(() => (document.getElementById('dueBasis') || {}).textContent || '');

async function phone(b, seed) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(s => {
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
async function drain(p) { await p.click('#dueFull'); await p.waitForTimeout(3000); }

(async () => {
  const b = await chromium.launch();

  console.log('a file the system cannot read is an inspection that reaches nobody');
  {
    await reset('n=12&bad=3');
    const a = await phone(b, {});
    await drain(a.p);
    /* THE CHECK THAT NAMES THE BUG. The reply said three files failed. */
    ok('the folder\'s complaint is not thrown away',
       await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)) === 3,
       'app holds ' + await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)));
    ok('and the Due screen says so, in files',
       (await note(a.p)).includes(await say(a.p, 'due_bad', { n: 3 })),
       (await note(a.p)).slice(-140));
    /* The count must be about the folder, not about how many times somebody
       pressed sync. Three unreadable files stay three. */
    await drain(a.p);
    ok('and pressing sync again does not multiply it',
       await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)) === 3,
       'app holds ' + await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)));
    await a.ctx.close();
  }

  console.log('\na folder it can read entirely says nothing');
  {
    await reset('n=12');
    const a = await phone(b, {});
    await drain(a.p);
    ok('no complaint is invented', await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)) === 0);
    ok('and the note is quiet about it', !(await note(a.p)).includes(await say(a.p, 'due_bad', { n: 1 })).valueOf()
       && !/cannot be read|не читаются/.test(await note(a.p)), (await note(a.p)).slice(-140));
    /* And a folder that was bad and is fixed stops complaining, or the warning
       outlives the fault and becomes background noise. */
    await a.ctx.close();
  }

  console.log('\nthe warning clears once the files are fixed');
  {
    await reset('n=12&bad=2');
    const a = await phone(b, {});
    await drain(a.p);
    ok('it complains while the files are broken', await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)) === 2);
    await reset('n=12');                                  // the folder is repaired
    await drain(a.p);
    ok('and stops once they are not', await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)) === 0,
       'app holds ' + await a.p.evaluate(() => (typeof badGet === "function" ? badGet() : -1)));
    await a.ctx.close();
  }

  console.log('\na round type in the wrong case is still that round');
  {
    /* The folder holds an undercarriage walk-around on DZ003 written "insp".
       The unit is uppercased on the way in and the type never was, so it keyed
       as insp|DZ003 and every index in the app treated it as a round type that
       does not exist. */
    await reset('n=4&rec=DZ003,2026-01-05,insp');
    const a = await phone(b, {});
    await drain(a.p);
    const keys = await a.p.evaluate(() => Object.keys(histAll()).filter(k => /DZ003/.test(k)));
    ok('it is filed under the round it is', keys.length === 1 && keys[0] === 'INSP|DZ003',
       JSON.stringify(keys));
    ok('so the due list can see the machine at all',
       await a.p.evaluate(() => dueRows().some(r => r.unit === 'DZ003')),
       JSON.stringify(await a.p.evaluate(() => dueRows().map(r => r.ty + '|' + r.unit))));
    /* January, on a 500 h round: it is months overdue and must be counted. */
    ok('and counts it as overdue, which is what it is',
       await a.p.evaluate(() => dueRows().some(r => r.unit === 'DZ003' && r.st === 'over')));
    await a.ctx.close();
  }

  console.log('\na round type nothing recognises is counted, not hidden');
  {
    await reset('n=4&rec=DZ005,2026-01-05,ZZZ');
    const a = await phone(b, {});
    await drain(a.p);
    ok('the round is not scheduled, which is right',
       !(await a.p.evaluate(() => dueRows().some(r => r.unit === 'DZ005'))));
    /* THE CHECK THAT NAMES THE BUG. It was dropped in silence. */
    ok('but the screen admits it dropped one',
       (await note(a.p)).includes(await say(a.p, 'due_unk', { n: 1 })),
       (await note(a.p)).slice(-140));
    await a.ctx.close();
  }

  console.log('\na date in the folder\'s own shape is a date');
  {
    /* Every filename in this folder is written 31.07.2026. A record body
       carrying the same shape reached DUE.next, which parses ISO and returns
       null on anything else, and dueRows dropped the null without a word — so
       the machine came off the screen looking like a machine with nothing due.
       Worse: cm_hist compares dates as strings, and "31.07.2026" sorts above
       every ISO date there will ever be, so one such round outranks every real
       one on that machine for good. */
    await reset('n=4&rec=DZ003,05.01.2026,INSP');
    const a = await phone(b, {});
    await drain(a.p);
    ok('it is stored in the one shape everything here reads',
       await a.p.evaluate(() => (histEntry(histAll()['INSP|DZ003']) || {}).d) === '2026-01-05',
       JSON.stringify(await a.p.evaluate(() => histAll()['INSP|DZ003'])));
    ok('so the machine is scheduled, and overdue',
       await a.p.evaluate(() => dueRows().some(r => r.unit === 'DZ003' && r.st === 'over')));
    ok('and nothing is reported as unschedulable',
       await a.p.evaluate(() => histUnschedulable()) === 0);
    await a.ctx.close();
  }

  console.log('\na date it cannot read is said out loud, not guessed at');
  {
    /* 07/02/2026 is the second of July or the seventh of February depending on
       who wrote it, and a wrong date is worse than an unreadable one. It stays
       exactly as it arrived — and it is counted, which is the whole point. */
    await reset('n=4&rec=DZ005,07/02/2026,INSP');
    const a = await phone(b, {});
    await drain(a.p);
    ok('it is not guessed at', await a.p.evaluate(
       () => (histEntry(histAll()['INSP|DZ005']) || {}).d) === '07/02/2026');
    ok('the round is not scheduled, which is right',
       !(await a.p.evaluate(() => dueRows().some(r => r.unit === 'DZ005'))));
    ok('and the screen admits it dropped one',
       (await note(a.p)).includes(await say(a.p, 'due_unk', { n: 1 })),
       (await note(a.p)).slice(-140));
    await a.ctx.close();
  }

  console.log('\na stray date newer than the folder\'s is still a stray');
  {
    /* The folder holds TK101 in July. This phone holds a date for the same
       round in December that the folder has never seen — loaded from a file,
       or left from a backend that is gone. 183 stamped it "from the system"
       because the folder had mentioned the pairing at all, which made the one
       control that exists to remove it refuse to. */
    await reset('n=4');
    const a = await phone(b, { hist: { 'MP|TK101': { d: '2026-12-25' } } });
    await drain(a.p);
    const s = await a.p.evaluate(() => histSources());
    ok('it is not laundered into a fleet fact', s.u === 1, JSON.stringify(s));
    ok('the phone still knows the folder answered', s.f > 0, s.f + ' from the system');
    ok('the note counts it', (await note(a.p)).includes(await say(a.p, 'due_stray', { n: 1 })),
       (await note(a.p)).slice(-140));
    await a.p.click('#dueOnly');
    await a.p.waitForTimeout(500);
    ok('and the cleanup can actually remove it',
       await a.p.evaluate(() => histStrays()) === 0);
    /* Removing the stray must leave the folder's own date for that round —
       not delete the machine's history along with the wrong date. */
    ok('leaving the folder\'s date for that round behind',
       await a.p.evaluate(() => (histEntry(histAll()['MP|TK101']) || {}).d) === '2026-07-02',
       JSON.stringify(await a.p.evaluate(() => histAll()['MP|TK101'])));
    await a.ctx.close();
  }

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED\n' + fails.join('\n') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
