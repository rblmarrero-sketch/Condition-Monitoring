/* Stage 2 / F4 — a Critical finding has to say what is wrong and what to do.
   Everything below drives the real form, not the draft object, so what is tested
   is what an inspector actually does. */
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) fails.push(n); };
const dlgOpen = p => p.evaluate(() => document.getElementById('dlg').open);
const dlgTxt = p => p.evaluate(() => document.getElementById('dlgTitle').textContent + ' | '
  + document.getElementById('dlgMsg').textContent);
const close = async p => { if (await dlgOpen(p)) { await p.click('#dlgOk'); await p.waitForTimeout(150); } };
const queued = p => p.evaluate(async () => (await dbAll()).length);
const curPos = p => p.evaluate(() => curItem);

async function app(b, lang) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) fails.push('CONSOLE ' + m.text()); });
  await p.addInitScript(l => { localStorage.setItem('up_dests', '[]');
    if (l) localStorage.setItem('lang', l); }, lang || '');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1100);
  return { ctx, p };
}
/* Fill the header the way the form is filled, then set one position's grade.
   The header folds itself once the unit and the name are both settled, so on
   any run after the first the name comes back from storage and the card is
   already folded — open it first, exactly as a person would. */
async function start(p, unit) {
  await p.evaluate(u => selectEquip(u), unit);
  await p.evaluate(() => { const b = document.getElementById('hdrSum');
    if (b && !b.classList.contains('hidden')) b.click(); });
  await p.waitForTimeout(150);
  await p.fill('#inspector', 'R. Marrero');
  await p.waitForTimeout(200);
}
const pick = (p, k) => p.evaluate(k => { saveCur(); curItem = k; loadPos(); renderChips(); }, k);
const setGrade = (p, g) => p.evaluate(g =>
  document.querySelector(`#gradeSeg [data-g="${g}"]`).click(), g);
const save = async p => { await p.click('#saveBtn'); await p.waitForTimeout(500); };

(async () => {
  const b = await chromium.launch();

  console.log('a Critical grade with nothing else filled in');
  let { ctx, p } = await app(b);
  await start(p, 'TKF401');
  const first = await p.evaluate(() => items()[0].k);
  await pick(p, first);
  await setGrade(p, 'X');                       // X = Critical
  await save(p);
  ok('the save is refused', (await queued(p)) === 0, `${await queued(p)} queued`);
  let d = await dlgTxt(p);
  ok('it says why', /Critical/i.test(d), d.slice(0, 90));
  ok('it names the position', new RegExp(first.replace('.', '\\.')).test(d), d.slice(0, 140));
  ok('it names the defect as missing', /a defect/.test(d), d);
  ok('it names the action as missing', /recommended action/.test(d), d);
  await close(p);

  console.log('\n  filling only one of the two is still not enough');
  await p.evaluate(() => { draft.positions[curItem].defect = 'DT14-03'; });
  await save(p);
  ok('still refused', (await queued(p)) === 0);
  d = await dlgTxt(p);
  ok('and only the action is asked for', /recommended action/.test(d) && !/a defect/.test(d), d);
  await close(p);

  console.log('\n  with both, it saves');
  await p.evaluate(() => { draft.positions[curItem].action = 'REP'; });
  await save(p);
  ok('saved', (await queued(p)) === 1, `${await queued(p)} queued`);
  ok('the confirmation is the normal one', /Saved/.test(await dlgTxt(p)), await dlgTxt(p));
  await close(p);
  await ctx.close();

  console.log('\nnothing below Critical is blocked');
  ({ ctx, p } = await app(b));
  await start(p, 'TKF402');
  for (const g of ['A', 'B', 'C']) {
    await p.evaluate(() => resetForm());
    await start(p, 'TKF402' + g);
    const k = await p.evaluate(() => items()[0].k);
    await pick(p, k);
    await setGrade(p, g);
    await save(p);
    ok(`grade ${g} saves with no defect or action`, /Saved/.test(await dlgTxt(p)), await dlgTxt(p));
    await close(p);
  }
  ok('all three are in the queue', (await queued(p)) === 3, `${await queued(p)} queued`);
  await ctx.close();

  console.log('\nseverity raised by hand is held to the same rule');
  ({ ctx, p } = await app(b));
  await start(p, 'TKF403');
  const k3 = await p.evaluate(() => items()[0].k);
  await pick(p, k3);
  await setGrade(p, 'B');                            // B alone would save
  /* Severity is derived now, so the way a Critical arrives is the grade. The
     old shape of this test wrote sev='CRI' beside grade='B' directly, which is
     the contradiction the derivation exists to make unrepresentable. */
  await setGrade(p, 'X');
  await save(p);
  ok('a hand-raised Critical is refused too', (await queued(p)) === 0, `${await queued(p)} queued`);
  ok('with the same explanation', /Critical/i.test(await dlgTxt(p)), await dlgTxt(p));
  await close(p);
  await ctx.close();

  console.log('\nit takes you to the position that needs work');
  ({ ctx, p } = await app(b));
  await start(p, 'TKF404');
  const all = await p.evaluate(() => items().map(i => i.k));
  await pick(p, all[0]); await setGrade(p, 'A');
  await pick(p, all[2]); await setGrade(p, 'X');
  await pick(p, all[1]); await setGrade(p, 'B');     // sitting somewhere else when Save is pressed
  ok('standing on a different position', (await curPos(p)) === all[1], await curPos(p));
  await save(p);
  ok('the save is refused', (await queued(p)) === 0);
  ok('and the form jumped to the critical one', (await curPos(p)) === all[2],
    `${await curPos(p)} — expected ${all[2]}`);
  ok('the grade buttons show that position', await p.evaluate(() =>
    !!document.querySelector('#gradeSeg [data-g="5"].on')));
  ok('the earlier positions were not lost', await p.evaluate(([a, c]) =>
    draft.positions[a] && draft.positions[a].grade === 'A' &&
    draft.positions[c] && draft.positions[c].grade === 'B', [all[0], all[1]]));
  await close(p);
  await ctx.close();

  console.log('\nRussian');
  ({ ctx, p } = await app(b, 'ru'));
  await start(p, 'TKF405');
  await pick(p, await p.evaluate(() => items()[0].k));
  await setGrade(p, 'X');
  await save(p);
  d = await dlgTxt(p);
  ok('the refusal is translated', /Критично/.test(d), d.slice(0, 80));
  ok('and so are the missing fields', /дефект/.test(d) && /действие/.test(d), d);
  ok('no English left', !/a defect|recommended action/.test(d), d);
  await close(p);
  await ctx.close();

  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
