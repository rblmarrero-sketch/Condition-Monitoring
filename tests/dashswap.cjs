/* The dashboard moves with the fleet.

   The phones act on the changeover themselves. The dashboard reads its source
   from its own browser storage, falling back to the built-in list — so without
   this it is the last thing in the system still pointed at the retired
   backend. On the measurements that prompted the move that is a 72-second read
   against 315 ms, and nobody calls that a misconfiguration. They call the
   dashboard slow, and then they stop opening it.

   Four browsers, because the interesting ones are not the fresh install:

     never configured   → takes the new endpoint
     on the old one     → moves, once, and forgets the old folder's cursor
     cleared on purpose → stays offline; that is a deliberate answer
     somewhere else     → left alone, and not marked done

   Run: node tests/dashswap.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn, execSync } = require('child_process');
const path = require('path');

const PORT = 8114, B = `http://127.0.0.1:${PORT}`;
let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

/* The config as it actually ships — the only version worth asserting about. */
const SW = JSON.parse(execSync(process.execPath + ' -e ' + JSON.stringify(
  'global.window={};require(' + JSON.stringify(path.join(__dirname, '../mobile/upload-defaults.js')) +
  ');process.stdout.write(JSON.stringify(window.UPLOAD_DEFAULTS.swap||{}))'), { encoding: 'utf8' }));

/* NEVER, meaning "this browser has no setting at all" — which is a different
   state from an empty string and the whole point of one of the cases below.
   Passing `undefined` through addInitScript does not survive: Playwright
   serialises it as null, setItem stores the string "null", and the browser then
   looks configured with a URL of "null". It read as a failure of the dashboard
   rather than of the fixture. */
const NEVER = '\u0000never';
async function browser(b, saved, cursor) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([s, c, never]) => {
    if (s !== never) localStorage.setItem('cm_drive_url', s);
    if (c) localStorage.setItem('cm_drive_cursor', String(c));
  }, [saved, cursor, NEVER]);
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  return { ctx, p };
}
const src = p => p.evaluate(() => ({
  url: localStorage.getItem('cm_drive_url'),
  cur: localStorage.getItem('cm_drive_cursor'),
  live: (window.CMDrive && CMDrive.url) || null }));

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!SW.to) { console.log('\n  ....  no changeover armed — nothing to verify'); bye(); return; }
  const b = await chromium.launch();
  let r, ctx, p;

  console.log('\na dashboard nobody has configured');
  ({ ctx, p } = await browser(b, NEVER));
  r = await src(p);
  ok('takes the new endpoint, not the old built-in', r.live === SW.to, r.live);
  await ctx.close();

  console.log('\na dashboard already pointed at the old one');
  ({ ctx, p } = await browser(b, SW.from, 1750000000000));
  r = await src(p);
  ok('moves across', r.url === SW.to, r.url);
  /* The cursor counts from the old folder's clock. Carried across, the first
     read asks for everything since a moment that never happened here and comes
     back empty — an empty dashboard in front of a backend holding every round,
     with nothing on screen to say why. */
  ok('  and forgets the old folder\'s cursor', !r.cur, r.cur || '(cleared)');
  /* Once means once. The init script re-seeds the OLD url on every navigation,
     so if the changeover ran again the reload would move it again — and an
     instruction that fires on every open is one that overrules an inspector who
     has deliberately set something else. Seeing the old url survive a reload is
     the proof that it did not. */
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(700);
  const after = await src(p);
  ok('  and does not do it again on the next open', after.url === SW.from,
     after.url === SW.to ? 'moved a second time' : 'left as re-seeded');
  await ctx.close();

  console.log('\na dashboard somebody deliberately took offline');
  ({ ctx, p } = await browser(b, ''));
  r = await src(p);
  ok('stays offline — an empty setting is an answer, not a gap', r.url === '' && !r.live,
     JSON.stringify(r.url) + ' · live ' + JSON.stringify(r.live));
  await ctx.close();

  console.log('\na dashboard pointed somewhere the changeover does not name');
  ({ ctx, p } = await browser(b, B + '/exec'));
  r = await src(p);
  ok('is left exactly where it is', r.url === B + '/exec', r.url);
  ok('  and is not recorded as having moved',
     !(await p.evaluate(i => localStorage.getItem('cm_swap_' + i), SW.id)));
  await ctx.close();

  await b.close(); bye();
  console.log(fail ? `\n${fail} FAILED` : '\nthe dashboard moves with the fleet');
  process.exit(fail ? 1 : 0);
})();
