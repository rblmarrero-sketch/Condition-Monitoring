/* The whole chain, on the backend it is moving to.

   Every other suite proves one link. e2e.cjs hands the dashboard an export
   file; mirror.cjs watches the uploader; dashswap.cjs checks which URL a
   browser picks. None of them walk the path a round actually takes:

     an inspector captures it  →  it uploads  →  it lands in the bucket
       →  the office opens the dashboard  →  the round is there
       →  with its findings, and its photographs

   That last arrow is the one this project keeps getting wrong, and always the
   same way: a real value rendered as nothing. A sheet with no photographs on it
   looks exactly like a round where nobody took any.

   Run: node tests/chain.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8115, B = `http://127.0.0.1:${PORT}`, EXEC = B + '/exec';
let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(EXEC); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();

  /* ---- 1. an inspector captures a round -------------------------------- */
  console.log('\nthe pit: one round, two photographs');
  const pctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await pctx.addInitScript(u => {
    localStorage.setItem('up_swap_off', '1');
    localStorage.setItem('up_gas_only_v1', '1');
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas', on: true, url: u, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' }]));
  }, EXEC);
  const ph = await pctx.newPage();
  ph.on('pageerror', e => ok('phone raised an error', false, e.message));
  await ph.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await ph.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await ph.waitForTimeout(400);

  await ph.evaluate(async () => {
    const shot = async tag => { const c = document.createElement('canvas');
      c.width = 640; c.height = 480; const x = c.getContext('2d');
      x.fillStyle = '#4b4136'; x.fillRect(0, 0, 640, 480);
      x.fillStyle = '#fff'; x.font = '48px sans-serif'; x.fillText(tag, 40, 240);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)); };
    const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change'));
    selectEquip('TK149');
    await new Promise(r => setTimeout(r, 400));
    const pos = {};
    for (const [i, it] of items().entries())
      pos[it.k] = { grade: i === 0 ? 'C' : 'A', sev: i === 0 ? 'DEG' : 'NOF',
                    defect: i === 0 ? 'DT14-03' : '', cause: i === 0 ? 'Gear wear' : '',
                    action: i === 0 ? 'MON' : '', detect: 'VI',
                    comment: i === 0 ? 'fine swarf, ~2 mm chips' : '',
                    photos: i === 0 ? [await shot('A'), await shot('B')] : [], video: null };
    await dbPut({ id: 'chain1', type: 'MP', equip: 'TK149', date: '2026-08-24', by: 'S. Volkov',
      sup: 'A. Sokolov', smu: '19004', cls: 'HT', gps: null, dev: 'PH-07', sign: null,
      positions: pos, created: '2026-08-24T06:00:00.000Z', up: 0, upTo: {}, rev: 1 });
    retryAt = RETRY_MIN;
    return syncThenArm(true);
  });
  await ph.waitForFunction(() => dbAll().then(a => a.length && a.every(r => r.up)),
                           null, { timeout: 90000 }).catch(() => {});
  const away = await ph.evaluate(() => dbAll().then(a => a.map(r => r.up)));
  ok('the round is marked away', away.length === 1 && away[0] === 1, JSON.stringify(away));

  const keys = await fetch(B + '/__keys').then(r => r.json()).then(j => j.keys.filter(k => /TK149/.test(k)));
  ok('  and the sidecar and BOTH photographs are in the bucket',
     keys.filter(k => /\.json$/.test(k)).length === 1 && keys.filter(k => /\.jpg$/.test(k)).length === 2,
     keys.join(' '));
  await pctx.close();

  /* ---- 2. the office opens the dashboard ------------------------------- */
  console.log('\nthe office: the same round, from the same endpoint');
  const dctx = await b.newContext({ viewport: { width: 1400, height: 950 } });
  await dctx.addInitScript(u => {
    localStorage.setItem('cm_swap_off', '1');
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
  }, EXEC);
  const dp = await dctx.newPage();
  const derr = [];
  dp.on('pageerror', e => derr.push(e.message));
  await dp.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await dp.waitForTimeout(1200);
  ok('the dashboard is pointed at it', (await dp.evaluate(() => CMDrive.url)) === EXEC);

  /* A full read, not an incremental one. The dashboard already pulled on page
     open and committed its cursor, so a second plain load() correctly returns
     "0 new" — which read as an empty dashboard and was a test measuring the
     wrong thing. `full` is what a person pressing Reload all gets. */
  const loaded = await dp.evaluate(async () => {
    try { const r = await CMDrive.load(null, { full: true });
          return { said: r.records, held: r.held, files: r.files, photos: r.photos }; }
    catch (e) { return { err: String(e.message || e) }; }
  });
  ok('  and reads the rounds back', (loaded.held || 0) > 0,
     loaded.err ? 'error: ' + loaded.err
                : 'read ' + loaded.said + ', holding ' + loaded.held + ', ' + loaded.photos + ' photo(s) indexed');

  /* On screen, not merely in memory. RECS is a module-scope variable and not
     reachable from a test — which is the right way round: what matters is that
     the office can SEE the round, and a row rendered is the only proof of that.
     Reading an internal array would have passed on a dashboard that held the
     record and drew nothing. */
  await dp.waitForTimeout(600);
  const onScreen = await dp.evaluate(() =>
    [...document.querySelectorAll('tr[data-u]')].map(tr => tr.getAttribute('data-u')));
  ok('  and the unit appears on the sheet the office looks at',
     onScreen.includes('TK149'), onScreen.slice(0, 8).join(' ') || '(no rows)');

  const found = await dp.evaluate(() => {
    const rows = [...document.querySelectorAll('tr[data-u]')].filter(tr => tr.getAttribute('data-u') === 'TK149');
    if (!rows.length) return null;
    const txt = rows.map(tr => tr.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    return { txt: txt.slice(0, 200), n: rows.length };
  });
  ok('  showing the date and the inspector, not a blank row',
     !!found && /2026-08-24/.test(found.txt) && /Volkov/.test(found.txt),
     found ? found.txt.slice(0, 110) : '(no row)');

  /* The arrow this project keeps getting wrong. Both photographs, fetched from
     the endpoint — not one, and not a placeholder standing in for two. */
  const pics = await dp.evaluate(async () => {
    const idx = await fetch(CMDrive.url + '?action=records&after=0&index=1').then(r => r.json());
    const mine = (idx.index || []).filter(f => /TK149_4C_24\.08\.2026_MP/.test(f.name));
    if (!mine.length) return { n: 0, why: 'not in the media index' };
    const got = await fetch(CMDrive.url + '?action=files&ids=' +
      mine.map(f => encodeURIComponent(f.id)).join(',')).then(r => r.json());
    const ok2 = (got.files || []).filter(f => f.ok && (f.data || '').length > 100);
    return { n: ok2.length, bytes: ok2.map(f => Math.round((f.data || '').length * 0.75)) };
  });
  ok('  and BOTH photographs come back with it', pics.n === 2,
     pics.why || (pics.n + ' file(s), ' + JSON.stringify(pics.bytes) + ' bytes'));
  ok('the dashboard raised nothing along the way', !derr.length, derr.slice(0, 2).join(' | ') || 'clean');

  await b.close(); bye();
  console.log(fail ? `\n${fail} FAILED` : '\npit to office, findings and photographs');
  process.exit(fail ? 1 : 0);
})();
