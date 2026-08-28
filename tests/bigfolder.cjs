/* A FOLDER BIGGER THAN ONE CALL, WHICH IS EVERY REAL FOLDER AFTER A SEASON.

   A records call answers at most six hundred JSON files, oldest first, and
   says how many it did not send. Baimskaya's folder is a season of sidecars
   plus every edit, conflict, deferral and deletion marker beside them, so it
   passed six hundred long ago. From that point on:

     · a FULL read - after=0 - always came back truncated, holding the OLDEST
       six hundred files;
     · its cursor, the six-hundredth oldest, was written straight over a cursor
       that was already at today, throwing away everything in between;
     · the one-time history repair ran a full read on every launch until it
       succeeded, and it could never succeed, so the phone reset itself to the
       same old window each time it opened;
     · and it never reached the newest rounds - which are exactly the rounds
       somebody is planning this week against.

   That is a handset reporting "Missed 0" while five machines sit past their
   interval, and nothing on it looks wrong: it syncs, it says "updated just
   now", and it is holding six hundred perfectly good rounds.

   It also explains the silence. The folder-versus-phone warning is only
   written by a read that covered the folder, and on a folder this size no
   single read ever did - so the one line that would have named this said
   nothing, on every build that had it.

   Two things are fixed and both are checked here:

     the cursor may never go backwards   it is a promise about what this phone
                                         HOLDS, and a prefix is not that promise
     a full read is a SCAN, not a call   it walks the folder in steps, from its
                                         own position, until the folder says
                                         there is nothing pending

   Run: node tests/bigfolder.cjs        (starts its own 700-round folder) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8116, B = `http://127.0.0.1:${PORT}`;
const ROUNDS = 700;                       // > 600, so one call cannot hold it
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = spawn(process.execPath, [path.join(__dirname, 'mock.cjs'), String(PORT)],
                  { stdio: 'ignore', env: Object.assign({}, process.env, { CM_SEED: String(ROUNDS) }) });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

/* The state a phone that has been syncing for months is in: a cursor at today,
   its one-time round-body repair long since done. */
const AHEAD = String(9e12);

async function boot(b, seed) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  const asked = [];
  p.on('request', r => { const u = r.url();
    if (u.indexOf('/exec') > 0) asked.push(Number((u.match(/after=(\d+)/) || [, -1])[1])); });
  await p.addInitScript(s => {
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: s.url, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_team_cursor', s.cursor);
    if (s.healed) localStorage.setItem('cm_hist_full_v1', '1');
    /* A cursor with an EMPTY round cache is a separate, older self-heal - the
       cache is gone, so the cursor's promise is false and it correctly starts
       over. A phone that has been syncing for months is not in that state, and
       a fixture that leaves the cache empty is testing that heal instead of
       this one. */
    if (s.held) {
      localStorage.setItem('cm_team', JSON.stringify(s.held));
      const h = {}; s.held.forEach(r => { h[r.t + '|' + r.u] = { d: r.d }; });
      localStorage.setItem('cm_hist', JSON.stringify(h));
    }
  }, Object.assign({ url: B + '/exec' }, seed));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  return { ctx, p, asked };
}
const state = p => p.evaluate(() => ({
  hist: Object.keys(JSON.parse(localStorage.getItem('cm_hist') || '{}')).length,
  cursor: Number(localStorage.getItem('cm_team_cursor') || 0),
  fleet: JSON.parse(localStorage.getItem('cm_fleet_n') || 'null'),
  healed: !!localStorage.getItem('cm_hist_full_v1'),
}));

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }

  console.log('the folder really is bigger than one call');
  const one = await fetch(B + '/exec?action=records&after=0&index=0').then(r => r.json());
  ok('a full read comes back short', one.truncated === true && one.records.length === 600,
     one.records.length + ' of ' + ROUNDS + ', truncated=' + one.truncated);
  ok('and says how much it did not send', one.pending === ROUNDS - 600, String(one.pending));
  /* The cursor of a truncated read is the six-hundredth OLDEST file. Written
     over a cursor at today, it throws away four months. */
  ok('its cursor is far behind a phone that is up to date', one.cursor < Number(AHEAD),
     one.cursor + ' vs ' + AHEAD);

  const b = await chromium.launch();

  console.log('\na phone that has been syncing for months, opened once');
  {
    const a = await boot(b, { cursor: AHEAD });
    await a.p.waitForTimeout(9000);
    const s = await state(a.p);
    /* THE ONE THAT NAMES THE BUG. Before this the phone ended holding the
       oldest six hundred and nothing else, for ever. */
    ok('it ends up holding the whole folder', s.hist === ROUNDS, s.hist + ' of ' + ROUNDS);
    ok('the stored cursor was never moved backwards', s.cursor >= Number(AHEAD),
       s.cursor + ' vs ' + AHEAD);
    ok('and the scan walked forward instead of asking the same thing twice',
       a.asked.filter(x => x === 0).length <= 2 && a.asked.some(x => x > 0 && x < Number(AHEAD)),
       a.asked.join(' '));
    ok('the repair records itself finished', s.healed);
    /* And the line that would have named all of this can finally be written:
       only a read that covered the folder may write it, and until now none
       ever did. */
    ok('what the folder holds is recorded at last', !!s.fleet && s.fleet.p === ROUNDS,
       JSON.stringify(s.fleet));
    await a.ctx.close();
  }

  console.log('\nand it does not re-read the folder every time it opens');
  {
    const HELD = [{ t: 'MP', u: 'TK101', d: '2026-07-02', by: 'R. Marrero', g: 'A' },
                  { t: 'MP', u: 'TK102', d: '2026-07-03', by: 'R. Marrero', g: 'A' }];
    const a = await boot(b, { cursor: AHEAD, healed: true, held: HELD });
    await a.p.waitForTimeout(4000);
    ok('a repaired phone asks from its cursor, not from the beginning',
       !a.asked.some(x => x === 0), a.asked.join(' ') || '(none)');
    await a.ctx.close();
  }

  console.log('\nnothing is claimed that was not read');
  {
    /* A scan that runs out of calls has not covered the folder, and must not
       write a folder count or mark the repair done - either would leave the
       phone confidently short. */
    const a = await boot(b, { cursor: AHEAD });
    const partial = await a.p.evaluate(async () => {
      localStorage.removeItem('cm_fleet_n');
      /* One call, by hand, exactly as a scan that could not continue would
         leave things. */
      await teamPull(true, true);
      return { complete: teamLastComplete, pending: teamPending,
               fleet: localStorage.getItem('cm_fleet_n') };
    });
    ok('a single truncated call is not a complete read', partial.complete === false,
       'complete=' + partial.complete + ' pending=' + partial.pending);
    ok('and writes no folder count', !partial.fleet, String(partial.fleet));
    await a.ctx.close();
  }

  await b.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
