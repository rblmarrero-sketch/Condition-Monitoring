/* The comparison page, driven against BOTH real backends at once.

   A tool for measuring two endpoints is worth nothing if it quietly measures
   one of them wrong — a column of "failed" against a backend that works, or
   worse, plausible numbers for a request that never went. So this points it at
   the Apps Script double on one side and the real Yandex function on the other,
   and checks that both columns fill in, that the write actually lands in the
   bucket, and that a broken endpoint is reported as broken rather than as slow.

   Run: node tests/compare.cjs        (starts both servers itself)
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const GAS = 8106, YA = 8107;
const G = `http://127.0.0.1:${GAS}`, Y = `http://127.0.0.1:${YA}`;

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = [
  spawn(process.execPath, [path.join(__dirname, 'ed-srv.cjs'), String(GAS)], { stdio: 'ignore' }),
  spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(YA)], { stdio: 'ignore' }),
];
const bye = () => srv.forEach(s => { try { s.kill(); } catch (e) {} });
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

const rows = p => p.$$eval('#tbl tbody tr', tr => tr.map(r =>
  [...r.children].map(c => c.textContent.trim())));

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(G + '/exec'); await fetch(Y + '/exec'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(Y + '/mobile/compare.html', { waitUntil: 'load' });

  console.log('\ntwo backends, measured side by side');
  await p.fill('#a', G + '/exec');
  await p.fill('#b', Y + '/exec');
  await p.fill('#n', '2');
  await p.click('#go');
  await p.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 120000 });

  const r = await rows(p);
  ok('every probe reported a result for both', r.length === 5, r.length + ' rows');

  /* The failure this exists to catch: a column of dashes or "failed" against an
     endpoint that is working perfectly well, which would send somebody to
     rebuild a backend that was fine. */
  const dead = r.filter(x => /failed|—/.test(x[1]) || /failed|—/.test(x[2]));
  ok('  and neither working backend is reported as broken', !dead.length,
     dead.length ? dead.map(x => x[0] + ': A=' + x[1] + ' B=' + x[2]).join(' | ') : 'all five measured');

  const cors = r.find(x => /Readable/.test(x[0]));
  ok('  both are reported readable by the page', cors && cors[1] === 'yes' && cors[2] === 'yes',
     cors ? 'A=' + cors[1] + ' B=' + cors[2] : '(row missing)');

  const photo = r.find(x => /photograph/.test(x[0]));
  ok('  and the photograph upload is timed on both', photo && /\d/.test(photo[1]) && /\d/.test(photo[2]),
     photo ? 'A=' + photo[1] + ' B=' + photo[2] : '(row missing)');

  /* Timed is not the same as sent. A page that reports a number for a request
     that never reached the bucket is worse than one that reports nothing. */
  const keys = await fetch(Y + '/__keys').then(r => r.json()).then(j => j.keys);
  ok('  and the file it timed actually reached the bucket',
     keys.some(k => /ZZTEST/.test(k)), keys.filter(k => /ZZTEST/.test(k)).join(' ') || '(nothing under ZZTEST)');

  /* And the thing being timed is the size of the thing it stands for. A
     synthetic image that compresses to a few KB measures request overhead, not
     a photograph crossing a satellite link. */
  const kb = Number((await p.textContent('#verdict')).match(/(\d+) KB/)?.[1] || 0);
  ok('  and the test photograph is the size of a real one', kb >= 150, kb + ' KB');

  const verdict = await p.textContent('#verdict');
  ok('  and it says which one won, in words', /faster|Too close/.test(verdict),
     (verdict || '').replace(/\s+/g, ' ').slice(0, 110));

  /* ---- a dead endpoint must read as dead ------------------------------- */
  console.log('\nand an endpoint that is not there');
  await p.fill('#a', 'http://127.0.0.1:9/dead');
  await p.fill('#b', Y + '/exec');
  await p.fill('#n', '1');
  await p.click('#go');
  await p.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 120000 });
  const r2 = await rows(p);
  const aDead = r2.every(x => /failed|NO|—/.test(x[1]));
  ok('the dead side is reported failed on every probe, not slow', aDead,
     r2.map(x => x[1]).join(' | '));
  ok('  while the live one still reports numbers', r2.some(x => /\d\s*(ms|s)/.test(x[2])),
     r2.map(x => x[2]).join(' | '));
  const v2 = await p.textContent('#verdict');
  /* Names the DEAD side, not just any side. Grepping for "accepted the
     photograph" passed a verdict that read "A accepted the photograph" while A
     was the one refusing every request — a check that cannot tell the two apart
     is worse than none, because it certifies the wrong answer. */
  ok('  and the verdict names the dead endpoint as the dead one',
     /A did not accept the photograph/.test(v2),
     (v2 || '').replace(/\s+/g, ' ').slice(0, 90));

  await b.close();
  bye();
  console.log(fail ? `\n${fail} FAILED` : '\nboth measured, and a dead one reads as dead');
  process.exit(fail ? 1 : 0);
})();
