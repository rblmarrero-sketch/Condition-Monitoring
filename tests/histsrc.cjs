/* THREE COPIES OF ONE APP, THREE DIFFERENT SCHEDULES, ALL "UPDATED JUST NOW".

   A phone in the browser said 52 machines and 5 overdue. The same phone's
   installed app said 47 and none. A laptop on the same URL said 51 and 4.
   Every one of them had just synced, every one of them was telling the truth
   about itself, and the installed one had drained the folder to the end and
   reported "this phone already has every round in the folder."

   cm_hist accumulates and is never pruned. A date learned two backends ago is
   still in it. A date loaded by hand from an exported entries.json is in it on
   exactly one device and syncs nowhere. A date from a round captured here is
   in it before the folder has ever seen it. Nothing recorded which was which,
   so there was no way from inside any copy to tell a fleet fact from a local
   one — and a week went into comparing phones when the question was never
   about the phones.

   Every date now carries where it came from:

     f  the system — a folder read delivered it
     o  recorded on this device
     i  loaded from a history file, and on this device alone

   Stamped even when the date has not changed, so ONE folder read re-stamps
   everything the folder holds; whatever is left unstamped afterwards is
   exactly what the folder does not have.

   SELF-GATING, and this is the part that matters most. Until a stamping read
   has run, every entry on every phone in the field is unstamped — so a warning
   that counted unstamped entries would fire on every handset the moment it
   upgraded, about the upgrade rather than about the data. It says nothing
   until at least one entry carries the folder's stamp.

   Run: node tests/histsrc.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);

/* The five dates the field copies carried and the folder never had. */
const STRAYS = { 'MP|BS001': { d: '2026-07-31' }, 'FC|CR002': { d: '2026-07-31' },
                 'INSP|CR006': { d: '2026-07-31' }, 'INSP|DZ003': { d: '2026-07-31' },
                 'INSP|DZ005': { d: '2026-07-31' } };

async function phone(b, seed) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(s => {
    if (s.offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    else localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_hist_full_v1', '1');
    if (s.hist) localStorage.setItem('cm_hist', JSON.stringify(s.hist));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
  }, Object.assign({ url: BASE + '/exec' }, seed));
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(500);
  return { ctx, p };
}
const src = p => p.evaluate(() => histSources());
const note = p => p.evaluate(() => (document.getElementById('dueBasis') || {}).textContent || '');
const btn = p => p.evaluate(() => !document.getElementById('dueOnly').classList.contains('hidden'));

(async () => {
  const b = await chromium.launch();

  console.log('an upgraded phone that has not synced yet says nothing');
  {
    /* THE CHECK THAT PROTECTS THE FLEET. Every handset in service carries
       unstamped dates the moment it takes this build. A warning that counted
       them would fire on all of them, about the upgrade. */
    const a = await phone(b, { offline: true, hist: STRAYS });
    const s = await src(a.p);
    ok('nothing is stamped and nothing is claimed', s.f === 0 && s.u === 5,
       JSON.stringify(s));
    ok('so no warning is raised', !(await note(a.p)).includes('not in the system'));
    ok('and no cleanup is offered', !(await btn(a.p)));
    await a.ctx.close();
  }

  console.log('\na folder read stamps everything the folder holds');
  {
    const a = await phone(b, { hist: STRAYS });
    await a.p.click('#dueFull');
    await a.p.waitForTimeout(2800);
    const s = await src(a.p);
    ok('the folder\'s rounds are marked as the system\'s', s.f > 0, s.f + ' from the system');
    /* THE ONE THAT NAMES THE BUG. Five dates the folder has never heard of,
       indistinguishable from fleet facts until now. */
    ok('and the five it has never heard of are left unstamped', s.u === 5, JSON.stringify(s));
    ok('the note says so, in machines', (await note(a.p)).includes(await say(a.p, 'due_stray', { n: 5 })),
       (await note(a.p)).slice(-100));
    ok('and offers the way back to one answer', await btn(a.p));
    await a.ctx.close();
  }

  console.log('\na loaded history file is marked as this device\'s alone');
  {
    const a = await phone(b, {});
    await a.p.waitForTimeout(400);
    const s = await a.p.evaluate(() => {
      const h = histAll();
      histPut(h, 'MP|ZZ001', { d: '2026-07-01' }, 'i');
      histPut(h, 'MP|ZZ002', { d: '2026-07-01' }, 'o');
      histSave(h);
      return histSources();
    });
    ok('an import is marked as an import', s.i === 1, JSON.stringify(s));
    ok('and a round recorded here is marked as this phone\'s', s.o === 1, JSON.stringify(s));
    /* A round captured here is on its way to the folder and is this phone's
       own work. It is not a stray and must never be dropped as one. */
    const strays = await a.p.evaluate(() => histStrays());
    ok('own work does not count as a stray', strays === 1, strays + ' (the import only)');
    await a.ctx.close();
  }

  console.log('\none read re-stamps a date the folder already had');
  {
    /* The date does not change, so the old histPut returned early and learned
       nothing. Where it came from still had to be recorded, or a phone that
       was already up to date would look entirely unstamped for ever. */
    const a = await phone(b, {});
    await a.p.click('#dueFull');
    await a.p.waitForTimeout(2800);
    const first = await src(a.p);
    const again = await a.p.evaluate(async () => {
      const h = histAll();
      Object.keys(h).forEach(k => { const e = histEntry(h[k]); if (e) { delete e.s; h[k] = e; } });
      histSave(h);
      const before = histSources();
      await teamPull(true, true);
      return { before, after: histSources() };
    });
    ok('an unstamped phone comes back fully stamped', again.after.f === first.f,
       again.before.u + ' unstamped → ' + again.after.f + ' from the system');
    ok('without inventing any new dates', again.after.total === first.total,
       again.after.total + ' vs ' + first.total);
    await a.ctx.close();
  }

  console.log('\nkeeping only what the system has');
  {
    const a = await phone(b, { hist: STRAYS });
    await a.p.click('#dueFull');
    await a.p.waitForTimeout(2800);
    const before = await src(a.p);
    const rounds = await a.p.evaluate(() => (JSON.parse(localStorage.getItem('cm_team') || '[]')).length);
    await a.p.evaluate(() => { const h = histAll(); histPut(h, 'MP|ZZ009', { d: '2026-07-01' }, 'o'); histSave(h); });
    await a.p.click('#dueOnly');
    await a.p.waitForTimeout(500);
    const after = await src(a.p);
    ok('the strays are gone', after.u === 0 && after.i === 0, JSON.stringify(after));
    ok('the system\'s dates are all still there', after.f === before.f,
       after.f + ' of ' + before.f);
    /* This phone's own round is its own work, on its way to the folder. */
    ok('and this phone\'s own round is not swept up with them', after.o === 1, JSON.stringify(after));
    ok('it says what it dropped',
       (await a.p.evaluate(() => document.getElementById('dueFullMsg').textContent))
         === await say(a.p, 'due_only_go', { n: 5, m: await a.p.evaluate(() => dueMachines()) }),
       await a.p.evaluate(() => document.getElementById('dueFullMsg').textContent));
    /* A schedule is not evidence. Nothing about the rounds themselves moves. */
    ok('and the rounds themselves are untouched',
       await a.p.evaluate(() => (JSON.parse(localStorage.getItem('cm_team') || '[]')).length) === rounds,
       rounds + ' round(s)');
    ok('the offer goes away once there is nothing to drop', !(await btn(a.p)));
    await a.ctx.close();
  }

  await b.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
