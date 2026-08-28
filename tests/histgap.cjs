/* "MISSED 0" ON A PHONE THAT HAS SIX OVERDUE MACHINES IN ITS OWN CACHE.

   dueRows() is computed from cm_hist and from nothing else. It walks that
   object's keys, and a unit/type pair that is not in it produces no row at
   all — not "missed", not "unknown", not a gap somebody could see. Absent.

   So a damaged index does not present as an error. It presents as "Missed 0",
   which is the one answer a reliability engineer acts on without checking.

   The self-heal that existed guarded the WRONG STRUCTURE. It reset the cursor
   when cm_team — the browsable cache — was empty, while the thing the due
   list actually runs on is cm_hist. The two drift apart, and only one of them
   was ever looked at. A phone that lost its index and kept its cursor had no
   repair path at all: the cursor promises the server "I already hold
   everything up to here", so nothing is sent again, for ever.

   cm_hist keeps a date after its row ages out of the bounded cache, so the
   index is a superset of the cache and the invariant runs one way:

       EVERY ROUND IN THE CACHE MUST BE REPRESENTED IN THE INDEX.

   A violation is proof the index is damaged. The repair is in two parts and
   both are needed: rebuild from the cache, which is free, local and works
   with no signal at all; and force a full re-read, because the cache is
   bounded and the rounds that aged out of it are the oldest ones — which are
   exactly the ones most likely to be overdue.

   And the honest half. This site has 1,128 machines; a phone holds a few
   dozen rounds. "Missed 0" has always meant "none of the machines I have
   heard of is overdue" while reading as "nothing is overdue", so the note now
   says how many machines the number is about.

   Run: node tests/histgap.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);

const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
/* Three magnetic-plug rounds on a 250 h interval at 20 h/day: 400 h, 500 h and
   100 h since. Two are past it and one is not, so a count of two is a fact
   about these machines and not about the fixture's size. */
const TEAM = [
  { t: 'MP', u: 'TK160', d: ago(20), by: 'B. Ivanov', g: 'C', s: '7900' },
  { t: 'MP', u: 'TK158', d: ago(25), by: 'B. Ivanov', g: 'A', s: '8100' },
  { t: 'MP', u: 'TK154', d: ago(5),  by: 'B. Ivanov', g: 'A', s: '7300' },
];
const HIST = {};
TEAM.forEach(r => { HIST[r.t + '|' + r.u] = { d: r.d, h: Number(r.s) }; });

async function phone(b, seed) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(s => {
    /* Offline on purpose for most of these: the repair must work on a phone
       in the pit, out of the rounds it is already holding. */
    if (s.offline) Object.defineProperty(navigator, 'onLine', { get: () => false });
    else localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
    localStorage.setItem('cm_team', JSON.stringify(s.team || []));
    if (s.hist) localStorage.setItem('cm_hist', JSON.stringify(s.hist));
    if (s.cursor) localStorage.setItem('cm_team_cursor', String(s.cursor));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 3 }));
  }, seed);
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1400);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(400);
  return { ctx, p };
}
const missed = p => p.evaluate(() => dueRows('').filter(r => r.st === 'over').length);
const badge = p => p.evaluate(() => { const el = document.getElementById('tabD');
  return el.className.indexOf('hidden') >= 0 ? '' : el.textContent.trim(); });
const note = p => p.evaluate(() => (document.getElementById('dueBasis') || {}).textContent || '');
const histKeys = p => p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cm_hist') || '{}')));

(async () => {
  const b = await chromium.launch();

  console.log('the index and the cache agreeing, which is the ordinary case');
  {
    const a = await phone(b, { offline: true, team: TEAM, hist: HIST, cursor: Date.now() });
    ok('two machines are past their interval', await missed(a.p) === 2, String(await missed(a.p)));
    ok('and the tab says so', await badge(a.p) === '2', await badge(a.p) || '(none)');
    ok('nothing was flagged as damaged',
       !(await a.p.evaluate(() => !!localStorage.getItem('cm_hist_short'))));
    await a.ctx.close();
  }

  console.log('\nthe index lost, the cache kept, the cursor still promising');
  {
    /* Exactly the state a phone is left in by an eviction, a clear, or a
       write that failed months ago: nothing looks wrong from the outside. */
    const a = await phone(b, { offline: true, team: TEAM, hist: null, cursor: Date.now() });
    /* THE ONE THAT NAMES THE BUG. Before the repair this was 0, on a phone
       holding the rounds that prove otherwise, with no signal that anything
       was missing. */
    ok('the overdue machines are found anyway', await missed(a.p) === 2, String(await missed(a.p)));
    ok('and the tab badge shows them', await badge(a.p) === '2', await badge(a.p) || '(none)');
    const k = await histKeys(a.p);
    ok('the index was rebuilt from the rounds the phone already held',
       k.length === 3, k.join(' '));
    /* Offline, with no destination configured. The repair may not wait for a
       folder the phone cannot reach. */
    ok('with no network involved at all',
       await a.p.evaluate(() => !navigator.onLine));
    /* The cache is bounded, so what it holds is not all there was. */
    ok('and it says the history is still incomplete',
       await a.p.evaluate(() => !!localStorage.getItem('cm_hist_short')));
    await a.ctx.close();
  }

  console.log('\na partial index is repaired too, not just an empty one');
  {
    const part = { 'MP|TK154': HIST['MP|TK154'] };          // only the one that is FINE
    const a = await phone(b, { offline: true, team: TEAM, hist: part, cursor: Date.now() });
    /* The cruellest shape: the index holds exactly the machines that are in
       good order, so the phone reports a clean fleet. */
    ok('the two that were missing come back', await missed(a.p) === 2, String(await missed(a.p)));
    ok('and the one already there is not disturbed',
       (await histKeys(a.p)).length === 3, (await histKeys(a.p)).join(' '));
    await a.ctx.close();
  }

  console.log('\na damaged index makes the phone re-read the whole folder');
  {
    /* Rebuilding recovers what the cache still holds. The cache is bounded and
       the rounds that aged out of it are the oldest — which are exactly the
       ones most likely to be overdue — so the folder has to be asked again. */
    /* Watched from before the page loads. The repair runs at boot, so the very
       first pull is the one that has to ask from zero — asserting on a later
       pull would be asserting after the repair had already happened, which is
       a check that cannot fail. */
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    const asked = [];
    pg.on('request', r => { const u = r.url();
      if (u.indexOf('/exec') > 0) asked.push(u); });
    await pg.addInitScript(s => {
      localStorage.setItem('up_dests', JSON.stringify(
        [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
      localStorage.setItem('cm_team', JSON.stringify(s.team));
      localStorage.setItem('cm_team_cursor', '999');
    }, { url: BASE + '/exec', team: TEAM });
    await pg.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await pg.waitForTimeout(2200);
    const a = { ctx, p: pg };
    ok('it asks from the beginning, not from its cursor',
       asked.some(u => /after=0/.test(u)),
       asked.map(u => (u.match(/after=\d+/) || ['—'])[0]).join(' ') || '(no request)');
    await a.p.waitForTimeout(400);
    ok('and the flag is retired once that read has stored',
       !(await a.p.evaluate(() => !!localStorage.getItem('cm_hist_short'))));
    await a.ctx.close();
  }

  console.log('\nan intact index is left alone');
  {
    /* The repair must not fire on a phone that is simply new, or one whose
       index legitimately holds MORE than its bounded cache — which is the
       normal state after a few months, since a date outlives its row. */
    const more = Object.assign({ 'MP|TK999': { d: ago(3), h: 100 } }, HIST);
    const a = await phone(b, { offline: true, team: TEAM, hist: more, cursor: Date.now() });
    ok('a superset index is not treated as damage',
       !(await a.p.evaluate(() => !!localStorage.getItem('cm_hist_short'))));
    ok('and nothing was rewritten', (await histKeys(a.p)).length === 4,
       (await histKeys(a.p)).join(' '));
    await a.ctx.close();
  }
  {
    const a = await phone(b, { offline: true, team: [], hist: null });
    ok('an empty phone is not damage either',
       !(await a.p.evaluate(() => !!localStorage.getItem('cm_hist_short'))));
    await a.ctx.close();
  }

  console.log('\nan index and a cache that agree with each other and are both short');
  {
    /* THE STATE THE FIELD IS ACTUALLY IN, and the one the 177 invariant cannot
       see. The old storage bug damaged BOTH structures in the same breath —
       teamSave halved the cache, histSave lost the index — and then the cursor
       advanced past everything they had just dropped. What is left agrees
       perfectly with itself and is short of the folder. Nothing on the phone
       can detect that, because the only thing that knows what the folder holds
       is the folder.

       So: two rounds held, a cursor far ahead so an ordinary pull returns
       nothing, and forty rounds sitting in the folder. */
    const held = [{ t: 'MP', u: 'TK101', d: '2026-07-02', by: 'R. Marrero', g: 'A', s: '5120' }];
    const heldHist = { 'MP|TK101': { d: '2026-07-02', h: 5120 } };
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    const asked = [];
    pg.on('request', r => { const u = r.url(); if (u.indexOf('/exec') > 0) asked.push(u); });
    await pg.addInitScript(s => {
      localStorage.setItem('up_dests', JSON.stringify(
        [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
      localStorage.setItem('cm_team', JSON.stringify(s.team));
      localStorage.setItem('cm_hist', JSON.stringify(s.hist));
      localStorage.setItem('cm_team_cursor', String(9e12));   // "I have everything"
      /* Every phone in the field did the round-body heal months ago, so that
         one returns immediately and cannot be what repairs this. Without this
         line the fixture is healed by the OLD mechanism and proves nothing —
         which is exactly what it did on the first run. */
      localStorage.setItem('cm_team_full_v1', '1');
    }, { url: BASE + '/exec', team: held, hist: heldHist });
    await pg.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await pg.waitForTimeout(2600);

    const before = Object.keys(heldHist).length;
    const after = (await pg.evaluate(() => Object.keys(JSON.parse(
      localStorage.getItem('cm_hist') || '{}')))).length;
    ok('nothing on the phone looked inconsistent to begin with',
       await pg.evaluate(() => typeof histGapVsTeam === 'function' && histGapVsTeam() === 0));
    /* THE ONE THAT NAMES THIS ROUND OF THE BUG. */
    ok('it asks the folder anyway, once, on the upgrade',
       asked.some(u => /after=0/.test(u)),
       asked.map(u => (u.match(/after=\d+/) || ['—'])[0]).join(' ') || '(no request)');
    ok('and the missing rounds arrive', after > before, before + ' → ' + after);
    ok('the repair is recorded so it happens once, not every launch',
       await pg.evaluate(() => !!localStorage.getItem('cm_hist_full_v1')));
    await ctx.close();
  }
  {
    /* A phone that has already been repaired must not re-read the whole folder
       on every launch. A season of work is megabytes over a satellite link. */
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
    const asked = [];
    pg.on('request', r => { const u = r.url(); if (u.indexOf('/exec') > 0) asked.push(u); });
    await pg.addInitScript(s => {
      localStorage.setItem('up_dests', JSON.stringify(
        [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
      localStorage.setItem('cm_team', JSON.stringify(s.team));
      localStorage.setItem('cm_hist', JSON.stringify(s.hist));
      localStorage.setItem('cm_team_cursor', String(9e12));
      localStorage.setItem('cm_hist_full_v1', '1');          // already done
      localStorage.setItem('cm_team_full_v1', '1');
    }, { url: BASE + '/exec',
         team: [{ t: 'MP', u: 'TK101', d: '2026-07-02', by: 'R. Marrero', g: 'A' }],
         hist: { 'MP|TK101': { d: '2026-07-02' } } });
    await pg.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
    await pg.waitForTimeout(2200);
    ok('a phone already repaired does not re-read the folder again',
       !asked.some(u => /after=0/.test(u)),
       asked.map(u => (u.match(/after=\d+/) || ['—'])[0]).join(' ') || '(none)');
    await ctx.close();
  }

  console.log('\nthe number says how much of the fleet it is about');
  {
    const a = await phone(b, { offline: true, team: TEAM, hist: HIST, cursor: Date.now() });
    const total = await a.p.evaluate(() => (window.ASSETS || []).length);
    const n = await note(a.p);
    if (total > 3) {
      /* "Missed 0" read as "nothing is overdue" while it meant "none of the
         machines I have heard of is overdue". This site has 1,128 of them. */
      ok('the note says how many machines have history here',
         n.includes(await say(a.p, 'due_cover', { n: 3, m: total })),
         n.slice(-80));
    } else {
      ok('the register is too small in this fixture to test coverage', true, total + ' asset(s)');
    }
    await a.ctx.close();
  }

  await b.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
