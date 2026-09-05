/* WHAT THE OFFICE CORRECTS, THE PHONE SHOWS.

   "I already put the grade in the dashboard; in the mobile still nothing."
   The dashboard wrote corrections as markers and applied them with its own
   applyEdits(); the phone read the same markers off the same pull and applied
   only the void. A grade the office put on a round that arrived ungraded, a
   finding moved to the right point, a position removed — the inspector's
   history never showed any of it.

   Now both surfaces read a round through mobile/edits.js, and the phone
   keeps the markers it has seen. Against the REAL backend (function.js on
   tests/ya-srv.cjs), the way the fleet talks to it:

     · a round pulled with no marker reads as captured;
     · the office grades a position; the phone's next ordinary pull brings
       the marker and the history row and the round view say the new grade;
     · the office moves a finding to another point; the round view lists it
       there;
     · the office removes a position; the round view no longer lists it;
     · the markers survive a reload of the app;
     · the last marker written wins.

   Run: node tests/teamedit.cjs        (spawns tests/ya-srv.cjs on 8135) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8135, B = 'http://127.0.0.1:' + PORT, EXEC = B + '/exec';
const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT), 'letmein'], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const dests = u => JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' }]);
const post = b => fetch(EXEC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const KEY = 'MP|TK146|2026-03-09';          // the row's key, type|unit|date
const FKEY = 'TK146|2026-03-09|MP';         // the round's filing key, unit|date|type — what the list hands to openTeamRow

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC + '?action=list&ext=.json'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(d => localStorage.setItem('up_dests', d), dests(EXEC));
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const row = () => p.evaluate(k => { const r = teamAll().find(x => teamKey(x) === k); return r ? { g: r.g, by: r.by } : null; }, KEY);
  const view = () => p.evaluate(async k => { await openTeamRow(k); const rows = [...document.querySelectorAll('#roundBody .rdrow')].map(e => e.innerText.replace(/\s+/g, ' ').trim());
    document.getElementById('roundClose').click(); return rows; }, FKEY);

  console.log('as captured');
  ok('the phone pulled the folder', await p.evaluate(() => teamPull(true, true)) === true);
  let r = await row();
  ok('TK146 09.03 reads grade 3, as the inspector graded it', r && r.g === 3, JSON.stringify(r));
  let v = await view();
  ok('and the round view shows position 4C at 3 – Degraded', v.length === 1 && /4C|Final Drive/.test(v[0]) && v[0].indexOf(await p.evaluate(() => GRADE.label(3, lang))) >= 0, v.join(' | '));

  console.log('\nthe office grades it 1');
  const ed = await post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'Office', items: { '4C': { grade: 1 } } });
  ok('the marker is on the folder', ed.ok, JSON.stringify(ed).slice(0, 80));
  ok('the phone\'s next ordinary pull', await p.evaluate(() => teamPull(true)) === true);
  r = await row();
  ok('the history row now says 1', r && r.g === 1, JSON.stringify(r));
  v = await view();
  ok('and the round view shows 1 – Normal on 4C', v.length === 1 && v[0].indexOf(await p.evaluate(() => GRADE.label(1, lang))) >= 0, v.join(' | '));

  console.log('\nthe office moves the finding to 4D');
  await post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'Office', items: { '4C': { grade: 1, key: '4D', label: 'Right Rear Final Drive' } } });
  await p.evaluate(() => teamPull(true));
  v = await view();
  ok('the round view lists it under 4D, still graded 1', v.length === 1 && /4D|Right Rear/.test(v[0]) && !/\b4C\b/.test(v[0]), v.join(' | '));

  console.log('\nthe office removes the position');
  await post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'Office', items: { '4C': { removed: 1 } } });
  await p.evaluate(() => teamPull(true));
  v = await view();
  r = await row();
  ok('the round view no longer lists it', v.length === 0, v.join(' | ') || 'nothing listed');
  ok('and the row carries no grade', r && (r.g === '' || r.g == null), JSON.stringify(r));

  console.log('\nthe markers survive a reload, and the last written wins');
  await post({ op: 'edit', key: 'TK146|2026-03-09|MP', by: 'Office', items: { '4C': { grade: 2 } } });
  await p.evaluate(() => teamPull(true));
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500);
  r = await row(); v = await view();
  ok('after a reload the row says 2 and the view shows 2 – Incipient', r && r.g === 2 && v.length === 1 && v[0].indexOf(await p.evaluate(() => GRADE.label(2, lang))) >= 0, JSON.stringify(r) + ' ' + v.join(' | '));
  const other = await p.evaluate(() => { const r = teamAll().find(x => x.u === 'TK147'); return r && r.g; });
  ok('a round the office never touched reads as captured', other === 1, String(other));

  await ctx.close(); await b.close(); bye();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); bye(); process.exit(1); });
