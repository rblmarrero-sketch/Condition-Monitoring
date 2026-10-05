/* A ROUND PUT BACK AFTER IT WAS DELETED IS SHOWN AGAIN — AND ONLY THEN.

   Both office pages remember a deletion for good (cm_dash_deleted), on
   purpose: a phone that missed the marker and re-sends its old copy must not
   bring a deleted round back. EX003's real General Inspection of 30 Sep was
   deleted by mistake on 4 Oct and restored from a saved copy on 5 Oct; the
   restored record carries `restoredAt`, and isDeleted() lets a record through
   only when that stamp is later than the deletion.

   Each page first LEARNS the deletion (marker on the server, no sidecar), then
   the restored sidecar arrives, and the page reloads with the tombstone still
   in its own storage — the state every live desk is in.

   Run: node tests/restorewins.cjs   (starts its own ya-srv) */
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const PORT = 8187, B = 'http://127.0.0.1:' + PORT;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const put = (key, obj) => fetch(B + '/__put?key=' + encodeURIComponent(key) + '&type=application%2Fjson', { method: 'POST', body: JSON.stringify(obj) });
const side = (u, d, ty, extra) => ({ type: 'cm-inspection-entries', version: 2, records: [Object.assign({ equip: u, date: d, type: ty, by: 'Rayanov/Taganov', cls: 'EXC', dev: 'DRLDEJ',
  items: [{ key: 'CH.BUC', label: 'Bucket', grade: 4, defect: 'Crack' }] }, extra || {})] });
const dmy = d => d.split('-').reverse().join('.');
const marker = (u, d, ty, at) => put(`_meta/${u}_${dmy(d)}_${ty}.deleted.json`, { type: 'cm-record-deleted', key: `${u}|${d}|${ty}`, by: 'R. Marrero', at });
const sidecarKey = (u, d, ty) => `${ty}/${u}/${d}/${u}_${dmy(d)}_${ty}.json`;
const DEL_AT = '2026-10-04T10:37:17.734Z';
const CASES = [
  ['EX003', '2026-09-30', 'INSP', { restoredAt: '2026-10-05T09:43:54.000Z', restoredBy: 'R. Marrero (office)' }, true,  'restored after the deletion'],
  ['EX004', '2026-09-30', 'INSP', {},                                                                          false, 'a re-sent copy with no restore stamp'],
  ['EX005', '2026-09-30', 'INSP', { restoredAt: '2026-10-01T00:00:00.000Z' },                                  false, 'a restore stamp OLDER than the deletion'],
];

(async () => {
  const srv = spawn(process.execPath, [__dirname + '/ya-srv.cjs', String(PORT), 'NONE'], { stdio: 'ignore' });
  await wait(1500);
  const b = await chromium.launch();
  for (const page of ['dashboard', 'dashboard-next']) {
    console.log('\n── ' + page);
    await fetch(B + '/__seed');
    for (const [u, d, ty] of CASES) await marker(u, d, ty, DEL_AT);
    const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript(p => { localStorage.setItem('cm_drive_url', p + '/exec'); localStorage.setItem('cm_dash_lang', 'en'); }, B);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(B + '/' + page + '/index.html', { waitUntil: 'load' }); await p.waitForTimeout(4500);
    const learnt = await p.evaluate(() => CMDash.deletedCount());
    ok('the page learns all three deletions first (as every live desk already has)', learnt >= 3, String(learnt));
    for (const [u, d, ty, extra] of CASES) await put(sidecarKey(u, d, ty), side(u, d, ty, extra));
    /* The tombstones stay in the page's own storage across the reload. */
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(5000);
    const still = await p.evaluate(() => CMDash.deletedCount());
    ok('the tombstones are still remembered after the reload', still >= 3, String(still));
    const shown = await p.evaluate(() => CMDash.allRecs().map(r => r.equip + '|' + r.date + '|' + r.type));
    for (const [u, d, ty, , want, why] of CASES)
      ok(`${u}: ${why} is ${want ? 'SHOWN' : 'still hidden'}`, shown.includes(`${u}|${d}|${ty}`) === want, shown.filter(k => k.startsWith('EX00')).join(','));
    ok('no page errors', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  await b.close(); srv.kill();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall pass');
  process.exit(fails.length ? 1 : 0);
})();
