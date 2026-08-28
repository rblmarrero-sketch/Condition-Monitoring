/* THE SAME PHONE, THE SAME BUILD, SIX OVERDUE MACHINES APART.

   An installed home-screen app said "Missed 0 · All 47". The same URL in the
   browser on the same handset said "Missed 6". Both were on v174. Both said
   "fleet history updated just now".

   The storage split is real — iOS gives an installed PWA its own localStorage
   — but it is not the fault. It only decides WHICH copy breaks first, and the
   installed one breaks first because it also carries the offline shell, the
   photo queue and the drafts. The fault is what this app does when a jar is
   full, and it was a chain of four:

     1  teamSave halved the round cache and returned TRUE. The caller reads
        that return to decide whether to advance the cursor.
     2  So the cursor advanced past rounds that had just been dropped. The
        cursor means "I already hold everything up to here", which the server
        takes at face value — those rounds were never sent again, ever.
     3  histSave swallowed its own quota failure. histCache — memory — took
        the new index, localStorage kept the old one. On the next launch
        memory is gone and the short stored index is the only truth.
     4  histStamp fired regardless, so the screen said "updated just now" over
        a history that had never been written.

   Nothing threw. Nothing was cleared. Nothing looked wrong. The phone computed
   its due list from a history it did not have and reported no overdue machines
   with complete confidence — the reassuring direction, and the one nobody goes
   back to check.

   The priority was inverted as well: cm_hist is a few hundred bytes per unit
   and decides whether somebody walks to a machine at −40; cm_team is a
   bounded cache of two thousand rows behind a browsable list. The small
   critical one was losing to the big convenient one.

   Run: node tests/histfull.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const say = (p, k, v) => p.evaluate(([k, v]) => t(k, v || undefined), [k, v]);

/* A jar that is full for everything EXCEPT the keys named. Real quota
   behaviour: setItem throws, getItem and removeItem keep working, and freeing
   space makes the next write succeed — which is the whole basis of the repair. */
const CAP = (allow) => `
  (() => {
    const real = Object.getPrototypeOf(localStorage);
    const set = real.setItem, rm = real.removeItem;
    window.__full = true;
    window.__allow = ${JSON.stringify(allow)};
    real.setItem = function (k, v) {
      if (window.__full && window.__allow.indexOf(k) < 0) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      return set.call(this, k, v);
    };
  })();`;

async function phone(p, opts) {
  const ctx = await p.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await pg.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: u, sec: '', folder: '' }]));
  }, BASE + '/exec');
  if (opts && opts.cap) await pg.addInitScript(opts.cap);
  await pg.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await pg.waitForTimeout(1400);
  return { ctx, p: pg };
}
/* DID THE SCRIPT RUN TO THE END?

   teamBusy is declared near the bottom of the file. If a top-level write threw
   on the way down, everything from that point is never evaluated, and reading
   it raises a temporal-dead-zone ReferenceError. That is the difference
   between "the app is degraded" and "the app is not there". */
const booted = pg => pg.evaluate(() => {
  try { return typeof teamBusy !== "undefined" || teamBusy === false; }
  catch (e) { return false; }
});
const pull = async pg => {
  if (!await booted(pg)) return false;
  await pg.evaluate(() => showPane('paneSystem'));
  await pg.evaluate(() => teamPull(true, false));
  await pg.waitForTimeout(1200);
  return true;
};
/* Read entirely out of storage except for the one line that has to compare
   memory against it - and that line is guarded, because on a script that died
   half way down histAll() is not merely wrong, it throws. A suite that cannot
   report on a broken app reports nothing at all. */
const state = pg => pg.evaluate(() => ({
  cursor: localStorage.getItem('cm_team_cursor') || '',
  short: !!localStorage.getItem('cm_hist_short'),
  stamped: !!localStorage.getItem('cm_hist_at'),
  storedHist: Object.keys(JSON.parse(localStorage.getItem('cm_hist') || '{}')).length,
  memHist: (() => { try { return Object.keys(histAll()).length; } catch (e) { return -1; } })(),
}));

/* A MECHANISM, NOT A RESOLUTION TO BE CAREFUL.

   One bare localStorage.setItem in the body of the script is enough to stop
   the app loading on a full phone, and it is invisible in review — it looks
   exactly like the forty guarded ones. So the file is read as text and every
   write is checked, with two deliberate exemptions: teamSave and histSave are
   the two callers for which the throw IS the answer. */
function unguardedWrites() {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "mobile", "index.html"), "utf8");
  const lines = src.split("\n");
  const span = name => {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("function " + name + "(")) continue;
      let d = 0, started = false;
      for (let j = i; j < lines.length; j++) {
        d += (lines[j].match(/{/g) || []).length - (lines[j].match(/}/g) || []).length;
        if (lines[j].includes("{")) started = true;
        if (started && d <= 0) return [i, j];
      }
    }
    return null;
  };
  /* lsSet and lsDel ARE the guard — they are where the raw call is supposed
     to live. teamSave and histSave are the two that read the throw as an
     answer. Nothing else may touch localStorage directly. */
  const exempt = [span("teamSave"), span("histSave"), span("lsSet"), span("lsDel")].filter(Boolean);
  const out = [];
  lines.forEach((l, i) => {
    if (!/localStorage\.(setItem|removeItem)\(/.test(l)) return;
    if (exempt.some(([a, b]) => i >= a && i <= b)) return;
    out.push((i + 1) + ": " + l.trim().slice(0, 70));
  });
  return { out, exempt: exempt.length };
}

(async () => {
  console.log('every write goes through a guard');
  const uw = unguardedWrites();
  ok('the guard and the two that read a throw are the only exemptions',
     uw.exempt === 4, uw.exempt + ' found');
  ok('and nothing else writes to localStorage directly', uw.out.length === 0,
     uw.out.slice(0, 4).join(' | ') || 'none');

  const b = await chromium.launch();

  console.log('\na phone with room stores what it was sent');
  {
    const a = await phone(b);
    await pull(a.p);
    const s = await state(a.p);
    ok('the index reached storage', s.storedHist > 0, s.storedHist + ' unit/type date(s)');
    ok('memory and storage agree', s.storedHist === s.memHist, s.storedHist + ' vs ' + s.memHist);
    ok('it is stamped', s.stamped);
    ok('and nothing is flagged as short', !s.short);
    ok('the cursor advanced', !!s.cursor, s.cursor);
    await a.ctx.close();
  }

  console.log('\na full jar: the index wins, the browsable cache gives way');
  {
    /* Room for the index and for its own bookkeeping, and for nothing else —
       which is what a phone looks like once the offline shell, the photo queue
       and the drafts are in the same jar. */
    const a = await phone(b, { cap: CAP(['cm_hist', 'cm_hist_short', 'cm_hist_at', 'cm_hist_err', 'cm_team']) });
    /* THE ONE THAT MATTERS MOST, AND IT IS NOT ABOUT HISTORY.

       A one-time upgrade write sat as a bare statement in the body of the
       script. On a full phone it threw during evaluation, and every line below
       it - all the state, all the functions, all the handlers - was never
       reached. The page painted its markup and did nothing. An installed
       home-screen app has its own jar and fills first, so this is the copy
       that dies, on the handsets that have been in service longest, and it
       reads to the person holding it as "the app is broken on my phone". */
    ok("a full phone still finishes loading the app", await booted(a.p));
    await a.p.evaluate(() => { window.__allow = ['cm_hist_short', 'cm_hist_at', 'cm_hist_err', 'cm_hist']; });
    await pull(a.p);
    const s = await state(a.p);
    ok('the last-done index still reached storage', s.storedHist > 0, s.storedHist + ' date(s)');
    /* THE ONE THAT NAMES THE BUG. Memory and storage diverging IS the defect:
       the screen reads memory, the next launch reads storage. */
    ok('and it is the same index the screen is reading',
       s.storedHist === s.memHist, s.storedHist + ' stored vs ' + s.memHist + ' in memory');
    await a.ctx.close();
  }

  console.log('\nwhen nothing can be written, nothing is claimed');
  {
    const a = await phone(b, { cap: CAP(['cm_hist_short']) });
    await pull(a.p);
    const s = await state(a.p);
    ok('the index did not reach storage', s.storedHist === 0, s.storedHist + ' date(s)');
    /* It used to stamp anyway. "Updated just now" over a history that was
       never written is the reassuring direction of this project's oldest
       failure. */
    ok('so nothing says it was updated', !s.stamped);
    ok('and the phone knows it is short', s.short);
    await a.ctx.close();
  }

  console.log('\nthe cursor never moves past rounds that were not stored');
  {
    const a = await phone(b, { cap: CAP(['cm_hist_short']) });
    await pull(a.p);
    const s = await state(a.p);
    /* This is the line that made the loss PERMANENT. The cursor is a promise
       to the server that this phone already holds everything up to it. */
    ok('no cursor was written', !s.cursor, s.cursor || '(none)');
    await a.ctx.close();
  }

  console.log('\na phone that came up short re-reads the whole folder');
  {
    const a = await phone(b);
    await pull(a.p);
    const before = await state(a.p);
    ok('it starts with a cursor and a full index', !!before.cursor && before.storedHist > 0,
       before.cursor + ' · ' + before.storedHist);
    /* Exactly the state the two handsets were in: a cursor that cannot be
       backed up, and nothing cleared to make it look wrong. */
    await a.p.evaluate(() => { localStorage.setItem('cm_hist_short', '1'); });
    const asked = await a.p.evaluate(async () => {
      const seen = [];
      const f = window.fetch;
      window.fetch = (u, o) => { seen.push(String(u)); return f(u, o); };
      await teamPull(true, false);
      window.fetch = f;
      return seen;
    });
    await a.p.waitForTimeout(600);
    ok('the next check asks from the beginning',
       asked.some(u => /after=0/.test(u)), asked.map(u => (u.match(/after=\d+/) || ['—'])[0]).join(' '));
    const after = await state(a.p);
    ok('and the flag is retired by a read that actually stored', !after.short);
    ok('with the index intact', after.storedHist >= before.storedHist,
       before.storedHist + ' → ' + after.storedHist);
    await a.ctx.close();
  }

  console.log('\nthe due list says it is incomplete rather than saying nothing is due');
  {
    const a = await phone(b);
    await pull(a.p);
    await a.p.evaluate(() => showPane('paneDue'));
    await a.p.waitForTimeout(400);
    /* Raised AFTER the pane is up and nothing else is in flight: a complete
       read that stored is allowed to retire this flag, and an automatic pull
       landing mid-test would do exactly that. */
    await a.p.evaluate(() => { localStorage.setItem('cm_hist_short', '1'); renderDue(); });
    await a.p.waitForTimeout(200);
    const note = await a.p.evaluate(() => (document.getElementById('dueBasis') || {}).textContent || '');
    ok('the note names running out of room', note.includes(await say(a.p, 'hist_short')), note.slice(-70));
    /* Out of room outranks everything else on that line: a full phone goes on
       reaching the system perfectly well and goes on being wrong. */
    ok('and not a network failure it did not have',
       !note.includes(await say(a.p, 'hist_fail')));
    ok('the note is marked as a warning',
       await a.p.evaluate(() => document.getElementById('dueBasis').classList.contains('warn')));
    await a.ctx.close();
  }
  {
    const a = await phone(b, { cap: CAP(['cm_hist_short']) });
    await a.p.evaluate(() => showPane('paneDue'));
    await a.p.waitForTimeout(300);
    /* histCache is the in-memory copy the screen actually reads. Clearing the
       key without clearing it would leave the list rendering from a history
       that is no longer there - which is, in miniature, the bug this whole
       file is about. */
    await a.p.evaluate(() => { localStorage.setItem('cm_hist_short', '1');
                               localStorage.removeItem('cm_hist');
                               histCache = null; renderDue(); });
    await a.p.waitForTimeout(300);
    const empty = await a.p.evaluate(() => {
      const e = document.querySelector('#dueList .empty'); return e ? e.textContent.trim() : null; });
    ok('an empty list explains the loss', empty === await say(a.p, 'due_short'), String(empty).slice(0, 70));
    ok('rather than saying nothing is due', empty !== await say(a.p, 'due_empty'));
    await a.ctx.close();
  }

  await b.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
