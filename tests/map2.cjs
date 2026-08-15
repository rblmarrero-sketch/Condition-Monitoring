/* Two things an inspector cannot work around on their own:
   a machine that is not in the asset register yet, and a defect picker that
   offers a coolant leak on an air-conditioning condenser. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const txt = async (p, s) => ((await p.textContent(s).catch(() => '')) || '').replace(/\s+/g, ' ').trim();

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?');

  console.log('a machine that arrived before the asset list caught up');
  ok('DR011 really is absent from the register', await p.evaluate(() => !ASSET_BY['DR011']));
  ok('DR001-DR010 are there', await p.evaluate(() =>
    ['DR001', 'DR005', 'DR010'].every(u => !!ASSET_BY[u])));
  await p.evaluate(() => { const s = document.getElementById('typeSel');
    s.value = 'INSP'; s.dispatchEvent(new Event('change')); });
  await p.waitForTimeout(350);
  await p.evaluate(() => selectEquip('DR011'));
  /* A fixed wait here was a flake: selectEquip re-renders the position strip
     asynchronously, and on a loaded machine 600 ms was sometimes short, leaving
     the assertions below reading "Tap to choose a unit…". Wait for the thing
     being asserted on instead of for a duration. */
  await p.waitForFunction(() => /DR011/.test((document.getElementById('posnav') || {}).textContent || ''),
                          null, { timeout: 15000 });
  const n = await p.evaluate(() => (componentsForUnit('DR011') || []).length);
  ok('it still gets a component list', n > 0, n + ' components');
  ok('and it is a drill\'s, taken from the prefix the register itself uses',
    await p.evaluate(() => {
      const c = componentsForUnit('DR011') || [];
      return c.some(x => /^(WE|CH)\./.test(x)) &&
        JSON.stringify(c) === JSON.stringify(CLASS_BY[HME.prefixClass.DR.c].components); }));
  ok('the app says out loud that this is a fallback, not a record',
    /not in the asset register/i.test(await txt(p, '#posnav')), await txt(p, '#posnav'));
  ok('it names the list being shown so a wrong guess is obvious',
    (await txt(p, '#posnav')).includes('DR011'));
  ok('a registered unit shows no such warning', await p.evaluate(async () => {
    selectEquip('DR005'); await new Promise(r => setTimeout(r, 400));
    return !document.querySelector('.guess'); }));
  ok('the evidence behind the guess is carried, not hidden',
    await p.evaluate(() => HME.prefixClass.DR.of === 10 && HME.prefixClass.DR.n === 6));
  ok('every unit prefix in the fleet can resolve one', await p.evaluate(() => {
    const pre = new Set(ASSETS.map(a => (/^([A-Za-z]+)/.exec(a.n) || [])[1]).filter(Boolean)
      .map(x => x.toUpperCase()));
    return [...pre].every(x => HME.prefixClass[x]); }));

  console.log('\nthe picker offers what the part can actually do');
  ok('an A/C condenser no longer leads with a coolant leak', await p.evaluate(() =>
    !defectsForComponent('AC.CND').some(d => d.code === 'FM-LEK-02')));
  ok('nor a fuel leak', await p.evaluate(() =>
    !defectsForComponent('AC.CND').some(d => d.code === 'FM-LEK-03')));
  ok('but it keeps the oil leak, which it really can do', await p.evaluate(() =>
    defectsForComponent('AC.CND').some(d => d.code === 'FM-LEK-01')));
  ok('a hydraulic valve keeps its oil leak and loses the coolant one',
    await p.evaluate(() => {
      const l = defectsForComponent('HOI.CV').map(d => d.code);
      return l.includes('FM-LEK-01') && !l.includes('FM-LEK-02'); }));
  ok('an engine keeps coolant AND fuel, because it has both',
    await p.evaluate(() => {
      const c = Object.keys(CX.c).find(k => /^DRS\.(ENG|EN)$/.test(k)) ||
        Object.keys(CX.c).find(k => (COMP_BY[k] || {}).en === 'Engine');
      if (!c) return true;
      const l = defectsForComponent(c).map(d => d.code);
      return l.includes('FM-LEK-02') && l.includes('FM-LEK-03'); }));
  ok('103 components were narrowed, 262 modes moved',
    await p.evaluate(() => Object.keys(CX.dm).length === 103 &&
      Object.values(CX.dm).reduce((a, x) => a + x.length, 0) === 262));

  console.log('  nothing was deleted — a real finding can still be recorded');
  ok('the demoted mode is still in the taxonomy',
    await p.evaluate(() => !!DEFECT_BY['FM-LEK-02']));
  ok('and "show all" still reaches it', await p.evaluate(() => {
    curItem = 'AC.CND'; showAllDefects = true; pickMode = 'defect';
    return pickerSource().some(o => o.k === 'FM-LEK-02'); }));
  ok('the component keeps the pair in the matrix, only the order changed',
    await p.evaluate(() => !!CX.c['AC.CND']['FM-LEK-02']));
  ok('and the full list is one flag away',
    await p.evaluate(() => defectsForComponent('AC.CND', null, true)
      .some(d => d.code === 'FM-LEK-02')));

  console.log('\nthe vibrator drum I added no longer claims an undercarriage');
  ok('CH.VD has no undercarriage wear mode', await p.evaluate(() =>
    !Object.keys(CX.c['CH.VD']).some(d => (DEFECT_BY[d] || {}).group === 'UC')));
  ok('but it kept the rest of the roller\'s list', await p.evaluate(() =>
    Object.keys(CX.c['CH.VD']).length > 20));

  console.log('\nno component was left with nothing to say');
  ok('every reachable component still offers at least one defect',
    await p.evaluate(() => {
      const reach = new Set();
      HME.equipmentClasses.forEach(c => (c.components || []).forEach(x => reach.add(x)));
      Object.values(HME.models || {}).forEach(l => l.forEach(x => reach.add(x)));
      return [...reach].every(c => defectsForComponent(c).length > 0); }));
  const narrow = await p.evaluate(() => {
    const reach = new Set();
    HME.equipmentClasses.forEach(c => (c.components || []).forEach(x => reach.add(x)));
    const n = [...reach].map(c => defectsForComponent(c).length).sort((a, b) => a - b);
    return { min: n[0], med: n[n.length >> 1], max: n[n.length - 1] }; });
  console.log(`  defects offered per component now: ${narrow.min} / ${narrow.med} / ${narrow.max}`);
  ok('the narrowest picker is still usable', narrow.min >= 8, narrow.min);

  await ctx.close(); await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
