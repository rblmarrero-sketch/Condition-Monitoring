/* One destination decides, and it is the one everything reads from.

   A round counted as safely away only once EVERY ticked destination had taken
   every one of its files, and phones here shipped with two ticked. Only the
   first is ever read back — the dashboard, the team list and the photographs
   on a colleague's report all come from Drive — so the second was a write-only
   mirror that could hold every round on every phone for ever.

   The correction has to reach phones that ALREADY carry it, which is the whole
   difficulty: emptying the URL in upload-defaults.js reaches nobody, because a
   destination with a URL counts as configured and configured destinations are
   deliberately left alone, tick included.

   Run: node tests/gasonly.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };

const boot = async (b, seed) => {
  const ctx = await b.newContext({ viewport:{ width:412, height:915 }, isMobile:true, hasTouch:true });
  await ctx.addInitScript(s => { if (s) for (const k of Object.keys(s)) localStorage.setItem(k, s[k]); }, seed);
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil:'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout:20000 });
  await p.waitForTimeout(400);
  return { ctx, p };
};
const ticked = p => p.evaluate(() => loadDests().filter(d => d.on && d.url).map(d => d.id));

(async () => {
  const b = await chromium.launch();

  /* ---- a phone that already had both, the way they all do ---------------- */
  console.log('\na phone already carrying SharePoint');
  const had = await boot(b, { up_dests: JSON.stringify([
    { id:'gas', on:true, url:B + '/exec', sec:'', folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}' },
    { id:'pa',  on:true, url:'https://flow.invalid/x', sec:'', folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}' }]) });
  const after = await ticked(had.p);
  ok('only Google is left ticked', JSON.stringify(after) === '["gas"]', after.join(',') || 'none');
  ok('  and the flow keeps its URL, so it can be turned back on by hand',
     await had.p.evaluate(() => !!(loadDests().find(d => d.id === 'pa') || {}).url));
  ok('  and the correction records itself, so it runs once',
     await had.p.evaluate(() => localStorage.getItem('up_gas_only_v1') === '1'));

  /* Once means once: a deliberate choice made afterwards has to survive. */
  await had.p.evaluate(() => {
    saveDests(loadDests().map(x => Object.assign({}, x, x.id === 'pa' ? { on:true } : {})));
  });
  await had.p.reload({ waitUntil:'load' });
  await had.p.waitForTimeout(700);
  const kept = await ticked(had.p);
  ok('an inspector who turns it back on afterwards keeps it',
     kept.indexOf('pa') >= 0, kept.join(','));
  await had.ctx.close();

  /* ---- a phone out of the box ------------------------------------------- */
  console.log('\na phone opened for the first time');
  const fresh = await boot(b, null);
  const out = await fresh.p.evaluate(() => loadDests().map(d => d.id + (d.on ? ':on' : ':off')));
  ok('picks up Google alone', out.indexOf('gas:on') >= 0 && out.indexOf('pa:on') < 0, out.join(' '));
  await fresh.ctx.close();

  /* ---- and the thing this was all for ----------------------------------- */
  /* With one destination, a round Drive has taken is DONE — not held against
     an endpoint nobody reads, on a phone that then cannot tell the inspector
     their work is safe. */
  console.log('\nand a round is done when Drive has it');
  const run = await boot(b, { up_dests: JSON.stringify([
    { id:'gas', on:true, url:B + '/exec', sec:'', folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}' },
    { id:'pa',  on:true, url:'https://flow.invalid/x', sec:'', folder:'' }]) });
  /* Put the round in the store and let the queue send it. The capture screen
     has suites of its own; what is being measured here is the SENDING rule, and
     driving the Save button drags in a dialog this test has no business
     answering. */
  await run.p.evaluate(async () => {
    const s = document.getElementById('typeSel');
    s.value = 'MP'; s.dispatchEvent(new Event('change'));
    selectEquip('TK149');
    await new Promise(r => setTimeout(r, 500));
    const pos = {};
    items().forEach(x => { pos[x.k] = { grade:'A', sev:'NOF', detect:'VI', photos:[], video:null }; });
    await dbPut({ id:'one', type:'MP', equip:'TK149', date:'2026-08-24', by:'S. Volkov',
      sup:'A. Sokolov', smu:'19004', cls:(ASSET_BY['TK149']||{}).cls||'', gps:null, dev:'PH-01',
      sign:null, positions:pos, created:'2026-08-24T06:00:00.000Z', up:0, upTo:{}, rev:1 });
    retryAt = RETRY_MIN;
    return syncThenArm(true);
  });
  await run.p.waitForFunction(() => dbAll().then(a => a.length && a.every(r => r.up)),
                              null, { timeout:60000 }).catch(() => {});
  const done = await run.p.evaluate(() => dbAll().then(a => a.map(r => ({ up:r.up, to:Object.keys(r.upTo||{}) }))));
  ok('it reaches the cloud and says so', done.length === 1 && done[0].up === 1, JSON.stringify(done));
  ok('  without ever being sent to the mirror',
     (done[0] || {}).to && done[0].to.join(',') === 'gas', ((done[0] || {}).to || []).join(','));
  /* The row an inspector reads before deleting anything. */
  await run.p.click('#tabbar [data-pane="paneQueue"]');
  await run.p.waitForTimeout(600);
  const badge = await run.p.evaluate(() => {
    const e = document.querySelector('#pending .pitem .up');
    return e ? { k:['ok','wait','part','never'].find(c => e.classList.contains(c)), t:e.textContent } : null;
  });
  ok('  and the row says it is in the cloud', badge && badge.k === 'ok',
     badge ? badge.k + ' — ' + badge.t : '(no row)');
  await run.ctx.close();

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : '\none destination, and it is the one that is read');
  process.exit(fail ? 1 : 0);
})();
