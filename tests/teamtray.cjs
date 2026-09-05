/* A MEASURED ROUND IS GRADED THE SAME ON THE PHONE AS IN THE OFFICE.

   Field report, build 261: the dashboard listed TK124's dump-body round as
   5 – Critical, "2 at or past condemn · worst 103%", and the phone's history
   showed the same round with no grade at all. Both had the same record. The
   tray was walked before the register knew the truck's tray model, so the
   phone stored the millimetres and no remaining life; the office recomputes
   every station against today's limits (wearOf), and the phone's row read
   only what was stored.

   How a tray is rated, on both surfaces: PER STATION. Each station's
   thickness is set against the liner's new and condemn limits (HM400 liner:
   20 mm new, 3 mm condemn) — worn % = (new − mm) / (new − condemn) — and the
   round's grade is the WORST station, by the same 1–5 table as a graded
   point (GRADE.fromWorn). "4 at or past condemn · worst 111%" is four
   stations at or below the condemn thickness, the worst 11% past it.

   What has to be true, against the real backend:
     · a tray round with readings and no stored remaining life reads on the
       phone's history row exactly as the office rates it, from the phone's
       own reference for that truck;
     · a round measured before a limit was revised — stale figure stored —
       reads by today's limit, as the office does;
     · the round view's percentage column says the same per station.

   Run: node tests/teamtray.cjs        (spawns tests/ya-srv.cjs on 8136) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8136, B = 'http://127.0.0.1:' + PORT, EXEC = B + '/exec';
const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT), 'letmein'], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const dests = u => JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' }]);
const post = b => fetch(EXEC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const plant = async (unit, date, items) => {
  const dmy = date.split('-').reverse().join('.');
  const side = JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [{ equip: unit, date, type: 'TB', by: 'Хасенов', cls: 'AT', dev: 'DTRAY', items }] });
  return post({ op: 'batch', dev: 'DTRAY', folder: 'TB/2026-08', files: [{ name: `${unit}_${dmy}_TB.json`, file: Buffer.from(side).toString('base64'), contentType: 'application/json' }] });
};
const st = (key, mm, extra) => Object.assign({ key, detection: 'DM-02', mm, refSrc: 'tray:HM400?' }, extra || {});

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(EXEC + '?action=list&ext=.json'); break; } catch (e) { await new Promise(r => setTimeout(r, 250)); } }
  /* TK124 the way the folder holds it: readings, no remaining life, the tray
     model a question mark at capture. Two stations past condemn. */
  const a = await plant('TK124', '2026-08-12', [st('H21', 7.9), st('F31', 2.5), st('F32', 2.9), st('F33', 9.0), st('F62', 24)]);
  /* TK117 the way the folder holds it: measured against the 8 mm limit that
     was revised to 3 mm the same day — the stored figure says 92% worn. */
  const b0 = await plant('TK117', '2026-08-23', [st('F31', 8.92, { newMM: 20, condemnMM: 8, wearPct: 92, refSrc: 'tray:HM400' })]);
  ok('two tray rounds are on the folder', a.ok && b0.ok, JSON.stringify([a.ok, b0.ok]));

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript(d => localStorage.setItem('up_dests', d), dests(EXEC));
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  ok('the phone pulled the folder', await p.evaluate(() => teamPull(true, true)) === true);

  console.log('\n  TK124: readings, no remaining life on the record');
  const R = await p.evaluate(() => {
    const row = teamAll().find(x => x.u === 'TK124' && x.t === 'TB');
    /* What the office rates it: every station against today's limits for
       this truck's tray, the worst decides — asked of the phone's own tables. */
    const st = bodyStatus('TK124');
    const pct = k => Math.round(BODY.wear(st.model, k, { H21: 7.9, F31: 2.5, F32: 2.9, F33: 9.0, F62: 24 }[k]));
    const per = ['H21', 'F31', 'F32', 'F33', 'F62'].map(k => k + '=' + pct(k) + '%');
    const worst = Math.max(...['H21', 'F31', 'F32', 'F33', 'F62'].map(pct));
    return { g: row && row.g, model: st.model, sure: st.sure, per, worst, want: GRADE.fromWorn(worst), atCondemn: ['H21', 'F31', 'F32', 'F33', 'F62'].filter(k => pct(k) >= 100).length };
  });
  console.log('   ' + JSON.stringify(R));
  ok('the phone knows the tray model from the register', !!R.model, R.model + (R.sure ? '' : ' (not sure)'));
  ok('the history row carries the grade the office shows — the worst station, ' + R.worst + '% worn', R.g === R.want && R.want === 5, 'row ' + R.g + ' vs ' + R.want);
  ok('  rated per station: ' + R.atCondemn + ' at or past condemn', R.atCondemn === 2, R.per.join(' '));
  const V = await p.evaluate(async () => { await openTeamRow('TK124|2026-08-12|TB');
    const rows = [...document.querySelectorAll('#roundBody .rdrow')].map(e => ({ t: e.innerText.replace(/\s+/g, ' ').trim(), p: (e.querySelector('.rp') || {}).textContent || '' }));
    document.getElementById('roundClose').click(); return rows; });
  /* Every liner station is 20 mm on and 3 mm off (body-points.js LINER), so a
     24 mm reading on F62 is thicker than new: −24%, and honestly so. */
  ok('the round view shows the same percentage per station', V.length === 5 && V.some(r => /F31/.test(r.t) && /103%/.test(r.p)) && V.some(r => /F32/.test(r.t) && /101%/.test(r.p)) && V.some(r => /F62/.test(r.t) && /-24%/.test(r.p)), V.map(r => r.t.slice(0, 12) + ' ' + r.p).join(' | '));

  console.log('\n  TK117: measured before the limit was revised');
  const T = await p.evaluate(() => { const row = teamAll().find(x => x.u === 'TK117' && x.t === 'TB'); const st = bodyStatus('TK117');
    const today = Math.round(BODY.wear(st.model, 'F31', 8.92)); return { g: row && row.g, today, wantToday: GRADE.fromWorn(today), stale: GRADE.fromWorn(92) }; });
  ok('the row reads by today\'s limit, as the office does — not the 92% stored at capture', T.g === T.wantToday && T.g !== T.stale, JSON.stringify(T));

  await ctx.close(); await b.close(); bye();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); bye(); process.exit(1); });
