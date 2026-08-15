/* The v4 matrix, checked through the running app rather than against the JSON.
   Checks (a)–(f) are the ones the integration brief names; the rest are what a
   reliability engineer would want to know before letting inspectors near it. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8094';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };

async function app(b, lang) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(l => { localStorage.setItem('up_dests', '[]');
    if (l) localStorage.setItem('lang', l); }, lang || '');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  return { ctx, p };
}
const insp = async p => { await p.evaluate(() => { document.getElementById('typeSel').value = 'INSP';
  document.getElementById('typeSel').dispatchEvent(new Event('change')); }); await p.waitForTimeout(250); };
const at = async (p, unit, code) => { await p.evaluate(u => selectEquip(u), unit); await p.waitForTimeout(250);
  if (code) { await p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, code); await p.waitForTimeout(150); } };

(async () => {
  const b = await chromium.launch();
  let { ctx, p } = await app(b);

  console.log('the data actually loaded');
  ok('no missing-data warning', (await p.evaluate(() => document.getElementById('dataWarn').classList.contains('hidden'))));
  ok('matrix version 4', (await p.evaluate(() => HME.version)) === '4.0.0', await p.evaluate(() => HME.version));
  ok('263 components, 114 modes, 495 causes', await p.evaluate(() =>
    HME.components.length === 263 && HME.defectTypes.length === 114 && HME.directCauses.length === 495),
    await p.evaluate(() => `${HME.components.length}/${HME.defectTypes.length}/${HME.directCauses.length}`));

  console.log('\n(a) every component the UI can offer exists in the matrix');
  const a = await p.evaluate(() => {
    const bad = [];
    for (const e of HME.equipmentClasses) for (const c of e.components)
      if (!HME.components.some(x => x.code === c)) bad.push(e.name + ' → ' + c);
    for (const [k, cs] of Object.entries(HME.models)) for (const c of cs)
      if (!HME.components.some(x => x.code === c)) bad.push(k + ' → ' + c);
    return bad;
  });
  ok('no class or model offers an unknown component', a.length === 0, a.slice(0, 3).join(' | '));
  const cov = await p.evaluate(() => ASSETS.filter(u => !componentsForUnit(u.n)).map(u => u.n));
  ok('every unit resolves to a component list', cov.length === 0, `${cov.length} without one: ` + cov.slice(0, 5).join(' '));

  console.log('\n(b) no cascade lookup can come back empty');
  const bres = await p.evaluate(() => {
    let pairs = 0, empty = 0, noSpecific = 0, genShown = 0;
    for (const comp of Object.keys(CX.c)) for (const fm of Object.keys(CX.c[comp])) {
      pairs++;
      const r = causesFor(comp, fm);
      if (!r.primary.length && !r.general.length) empty++;
      if (!r.primary.length) { noSpecific++; if (r.general.length) genShown++; }
    }
    return { pairs, empty, noSpecific, genShown };
  });
  ok('no pair returns nothing', bres.empty === 0, `${bres.empty} of ${bres.pairs}`);
  ok('where there is nothing specific, the general list still answers',
    bres.noSpecific === bres.genShown, `${bres.noSpecific} such pairs, ${bres.genShown} answered`);
  // and the picker must not hide them behind an expander over an empty box
  await insp(p); await at(p, 'TK146', 'CH.FR');
  const hollow = await p.evaluate(() => {
    // a pair with no rank<=2 cause at all
    let found = null;
    for (const fm of Object.keys(CX.c['CH.FR'])) { const r = causesFor('CH.FR', fm);
      if (!r.primary.length && r.general.length) { found = fm; break; } }
    if (!found) return { skip: true };
    curP().defect = found; showAllCauses = false; pickMode = 'cause';
    const src = pickerSource();
    return { fm: found, n: src.length, more: src.some(o => o.k === '__more__') };
  });
  ok('a pair with no specific cause opens its general list',
    hollow.skip || (!hollow.more && hollow.n > 1), JSON.stringify(hollow));

  console.log('\n(c) every user-visible record has both languages');
  const c = await p.evaluate(() => {
    const bad = [];
    const chk = (n, rows) => rows.forEach(r => { if (!r.en || !r.ru) bad.push(n + ':' + (r.code || r.k)); });
    chk('components', HME.components); chk('defectTypes', HME.defectTypes);
    chk('directCauses', HME.directCauses); chk('systems', HME.systems);
    chk('severity', HME.severity); chk('grade', HME.grade);
    chk('action', HME.action); chk('detection', HME.detection);
    chk('defectTypeGroups', HME.defectTypeGroups); chk('directCauseGroups', HME.directCauseGroups);
    return bad;
  });
  ok('no record is missing en or ru', c.length === 0, c.slice(0, 5).join(' '));

  console.log('\n(d) the regression this matrix exists to prevent');
  ok("a Frame is not offered a ground-engaging-tool mode",
    !(await p.evaluate(() => defectsForComponent('CH.FR').some(d => d.code === 'FM-GET-01'))));
  ok('nor a tyre mode', !(await p.evaluate(() => defectsForComponent('CH.FR').some(d => d.group === 'TYR'))));
  ok('nor a drilling mode', !(await p.evaluate(() => defectsForComponent('CH.FR').some(d => d.group === 'DRL'))));
  const leaky = await p.evaluate(() => HME.components
    .filter(x => x.system === 'AU' || x.system === 'ELS')
    .map(x => ({ c: x.code, n: x.en, k: (CX.c[x.code] ? Object.keys(CX.c[x.code]) : []).filter(f => /^FM-LEK/.test(f)).length }))
    .filter(x => x.k));
  ok('no fluid-leak mode on a control, GPS, camera or ECU component',
    !leaky.some(x => /control|gps|camera|telemat|ecu|aerial|transceiver|lamp|alarm|cabinet/i.test(x.n)),
    JSON.stringify(leaky));

  console.log('\n(e) four cascades, end to end');
  for (const [comp, fm] of [['CH.FR', 'FM-MEC-04'], ['COO.RAD', 'FM-TMP-01'],
                            ['UC.FRT', 'FM-TYR-01'], ['FUE.INJ', 'FM-PER-04']]) {
    const r = await p.evaluate(([c, f]) => {
      const x = causesFor(c, f);
      return { comp: compLabel(c), fm: (DEFECT_BY[f] || {}).en,
               p: x.primary.map(y => y.en), g: x.general.length };
    }, [comp, fm]);
    ok(`${comp} + ${fm}`, !!r.fm && r.p.length + r.g > 0,
      `${r.comp} · ${r.fm} → ${r.p.length} specific, ${r.g} general`);
    console.log('           ' + (r.p.slice(0, 4).join(' · ') || '(none specific)'));
  }

  console.log('\n(f) a model narrows its equipment class');
  const f = await p.evaluate(() => ({
    model: HME.models['NHL|TR60'].length,
    cls: HME.equipmentClasses.find(e => e.name === 'TRUCK, DUMP').components.length,
    unit: (() => { selectEquip('TK146'); return componentsForUnit('TK146').length; })(),
  }));
  ok('NHL TR60 carries fewer components than TRUCK, DUMP', f.model < f.cls, `${f.model} vs ${f.cls}`);
  ok('and a TR60 unit is given the model list', f.unit === f.model, `${f.unit} vs ${f.model}`);
  const noModel = await p.evaluate(() => {
    const u = ASSETS.find(x => !x.mk && x.cat === 'TRUCK, DUMP');
    return u ? { n: u.n, len: componentsForUnit(u.n).length } : null;
  });
  ok('a unit with no model recorded falls back to its class, not to nothing',
    !noModel || noModel.len === f.cls, JSON.stringify(noModel));

  console.log('\nthe rank rule');
  const rank = await p.evaluate(() => {
    curEquip = 'TK146'; curItem = 'COO.RAD'; draft.positions = { 'COO.RAD': { defect: 'FM-TMP-01' } };
    showAllCauses = false; pickMode = 'cause';
    const shut = pickerSource();
    showAllCauses = true;
    const open = pickerSource();
    const all = causesFor('COO.RAD', 'FM-TMP-01');
    return { shut: shut.length, open: open.length, more: shut.some(o => o.k === '__more__'),
             specific: all.primary.length, general: all.general.length };
  });
  ok('the general causes start behind an expander', rank.more);
  ok('closed, only the specific ones show', rank.shut === rank.specific + 2,
    `${rank.shut} rows for ${rank.specific} specific + blank + expander`);
  ok('opened, the general ones appear', rank.open === rank.specific + rank.general + 1,
    `${rank.open} rows for ${rank.specific}+${rank.general}`);

  console.log('\nhistory still reads');
  const legacy = await p.evaluate(() => ({
    defect: defectLabel('DT1-01'), cause: causeLabel('DC-ERC-001'),
    comp: compLabel('DRS.COO.RAD'), action: actionLabel('NOW'),
    retired: causeLabel('DC-UC-011'),
    unchanged: (() => { const n = Object.keys(HME.legacy.defects).length
      + Object.keys(HME.legacy.causes).length + Object.keys(HME.legacy.components).length; return n; })(),
  }));
  ok('an old defect code still names its defect', !/^DT1-01$/.test(legacy.defect), legacy.defect);
  ok('an old cause code still names its cause', !/^DC-ERC-001$/.test(legacy.cause), legacy.cause);
  ok('an old component code still names its component', legacy.comp === 'Radiator', legacy.comp);
  ok('an old action code still names its action', !/^NOW$/.test(legacy.action), legacy.action);
  ok('a retired code keeps the wording the inspector saw', legacy.retired === 'Track derailed', legacy.retired);
  ok('the map covers what it should', legacy.unchanged > 300, String(legacy.unchanged));

  console.log('\nthe detection method');
  ok('the field is on the form', await p.evaluate(() => !!document.getElementById('detectBtn')));
  ok('it defaults to visual inspection',
    /visual/i.test(await p.textContent('#detectBtn')), await p.textContent('#detectBtn'));
  ok('oil analysis and vibration are offered', await p.evaluate(() =>
    HME.detection.some(d => /oil/i.test(d.en)) && HME.detection.some(d => /vibration/i.test(d.en))));
  ok('a saved position records it', await p.evaluate(async () => {
    resetForm(); selectEquip('TK146');
    document.getElementById('inspector').value = 'R. Marrero';
    curItem = 'CH.FR'; curP().grade = 'B'; saveCur();
    document.getElementById('saveBtn').click();
    await new Promise(r => setTimeout(r, 600));
    const all = await dbAll();
    return all.some(r => Object.values(r.positions).some(x => x.detect === 'DM-02'));
  }));
  await ctx.close();

  console.log('\nRussian');
  ({ ctx, p } = await app(b, 'ru'));
  await insp(p); await at(p, 'TK146', 'CH.FR');
  const ru = await p.evaluate(() => ({
    comp: compLabel('CH.FR'), def: defectLabel('FM-MEC-04'),
    cause: causeLabel('DC-STR-007'), det: detectLabel('DM-02'), act: actionLabel('RA-06'),
  }));
  ok('components are translated', /[А-Яа-я]/.test(ru.comp), ru.comp);
  ok('defects are translated', /[А-Яа-я]/.test(ru.def), ru.def);
  ok('causes are translated', /[А-Яа-я]/.test(ru.cause), ru.cause);
  ok('detection methods are translated', /[А-Яа-я]/.test(ru.det), ru.det);
  ok('actions are translated', /[А-Яа-я]/.test(ru.act), ru.act);
  await ctx.close();

  console.log('\nthe compactor drum the register does not have');
  ({ ctx, p } = await app(b));
  await insp(p);
  const cd = await p.evaluate(() => {
    const u = ASSETS.find(x => x.cat === 'COMPACTOR, ROLLER DRUM');
    if (!u) return { skip: true };
    selectEquip(u.n);
    const has = componentsForUnit(u.n).includes('CH.VD');
    return { unit: u.n, has, defects: defectsForComponent('CH.VD').length,
             label: compLabel('CH.VD'), local: !!(HME.components.find(c => c.code === 'CH.VD') || {}).local };
  });
  ok('a compactor is still offered its vibrator', cd.skip || cd.has, JSON.stringify(cd));
  ok('and the vibrator has failure modes to record', cd.skip || cd.defects > 20, String(cd.defects));
  ok('it is marked as local, not as register data', cd.skip || cd.local === true);
  await ctx.close();

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
