/* A round in progress survives anything.

   The scenario this exists for is not exotic. An inspector is nineteen points
   into a thirty-six point undercarriage round, standing in the cold with the
   phone in one glove. Something takes the tab away — a call, the camera, the
   OS reclaiming memory, a battery that reads 8% at −40 °C and lies. The tab
   comes back reloaded and the round is gone.

   Nothing about that is a wrong number, so no report would ever show it. It is
   simply the afternoon that decides somebody goes back to paper. Two things
   are guarded here:

     · the draft is on disk before the reload, not after it
     · it is OFFERED back, never assumed — silently restoring puts a reading
       against a machine the inspector is no longer standing at, and silently
       discarding is the whole fault this prevents

   The debounce is 400 ms and pagehide races an async IndexedDB write, so the
   real checkpoint is moving between points. That is what the crash tests below
   drive: readings, a point change, then a hard reload with no farewell at all.

   Also guarded: the draft must never leak into the queue (dbAll filters it) or
   into a saved record, and the two things that answer "how much is left" —
   the progress bar and the count on the Save button — have to agree with the
   round rather than with each other.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

async function boot(ctx) {
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForTimeout(400);
  return p;
}

/* offerDraft is on a timer, so waiting a fixed number of milliseconds for it
   is a coin toss that passes on a fast machine and fails on a loaded one. Wait
   for the question itself, and give a quiet boot time to prove it stays quiet. */
async function waitAsked(p) {
  try { await p.waitForFunction(() => document.getElementById('dlg').open === true,
                                null, { timeout: 6000 }); return true; }
  catch (e) { return false; }
}
async function stayedQuiet(p) {
  await p.waitForTimeout(2500);
  return (await p.evaluate(() => document.getElementById('dlg').open)) !== true;
}

/* Type readings into the first n undercarriage points, moving between them the
   way an inspector does — the move is what checkpoints the draft. */
async function takeReadings(p, n) {
  return p.evaluate(async n => {
    const keys = ucOrder().slice(0, n);
    for (let i = 0; i < keys.length; i++) {
      saveCur(); curItem = keys[i]; loadPos(); renderChips();
      const f = document.getElementById('ucMM');
      if (!f) return { err: 'no #ucMM at ' + keys[i] };
      f.value = String(40 + i);
      f.dispatchEvent(new Event('input', { bubbles: true }));
      saveCur();
      await new Promise(r => setTimeout(r, 30));
    }
    saveCur();
    return { keys, taken: Object.keys(draft.positions).length };
  }, n);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    localStorage.setItem('inspector', 'R. Marrero');
    localStorage.setItem('insp_type', 'UC');
  });

  console.log('the tab dies mid-round');
  let p = await boot(ctx);
  await p.evaluate(() => { selectEquip('DZ001'); });
  await p.waitForTimeout(300);
  const took = await takeReadings(p, 5);
  ok('five readings went in', took.taken === 5, JSON.stringify(took.taken) + ' ' + (took.err || ''));

  /* No pagehide, no beforeunload, no grace. This is the OS killing the tab. */
  const onDisk = await p.evaluate(async () => {
    const d = await dbGet('__draft__');
    return d ? { n: Object.keys(d.positions || {}).length, equip: d.equip, type: d.type } : null;
  });
  ok('the draft is already on disk before anything is closed', onDisk && onDisk.n === 5,
     JSON.stringify(onDisk));
  ok('and it knows which machine and which round', onDisk && onDisk.equip === 'DZ001' && onDisk.type === 'UC',
     onDisk ? onDisk.equip + '/' + onDisk.type : 'none');

  /* Nothing that survives may masquerade as a finished inspection. */
  const leak = await p.evaluate(async () => (await dbAll()).map(r => r.id));
  ok('the unfinished round is not sitting in the queue', !leak.includes('__draft__'), leak.join(',') || 'queue empty');
  const qCount = await p.evaluate(async () => { await renderPending();
    return (document.getElementById('pending').textContent.match(/DZ001/g) || []).length; });
  ok('and the queue screen does not show it', qCount === 0, qCount + ' mentions');

  await p.close();

  console.log('\nit comes back reloaded');
  p = await boot(ctx);
  ok('the question arrives without being hunted for', await waitAsked(p));
  const dlg = await p.evaluate(() => {
    const d = document.getElementById('dlg');
    return { open: d.open, title: document.getElementById('dlgTitle').textContent,
             msg: document.getElementById('dlgMsg').textContent,
             ok: document.getElementById('dlgOk').textContent,
             cancel: document.getElementById('dlgCancel').textContent };
  });
  ok('the app asks rather than deciding', dlg.open === true);
  ok('the question names the machine, the round and the count',
     /DZ001/.test(dlg.msg) && /5/.test(dlg.msg) && dlg.msg.length > 20, dlg.msg);
  ok('both answers are offered', !!dlg.ok && !!dlg.cancel, dlg.ok + ' / ' + dlg.cancel);
  note('asked', dlg.title + ' — ' + dlg.msg);

  /* Esc means "keep it". A dismissed question must not be a destroyed round. */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const afterEsc = await p.evaluate(async () => {
    const d = await dbGet('__draft__'); return d ? Object.keys(d.positions || {}).length : 0; });
  ok('dismissing the question keeps the round', afterEsc === 5, afterEsc + ' readings');
  await p.close();

  console.log('\ncarry on');
  p = await boot(ctx);
  ok('it is offered again after a dismissal', await waitAsked(p));
  await p.evaluate(() => document.getElementById('dlgOk').click());
  await p.waitForTimeout(600);
  const back = await p.evaluate(() => ({
    n: Object.keys(draft.positions).length, equip: curEquip, type,
    round: document.body.dataset.round,
    first: (draft.positions[ucOrder()[0]] || {}).mm }));
  ok('every reading is back', back.n === 5, back.n + ' readings');
  ok('on the same machine', back.equip === 'DZ001', back.equip);
  ok('in the same round', back.type === 'UC' && back.round === 'UC', back.type + '/' + back.round);
  ok('with the numbers unchanged', String(back.first) === '40', String(back.first));

  console.log('\nand finishing clears it');
  await p.evaluate(() => document.getElementById('saveBtn').click());
  await p.waitForTimeout(900);
  await p.evaluate(() => { const d = document.getElementById('dlg'); if (d.open) document.getElementById('dlgOk').click(); });
  await p.waitForTimeout(300);
  const saved = await p.evaluate(async () => {
    const d = await dbGet('__draft__');
    const all = await dbAll();
    return { draftLeft: d ? Object.keys(d.positions || {}).length : 0,
             records: all.filter(r => r.equip === 'DZ001').length };
  });
  ok('the finished round is in the queue', saved.records >= 1, saved.records + ' record(s)');
  ok('and the draft is gone, so the next boot asks nothing', saved.draftLeft === 0, saved.draftLeft + ' left');
  await p.close();

  console.log('\na clean start asks nothing');
  p = await boot(ctx);
  ok('no question on a phone with no unfinished round', await stayedQuiet(p));
  await p.close();

  console.log('\nthrowing it away is a decision, taken once');
  p = await boot(ctx);
  await p.evaluate(() => { selectEquip('DZ002'); });
  await p.waitForTimeout(300);
  await takeReadings(p, 3);
  await p.close();
  p = await boot(ctx);
  await waitAsked(p);
  await p.evaluate(() => document.getElementById('dlgCancel').click());
  await p.waitForTimeout(400);
  const dropped = await p.evaluate(async () => (await dbGet('__draft__')) ? 1 : 0);
  ok('saying no removes it', dropped === 0);
  await p.close();
  p = await boot(ctx);
  ok('and it is not asked again', await stayedQuiet(p));
  await p.close();

  console.log('\nhow much is left');
  p = await boot(ctx);
  await p.evaluate(() => { selectEquip('DZ001'); });
  await p.waitForTimeout(400);

  const empty = await p.evaluate(() => {
    const el = document.querySelector('#ucFields .prog, #ucTally .prog, .prog');
    return { html: el ? el.textContent.trim() : null,
             w: el ? el.querySelector('.pb i').style.width : null,
             total: ucOrder().length,
             btn: document.getElementById('saveBtn').textContent };
  });
  ok('the bar is there before a single reading', empty.html !== null, String(empty.html));
  ok('at zero', empty.w === '0%', String(empty.w));
  ok('the Save button carries the same count', /(^|·\s*)0\/\d+/.test(empty.btn), empty.btn);
  note('round size', empty.total + ' points');

  await takeReadings(p, 5);
  await p.waitForTimeout(200);
  const part = await p.evaluate(() => {
    const el = document.querySelector('.prog');
    const total = ucOrder().length;
    return { txt: el.textContent.trim(), w: el.querySelector('.pb i').style.width,
             full: el.classList.contains('full'), total,
             btn: document.getElementById('saveBtn').textContent,
             now: el.getAttribute('aria-valuenow'), max: el.getAttribute('aria-valuemax') };
  });
  ok('the bar counts the readings, not the verdicts', part.txt.indexOf('5/' + part.total) === 0,
     part.txt);
  ok('its width matches the fraction',
     part.w === Math.round(5 / part.total * 100) + '%', part.w + ' of ' + part.total);
  ok('it is not marked complete', part.full === false);
  ok('the button agrees with the bar', part.btn.indexOf('5/' + part.total) > 0, part.btn);
  ok('a screen reader gets the same numbers',
     part.now === '5' && part.max === String(part.total), part.now + '/' + part.max);

  /* The bar must not be readable as a status. Green here would sit two
     centimetres above a green "serviceable" dot and mean something else. */
  const hue = await p.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.prog .pb i'));
    const px = h => { const d = document.createElement('div'); d.style.color = h;
      document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
    return { fill: cs.backgroundColor, good: px(getComputedStyle(document.body).getPropertyValue('--good').trim()) };
  });
  ok('a part-done bar is not wearing the serviceable colour', hue.fill !== hue.good,
     hue.fill + ' vs good ' + hue.good);

  const all = await p.evaluate(async () => {
    const keys = ucOrder();
    for (const k of keys) { saveCur(); curItem = k; loadPos();
      const f = document.getElementById('ucMM');
      if (!f) return { err: 'the measurement field vanished at ' + k };
      f.value = '42'; f.dispatchEvent(new Event('input', { bubbles: true })); saveCur(); }
    saveCur(); renderUC(); renderChips();
    const el = document.querySelector('.prog');
    return { txt: el.textContent.trim(), w: el.querySelector('.pb i').style.width,
             full: el.classList.contains('full'),
             fill: getComputedStyle(el.querySelector('.pb i')).backgroundColor,
             good: (()=>{ const d=document.createElement('div');
               d.style.color=getComputedStyle(document.body).getPropertyValue('--good').trim();
               document.body.appendChild(d); const v=getComputedStyle(d).color; d.remove(); return v; })(),
             btn: document.getElementById('saveBtn').textContent, total: keys.length };
  });
  if (all.err) { ok('every point can be measured', false, all.err); }
  else {
  ok('a finished round says so in words, not just a full bar', /done/i.test(all.txt) || /готов/i.test(all.txt), all.txt);
  ok('the bar is full', all.w === '100%' && all.full === true, all.w);
  ok('and only then turns green', all.fill === all.good, all.fill);
  ok('the button stops counting and says done', !/\d+\/\d+$/.test(all.btn.replace(/\s/g,'')) || /done|готов/i.test(all.btn), all.btn);
  }

  await p.close();

  console.log('\nrounds without measured points do not pretend to have progress');
  p = await boot(ctx);
  for (const ty of ['MP', 'INSP', 'FC']) {
    const r = await p.evaluate(t => { const s = document.getElementById('typeSel');
      s.value = t; s.dispatchEvent(new Event('change')); selectEquip('DZ001');
      return { bar: !!document.querySelector('.prog'),
               btn: document.getElementById('saveBtn').textContent }; }, ty);
    ok(ty + ' shows no bar and no count on the button',
       !r.bar && !/\d+\/\d+/.test(r.btn), (r.bar ? 'bar ' : '') + r.btn);
  }
  await p.close();

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
