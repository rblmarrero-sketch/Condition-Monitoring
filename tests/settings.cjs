/* The Settings sheet opens, and every destination row is really there.

   Build 137 shipped with Settings dead. DEST_META gained no row for the new
   destination, six call sites read DEST_META[id].label with no fallback, and
   the first one reached threw "Cannot read properties of undefined" — so the
   sheet never opened at all. Every other suite passed: they set destinations
   through localStorage and never press the button an inspector presses.

   A screen nobody opens in a test is a screen that goes out broken. This opens
   it, on every destination the app knows about, and checks the page raised
   nothing while doing it.

   Run: node tests/settings.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8113, B = `http://127.0.0.1:${PORT}`;
let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  /* Every slot filled, so every row in every per-destination table is reached.
     An empty destination is the case that would have kept the broken lookup
     hidden. */
  await ctx.addInitScript(u => {
    localStorage.setItem('up_swap_off', '1');
    localStorage.setItem('up_gas_only_v1', '1');
    localStorage.setItem('up_dests', JSON.stringify([
      { id: 'gas',    on: true,  url: u + '/exec', sec: '', folder: '{TYPE}/{UNIT}' },
      { id: 'mirror', on: true,  url: u + '/exec', sec: '', folder: '{TYPE}/{UNIT}' },
      { id: 'pa',     on: true,  url: 'https://off.invalid/pa',   sec: 'x-api-key: k', folder: '{TYPE}' },
      { id: 'post',   on: true,  url: 'https://off.invalid/post', sec: '', folder: '{TYPE}' }]));
  }, B);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  ok('the app loads without raising anything', !errs.length, errs.join(' | ') || 'clean');

  console.log('\nthe button an inspector actually presses');
  errs.length = 0;
  await p.click('#setBtn');
  await p.waitForTimeout(500);
  ok('Settings opens', !(await p.evaluate(() => document.getElementById('setOv').classList.contains('hidden'))));
  ok('  without raising anything', !errs.length, errs.join(' | ') || 'clean');

  /* The line that broke: it names every destination in use, through the table
     that had no row for the new one. */
  const diag = await p.textContent('#setDiag');
  ok('  and it says which build and which destinations are in use',
     /build v\d+/.test(diag) && /in use:/.test(diag), (diag || '').slice(0, 120));
  ok('  naming all four, none of them as a bare id',
     !/in use:.*\b(gas|mirror|pa|post)\b/.test(diag), (diag.split('in use:')[1] || '').trim());

  console.log('\nand every destination has its own row, filled in');
  for (const id of ['gas', 'mirror', 'pa', 'post']) {
    const row = await p.evaluate(i => {
      const on = document.getElementById(i + 'On'), url = document.getElementById(i + 'Url');
      const sec = document.getElementById(i + 'Sec') || document.getElementById(i + 'Hdr');
      const fol = document.getElementById(i + 'Folder');
      if (!on || !url || !sec || !fol) return { missing: [['On', on], ['Url', url], ['Sec/Hdr', sec], ['Folder', fol]]
        .filter(x => !x[1]).map(x => i + x[0]).join(' ') };
      return { ticked: on.checked, url: url.value, sec: sec.value, folder: fol.value,
               vis: on.getClientRects().length > 0 };
    }, id);
    ok('  ' + id, !row.missing && row.ticked && !!row.url && !!row.folder && row.vis,
       row.missing ? 'missing field(s): ' + row.missing
                   : (row.url.slice(0, 34) + ' · ' + row.folder + (row.sec ? ' · secret set' : '')));
  }

  /* Round-trips through the form. A field written to the wrong element saves
     the wrong thing, and the sheet would look right while doing it. */
  console.log('\nand what the form saves is what it read');
  await p.click('#setSave').catch(() => {});
  await p.waitForTimeout(400);
  const back = await p.evaluate(() => loadDests().map(d => d.id + ':' + (d.url ? '1' : '0') + (d.on ? 'T' : 'f')).join(' '));
  ok('all four survive a save', back === 'gas:1T mirror:1T pa:1T post:1T', back);
  ok('  and the secret stayed with the destination that owns it',
     (await p.evaluate(() => (loadDests().find(d => d.id === 'pa') || {}).sec)) === 'x-api-key: k');

  await b.close(); bye();
  console.log(fail ? `\n${fail} FAILED` : '\nSettings opens, and every destination is on it');
  process.exit(fail ? 1 : 0);
})();
