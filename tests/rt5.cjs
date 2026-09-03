/* Every inspection type, five rounds each, driven end to end and read back out
   of the store. The undercarriage round used to save an empty record — the
   millimetres never left the draft — and nothing caught it because no suite had
   ever read a saved position back. This one does, for all five. */
const { chromium } = require(require('./pw.cjs'));
const { PLANT } = require('./overview.cjs');   // the machine photographs every round now carries
const B = process.env.CMB || 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

async function settled(p) {
  await p.waitForTimeout(1200);
  for (let i = 0; i < 4; i++) {
    try {
      await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?',
        null, { timeout: 8000 });
      await p.waitForTimeout(200);
      return;
    } catch (e) { await p.waitForTimeout(600); }
  }
  throw new Error('page never settled');
}
const setType = async (p, ty) => {
  await p.evaluate(t => { const s = document.getElementById('typeSel'); s.value = t; s.dispatchEvent(new Event('change')); }, ty);
  await p.waitForTimeout(300);
};
const dismiss = async p => {
  for (let i = 0; i < 3; i++) {
    if (await p.evaluate(() => document.getElementById('dlg').open)) {
      await p.click('#dlgOk'); await p.waitForTimeout(250);
    } else break;
  }
};

/* Units that actually carry each type. UC needs a tracked machine; the rest run
   on the magnetic-plug fleet. */
const PLAN = [
  { ty: 'MP', units: ['TK146', 'TK147', 'TK148', 'TK149', 'TK150'] },
  { ty: 'FC', units: ['TK146', 'TK147', 'TK148', 'TK149', 'TK150'] },
  { ty: 'INSP', units: ['EX001', 'EX002', 'DZ001', 'DZ002', 'TK146'] },
  { ty: 'TEMP', units: ['TK146', 'TK147', 'TK148', 'TK149', 'TK150'] },
  { ty: 'UC', units: ['DZ001', 'DZ002', 'EX001', 'EX002', 'DZ003'] },
];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);
  await p.fill('#inspector', 'R. Marrero');

  /* Every unit in the plan has to exist in the register, or a "pass" would only
     mean the app quietly did nothing. */
  const missing = await p.evaluate(pl => pl.flatMap(x => x.units).filter(u => !ASSET_BY[u]),
    PLAN);
  ok('every unit in the plan is in the register', missing.length === 0, missing.join(','));

  let expected = 0;
  for (const { ty, units } of PLAN) {
    console.log('\n  ' + ty + ' — five rounds');
    for (let n = 0; n < units.length; n++) {
      const u = units[n];
      await setType(p, ty);
      await p.evaluate(x => selectEquip(x), u);
      await p.waitForTimeout(ty === 'UC' ? 700 : 350);

      const wrote = await p.evaluate(({ ty, n }) => {
        const ks = items().map(x => x.k);
        if (!ks.length) return { err: 'no positions' };
        const out = { keys: [], mm: {}, n: ks.length };
        // three positions per round — enough to prove the shape, cheap to drive
        const pick = ks.slice(0, 3);
        for (let i = 0; i < pick.length; i++) {
          const k = pick[i];
          saveCur(); curItem = k; loadPos();
          if (ty === 'UC') {
            const ref = ucRef();
            // a value between new and condemn, nudged per round so a stale
            // read-back cannot pass by echoing the previous one
            const v = ref && !ref.x
              ? Math.round((ref.n + (ref.c - ref.n) * (0.3 + 0.1 * i) + n * 0.1) * 10) / 10
              : 40 + i + n;
            document.getElementById('ucMM').value = String(v);
            document.getElementById('ucMM').dispatchEvent(new Event('input', { bubbles: true }));
            out.mm[k] = Number(document.getElementById('ucMM').value);
          } else {
            document.querySelector('#gradeSeg [data-g="2"]').click();
            const cf = document.getElementById('comment');
            cf.value = 'round ' + n + ' pos ' + i;
            cf.dispatchEvent(new Event('input', { bubbles: true }));
            if (ty === 'TEMP') {
              const f = document.getElementById('tempV');
              f.value = String(70 + i + n); f.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
          saveCur();
          out.keys.push(k);
        }
        return out;
      }, { ty, n });
      if (wrote.err) { ok(ty + ' ' + u + ': has positions', false, wrote.err); continue; }

      // the sheet is modal over the page — the round ends before it is saved
      if (ty === 'UC') { await p.evaluate(() => { if (ucSheetOn()) ucCloseSheet(); }); await p.waitForTimeout(250); }
      await p.evaluate(PLANT);
      await p.click('#saveBtn'); await p.waitForTimeout(500);
      await dismiss(p);
      expected++;

      const back = await p.evaluate(async ({ u, ty, keys }) => {
        const all = await dbAll();
        const rec = all.filter(r => r.equip === u && r.type === ty)
          .sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
        if (!rec) return { err: 'no record stored' };
        return {
          n: Object.keys(rec.positions).filter(k => k !== '__general').length,   // the machine's photographs are not a position
          pos: keys.map(k => rec.positions[k] || null),
          out: keys.map(k => rec.positions[k] ? wearOut(rec, k, rec.positions[k]) : null),
        };
      }, { u, ty, keys: wrote.keys });

      if (back.err) { ok(ty + ' ' + u + ': the round was stored', false, back.err); continue; }
      ok(ty + ' ' + u + ': all three positions stored', back.n === wrote.keys.length, String(back.n));

      if (ty === 'UC') {
        const mmOk = back.pos.every((q, i) => q && Number(q.mm) === wrote.mm[wrote.keys[i]]);
        ok(ty + ' ' + u + ': the millimetres survived the save', mmOk,
          JSON.stringify(back.pos.map(q => q && q.mm)) + ' want ' + JSON.stringify(wrote.keys.map(k => wrote.mm[k])));
        const derived = back.out.every(w => w && w.mm !== '' && w.wearPct !== '' && w.band);
        ok(ty + ' ' + u + ': wear % and band resolve on read-back', derived,
          JSON.stringify(back.out.map(w => w && [w.wearPct, w.band, w.refSrc])));
      } else {
        ok(ty + ' ' + u + ': the grade survived the save', back.pos.every(q => q && q.grade === 2));
        ok(ty + ' ' + u + ': the comment survived the save',
          back.pos.every((q, i) => q && q.comment === 'round ' + n + ' pos ' + i));
        if (ty === 'TEMP') ok(ty + ' ' + u + ': the temperature survived the save',
          back.pos.every(q => q && q.tempV), JSON.stringify(back.pos.map(q => q && q.tempV)));
      }
    }
  }

  console.log('\n  the queue holds every one of them');
  const total = await p.evaluate(async () => (await dbAll()).length);
  ok('twenty-five rounds in the store', total === expected, total + ' of ' + expected);

  console.log('\n  and every one exports its measurement');
  const exp = await p.evaluate(async () => {
    const all = await dbAll();
    const uc = all.filter(r => r.type === 'UC').map(recToExport);
    const items = uc.flatMap(r => r.items).filter(i => !i.general);
    return { rounds: uc.length, items: items.length,
      withMM: items.filter(i => i.mm !== '' && i.mm != null).length,
      withPct: items.filter(i => i.wearPct !== '' && i.wearPct != null).length,
      sample: items[0] || null };
  });
  ok('every exported undercarriage row carries its millimetres',
    exp.items > 0 && exp.withMM === exp.items, exp.withMM + ' of ' + exp.items);
  ok('and its wear percentage', exp.withPct === exp.items, exp.withPct + ' of ' + exp.items);

  console.log('\n  the regressions this pass fixed');
  // switching away from UC with the sheet up must tear it down
  await setType(p, 'UC');
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(700);
  // the map is a photograph with numbers on it now; the named chips under it
  // are the same targets and are ordinary buttons
  await p.evaluate(() => { const s = document.querySelector('.ucgroups button');
    if (s) s.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.waitForTimeout(400);
  const wasOpen = await p.evaluate(() => ucSheetOn());
  ok('the measure sheet opens from the machine', wasOpen);
  await setType(p, 'MP');
  await p.evaluate(() => selectEquip('TK146'));
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => {
    const t = document.getElementById('takeBtn'), c = document.getElementById('comment');
    const r = e => !!e && e.getClientRects().length > 0;
    return { overflow: document.body.style.overflow,
      /* The modal is gone entirely — no dimming layer, no .sheet, no locked
         page. What replaced it is a dock in the page, and leaving the round
         has to take that down too. */
      backdrop: !!document.getElementById('ucBackdrop'),
      sheet: document.getElementById('ucFields').classList.contains('sheet'),
      dock: document.getElementById('ucFields').classList.contains('dock'),
      photo: r(t), comment: r(c) };
  });
  ok('leaving the wear type unlocks the page', after.overflow === '', after.overflow);
  ok('and there is no dimming layer to drop, because there is no modal', after.backdrop === false);
  ok('and the dock is down', after.dock === false && after.sheet === false);
  ok('the photo button comes back', after.photo === true);
  ok('so does the comment field', after.comment === true);

  /* A network error message is text, never markup.

     Stopping the retry timer is not enough on its own, and this used to fail
     about one sweep in ten. An upload attempt starting is entitled to clear the
     last error — that is correct behaviour — and the 200ms wait between setting
     lastErr and reading the bar was long enough for the periodic sync, which
     retryTimer is not, to fire and repaint it as "Uploading…". The assertion
     then failed for a reason with nothing to do with escaping. In a sweep of
     137 suites a guard that cries wolf is worse than no guard: it is the noise
     a real failure hides in.

     renderSync() is ASYNC — it awaits dbAll() before it paints anything. The
     test called it without awaiting and slept 200ms instead, which is the whole
     flake: usually long enough, sometimes not, and long enough for a periodic
     sync to repaint the bar underneath it. Await it and read in the SAME
     evaluate, and there is no sleep and no window for anything to intervene.
     Only escaping is under test here; autosync.cjs exercises the timers. */
  const inj = await p.evaluate(async () => {
    if (typeof retryTimer !== 'undefined' && retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    /* `syncing` outranks `lastErr` in the bar, and rightly so — a send in
       flight is what an inspector most needs to see. It also meant this
       assertion read "Sending automatically…" whenever a periodic send happened
       to be running, which is a race the suite cannot win by sleeping. Only
       escaping is under test here, so the in-flight state is stood down first;
       autosync.cjs is what exercises the timers. */
    if (typeof syncing !== 'undefined') syncing = false;
    lastErr = '<img src=x onerror="window.__x=1">';
    await renderSync();
    const bar = document.getElementById('syncBar');
    return { x: window.__x, imgs: bar.querySelectorAll('img').length,
             shown: (bar.textContent || '').indexOf('onerror') >= 0,
             text: (bar.textContent || '').slice(0, 80) };
  });
  ok('a sync error cannot inject markup', !inj.x && inj.imgs === 0);
  ok('and is shown as the text it is', inj.shown, inj.text);

  // a comma decimal is a decimal
  await setType(p, 'UC');
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(600);
  const comma = await p.evaluate(() => {
    const ks = items().map(x => x.k); saveCur(); curItem = ks[0]; loadPos();
    const f = document.getElementById('ucMM');
    f.value = '12,5'; f.dispatchEvent(new Event('input', { bubbles: true }));
    return { field: f.value, stored: (draft.positions[curItem] || {}).mm };
  });
  ok('a comma typed into a measurement becomes a point', comma.field === '12.5', comma.field);
  ok('and the number is stored', comma.stored === 12.5, String(comma.stored));

  // the previous-reading line must not quote the round before last
  const prev = await p.evaluate(async () => {
    const ks = items().map(x => x.k), k = ks[0];
    saveCur(); curItem = k; loadPos();
    const f = document.getElementById('ucMM');
    f.value = '77.7'; f.dispatchEvent(new Event('input', { bubbles: true }));
    saveCur();
    const rec = { id: 'probe', type: 'UC', equip: curEquip, date: '2099-01-01', cls: '', positions: {}, up: 0, upTo: {} };
    rec.positions[k] = { mm: 77.7, stood: 0, reason: '' };
    await dbPut(rec);
    const rows = await ucPrevReadings(curEquip);
    await dbDel('probe');
    return rows[k] || null;
  });
  ok('a freshly saved reading is what "last time" reads back', prev && prev.mm === 77.7,
    JSON.stringify(prev));

  // the last point's button says Done — it has to mean it
  await setType(p, 'UC');
  await p.evaluate(() => selectEquip('DZ001'));
  await p.waitForTimeout(600);
  const done = await p.evaluate(() => {
    const o = ucOrder(); saveCur(); curItem = o[o.length - 1]; loadPos();
    const n = document.getElementById('ucNext');
    return { open: ucSheetOn(), label: n.textContent, disabled: n.disabled, flag: n.dataset.done };
  });
  ok('the last point is reachable with the sheet up', done.open);
  ok('its button is enabled and says Done', !done.disabled && done.flag === '1', done.label);
  await p.click('#ucNext'); await p.waitForTimeout(300);
  const closed = await p.evaluate(() => ({ on: ucSheetOn(),
    overflow: document.body.style.overflow,
    sheet: document.getElementById('ucFields').classList.contains('sheet') }));
  ok('Done ends the round', closed.on === false && closed.sheet === false);
  ok('and gives the page back', closed.overflow === '', closed.overflow);

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
