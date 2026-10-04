/* THE SITE'S SCOPE OF 2026-10-04: TR60 LUBRICATION AT 500 H, EVERY CRANE ON
   THE GENERAL INSPECTION, AND THE OFFLINE-FILTRATION TICK.

   Three asks, one file, because each is a statement about WHO IS ON A ROUND
   and every surface has to give the same answer:

   · The 16 Terex TR60 haul trucks run the Lubrication Audit every 500 h. That
     is a MODEL, not a class — the TR60 share class HT with 30 KAMAZ (held off
     every round) and 5 IVECO nobody has given a figure for — so it is a
     due.js `byModel` rule, and the one thing this suite must be sure of is that
     it moves THOSE sixteen and nobody else.
   · All 24 mobile cranes are on the General Inspection. They were class GEN,
     the catch-all, which cannot state a programme (CATCHALL_MIN); they are
     class CRN now, and `onClass` puts the class on the round.
   · The Lubrication Audit records "offline filtration done" beside "oil sample
     taken" (tests/lubekeep.cjs carries the save / wire / reopen / report
     journey; this one opens the real screen and ticks the real box).

   Everything is asked of the app: the register is read from mobile/assets.js,
   the interval from due.js — nothing here keeps its own copy of 500 or 1000.

   Run: node tests/lubescope.cjs   (needs ed-srv on 8093 and mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const fs = require('fs'), path = require('path');
const PHONE = 'http://127.0.0.1:' + (process.env.CMPORT || '8093') + '/mobile/index.html';
const OFFICE = 'http://127.0.0.1:8099/dashboard/index.html';
const NEXT = 'http://127.0.0.1:8099/dashboard-next/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* ── the engine on its own, against the real register ───────────────────── */
const G = { ASSETS: null };
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'mobile', 'assets.js'), 'utf8'))(G);
const REG = G.ASSETS;
const self_ = { ASSETS: REG };
new Function('self', fs.readFileSync(path.join(__dirname, '..', 'mobile', 'due.js'), 'utf8'))(self_);
const DUE = self_.DUE;
const tr60 = REG.filter(a => /TR60/i.test((a.m || '') + ' ' + (a.mk || '')));
const cranes = REG.filter(a => a.cat === 'CRANE, MOBILE');
const ht = REG.filter(a => a.cls === 'HT');

console.log('\n── due.js: the TR60 lubrication audit');
ok('the register carries TR60 haul trucks', tr60.length >= 10, String(tr60.length));
ok('every TR60 is class HT (the rule is a model, not a class)', tr60.every(a => a.cls === 'HT'));
ok('every TR60 is on LUBE by model', tr60.every(a => DUE.scoped('LUBE', a)));
const h = a => DUE.hours('LUBE', null, a.cls, a.n);
ok('a TR60 runs the audit on the stated hours, asked with the unit',
   tr60.every(a => h(a) === DUE.byModel('LUBE')[0].h), tr60.map(h).join(','));
ok('and that is 500 h, the figure the site gave', DUE.byModel('LUBE')[0].h === 500);
const days = DUE.days('LUBE', null, DUE.HOURS_PER_DAY, 'HT', tr60[0].n);
ok('it renders to the calendar at the fleet rate', Math.abs(days - 500 / DUE.HOURS_PER_DAY) < 1e-9, String(days));
const others = ht.filter(a => !tr60.includes(a));
ok('every OTHER truck of class HT is untouched: no model rule, still the carried 30 days',
   others.length > 0 && others.every(a => !DUE.scoped('LUBE', a) && h(a) === null && DUE.days('LUBE', null, 20, a.cls, a.n) === 30),
   others.length + ' trucks');
ok('asked with the class only (no unit) a round still answers its own figure — no caller changes behaviour by accident',
   DUE.hours('LUBE', null, 'HT') === null);
ok('no other round moved for a TR60 (plug 250, liner 2000, inspection 1000)',
   DUE.hours('MP', null, 'HT', tr60[0].n) === 250 && DUE.hours('TB', null, 'HT', tr60[0].n) === 2000 && DUE.hours('INSP', null, 'HT', tr60[0].n) === 1000);
ok('a machine stated by number still beats a model (DZ011 filter cut)', DUE.hours('FC', null, 'DOZ', 'DZ011') === 500);
const next = DUE.next({ type: 'LUBE', last: { d: DUE.shift(DUE.today(), -10) }, today: DUE.today(), rate: 20, cls: 'HT', unit: tr60[0].n });
ok('DUE.next schedules a TR60 on hours, not on the calendar', next && next.basis === 'hours' && next.dueInHours === 500 - 200, JSON.stringify(next && { b: next.basis, h: next.dueInHours }));

console.log('\n── due.js: the cranes');
ok('the register has 24 mobile cranes', cranes.length === 24, String(cranes.length));
ok('every one is class CRN, none is left in GEN', cranes.every(a => a.cls === 'CRN'));
ok('the general inspection names the class', (DUE.EVERY.INSP.onClass || []).includes('CRN'));
ok('and its interval did not move (1,000 h is still the only figure)', DUE.hours('INSP', null, 'CRN', cranes[0].n) === 1000);
ok('nothing else on the register was reclassified (no CRN outside the cranes)', REG.filter(a => a.cls === 'CRN').length === cranes.length);

(async () => {
  const b = await chromium.launch();

  /* ── the phone ─────────────────────────────────────────────────────────── */
  console.log('\n── the phone');
  const p = await b.newPage({ viewport: { width: 412, height: 915 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(PHONE, { waitUntil: 'load' });
  await p.waitForTimeout(1700);
  const ph = await p.evaluate(() => {
    const on = roundsOnClass();
    const never = ty => neverRows(ty).map(r => r.unit);
    const nL = never('LUBE'), nI = never('INSP');
    return {
      crnInsp: !!(on.CRN && on.CRN.has('INSP')),
      classOfCrn: PTS.classOf('CRN'),
      crnPts: !!(CLASSES.CRN && CLASSES.CRN.INSP && CLASSES.CRN.INSP.length),
      catMap: CAT2CLS['CRANE, MOBILE'],
      order: CLASS_ORDER.includes('CRN'),
      nI, nL,
      unclassed: unclassedCount(),
      tr60: ASSETS.filter(a => /TR60/i.test((a.m || '') + (a.mk || ''))).map(a => a.n),
      cranes: ASSETS.filter(a => a.cat === 'CRANE, MOBILE').map(a => a.n),
      ivecoLube: ASSETS.filter(a => a.cls === 'HT' && /IVECO/i.test(a.m || '')).map(a => a.n).filter(u => never('LUBE').includes(u)),
      kamazLube: ASSETS.filter(a => /KAMAZ/i.test(a.m || '')).map(a => a.n).filter(u => never('LUBE').includes(u)),
    };
  });
  ok('the crane class is on the general inspection', ph.crnInsp);
  ok('PTS knows the class by its code', ph.classOfCrn === 'CRN', ph.classOfCrn);
  ok('and the crane class has its walk lists (a crane\'s capture screen is not empty)', ph.crnPts);
  ok('the category maps to the class and the class is in the chooser', ph.catMap === 'CRN' && ph.order);
  ok('EVERY crane is proposed for the general inspection on a phone that has walked none',
     ph.cranes.every(u => ph.nI.includes(u)), ph.cranes.filter(u => !ph.nI.includes(u)).join(',') || ph.cranes.length + ' of ' + ph.cranes.length);
  ok('EVERY TR60 is proposed for the lubrication audit, though no truck has ever been walked on it',
     ph.tr60.every(u => ph.nL.includes(u)), ph.tr60.filter(u => !ph.nL.includes(u)).join(',') || ph.tr60.length + ' trucks');
  ok('the IVECO trucks (same class, no figure) are NOT dragged onto it', ph.ivecoLube.length === 0, ph.ivecoLube.join(','));
  ok('and the KAMAZ trucks stay held off', ph.kamazLube.length === 0, ph.kamazLube.join(','));

  /* The tick, on the real screen. */
  const tick = await p.evaluate(async () => {
    const unit = ASSETS.find(a => /TR60/i.test((a.m || '') + (a.mk || '')));
    type = 'LUBE'; curEquip = unit.n; eqClass = unit.cls;
    const k = String(lubeComps(unit.n)[0].k);
    draft = { positions: {} };
    curItem = k;
    const el = document.getElementById('lubeFilt'), samp = document.getElementById('lubeSamp');
    const box = id => { const e = document.getElementById(id); return e ? e.closest('label').getBoundingClientRect() : null; };
    return { unit: unit.n, k, exists: !!el, sampExists: !!samp,
             label: (el && el.closest('label') && el.closest('label').textContent.trim()) || '',
             sameParent: !!(el && samp && el.closest('label').parentElement === samp.closest('label').parentElement),
             follows: !!(el && samp && samp.closest('label').nextElementSibling === el.closest('label')) };
  });
  ok('the filtration tick exists on the audit screen', tick.exists);
  ok('it sits directly beside the oil-sample tick, in the same group', tick.sameParent && tick.follows);
  ok('it is worded for the fitter', /offline filtration/i.test(tick.label), tick.label);
  const ru = await p.evaluate(() => { const t0 = lang; lang = 'ru'; try { return t('lube_filt'); } finally { lang = t0; } });
  ok('and it has a Russian wording', /[Ѐ-ӿ]/.test(ru), ru);
  const saved = await p.evaluate(() => {
    /* Set up and tick inside ONE evaluation: the screen's own timers are free to
       rebuild the draft between two of them. */
    const unit = ASSETS.find(a => /TR60/i.test((a.m || '') + (a.mk || '')));
    type = 'LUBE'; curEquip = unit.n; eqClass = unit.cls;
    draft = { positions: {} }; curItem = String(lubeComps(unit.n)[0].k);
    const el = document.getElementById('lubeFilt');
    el.checked = true;
    saveCur();
    const k = curItem, ticked = !!(draft.positions[k] && draft.positions[k].filt);   // read NOW: the next save edits the same object
    el.checked = false; saveCur();
    return { tickedSaved: ticked, clearedGone: !draft.positions[k] };
  });
  ok('ticking it is kept on the position (even with nothing else recorded: it IS a record)', saved.tickedSaved);
  ok('un-ticking it removes it, leaving no phantom position', saved.clearedGone);
  ok('no page errors on the phone', !errs.length, errs.slice(0, 2).join(' | '));

  /* ── both office pages ─────────────────────────────────────────────────── */
  for (const [name, url] of [['dashboard', OFFICE], ['dashboard-next', NEXT]]) {
    console.log('\n── ' + name);
    const o = await b.newPage({ viewport: { width: 1366, height: 900 } });
    const oerr = [];
    o.on('pageerror', e => oerr.push(e.message));
    await o.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    await o.goto(url, { waitUntil: 'load' });
    await o.waitForTimeout(1500);
    const r = await o.evaluate(() => {
      const trk = ASSETS.filter(a => /TR60/i.test((a.m || '') + (a.mk || '')));
      const ivec = ASSETS.find(a => a.cls === 'HT' && /IVECO/i.test(a.m || ''));
      const never = ty => dueNeverRows(ty).map(r => r.unit);
      const nL = never('LUBE'), nI = never('INSP');
      const row = { ty: 'LUBE', iv: 30, ivh: null, perCls: [], byModel: DUE.byModel('LUBE') };
      return {
        tr60Days: trk.map(a => ivDaysFor('LUBE', a)),
        ivecoDays: ivec ? ivDaysFor('LUBE', ivec) : null,
        nLall: trk.every(a => nL.includes(a.n)),
        nIall: ASSETS.filter(a => a.cat === 'CRANE, MOBILE').every(a => nI.includes(a.n)),
        iveco: ivec ? nL.includes(ivec.n) : null,
        every: cvEvery(row),
        clsName: t('cls_CRN'),
        cmp: t('lube_filtered'),
        hpd: HPD(),
      };
    });
    ok(name + ': every TR60 is on a 500 h cycle in the coverage arithmetic', r.tr60Days.every(d => Math.abs(d - 500 / r.hpd) < 1e-9), r.tr60Days.slice(0, 3).join(','));
    ok(name + ': an IVECO truck of the same class is not (30 days carried)', r.ivecoDays === 30, String(r.ivecoDays));
    ok(name + ': every TR60 is on the never-inspected list for the audit', r.nLall);
    ok(name + ': the IVECO trucks are not', r.iveco === false, String(r.iveco));
    ok(name + ': every crane is on the never-inspected list for the general inspection', r.nIall);
    ok(name + ': the coverage row says 500 h and names the model, and says the rest differ',
       /500/.test(r.every) && /TR60/.test(r.every) && /other machines/.test(r.every), r.every);
    ok(name + ': the crane class has a name', r.clsName === 'Mobile crane', r.clsName);
    ok(name + ': the filtration wording exists for the position drawer', /filtration/i.test(r.cmp), r.cmp);
    ok(name + ': no page errors', !oerr.length, oerr.slice(0, 2).join(' | '));
    await o.close();
  }

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.join(', ') : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
