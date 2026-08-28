/* "EX001 — WE ALREADY CHOSE ONE. IT IS STILL THERE."

   The office settled the clash in the dashboard. The phone went on painting a
   1 on SYSTEM and a ⑂ on the row, and would have done so for as long as it
   lived.

   cfy.cjs proves the CURRENT backend stamps a settled marker rather than
   deleting it, and that a phone pulling that stamp stops warning. This suite is
   about the phone that never gets the stamp, which is the case in the field:

     · docs/yandex/function.js is not live on push. It runs on a VM and is
       replaced by hand. A deployment older than that fix DELETED the marker on
       resolve, so nothing ever arrived saying the question had been answered.
     · Even after the VM is updated, a clash settled by the old backend is
       already gone from the folder, and the phone is left holding a key that
       nothing will ever contradict.

   cfMerge only reconciles by absence on a COMPLETE read - a full re-read of the
   whole folder, with a four-minute budget, behind a button whose connection to
   a stale badge is invisible to the person reading the badge. On every ordinary
   incremental pull the reply is silent about a marker older than the cursor,
   and silence is correctly not read as a verdict. So the badge stood.

   cfRecheck() asks about the markers themselves, and only when there is one to
   ask about. It uses `list` and `files` - actions every deployment of this
   backend has had for a long time - because this has to work against whatever
   is on the VM today, not against a version somebody still has to install.

   The rule it must never break: it may CLOSE a clash and may never OPEN one. A
   listing that failed or came back short is not a statement about what is
   absent, and a false all-clear on a real clash is the worse of the two
   mistakes by a distance.

   Run: node tests/cfstale.cjs        (starts its own server) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8114, B = `http://127.0.0.1:${PORT}`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const KEY = 'TK146|2026-03-09|MP';
const MARKER = '_meta/TK146_09.03.2026_MP.conflict.json';
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const post = body => fetch(B + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(r => r.json());
const rival = (dev, by) => post({ name: 'TK146_09.03.2026_MP.json', folder: 'MP/2026-03',
  contentType: 'application/json', dev, file: b64(JSON.stringify({
    type: 'cm-inspection-entries', version: 2,
    records: [{ equip: 'TK146', date: '2026-03-09', type: 'MP', by, dev,
                items: [{ key: '4C', grade: 'X' }] }] })) });
/* The old backend's resolve, reproduced exactly: the marker goes, and nothing
   is left behind to say a decision was made. */
const deleteMarker = () => fetch(B + '/__del?key=' + encodeURIComponent(MARKER)).then(r => r.text());

async function app(b, url) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify(
      [{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{YYYY-MM}' }]));
  }, url || (B + '/exec'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  return { ctx, p };
}
const settled = p => p.waitForFunction(() => {
  const s = document.getElementById('teamMsg').textContent.trim();
  return s && !/^(Checking|Проверя)/.test(s); }, null, { timeout: 20000 });
/* Through the control an inspector presses, not by calling teamPull - the
   recheck hangs off the press, and a suite that calls the function underneath
   it cannot see whether anything can reach the function. */
const press = async p => {
  await p.evaluate(() => { document.getElementById('teamMsg').textContent = ''; });
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await settled(p);
  await p.waitForTimeout(700);                       // the recheck follows the pull
};
const badge = p => p.evaluate(() => { const el = document.getElementById('tabS');
  return el.className.indexOf('hidden') >= 0 ? '' : el.textContent.trim(); });
const flagged = p => p.evaluate(() => /⑂/.test(document.getElementById('teamList').textContent || ''));
const held = p => p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cm_team_conflicts') || '{}')));

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const br = await chromium.launch();
  await fetch(B + '/__seed');
  await rival('DAAAA', 'I. Ivanov');
  await rival('DBBBB', 'O. Petrova');

  console.log('\nthe phone is warned, which is the part that already worked');
  const { ctx, p } = await app(br);
  await press(p);
  ok('the clash is held', (await held(p)).join() === KEY, (await held(p)).join() || '(none)');
  ok('the tab says so', await badge(p) === '1', await badge(p) || '(no badge)');
  ok('and the row carries the mark', await flagged(p));

  console.log('\nthe office settles it on a backend that deletes its marker');
  ok('the marker is removed from the folder', await deleteMarker() === 'ok');

  console.log('\nan ordinary check no longer reports a decision already made');
  await press(p);
  /* THE ONE THAT NAMES THE BUG. Before the recheck this stayed at 1 for ever:
     the incremental reply is silent about a file older than the cursor, and
     cfMerge is right not to read silence as an answer. */
  ok('the clash is closed', (await held(p)).length === 0, (await held(p)).join() || '(none)');
  ok('the tab badge clears', await badge(p) === '', await badge(p) || '(cleared)');
  ok('and the mark is off the row', !(await flagged(p)));
  /* Closing a clash must not cost the round it was about. */
  ok('the round itself is still in the list',
     await p.evaluate(() => /TK146/.test(document.getElementById('teamList').textContent || '')));
  await ctx.close();

  console.log('\na settled marker that IS stamped closes it too');
  {
    await fetch(B + '/__seed');
    await rival('DAAAA', 'I. Ivanov');
    await rival('DBBBB', 'O. Petrova');
    const a2 = await app(br);
    await press(a2.p);
    ok('warned first', (await held(a2.p)).length === 1, (await held(a2.p)).join());
    await post({ op: 'resolve', key: KEY, keep: 'DAAAA', by: 'office' });
    /* Cleared here by cfMerge, on the incremental pull that carries the
       freshly rewritten marker - the path cfy.cjs owns. Asserted anyway,
       because the recheck must not get in its way. */
    await press(a2.p);
    ok('the stamp closes it', (await held(a2.p)).length === 0, (await held(a2.p)).join() || '(none)');
    ok('and the badge is gone', await badge(a2.p) === '', await badge(a2.p) || '(cleared)');
    await a2.ctx.close();
  }

  console.log('\nsilence is still not a verdict');
  {
    /* A real, open clash, and a backend that cannot be reached. The recheck
       must leave it exactly where it is: a false all-clear on a live clash is
       the expensive direction of this mistake. */
    await fetch(B + '/__seed');
    await rival('DAAAA', 'I. Ivanov');
    await rival('DBBBB', 'O. Petrova');
    const a3 = await app(br);
    await press(a3.p);
    ok('open to begin with', (await held(a3.p)).length === 1, (await held(a3.p)).join());
    const n = await a3.p.evaluate(async u => {
      const d = JSON.parse(localStorage.getItem('up_dests'));
      d[0].url = u; localStorage.setItem('up_dests', JSON.stringify(d));
      return await cfRecheck();
    }, 'http://127.0.0.1:9/dead');
    ok('an unreachable backend closes nothing', n === 0, 'closed ' + n);
    ok('and the clash is still held', (await held(a3.p)).length === 1, (await held(a3.p)).join());
    ok('and the badge still warns', await badge(a3.p) === '1', await badge(a3.p) || '(no badge)');
    await a3.ctx.close();
  }

  console.log('\nthe recheck can never invent a clash');
  {
    /* A clean phone FIRST - the folder has no marker when it loads, so the
       startup pull cannot legitimately open one - and only then a live
       unresolved marker is planted behind its back. If the recheck could open
       a clash, a listing glitch would put a warning on a screen with nothing
       behind it, which is the same lie as a missing reading told the other way
       round. */
    await fetch(B + '/__seed');
    await rival('DAAAA', 'I. Ivanov');
    const a4 = await app(br);
    await press(a4.p);
    ok('nothing is held to begin with', (await held(a4.p)).length === 0, (await held(a4.p)).join() || '(none)');
    await fetch(B + '/__put?key=' + encodeURIComponent(MARKER) + '&type=application/json',
      { method: 'POST', body: JSON.stringify({ type: 'cm-record-conflict', version: 1, key: KEY,
        at: new Date().toISOString(), devices: [{ dev: 'DAAAA', file: '' }, { dev: 'DBBBB', file: '' }],
        resolved: false, keep: '', by: '' }) });
    const n = await a4.p.evaluate(() => cfRecheck());
    ok('it closes nothing when nothing is open', n === 0, 'closed ' + n);
    ok('and opens nothing either', (await held(a4.p)).length === 0, (await held(a4.p)).join() || '(none)');
    ok('so the tab stays clear', await badge(a4.p) === '', await badge(a4.p) || '(clear)');
    await a4.ctx.close();
  }

  await br.close();
  console.log('\n' + (fails.length ? 'FAILED ' + fails.length + '\n  ' + fails.join('\n  ') : 'all passed'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
