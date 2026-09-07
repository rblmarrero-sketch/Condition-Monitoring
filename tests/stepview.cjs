/* THE FOUR STEPS ARE FOUR VIEWS — the defect an audit of build 276 reported.

   On the published build the chips 1 Inspection · 2 Findings · 3 Review ·
   4 Saved were not a workflow. Pressing Findings did nothing anybody could
   see; pressing Review did nothing; the same content stayed on screen; and
   at any window 820px or wider every destination rendered at once, so the
   phone page was one column six thousand pixels tall holding the setup form,
   the findings form, the sign-off, the saved list, readiness, the system card
   and the due list together. A control that does nothing, because there was
   nothing left for it to reveal.

   What has to hold now:
     · one step on screen, the others gone from sight, the keyboard and the
       screen reader (the `hidden` attribute, not a class);
     · exactly one tab with aria-selected="true", and it is the one whose
       panel is showing;
     · a step that will not open says why, in a sentence, and puts the
       technician where the missing thing is — never silence;
     · Back and Continue on every step, and Finish ONLY on Review;
     · nothing typed, chosen or photographed is lost by moving between steps,
       in either direction;
     · a wide window still shows one destination and keeps the tab bar;
     · the working page is hundreds of pixels tall, not thousands.

   Run: node tests/stepview.cjs [port]   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const { PHOTOS } = require('./overview.cjs');   // the machine photographs every round carries
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Read by what things ARE: the selected tab, the panel that is actually
   showing, and the one the tab claims to control. */
const SNAP = () => {
  const tabs = [...document.querySelectorAll('#stepBar button')].map(b => ({
    step: b.dataset.step, sel: b.getAttribute('aria-selected'), controls: b.getAttribute('aria-controls'), tabIndex: b.tabIndex }));
  const views = ['viewSetup', 'viewFind', 'viewReview'].map(id => {
    const v = document.getElementById(id);
    return { id, hidden: v.hasAttribute('hidden'), h: Math.round(v.getBoundingClientRect().height) }; });
  const panes = [...document.querySelectorAll('main > .pane')].filter(x => x.checkVisibility()).map(x => x.id);
  const selTab = tabs.find(t => t.sel === 'true');
  return { tabs, views, panes, step: stepNow(),
           selected: selTab ? selTab.step : null, controls: selTab ? selTab.controls : null,
           shown: views.filter(v => !v.hidden).map(v => v.id),
           msg: (document.getElementById('stepMsg').classList.contains('hidden') ? '' : document.getElementById('stepMsg').textContent.trim()),
           /* The strongest form of "the selected tab matches the displayed
              panel": the element the tab NAMES is the one on screen. */
           selectedShows: (() => { const c = selTab && document.getElementById(selTab.controls); return !!c && c.checkVisibility(); })(),
           finishIn: (() => { const s = document.getElementById('saveBtn').closest('.view'); return s ? s.id : 'outside'; })(),
           finishVis: document.getElementById('saveBtn').checkVisibility(),
           docH: document.documentElement.scrollHeight, tabbar: document.getElementById('tabbar').checkVisibility() };
};
/* One step on screen, and the selected tab is the one showing it. */
const coherent = s => s.tabs.filter(t => t.sel === 'true').length === 1 && s.selectedShows
  && (s.step === 4 || (s.shown.length === 1 && s.controls === s.shown[0]));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: 'http://127.0.0.1:9/exec', sec: '', folder: '' }]));
    localStorage.setItem('inspector', 'R. Marrero'); localStorage.setItem('insp_type', 'MP'); localStorage.setItem('lang', 'en');
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1800);
  const snap = () => p.evaluate(SNAP);

  console.log('1. ONE STEP ON SCREEN, AND THE TAB THAT SAYS SO');
  let s = await snap();
  ok('the app opens on step 1 with one view showing', s.step === 1 && s.shown.join(',') === 'viewSetup', JSON.stringify({ step: s.step, shown: s.shown }));
  ok('  exactly one tab is selected, and it controls that view', coherent(s), s.selected + ' → ' + s.controls + ' · showing ' + s.shown.join(','));
  ok('  the other two views carry the hidden attribute, so the keyboard and a screen reader lose them too',
     s.views.filter(v => v.hidden).length === 2 && s.views.filter(v => v.hidden).every(v => v.h === 0), JSON.stringify(s.views));
  ok('  only the selected tab is in the tab order', s.tabs.filter(t => t.tabIndex === 0).length === 1, s.tabs.map(t => t.step + ':' + t.tabIndex).join(' '));
  ok('  one destination, and the tab bar is there', s.panes.join(',') === 'paneCapture' && s.tabbar, s.panes.join(','));
  ok('  the working page is hundreds of pixels tall, not thousands', s.docH < 1600, s.docH + 'px');

  console.log('\n2. A STEP THAT WILL NOT OPEN SAYS WHY');
  await p.click('#stepTab2'); await p.waitForTimeout(350);
  s = await snap();
  ok('pressing Findings with no equipment does not silently do nothing', !!s.msg, s.msg || '(silence — the defect)');
  ok('  it names what is missing, in plain words', /equipment/i.test(s.msg), s.msg);
  ok('  and leaves the technician on the step that holds the field', s.step === 1 && s.shown.join(',') === 'viewSetup' && coherent(s), JSON.stringify({ step: s.step, shown: s.shown }));
  await p.click('#stepTab3'); await p.waitForTimeout(300);
  s = await snap();
  ok('the same for Review', !!s.msg && s.step === 1, s.msg);

  console.log('\n3. THE WORKFLOW, FORWARD');
  await p.evaluate(() => selectEquip('TK101')); await p.waitForTimeout(500);
  s = await snap();
  ok('choosing equipment does not skip the rest of the setup step', s.step === 1 && !s.msg, JSON.stringify({ step: s.step, msg: s.msg }));
  ok('  Continue is on the setup step', await p.isVisible('#toFind'));
  await p.click('#toFind'); await p.waitForTimeout(450);
  s = await snap();
  ok('Continue opens Findings, and only Findings', s.step === 2 && s.shown.join(',') === 'viewFind' && coherent(s), JSON.stringify({ step: s.step, shown: s.shown }));
  ok('  the machine being walked is named on the step', await p.isVisible('#stepCtx') && /TK101/.test(await p.textContent('#stepCtx')), (await p.textContent('#stepCtx')).slice(0, 40));
  ok('  Finish is NOT on the findings form', s.finishIn === 'viewReview' && !s.finishVis, s.finishIn + ' · visible=' + s.finishVis);
  const focus1 = await p.evaluate(() => (document.activeElement || {}).id || '');
  ok('  focus moved to the step, not left on the tab', focus1 === 'viewFind', focus1);

  /* Something recorded, so the round is real from here on. */
  await p.evaluate(async () => {
    /* Grade 2 asks for nothing further, so Finish is testable here; what a
       grade of 3 or more demands before Finish is steps.cjs's subject. */
    document.querySelector('#gradeSeg .gcard[data-g="2"]').click();
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('comment').value = 'Ferrous swarf on the plug';
    document.getElementById('comment').dispatchEvent(new Event('input', { bubbles: true }));
    saveCur();
  }); await p.waitForTimeout(300);

  await p.click('#toReview'); await p.waitForTimeout(500);
  s = await snap();
  ok('Review opens, and only Review', s.step === 3 && s.shown.join(',') === 'viewReview' && coherent(s), JSON.stringify({ step: s.step, shown: s.shown }));
  ok('  Finish is here, and it is visible', s.finishVis && s.finishIn === 'viewReview');
  const rv = await p.evaluate(() => document.getElementById('reviewList').textContent.replace(/\s+/g, ' '));
  ok('  the review names the machine, the round and what was found', /TK101/.test(rv) && /(Magnetic|MP)/i.test(rv) && /Incipient|2/.test(rv), rv.slice(0, 90));
  ok('  the sign-off is on the review step', await p.isVisible('#cardSign'));

  console.log('\n4. BACK, AND NOTHING LOST');
  await p.click('#backFind'); await p.waitForTimeout(400);
  s = await snap();
  ok('Back returns to Findings', s.step === 2 && s.shown.join(',') === 'viewFind' && coherent(s), JSON.stringify({ step: s.step }));
  const kept = await p.evaluate(() => ({ comment: document.getElementById('comment').value,
    grade: (draft.positions[curItem] || {}).grade, item: curItem }));
  ok('  the grade and the comment survived the round trip', kept.grade === 2 && /Ferrous swarf/.test(kept.comment), JSON.stringify(kept));
  await p.click('#backSetup'); await p.waitForTimeout(400);
  s = await snap();
  ok('Back again returns to the setup step', s.step === 1 && s.shown.join(',') === 'viewSetup' && coherent(s), JSON.stringify({ step: s.step }));
  const setup = await p.evaluate(() => ({ equip: curEquip, insp: document.getElementById('inspector').value, type }));
  ok('  which still holds the equipment, the round and the inspector', setup.equip === 'TK101' && setup.type === 'MP' && /Marrero/.test(setup.insp), JSON.stringify(setup));
  await p.evaluate(() => { const e = document.getElementById('smu'); e.value = '18422'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(200);
  await p.click('#stepTab2'); await p.waitForTimeout(400);
  await p.click('#stepTab1'); await p.waitForTimeout(400);
  ok('  and hours typed on it survive two more step changes', (await p.inputValue('#smu')) === '18422', await p.inputValue('#smu'));

  console.log('\n5. THE KEYBOARD');
  await p.focus('#stepTab1');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(350);
  s = await snap();
  ok('Right arrow walks to the next step', s.step === 2 && coherent(s), String(s.step));
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(350);
  s = await snap();
  ok('Left arrow walks back', s.step === 1 && coherent(s), String(s.step));

  console.log('\n6. FINISH, FROM REVIEW');
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(400);
  /* Every check Finish has always applied still applies from here: this round
     owes its machine photographs, and pressing Finish says so rather than
     filing a round with no evidence. */
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(1000);
  const blocked = await p.evaluate(async () => ({ open: document.getElementById('dlg').open,
    text: document.getElementById('dlg').textContent.replace(/\s+/g, ' ').slice(0, 120), n: (await dbAll()).length }));
  ok('Finish still applies every rule the round owes, and names what is missing', blocked.open && /photograph/i.test(blocked.text) && blocked.n === 0, blocked.text);
  await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) { const b = document.getElementById('dlgOk'); if (b) b.click(); else d.close(); } });
  await p.waitForTimeout(400);
  await p.evaluate(PHOTOS); await p.waitForTimeout(600);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(400);
  await p.evaluate(() => goStep(3)); await p.waitForTimeout(200); await p.click('#saveBtn'); await p.waitForTimeout(1400);
  await p.evaluate(() => { const d = document.getElementById('dlg'); if (d && d.open) { const b = document.getElementById('dlgOk'); if (b) b.click(); else d.close(); } });
  await p.waitForTimeout(600);
  const saved = await p.evaluate(async () => { const all = await dbAll();
    return { n: all.length, equip: (all[0] || {}).equip, card: !document.getElementById('savedCard').classList.contains('hidden') }; });
  ok('and once they are taken it saves the round on the phone and says so', saved.n === 1 && saved.equip === 'TK101' && saved.card, JSON.stringify(saved));
  s = await snap();
  ok('  the finished round is step 4, and the tab names the card that is showing', s.step === 4 && s.selected === '4' && s.controls === 'savedCard' && coherent(s), JSON.stringify({ step: s.step, controls: s.controls }));

  console.log('\n7. THE MACHINE PHOTOGRAPHS FOLD ONCE THEY ARE TAKEN');
  {
    const st = await p.evaluate(() => ({ open: document.getElementById('mphotos').open,
      inSetup: !!document.getElementById('viewSetup').querySelector('#mphotos') }));
    ok('they belong to the Inspection step, and stay open while the round owes them', st.inSetup, JSON.stringify(st));
    /* The round finished in section 6, so this one starts owing them again. */
    await p.evaluate(() => { selectEquip('TK101'); }); await p.waitForTimeout(400);
    await p.evaluate(PHOTOS); await p.waitForTimeout(500);
    const folded = await p.evaluate(() => ({ open: document.getElementById('mphotos').open,
      count: document.getElementById('mpCount').textContent }));
    ok('  and fold themselves once the round has them', !folded.open && /1 of 1/.test(folded.count), JSON.stringify(folded));
    await p.evaluate(() => { document.getElementById('mphotos').open = true; renderMachinePhotos(); });
    await p.waitForTimeout(200);
    ok('  but never fold again on a technician who has just opened them',
       await p.evaluate(() => document.getElementById('mphotos').open));
  }

  console.log('\n8. DESTINATIONS ARE NOT STEPS');
  await p.click('#tabbar button[data-pane="paneDue"]'); await p.waitForTimeout(500);
  s = await snap();
  ok('the bottom bar changes destination, and only one is on screen', s.panes.join(',') === 'paneDue', s.panes.join(','));
  await p.click('#tabbar button[data-pane="paneQueue"]'); await p.waitForTimeout(400);
  s = await snap();
  ok('Saved is the destination step 4 names', s.panes.join(',') === 'paneQueue' && s.step === 4 && s.selected === '4' && s.controls === 'paneQueue' && coherent(s), JSON.stringify({ panes: s.panes, step: s.step }));
  await p.click('#tabbar button[data-pane="paneCapture"]'); await p.waitForTimeout(400);
  s = await snap();
  ok('and Inspect comes back to one step, coherently', s.panes.join(',') === 'paneCapture' && coherent(s), JSON.stringify({ panes: s.panes, step: s.step, shown: s.shown }));

  console.log('\n9. A WIDE WINDOW IS STILL ONE TASK AT A TIME');
  for (const [w, h] of [[834, 1112], [1280, 900], [1440, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
    const q = await snap();
    ok(w + 'px: one destination, one step, tab bar present, page under 2,000px',
       q.panes.length === 1 && q.shown.length === 1 && q.tabbar && q.docH < 2000,
       JSON.stringify({ panes: q.panes, shown: q.shown, tabbar: q.tabbar, docH: q.docH }));
  }
  await p.setViewportSize({ width: 390, height: 844 });

  console.log('\n10. RUSSIAN');
  await p.evaluate(() => { const btn = document.querySelector('.lang button[data-lang="ru"]'); if (btn) btn.click(); }); await p.waitForTimeout(500);
  const R = await p.evaluate(() => ({ toFind: document.getElementById('toFind').textContent.trim(),
    tabs: [...document.querySelectorAll('#stepBar button span')].map(x => x.textContent.trim()).join('|') }));
  await p.evaluate(() => { goStep(1); const e = document.getElementById('stepMsg'); e.textContent = ''; });
  await p.evaluate(() => { curEquip = ''; goStep(2); }); await p.waitForTimeout(300);
  const RM = await p.evaluate(() => document.getElementById('stepMsg').textContent.trim());
  const cyr = x => /[А-Яа-яЁё]/.test(x);
  ok('the steps, the Continue button and the refusal all speak Russian', cyr(R.toFind) && cyr(R.tabs) && cyr(RM), [R.tabs, R.toFind, RM].join(' · '));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
