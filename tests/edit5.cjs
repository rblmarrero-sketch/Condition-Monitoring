/* Save a round, reopen it to correct something, save again. Every field the
   inspector filled in has to be sitting there when the form comes back — an
   undercarriage round came back blank, which meant re-walking thirty-six points
   to fix one digit. Driven for all five types, five rounds each. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

async function settled(p) {
  await p.waitForTimeout(1200);
  for (let i = 0; i < 4; i++) {
    try { await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 8000 });
      await p.waitForTimeout(200); return; } catch (e) { await p.waitForTimeout(600); }
  }
  throw new Error('page never settled');
}
const setType = async (p, ty) => {
  await p.evaluate(t => { const s = document.getElementById('typeSel'); s.value = t; s.dispatchEvent(new Event('change')); }, ty);
  await p.waitForTimeout(300);
};
const dismiss = async p => { for (let i = 0; i < 3; i++) {
  if (await p.evaluate(() => document.getElementById('dlg').open)) { await p.click('#dlgOk'); await p.waitForTimeout(250); } else break; } };
const closeSheet = async p => { await p.evaluate(() => { if (typeof ucSheetOn === 'function' && ucSheetOn()) ucCloseSheet(); }); await p.waitForTimeout(250); };

/* Every field the save path writes. If a name is added there and not here, the
   test still catches it — it compares the whole stored position object. */
const PLAN = [
  { ty: 'MP', units: ['TK146', 'TK147', 'TK148', 'TK149', 'TK150'] },
  { ty: 'FC', units: ['TK151', 'TK152', 'TK153', 'TK154', 'TK155'] },
  { ty: 'INSP', units: ['EX001', 'EX002', 'DZ001', 'DZ002', 'EX003'] },
  { ty: 'TEMP', units: ['TK156', 'TK157', 'TK158', 'TK159', 'TK160'] },
  { ty: 'UC', units: ['DZ001', 'DZ002', 'DZ003', 'EX001', 'EX002'] },
];

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await settled(p);

  const missing = await p.evaluate(pl => pl.flatMap(x => x.units).filter(u => !ASSET_BY[u]), PLAN);
  ok('every unit in the plan is in the register', missing.length === 0, missing.join(','));

  for (const { ty, units } of PLAN) {
    console.log('\n  ' + ty + ' — save, reopen, correct, save again');
    for (let n = 0; n < units.length; n++) {
      const u = units[n];
      const tag = ty + ' ' + u;
      await setType(p, ty);
      await p.fill('#inspector', 'R. Marrero ' + n);
      await p.fill('#smu', String(10000 + n));
      await p.evaluate(x => selectEquip(x), u);
      await p.waitForTimeout(ty === 'UC' ? 700 : 350);
      /* selectEquip clears the header fields with the draft — set them after.
         The card folds itself once the unit and the name are both settled, so
         reopening it is the first step, exactly as it is for a person. */
      await p.evaluate(() => { const b = document.getElementById('hdrSum');
        if (b && !b.classList.contains('hidden')) b.click(); });
      await p.waitForTimeout(150);
      await p.fill('#inspector', 'R. Marrero ' + n);
      await p.fill('#smu', String(10000 + n));
      await p.evaluate(() => { const b = document.getElementById('signTog');
        if (b && document.getElementById('signBody').classList.contains('hidden')) b.click(); });
      await p.waitForTimeout(150);
      await p.fill('#supName', 'A. Supervisor');

      const wrote = await p.evaluate(({ ty, n }) => {
        const ks = items().map(x => x.k); if (!ks.length) return { err: 'no positions' };
        const keys = ks.slice(0, 3);
        const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
        for (let i = 0; i < keys.length; i++) {
          saveCur(); curItem = keys[i]; loadPos();
          set('comment', 'note ' + n + '/' + i);
          set('wo', 'WO' + n + i);
          if (ty === 'UC') {
            const ref = ucRef();
            const v = ref && !ref.x ? Math.round((ref.n + (ref.c - ref.n) * (0.25 + 0.15 * i)) * 10) / 10 : 40 + i;
            set('ucMM', String(v));
          } else {
            document.querySelector('#gradeSeg [data-g="C"]').click();
            const pp = draft.positions[curItem];
            pp.defect = 'DT14-03'; pp.cause = 'CA-WEAR'; pp.action = 'MON'; pp.detect = 'US';
            if (ty === 'TEMP') { set('tempV', String(80 + i + n)); set('tempA', String(20 + i)); }
            if (ty === 'MP' || ty === 'FC') { set('particle', String(18 + i)); set('comp', String(3000 + i)); set('oil', String(250 + i)); }
          }
          saveCur();
        }
        return { keys };
      }, { ty, n });
      if (wrote.err) { ok(tag + ': has positions', false, wrote.err); continue; }

      if (ty === 'UC') await closeSheet(p);
      await p.click('#saveBtn'); await p.waitForTimeout(500); await dismiss(p);

      const saved = await p.evaluate(async ({ u, ty }) => {
        const all = await dbAll();
        const rec = all.filter(r => r.equip === u && r.type === ty)
          .sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
        return rec ? { id: rec.id, smu: rec.smu, by: rec.by, sup: rec.sup, date: rec.date,
          positions: JSON.parse(JSON.stringify(rec.positions, (k, v) => v instanceof Blob ? '<blob>' : v)) } : null;
      }, { u, ty });
      if (!saved) { ok(tag + ': the round was stored', false); continue; }

      // reopen it exactly as the queue does
      await p.evaluate(async id => { const r = await dbGet(id); editRecord(r); }, saved.id);
      await p.waitForTimeout(ty === 'UC' ? 800 : 450);

      const back = await p.evaluate(({ keys }) => ({
        equip: curEquip, type: type, editing: !!editing,
        smu: document.getElementById('smu').value,
        by: document.getElementById('inspector').value,
        sup: document.getElementById('supName').value,
        date: document.getElementById('date').value,
        banner: !document.getElementById('editBanner').classList.contains('hidden'),
        draft: JSON.parse(JSON.stringify(keys.map(k => draft.positions[k] || null),
          (kk, v) => v instanceof Blob ? '<blob>' : v)),
        // and what the form itself shows for the first position
        shows: (() => { saveCur(); curItem = keys[0]; loadPos();
          return { mm: document.getElementById('ucMM').value,
            comment: document.getElementById('comment').value,
            wo: document.getElementById('wo').value,
            tempV: document.getElementById('tempV').value }; })(),
      }), { keys: wrote.keys });

      ok(tag + ': it reopens as an edit of that unit',
        back.equip === u && back.type === ty && back.editing && back.banner);
      ok(tag + ': the header came back', back.smu === saved.smu && back.by === saved.by &&
        back.sup === saved.sup && back.date === saved.date,
        JSON.stringify([back.smu, back.by, back.sup, back.date]));

      // every stored field is back in the draft, none dropped
      const dropped = [];
      wrote.keys.forEach((k, i) => {
        const was = saved.positions[k], now = back.draft[i];
        if (!now) { dropped.push(k + ':MISSING'); return; }
        Object.keys(was).forEach(f => {
          const a = was[f], c = now[f];
          const empty = x => x == null || x === '' || x === 0 || (Array.isArray(x) && !x.length);
          if (empty(a) && empty(c)) return;
          if (JSON.stringify(a) !== JSON.stringify(c)) dropped.push(k + '.' + f + ' ' + JSON.stringify(a) + '→' + JSON.stringify(c));
        });
      });
      ok(tag + ': every field survived the reopen', dropped.length === 0, dropped.join(' | '));

      if (ty === 'UC') ok(tag + ': the measurement is in the box, not blank',
        back.shows.mm === String(saved.positions[wrote.keys[0]].mm), back.shows.mm);
      else ok(tag + ': the comment is in the box', back.shows.comment === 'note ' + n + '/0', back.shows.comment);

      // correct one value and save again — no second record, and the edit sticks
      await p.evaluate(({ ty, keys }) => {
        saveCur(); curItem = keys[0]; loadPos();
        const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
        if (ty === 'UC') set('ucMM', '99'); else set('comment', 'corrected');
        saveCur();
      }, { ty, keys: wrote.keys });
      if (ty === 'UC') await closeSheet(p);
      await p.click('#saveBtn'); await p.waitForTimeout(500); await dismiss(p);

      const after = await p.evaluate(async ({ u, ty, id, k }) => {
        const all = await dbAll();
        const same = all.filter(r => r.equip === u && r.type === ty);
        const rec = all.find(r => r.id === id);
        return { count: same.length, found: !!rec, rev: rec && rec.rev,
          mm: rec && rec.positions[k] && rec.positions[k].mm,
          comment: rec && rec.positions[k] && rec.positions[k].comment,
          keys: rec ? Object.keys(rec.positions).length : 0 };
      }, { u, ty, id: saved.id, k: wrote.keys[0] });

      ok(tag + ': the correction replaced the round, it did not add one',
        after.count === 1 && after.found, after.count + ' records');
      ok(tag + ': the revision went up', after.rev === 2, String(after.rev));
      ok(tag + ': all three positions are still there', after.keys === wrote.keys.length, String(after.keys));
      if (ty === 'UC') ok(tag + ': the corrected millimetres stuck', Number(after.mm) === 99, String(after.mm));
      else ok(tag + ': the corrected comment stuck', after.comment === 'corrected', after.comment);

      await p.evaluate(() => resetForm());
      await p.waitForTimeout(200);
    }
  }

  console.log('\n  a unit this type has no walk for does not take the form down');
  await setType(p, 'UC');
  const odd = await p.evaluate(async () => {
    // a wheeled machine — the undercarriage walk is empty for it by design
    const u = (ASSETS.find(a => WEAR.exclude[a.m]) || {}).n;
    if (!u) return { skip: true };
    selectEquip(u);
    const rec = { id: 'oddball', type: 'UC', equip: u, cls: '', date: '2026-01-01',
      positions: {}, up: 0, upTo: {}, rev: 1, created: new Date().toISOString() };
    await dbPut(rec);
    let threw = '';
    try { editRecord(await dbGet('oddball')); } catch (e) { threw = e.message; }
    await dbDel('oddball');
    return { u, threw, alive: typeof selectEquip === 'function' && !!document.getElementById('saveBtn') };
  });
  ok('reopening a round on a machine with no walk does not throw',
    odd.skip || (!odd.threw && odd.alive), odd.threw || odd.u);

  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + e.message); process.exit(1); });
