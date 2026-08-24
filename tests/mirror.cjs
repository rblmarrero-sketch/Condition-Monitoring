/* Two backends receiving every round, one of them read from.

   Yandex took the `gas` slot, which left Google nowhere to go: the other two
   slots speak different protocols — pa sends application/json and so triggers a
   CORS preflight an Apps Script cannot answer, post sends multipart. So "we can
   switch back by changing a URL" was only true until the old destination
   stopped receiving rounds.

   `mirror` is a second slot on the SAME protocol, write-only. This proves the
   three things that make it worth having:

     1. every file reaches BOTH destinations
     2. a round is not marked away until both have it
     3. nothing is ever READ from the mirror — including when it is the only
        one with an answer, which is the case that would hide the mistake

   Run: node tests/mirror.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const MAIN = 8108, MIR = 8109;
const M = `http://127.0.0.1:${MAIN}`, R = `http://127.0.0.1:${MIR}`;

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = [
  spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(MAIN)], { stdio: 'ignore' }),
  spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(MIR)], { stdio: 'ignore' }),
];
const bye = () => srv.forEach(s => { try { s.kill(); } catch (e) {} });
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });
const keys = base => fetch(base + '/__keys').then(r => r.json()).then(j => j.keys);

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(M + '/exec'); await fetch(R + '/exec'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([m, r]) => {
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas',    on: true,  url: m, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
      { id: 'mirror', on: true,  url: r, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' },
      { id: 'pa',     on: false, url: '', sec: '', folder: '' },
      { id: 'post',   on: false, url: '', sec: '', folder: '' }]));
    /* This phone's inspector turned the mirror on deliberately, and the two
       one-time corrections in upload-defaults.js must not move it underneath
       them: gas-only would untick it, and an armed `retire` — which is what
       ends a changeover — would switch off the very destination this suite
       exists to watch. Held explicitly, which is what up_swap_off is for. */
    localStorage.setItem('up_gas_only_v1', '1');
    localStorage.setItem('up_swap_off', '1');
  }, [M + '/exec', R + '/exec']);
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(M + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  console.log('\none round, two destinations');
  await p.evaluate(async () => {
    const shot = async () => { const c = document.createElement('canvas');
      c.width = 400; c.height = 300; c.getContext('2d').fillRect(0, 0, 400, 300);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)); };
    const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change'));
    selectEquip('TK149');
    await new Promise(r => setTimeout(r, 400));
    const pos = {};
    for (const [i, it] of items().entries())
      pos[it.k] = { grade: i === 0 ? 'C' : 'A', sev: i === 0 ? 'DEG' : 'NOF',
                    defect: i === 0 ? 'DT14-03' : '', detect: 'VI',
                    photos: i === 0 ? [await shot(), await shot()] : [], video: null };
    await dbPut({ id: 'mir1', type: 'MP', equip: 'TK149', date: '2026-08-24', by: 'S. Volkov',
      sup: '', smu: '19004', cls: 'HT', gps: null, dev: 'PH-07', sign: null,
      positions: pos, created: '2026-08-24T06:00:00.000Z', up: 0, upTo: {}, rev: 1 });
    retryAt = RETRY_MIN;
    return syncThenArm(true);
  });
  await p.waitForFunction(() => dbAll().then(a => a.length && a.every(r => r.up)),
                          null, { timeout: 90000 }).catch(() => {});

  const km = (await keys(M)).filter(k => k.indexOf('TK149') >= 0);
  const kr = (await keys(R)).filter(k => k.indexOf('TK149') >= 0);
  ok('the main destination has the whole round', km.length === 3, km.length + ' files');
  ok('  and the mirror has exactly the same files', kr.length === 3 && km.every(k => kr.includes(k)),
     kr.length + ' files' + (kr.length ? '' : ' — nothing mirrored'));

  const st = await p.evaluate(() => dbAll().then(a => a.map(r => ({ up: r.up, to: Object.keys(r.upTo || {}).sort() }))));
  ok('  and the round counts as away only once both have it',
     st[0] && st[0].up === 1 && st[0].to.join(',') === 'gas,mirror', JSON.stringify(st));

  /* ---- the failure that would hide -------------------------------------
     A mirror that is silently read from looks perfect while both agree. Give
     the mirror a record the main destination has never heard of: if any read
     path touches it, that unit appears on the phone. */
  console.log('\nand nothing is ever read from the mirror');
  await fetch(R + '/exec', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ op: 'batch', folder: 'MP/ZZONLY/2026-08-01', secret: '', dev: 'X',
      files: [{ name: 'ZZONLY_01.08.2026_MP.json', contentType: 'application/json',
        file: Buffer.from(JSON.stringify({ type: 'cm-inspection-entries', version: 2, records: [
          { equip: 'ZZONLY', date: '2026-08-01', type: 'MP', by: 'nobody', cls: 'HT', dev: 'X', items: [] }] })).toString('base64') }] }) });
  const onMirror = (await keys(R)).some(k => k.indexOf('ZZONLY') >= 0);
  ok('the mirror really does hold a record the main one does not', onMirror);

  const seen = await p.evaluate(async () => {
    await teamPull(true, true).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    return Object.keys(histAll()).join(' ');
  });
  ok('  and the phone never sees it', seen.indexOf('ZZONLY') < 0, seen || '(nothing)');

  const mainKnows = await fetch(M + '/exec?action=records').then(r => r.json())
    .then(j => (j.records || []).some(r => r.equip === 'ZZONLY'));
  ok('  because the read went to the main destination, which does not have it', !mainKnows);

  await b.close();
  bye();
  console.log(fail ? `\n${fail} FAILED` : '\nboth written, one read');
  process.exit(fail ? 1 : 0);
})();
