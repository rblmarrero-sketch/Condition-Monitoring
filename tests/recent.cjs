/* Finding the machine you are standing next to.

   The picker holds 1,128 units. An inspector's actual working set is a handful
   — the line they are walking today, the truck they came back to because the
   camera failed the first time, the dozer they do MP and then UC on. Every one
   of those is a scroll or a typed code through a list of a thousand others.

   Two of the five things the walkthrough scan found land here:

     · STARTING  — no recently-used list; 1,128 units and no shortcut
     · AFTER SAVE — the form clears, correctly, and the unit is simply gone;
                    the second round on the same machine starts with the hunt

   The fix is one list, not two features: the machines this phone has worked on
   sort to the top of the picker under their own heading. Filing a round still
   clears the form — a form that keeps its unit invites a second inspection
   filed against a machine nobody re-checked — but the unit is one tap away
   instead of a thousand.

   What is guarded here is mostly what it must NOT do: never invent a choice,
   never show a machine this round cannot be done on, never list the same unit
   twice, and never grow without bound.
*/
const { chromium } = require(require('./pw.cjs'));
const B = 'http://127.0.0.1:8093';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

/* What the picker shows, in order, with the heading each row sits under. */
const LIST = () => [...document.querySelectorAll('#pickList .pickitem')].map(b => ({
  k: b.dataset.k,
  grp: (b.querySelector('.pickgrp') || {}).textContent || '',
}));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('up_dests', '[]');
    localStorage.setItem('inspector', 'R. Marrero');
    localStorage.setItem('insp_type', 'UC');
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p.waitForTimeout(400);

  console.log('a phone that has never been used');
  const fresh = await p.evaluate(L => { openPicker('equip'); const l = eval(L)(); closePicker();
    return { n: l.length, heads: [...new Set(l.slice(0, 5).map(x => x.grp))] }; }, '(' + LIST + ')');
  /* The picker opens on the remembered category, so this is that category's
     eligible machines, not all 1,128 — the point is only that the ordinary
     list is intact before any shortcut exists. */
  ok('the ordinary list is intact', fresh.n > 20, fresh.n + ' rows');
  ok('and nothing claims to be recent yet',
     !fresh.heads.some(h => /recent|недавн/i.test(h)), fresh.heads.join(' | '));

  console.log('\nafter working on three machines');
  const three = await p.evaluate(async () => {
    const st = [];
    for (const u of ['DZ001', 'DZ002', 'DZ003']) { selectEquip(u); st.push(curEquip); }
    return st;
  });
  note('worked', three.join(', '));
  const after = await p.evaluate(L => { openPicker('equip'); const l = eval(L)(); closePicker();
    const head = l.find(x => /recent|недавн/i.test(x.grp));
    const top = l.filter(x => x.grp === (head || {}).grp).map(x => x.k);
    return { top, first: l.slice(0, 6).map(x => x.k), heading: (head || {}).grp || '' };
  }, '(' + LIST + ')');
  ok('they are at the top of the picker', after.top.length === 3, after.top.join(','));
  ok('under a heading that says what they are', /recent|недавн/i.test(after.heading), after.heading);
  ok('most recent first — the machine you just left is row one',
     after.top.join(',') === 'DZ003,DZ002,DZ001', after.top.join(','));

  console.log('\nsaid once, listed once');
  const twice = await p.evaluate(L => { selectEquip('DZ002');
    openPicker('equip'); const l = eval(L)(); closePicker();
    const c = {}; l.forEach(x => c[x.k] = (c[x.k] || 0) + 1);
    const dup = Object.entries(c).filter(([, n]) => n > 1);
    const head = l.find(x => /recent|недавн/i.test(x.grp));
    return { dup, top: l.filter(x => x.grp === (head || {}).grp).map(x => x.k) };
  }, '(' + LIST + ')');
  ok('no unit appears twice', twice.dup.length === 0, JSON.stringify(twice.dup));
  ok('revisiting one moves it to the front rather than adding it',
     twice.top.join(',') === 'DZ002,DZ003,DZ001', twice.top.join(','));

  console.log('\nsearch still searches the fleet');
  const searched = await p.evaluate(L => { openPicker('equip');
    document.getElementById('pickSearch').value = 'DZ01';
    renderPickList('DZ01'); const l = eval(L)(); closePicker();
    return l.map(x => x.k).filter(k => !/^__/.test(k)); }, '(' + LIST + ')');
  ok('a typed code reaches units that were never recent',
     searched.length > 0 && searched.every(k => /DZ01/i.test(k)),
     searched.slice(0, 6).join(',') + (searched.length > 6 ? ' …' : ''));

  /* The shortcut must not smuggle a machine past the eligibility filter. The
     naive version of this test — "are the rows it shows eligible" — passes
     trivially, because the recents are sorted inside a list that is already
     filtered. Prove it by planting a machine that IS worked on and IS NOT
     eligible for the round in front of us, then looking for it. */
  console.log('\nit never offers a machine the round cannot be done on');
  const cross = await p.evaluate(async L => {
    const s = document.getElementById('typeSel');
    const setRound = r => { s.value = r; s.dispatchEvent(new Event('change')); };
    const canDo = r => { setRound(r); return ASSETS.map(a => a.n).filter(n => eligible(n)); };
    /* Find any pair of rounds and a machine that one can do and the other
       cannot — rather than assuming which pair that is. */
    const rounds = ['UC', 'GET', 'TB'];
    const sets = {}; rounds.forEach(r => sets[r] = new Set(canDo(r)));
    let work = null, other = null, odd = null;
    for (const a of rounds) for (const bb of rounds) {
      if (a === bb || odd) continue;
      const f = [...sets[a]].find(n => !sets[bb].has(n));
      if (f) { work = a; other = bb; odd = f; }
    }
    if (!odd) return { skip: 'no machine separates any two rounds' };
    setRound(work); selectEquip(odd);        /* worked on, now recent */
    setRound(other);
    eqCat = 'ALL';                           /* widest possible list */
    openPicker('equip'); const l = eval(L)(); closePicker();
    return { odd, work, other, present: l.some(x => x.k === odd), rows: l.length };
  }, '(' + LIST + ')');
  if (cross.skip) ok('a machine that separates two rounds was found to plant', false, cross.skip);
  else ok('a machine the round cannot touch stays out of its picker, recent or not',
          !cross.present, cross.odd + ' is a ' + cross.work + ' machine, absent from ' +
          cross.other + '’s ' + cross.rows + ' rows: ' + !cross.present);

  console.log('\nthe list stays short enough to be a shortcut');
  const capped = await p.evaluate(L => {
    const s = document.getElementById('typeSel'); s.value = 'UC';
    s.dispatchEvent(new Event('change'));
    const ok0 = ASSETS.map(a => a.n).filter(n => eligible(n)).slice(0, 20);
    ok0.forEach(n => selectEquip(n));
    openPicker('equip'); const l = eval(L)(); closePicker();
    const head = l.find(x => /recent|недавн/i.test(x.grp));
    return { used: ok0.length, top: head ? l.filter(x => x.grp === head.grp).length : 0 };
  }, '(' + LIST + ')');
  ok('twenty machines worked, the shortcut does not become a second fleet list',
     capped.top > 0 && capped.top <= 8, capped.top + ' of ' + capped.used + ' kept');

  console.log('\nand it survives the phone being closed');
  await p.close();
  const p2 = await ctx.newPage();
  await p2.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p2.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 30000 });
  await p2.waitForTimeout(400);
  const persisted = await p2.evaluate(L => { openPicker('equip'); const l = eval(L)(); closePicker();
    const head = l.find(x => /recent|недавн/i.test(x.grp));
    return head ? l.filter(x => x.grp === head.grp).map(x => x.k) : []; }, '(' + LIST + ')');
  ok('yesterday\'s machines are still at the top this morning', persisted.length > 0,
     persisted.join(',') || 'none');

  console.log('\nand a filed round leaves the machine one tap away');
  const filed = await p2.evaluate(async L => {
    selectEquip('DZ001');
    const k = ucOrder()[0]; saveCur(); curItem = k; loadPos();
    const f = document.getElementById('ucMM');
    f.value = '40'; f.dispatchEvent(new Event('input', { bubbles: true })); saveCur();
    document.getElementById('saveBtn').click();
    await new Promise(r => setTimeout(r, 900));
    const d = document.getElementById('dlg'); if (d.open) document.getElementById('dlgOk').click();
    await new Promise(r => setTimeout(r, 300));
    openPicker('equip'); const l = eval(L)(); closePicker();
    return { cleared: curEquip, first: l.filter(x => !/^__/.test(x.k))[0] };
  }, '(' + LIST + ')');
  ok('the form still clears, so nothing is filed twice by accident',
     !filed.cleared, filed.cleared || 'cleared');
  ok('and the machine just filed is the first row of the picker',
     filed.first && filed.first.k === 'DZ001', JSON.stringify(filed.first));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
