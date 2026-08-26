/* F2 on the backend we actually run.

   cfp.cjs tells the whole two-phones-one-round story, and tells it against the
   Apps Script double — the backend the mine stopped using. Pointed at the
   Yandex function the same story failed at the first step and nothing said so:
   the marker went into the bucket with an EMPTY key, readRecords() only
   forwards a marker that has one, and resolving DELETED the marker instead of
   stamping it. So no phone was ever warned, the office's decision lived in the
   localStorage of the one browser that made it, and a phone warned back in the
   Drive era could never be told the question had been answered — which is
   exactly what came back from the pit: "I already chose one and it still shows
   1."

   Runs the REAL docs/yandex/function.js over an in-memory bucket, and the real
   app against it.

   Run: node tests/cfy.cjs        (starts its own server)
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8112, B = `http://127.0.0.1:${PORT}`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const post = body => fetch(B + '/exec', { method: 'POST',
  headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(r => r.json());
const get = q => fetch(B + '/exec?' + q).then(r => r.json());

const rival = (dev, by) => post({ name: 'TK146_09.03.2026_MP.json', folder: 'MP/2026-03',
  contentType: 'application/json', dev, file: b64(JSON.stringify({
    type: 'cm-inspection-entries', version: 2,
    records: [{ equip: 'TK146', date: '2026-03-09', type: 'MP', by, dev,
                items: [{ key: '4C', grade: 'X' }] }] })) });
const resolve = keep => post({ op: 'resolve', key: 'TK146|2026-03-09|MP', keep, by: 'office' });

async function app(b, init) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(([u, held]) => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{YYYY-MM}' }]));
    if (held) localStorage.setItem('cm_team_conflicts', held);
  }, [B + '/exec', init || '']);
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  return { ctx, p };
}
const settled = p => p.waitForFunction(() => {
  const s = document.getElementById('teamMsg').textContent.trim();
  return s && !/^(Checking|Проверя)/.test(s); }, null, { timeout: 20000 });
const check = async p => {
  await p.evaluate(() => { document.getElementById('teamMsg').textContent = ''; });
  await p.evaluate(() => showPane('paneSystem'));
  await p.click('#teamRefresh'); await settled(p);
};
/* What the tab actually paints, not what the store happens to hold — the number
   an inspector reads is the assertion. */
const badge = p => p.evaluate(() => { const el = document.getElementById('tabS');
  return el.className.indexOf('hidden') >= 0 ? '' : el.textContent.trim(); });

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const br = await chromium.launch();
  await fetch(B + '/__seed');

  console.log('\ntwo phones, one round');
  await rival('DAAAA', 'I. Ivanov');
  const r = await rival('DBBBB', 'O. Petrova');
  ok('the function kept both', r.ok && r.kept === true, JSON.stringify(r).slice(0, 120));
  ok('and answers with the record key, not a file name', r.conflict === 'TK146|2026-03-09|MP', String(r.conflict));
  ok('naming both devices as {dev,file}', Array.isArray(r.devices) && r.devices.length === 2
    && r.devices.every(d => d && d.dev && d.file), JSON.stringify(r.devices));

  /* The step that was silently dead. A marker nobody is handed warns nobody. */
  let j = await get('action=records&after=0&index=0');
  ok('the marker reaches the clients', (j.conflicts || []).length === 1,
    JSON.stringify((j.conflicts || []).length));
  ok('carrying the record key', ((j.conflicts || [])[0] || {}).key === 'TK146|2026-03-09|MP',
    JSON.stringify(((j.conflicts || [])[0] || {}).key));
  ok('and open, not settled', ((j.conflicts || [])[0] || {}).resolved === false);

  console.log('\nthe inspector is warned');
  const { ctx, p } = await app(br);
  await check(p);
  let msg = (await p.textContent('#teamMsg')).trim();
  ok('the pull says a round was sent twice', /sent twice/.test(msg), msg);
  ok('the affected round is marked in the list', /sent twice/.test(await p.textContent('#teamList')));
  ok('the tab says one is waiting', (await badge(p)) === '1', await badge(p));

  console.log('\na retry must not re-open a settled question');
  const again = await rival('DBBBB', 'O. Petrova');
  j = await get('action=records&after=0&index=0');
  ok('the same device re-sending adds no device', ((j.conflicts || [])[0] || {}).devices.length === 2,
    JSON.stringify(((j.conflicts || [])[0] || {}).devices.length));

  console.log('\nthe office decides');
  const rr = await resolve('DAAAA');
  ok('the reply names the device kept', rr.ok && rr.keep === 'DAAAA', JSON.stringify(rr));
  j = await get('action=records&after=0&index=0');
  ok('the marker is still there, stamped', (j.conflicts || []).length === 1
    && j.conflicts[0].resolved === true && j.conflicts[0].keep === 'DAAAA',
    JSON.stringify((j.conflicts || [])[0] || null).slice(0, 140));

  console.log('\nand the phone is told');
  await check(p);
  msg = (await p.textContent('#teamMsg')).trim();
  ok('the warning stops', !/sent twice/.test(msg), msg);
  ok('the list is clean', !/sent twice/.test(await p.textContent('#teamList')));
  ok('the tab badge clears', (await badge(p)) === '', await badge(p));

  console.log('\nthe decision outlives the browser that made it');
  const fresh = await app(br);
  await check(fresh.p);
  ok('a phone that never saw the clash is not warned',
    !/sent twice/.test(await fresh.p.textContent('#teamMsg')), await fresh.p.textContent('#teamMsg'));
  ok('and shows no badge', (await badge(fresh.p)) === '', await badge(fresh.p));
  await fresh.ctx.close();

  console.log('\na leftover from a backend that deleted its markers');
  /* Nothing on the server, a key in storage, and no round behind it: the badge
     an inspector reported as "1, but nothing". */
  const old = await app(br, JSON.stringify({ 'TK999|2020-01-01|MP': { at: '2020-01-01T00:00:00Z' } }));
  ok('a key with no round paints no badge', (await badge(old.p)) === '', await badge(old.p));
  await check(old.p);
  ok('and a full pull clears it for good',
    await old.p.evaluate(() => !Object.keys(JSON.parse(localStorage.getItem('cm_team_conflicts') || '{}')).length),
    await old.p.evaluate(() => localStorage.getItem('cm_team_conflicts')));
  await old.ctx.close();

  console.log('\nan incremental pull is silent, not empty');
  /* It says nothing about anything before the cursor, so it must never be read
     as "there are no clashes" — that would wipe a live one on every sync. */
  await p.evaluate(() => { localStorage.setItem('cm_team_conflicts',
    JSON.stringify({ 'TK146|2026-03-09|MP': { at: '2026-03-09T00:00:00Z' } })); cfCache = null; });
  const kept = await p.evaluate(() => cfMerge([], false)
    && Object.keys(JSON.parse(localStorage.getItem('cm_team_conflicts') || '{}')).length);
  ok('an incremental reply keeps an open clash',
    await p.evaluate(() => !!JSON.parse(localStorage.getItem('cm_team_conflicts') || '{}')['TK146|2026-03-09|MP']),
    String(kept));

  await ctx.close(); await br.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
