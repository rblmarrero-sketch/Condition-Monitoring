/* A shift, from the yard to the office, on one phone.

   Not a feature at a time: the sequence an inspector actually performs, in the
   order they perform it, with the signal going away in the middle of it the way
   it does at Baimskaya. Everything here has a suite of its own somewhere — the
   point of this one is the JOINS between them, which is where the app has hurt
   people before: a round that saves and then cannot be found, a queue that says
   "3 waiting" without saying which three, a delete that destroys the only copy.

   Run: node tests/field.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = `http://127.0.0.1:${PORT}`;

let fail = 0;
const ok = (n, c, d) => { if (!c) { fail++; console.log('  FAIL  ' + n + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + n + (d !== undefined ? '   ' + d : '')); return c; };
const note = (n, d) => console.log('  ....  ' + n + (d !== undefined ? '   ' + d : ''));

const ready = p => p.evaluate(() => [...document.querySelectorAll('.yardrow')].map(r => ({
  /* The verdict class, whatever the row's own class is called — read the state
     rather than string-surgery on the markup, or a rename turns every row into
     a silent failure that quotes the right text beside it. */
  k: ['ok','warn','bad'].find(c => r.classList.contains(c)) || '?',
  t: r.querySelector('b').textContent,
  s: r.querySelector('.w span').textContent })));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{ width:412, height:915 },
    isMobile:true, hasTouch:true, acceptDownloads:true });
  /* All three named, because loadDests() fills in any destination this phone
     has never configured — from upload-defaults.js, ticked. A phone in the
     field therefore has TWO live destinations, and a round is only "in the
     cloud" when both have taken it. That is the shipped behaviour and it is
     worth knowing; it is not what this suite is measuring, so the other two
     are given a URL (which is what makes loadDests leave them alone) and
     switched off. */
  await ctx.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify([
    { id:'gas',  on:true,  url:u, sec:'', folder:'{TYPE}/{UNIT}/{YYYY-MM-DD}' },
    { id:'pa',   on:false, url:'https://off.invalid/', sec:'', folder:'' },
    { id:'post', on:false, url:'https://off.invalid/', sec:'', folder:'' }])), B + '/exec');
  const p = await ctx.newPage();
  p.on('pageerror', e => ok('page error', false, e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil:'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout:20000 });
  await p.waitForTimeout(600);

  /* ---- 1. before the truck leaves the yard ------------------------------ */
  console.log('\nin the yard, with signal');
  await p.click('#tabbar [data-pane="paneQueue"]');
  await p.waitForTimeout(5500);
  const yard = await ready(p);
  yard.forEach(r => note(r.k.padEnd(4), r.t + ' — ' + r.s));
  ok('every readiness question is answered', yard.length === 6, yard.length + ' checks');
  ok('and on a clean phone with signal they all pass',
     yard.every(r => r.k === 'ok'), yard.filter(r => r.k !== 'ok').map(r => r.t).join(', ') || 'all green');

  /* ---- 2. the signal goes, and the work starts -------------------------- */
  /* The pit. Every round type, captured with nothing but the phone. */
  console.log('\nout at the machines, no signal');
  await ctx.setOffline(true);
  const walked = await p.evaluate(async () => {
    const sel = document.getElementById('typeSel');
    const KNOWN = { UC:['DZ002'], TB:['TK143'],
      GET:(window.ASSETS||[]).filter(a=>/EXC|LOAD/i.test(a.cls||'')).slice(0,3).map(a=>a.n) };
    const shot = async () => { const c = document.createElement('canvas');
      c.width = 640; c.height = 480; const x = c.getContext('2d');
      x.fillStyle = '#5b6670'; x.fillRect(0, 0, 640, 480);
      return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)); };
    const out = [];
    for (const ty of [...sel.options].map(o => o.value)) {
      sel.value = ty; sel.dispatchEvent(new Event('change'));
      let unit = null, ks = [];
      const tryOne = async n => { selectEquip(n); await new Promise(r => setTimeout(r, 320));
        const g = items().map(x => x.k); return g.length ? g : null; };
      for (const n of (KNOWN[ty] || [])) { const g = await tryOne(n); if (g) { unit = n; ks = g; break; } }
      if (!unit) for (const a of (window.ASSETS || []).slice(0, 40)) {
        const g = await tryOne(a.n); if (g) { unit = a.n; ks = g; break; } }
      if (!unit) { out.push({ ty, skip:1 }); continue; }
      const pos = {};
      for (const [i, k] of ks.entries())
        pos[k] = { mm: 20 + (i % 6), grade:'A', sev:'NOF', stood:0, reason:'',
                   photos: i === 0 ? [await shot()] : [], video:null };
      await dbPut({ id:'f-' + ty, type:ty, equip:unit, date:'2026-08-24', by:'S. Volkov',
        sup:'A. Sokolov', smu:'100', cls:(ASSET_BY[unit]||{}).cls||'', gps:null, dev:'PH-01',
        sign:null, positions:pos, created:'2026-08-24T06:00:00.000Z', up:0, upTo:{}, rev:1 });
      out.push({ ty, unit, n:ks.length });
    }
    await renderPending();
    return out;
  });
  walked.filter(w => !w.skip).forEach(w => note(w.ty.padEnd(5), w.unit + '  ' + w.n + ' points'));
  ok('every round type this build offers can be walked with no signal',
     walked.every(w => !w.skip), walked.filter(w => w.skip).map(w => w.ty).join(',') || 'all of them');

  /* ---- 3. and the queue says where each one stands ---------------------- */
  console.log('\nback in the truck: what is safe to delete');
  await p.click('#tabbar [data-pane="paneQueue"]');
  await p.waitForTimeout(600);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#pending .pitem')].map(r => ({
    a:(r.querySelector('.meta .a')||{}).textContent.trim(),
    up:(r.querySelector('.up')||{}).textContent,
    k:((r.querySelector('.up')||{}).className||'').replace('up ','') })));
  ok('every round on the phone says whether it has reached the cloud',
     rows.length > 0 && rows.every(r => r.up && r.up.length > 2), rows.length + ' rounds');
  ok('  and none of them is claiming to be there yet',
     rows.every(r => r.k !== 'ok'), rows.map(r => r.k).join(' '));

  /* Deleting one now destroys the only copy, and the phone has to say so in
     those words — not "are you sure". */
  const warn = await p.evaluate(async () => {
    const seen = {};
    const realAsk = window.ask;
    window.ask = (title, msg) => { seen.title = title; seen.msg = msg; return Promise.resolve(false); };
    document.querySelector('#pending .pitem .del').click();
    await new Promise(r => setTimeout(r, 400));
    window.ask = realAsk;
    return seen;
  });
  ok('deleting an unsent round warns that it exists nowhere else',
     /not been uploaded|не выгружено/i.test(warn.title || ''), warn.title || '(no warning)');
  ok('  and says what would be lost',
     /only on this phone|только на этом|cannot be undone|нельзя отменить/i.test(warn.msg || ''),
     (warn.msg || '').slice(0, 70));
  ok('  and nothing was deleted, because the answer was no',
     (await p.evaluate(() => dbAll().then(a => a.length))) === rows.length);

  /* ---- 4. back in range: it sends itself -------------------------------- */
  console.log('\nback in range');
  await ctx.setOffline(false);
  await p.evaluate(() => { retryAt = RETRY_MIN; return syncThenArm(true); });
  await p.waitForFunction(() => dbAll().then(a => a.every(r => r.up)), null, { timeout:120000 })
    .catch(() => {});
  await p.evaluate(() => renderPending());
  await p.waitForTimeout(500);
  const after = await p.evaluate(() => [...document.querySelectorAll('#pending .pitem')].map(r =>
    ((r.querySelector('.up')||{}).className||'').replace('up ','')));
  ok('every round reaches the cloud without being asked twice',
     after.length > 0 && after.every(k => k === 'ok'), after.join(' '));

  const safe = await p.evaluate(async () => {
    const seen = {};
    const realAsk = window.ask;
    window.ask = (title, msg) => { seen.title = title; seen.msg = msg; return Promise.resolve(false); };
    document.querySelector('#pending .pitem .del').click();
    await new Promise(r => setTimeout(r, 400));
    window.ask = realAsk;
    return seen;
  });
  /* The reassurance, not the vendor. This matched "Drive is not touched",
     which was true only while there was one backend behind that word — and
     after the changeover the phone correctly said "the copy in the system is
     not touched" and the check went red on wording it had pinned. What has to
     hold is that an inspector deleting an uploaded round is told the uploaded
     copy survives; which company holds it is not the point being made. */
  ok('and deleting one now says the uploaded copy is untouched',
     /already been uploaded|уже выгружено/i.test(safe.title || '')
     || /is not touched|не затрагивается|не тронут/i.test(safe.msg || ''),
     (safe.title || '') + ' / ' + (safe.msg || '').slice(0, 60));

  /* ---- 5. and the yard check goes quiet --------------------------------- */
  await p.evaluate(() => yardCheck());
  await p.waitForTimeout(5500);
  const end = await ready(p);
  ok('the readiness card is green once the work is away',
     end.every(r => r.k === 'ok'), end.filter(r => r.k !== 'ok').map(r => r.t + ': ' + r.s).join(' | ') || 'all green');

  /* ---- 6. the paper ----------------------------------------------------- */
  console.log('\nand the report comes out');
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout:180000 }),
    p.click('#reportBtn'),
  ]);
  const size = require('fs').statSync(await dl.path()).size;
  ok('the whole shift prints', size > 20000, (size / 1024).toFixed(0) + ' KB');

  await b.close();
  console.log(fail ? `\n${fail} FAILED` : '\nyard to office, nothing lost on the way');
  process.exit(fail ? 1 : 0);
})();
