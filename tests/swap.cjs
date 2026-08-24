/* Moving a fleet that is already in the field.

   Updating the build ships code and nothing else: a destination that already
   has a URL is left alone, which is right — and is why a fleet on Google stays
   on Google through any number of updates. Editing upload-defaults.js reaches
   nobody for the same reason.

   `swap` is the instruction that does move them. This proves the four things
   that decide whether it can be trusted on 1,128 phones:

     1. the URL in use slides into the second copy, the new one takes the main
        slot, and BOTH end up ticked — nothing stranded on either side
     2. it happens ONCE, so an inspector who changes it back keeps their choice
     3. a second copy somebody set up by hand is never overwritten
     4. a phone with nothing configured just takes the new endpoint

   Run: node tests/swap.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn, execSync } = require('child_process');
const path = require('path');

const PORT = 8110, B = `http://127.0.0.1:${PORT}`;
const OLD = 'https://script.google.com/macros/s/OLDONE/exec';
const NEW = 'https://baimskaya-cm.example.org';

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

/* The swap lives in upload-defaults.js, which ships empty. Rather than edit a
   file the repo serves, hand the page its own defaults before it boots — the
   same object, from the same global, which is all loadDests() ever reads. */
async function phone(b, { dests, swap, flags }) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([d, sw, fl]) => {
    if (d) localStorage.setItem('up_dests', JSON.stringify(d));
    (fl || []).forEach(k => localStorage.setItem(k, '1'));
    const wait = () => {
      if (window.UPLOAD_DEFAULTS) { window.UPLOAD_DEFAULTS.swap = sw; return; }
      /* upload-defaults.js has not run yet at init-script time, so catch the
         assignment rather than racing it. */
      let v;
      Object.defineProperty(window, 'UPLOAD_DEFAULTS', {
        configurable: true,
        get: () => v,
        set: n => { v = n; if (n) n.swap = sw; },
      });
    };
    wait();
  }, [dests, swap, flags || []]);
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(300);
  return { ctx, p };
}
const read = p => p.evaluate(() => loadDests().map(d => ({ id: d.id, on: !!d.on, url: d.url })));
const one = (d, id) => d.find(x => x.id === id) || {};

const SW = { id: 'yandex-test', from: OLD, to: NEW, sec: '' };
const GAS_ONLY = ['up_gas_only_v1'];

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(B + '/exec'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();

  console.log('\na phone in the field, on the old backend');
  let { ctx, p } = await phone(b, { flags: GAS_ONLY, swap: SW,
    dests: [{ id: 'gas', on: true, url: OLD, sec: 's3cret', folder: '{TYPE}/{UNIT}' },
            { id: 'pa', on: false, url: '', sec: '', folder: '' },
            { id: 'post', on: false, url: '', sec: '', folder: '' }] });
  let d = await read(p);
  ok('the new endpoint takes the main slot', one(d, 'gas').url === NEW, one(d, 'gas').url);
  ok('  and the old one slides into the second copy', one(d, 'mirror').url === OLD, one(d, 'mirror').url);
  ok('  with both ticked, so neither side misses a round',
     one(d, 'gas').on && one(d, 'mirror').on,
     'main ' + one(d, 'gas').on + ' / copy ' + one(d, 'mirror').on);
  ok('  and the old secret travels with the old URL',
     (await p.evaluate(() => (loadDests().find(x => x.id === 'mirror') || {}).sec)) === 's3cret');

  /* ---- once, and only once ---------------------------------------------
     An inspector who puts it back must keep their choice, or the app argues
     with them on every open — and an app that overrules a deliberate setting
     is one nobody trusts with the next one. */
  console.log('\nand an inspector who changes it back');
  await p.evaluate(o => { const d = loadDests().map(x => x.id === 'gas' ? Object.assign({}, x, { url: o }) : x);
    saveDests(d); }, OLD);
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(500);
  d = await read(p);
  ok('keeps what they chose', one(d, 'gas').url === OLD, one(d, 'gas').url);
  await ctx.close();

  /* ---- a second copy somebody already set up ---------------------------- */
  console.log('\na phone whose second copy is already in use');
  ({ ctx, p } = await phone(b, { flags: GAS_ONLY, swap: SW,
    dests: [{ id: 'gas', on: true, url: OLD, sec: '', folder: '' },
            { id: 'mirror', on: true, url: 'https://mine.example/keepme', sec: 'k', folder: '' }] }));
  d = await read(p);
  ok('the main slot still moves', one(d, 'gas').url === NEW, one(d, 'gas').url);
  ok('  but their own second copy is left exactly as it was',
     one(d, 'mirror').url === 'https://mine.example/keepme', one(d, 'mirror').url);
  await ctx.close();

  /* ---- a phone out of the box ------------------------------------------- */
  /* Its main URL comes from upload-defaults.js, so the instruction has to name
     THAT one to reach it — which is what the shipped config does. Using the
     fake `from` here would prove only that a mismatch is ignored, which the
     case below already covers. */
  console.log('\na phone that was never set up');
  const builtIn = execSync(process.execPath + ' -e ' + JSON.stringify(
    'global.window={};require(' + JSON.stringify(path.join(__dirname, '../mobile/upload-defaults.js')) +
    ');const d=(window.UPLOAD_DEFAULTS.dests||[]).find(x=>x.id==="gas")||{};process.stdout.write(d.url||"")'),
    { encoding: 'utf8' });
  ({ ctx, p } = await phone(b, { flags: GAS_ONLY, swap: Object.assign({}, SW, { from: builtIn }), dests: [] }));
  d = await read(p);
  ok('takes the new endpoint', one(d, 'gas').url === NEW, one(d, 'gas').url);
  /* And ends up in the same state as the rest of the fleet, not a special one.
     A phone out of the box picks up the built-in URL from upload-defaults.js
     and the swap moves it to the second copy, exactly as on a phone that has
     been in the field a year. That is what is wanted: during a changeover every
     phone writes to both, and one writing only to the new side would leave its
     rounds missing from the old one — a gap found later, when the whole point
     of running both was to have no gaps. */
  ok('  and joins the fleet in the same state: writing to both',
     !!one(d, 'mirror').url && one(d, 'mirror').on && one(d, 'gas').on,
     'copy ' + (one(d, 'mirror').url || '(empty)'));
  await ctx.close();

  /* ---- and no swap configured at all ------------------------------------ */
  /* ---- a phone on some other endpoint entirely -------------------------- */
  console.log('\na phone pointed somewhere the changeover does not name');
  ({ ctx, p } = await phone(b, { flags: GAS_ONLY, swap: SW,
    dests: [{ id: 'gas', on: true, url: 'http://127.0.0.1:8110/exec', sec: '', folder: '' }] }));
  d = await read(p);
  /* The instruction retires ONE endpoint. A phone somebody deliberately pointed
     elsewhere — another site's deployment, a spare, a test harness on
     localhost — is not part of that and must be left exactly where it is.
     Without this the arming of a changeover quietly moves every phone it
     reaches, and the only symptom is uploads arriving somewhere nobody chose. */
  ok('is left exactly where it is', one(d, 'gas').url === 'http://127.0.0.1:8110/exec',
     one(d, 'gas').url);
  ok('  and nothing is put in its second copy', !one(d, 'mirror').url,
     one(d, 'mirror').url || '(empty)');
  /* And it is not marked done, so it still moves if it is ever put on the
     endpoint being retired. */
  ok('  and it is not recorded as having moved',
     !(await p.evaluate(() => localStorage.getItem('up_swap_yandex-test'))));
  await ctx.close();

  console.log('\nand a fleet nobody is moving');
  ({ ctx, p } = await phone(b, { flags: GAS_ONLY, swap: { id: '', to: '' },
    dests: [{ id: 'gas', on: true, url: OLD, sec: '', folder: '' }] }));
  d = await read(p);
  ok('is not touched', one(d, 'gas').url === OLD && !one(d, 'mirror').url,
     one(d, 'gas').url + ' / copy ' + (one(d, 'mirror').url || '(empty)'));
  await ctx.close();

  /* ---- and finally, the config that actually ships -----------------------
     Everything above injects a swap. This one takes upload-defaults.js exactly
     as served, so it answers the only question that matters on 1,128 phones:
     does the file in the repository, right now, move a phone that is on the old
     backend? An armed swap that is wrong is wrong everywhere at once, and an
     unarmed one that was meant to be armed is a rollout that silently does
     nothing while everyone waits for it. */
  console.log('\nthe configuration as it actually ships');
  const shipped = JSON.parse(execSync(process.execPath + ' -e ' + JSON.stringify(
    'global.window={};require(' + JSON.stringify(path.join(__dirname, '../mobile/upload-defaults.js')) +
    ');process.stdout.write(JSON.stringify(window.UPLOAD_DEFAULTS.swap||{}))'), { encoding: 'utf8' }));

  if (!shipped.to) {
    console.log('  ....  no swap is armed — nothing to verify');
  } else {
    ok('an armed swap has an id, or it does nothing at all and says nothing',
       !!shipped.id, shipped.id || '(EMPTY — this swap would never run)');
    /* Starting from the endpoint the shipped config actually names, because
       that is the phone this is for. Starting anywhere else would now
       correctly do nothing, and prove nothing. */
    const start = shipped.from || OLD;
    ({ ctx, p } = await phone(b, { flags: GAS_ONLY, swap: shipped,
      dests: [{ id: 'gas', on: true, url: start, sec: '', folder: '{TYPE}/{UNIT}/{YYYY-MM-DD}' }] }));
    d = await read(p);
    ok('  a phone on the old backend moves to the shipped endpoint',
       one(d, 'gas').url === shipped.to, one(d, 'gas').url);
    ok('  and keeps the old one as its second copy, ticked',
       one(d, 'mirror').url === start && one(d, 'mirror').on,
       (one(d, 'mirror').url || '(empty)') + ' · ticked ' + one(d, 'mirror').on);
    ok('  and the folder pattern survives the move',
       (await p.evaluate(() => (loadDests().find(x => x.id === 'gas') || {}).folder)) === '{TYPE}/{UNIT}/{YYYY-MM-DD}');
    await ctx.close();
  }

  await b.close(); bye();
  console.log(fail ? `\n${fail} FAILED` : '\nthe fleet moves once, and keeps what it is told');
  process.exit(fail ? 1 : 0);
})();
