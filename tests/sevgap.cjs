/* A SEVERITY NOBODY CAN CHECK HAS TO BE SOMEWHERE A PERSON CAN FIND IT.

   sevConflicts() was written to name every place a record carries a severity
   its grade cannot explain. It was commented "Named and counted rather than
   silently normalised, because a contradiction somebody imported is a fact
   about the import and somebody has to see it."

   Nothing called it. Not one caller, anywhere in the dashboard.

   So six records in the live folder carried a severity the board could not
   justify, the function that found them ran nowhere, and the only way to reach
   one was to already know which record to open. This project's defect exactly,
   in the code written to catch it: a real value rendered as nothing.

   Two cases, and they are NOT the same question — listing them as one would be
   its own falsehood:

     nograde   the board shows a severity and there is nothing behind it.
               sevOf() falls through to the stored value on purpose, because
               throwing away a finding an inspector made is worse. It is still
               a number no one can re-derive, and only a person knows the grade.

     conflict  the grade already outranks the stored severity, so every screen
               shows the right answer and there is nothing to "pick". The row
               asks the opposite question: is the GRADE the wrong half?

   And the case that makes a list survive contact with an office: the conflict
   rows had NO WAY TO BE CLOSED. Choosing the grade a point already has is not
   a change, dataset.init correctly refuses to write it, and the row would sit
   there for ever. A list that cannot be emptied stops being read, which is how
   the real one gets missed.

   Run: node tests/sevgap.cjs
*/
const { chromium } = require(require('./pw.cjs'));
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8119, B = `http://127.0.0.1:${PORT}`, EXEC = B + '/exec';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

const srv = spawn(process.execPath, [path.join(__dirname, 'ya-srv.cjs'), String(PORT)], { stdio: 'ignore' });
const bye = () => { try { srv.kill(); } catch (e) {} };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

/* Five points chosen so every branch of the rule is exercised, including the
   three that must produce NOTHING. A guard that flags everything is the noise
   a real finding hides in. */
const FIX = [
  // grade B means Incipient; the record also carries Degraded from the import.
  { equip: 'TK001', date: '2026-08-22', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '5120',
    items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'B', sev: 'DEG' }] },
  /* Captured on a Russian phone, read on the English board. The label is data
     and arrives in whatever language the inspector's handset was set to, so
     the panel must resolve it rather than print it. */
  { equip: 'TK002', date: '2026-08-22', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '5210',
    items: [{ key: '4D', label: 'Правый задний бортовой редуктор', grade: '', sev: 'DEG' }] },
  // grade and severity agree — must not be listed.
  { equip: 'TK003', date: '2026-08-22', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '5300',
    items: [{ key: '4E', label: 'Left Front Wheel', grade: 'C', sev: 'DEG' }] },
  // a grade and no stored severity at all — nothing to contradict.
  { equip: 'TK004', date: '2026-08-22', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '5400',
    items: [{ key: '4F', label: 'Right Front Wheel', grade: 'A', sev: '' }] },
  // MEASURED, not graded: the band is the finding and outranks both.
  { equip: 'DZ001', date: '2026-08-20', type: 'UC', cls: 'DOZ', by: 'S. Volkov', smu: '9100',
    items: [{ key: 'IDLER.L', label: 'Left Idler', grade: '', sev: 'CRI',
              mm: 40, newMM: 60, condemnMM: 30 }] },
];

const KEY = 'TK001|2026-08-22|MP';      // the conflict row
const NGK = 'TK002|2026-08-22|MP';      // the no-grade row

const LIST = `(function(){
  const box = document.getElementById('sySev');
  const rows = (typeof sevConflicts === 'function') ? sevConflicts() : null;
  return { html: box ? box.textContent.trim() : null,
           items: box ? box.querySelectorAll('li').length : null,
           buttons: box ? box.querySelectorAll('[data-sevgo]').length : null,
           rows: rows ? rows.map(x => x.r.equip + ':' + x.i.key + ':' + x.why) : null,
           card: (document.getElementById('syGrade') || {}).textContent || null,
           /* Read as "is there an element and what does it hold", never
              coalesced to null — an absent badge and an empty one are
              different facts, and folding them together is how "the badge
              stands down" passed on a badge that was never rendered. */
           hasBadge: !!document.getElementById('nbSync'),
           badge: (document.getElementById('nbSync') || {}).textContent }; })`;

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(EXEC); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'Asia/Anadyr' });
  await ctx.addInitScript(u => { localStorage.setItem('cm_swap_off', '1');
    localStorage.setItem('cm_drive_url', u); localStorage.setItem('cm_drive_sec', ''); }, EXEC);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(B + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.evaluate(() => CMDrive.load(null, { full: true }));
  await p.waitForTimeout(900);
  await p.evaluate(f => CMDash.importRecords(f), FIX);
  await p.waitForTimeout(900);

  console.log('\n0. THE FIXTURE SAYS WHAT IT MEANS TO SAY');
  const prem = await p.evaluate(() => {
    const r = RECS.find(x => x.equip === 'DZ001' && x.type === 'UC');
    const it = r && (r.items || [])[0];
    const w = (r && it) ? wearOf(r, it) : null;
    return { found: !!it, band: (w && w.band) || null, sev: it && it.sev };
  });
  ok('the measured round is on the board', prem.found);
  ok('  and it really does derive a band, so excluding it proves something',
     !!prem.band, 'band ' + prem.band + ', stored ' + prem.sev);

  console.log('\n1. THE LIST EXISTS AND A PERSON CAN SEE IT');
  await p.evaluate(() => { const el = document.querySelector('[data-tab="sync"],#tabSync,[href="#sync"]');
                           if (el) el.click(); });
  await p.waitForTimeout(600);
  const A = await p.evaluate(LIST + '()');
  ok('the panel is rendered at all', A.html !== null, A.html === null ? '(#sySev missing)' : 'present');
  ok('  and is not empty while sevConflicts() has findings',
     !!A.rows && A.rows.length > 0 && A.items > 0, `${A.rows && A.rows.length} found, ${A.items} shown`);
  ok('  every finding gets a row — none is dropped on the way to the screen',
     A.items === (A.rows || []).length, `${A.items} rows for ${(A.rows || []).length} findings`);
  ok('  and every row offers the way to fix it', A.buttons === A.items,
     `${A.buttons} buttons for ${A.items} rows`);

  console.log('\n2. IT FLAGS THE TWO REAL CASES AND NOTHING ELSE');
  const set = new Set(A.rows || []);
  ok('a severity with no grade behind it is named', set.has('TK002:4D:nograde'));
  ok('a severity its grade contradicts is named', set.has('TK001:4C:conflict'));
  ok('a grade and severity that agree are NOT flagged',
     ![...set].some(x => x.startsWith('TK003:')), [...set].join(' '));
  ok('a grade with no stored severity is NOT flagged',
     ![...set].some(x => x.startsWith('TK004:')));
  ok('a MEASURED round is NOT flagged — the band is the finding',
     ![...set].some(x => x.startsWith('DZ001:')));

  console.log('\n2b. A POINT IS NAMED IN THE LANGUAGE ON SCREEN');
  /* The label is data, not UI: it arrives in whatever language the handset was
     set to. Printing it raw put Cyrillic in the middle of the English board on
     the live folder. ptLabelHTML() answers this once for the whole dashboard —
     the panel must ask it rather than keep a second copy of the rule. */
  const lbl = await p.evaluate(() => {
    const li = [...document.querySelectorAll('#sySev li')]
      .find(x => /TK002/.test(x.textContent));
    return li ? { text: li.textContent.replace(/\s+/g, ' ').trim(),
                  flagged: !!li.querySelector('.tgap') } : null;
  });
  ok('the Russian-captured row is on the list', !!lbl, lbl && lbl.text.slice(0, 80));
  ok('  and the English board does not print its Cyrillic label raw',
     !!lbl && !/Правый задний/.test(lbl.text), lbl && lbl.text.slice(0, 110));
  /* Two acceptable outcomes and no third. The reference table knows 4D, so the
     canonical English name is what should appear; where it does NOT know a
     point, the code must be shown with the gap flagged rather than a name
     guessed at. Asserting only the flag would fail on the better answer. */
  ok('  it uses the reference name, or flags the gap — never guesses',
     !!lbl && (/Right Rear Final Drive/.test(lbl.text) || lbl.flagged),
     lbl && ('canonical=' + /Right Rear Final Drive/.test(lbl.text) + ' tgap=' + lbl.flagged));

  console.log('\n2c. A REGISTER POINT IS NAMED FROM THE REGISTER');
  /* points.js and the records use two different code systems. A walk-around
     names its points "FDR"; an inspection record addresses the ISO 14224
     component "DRS.FD", which is what its filenames and its items carry. Asking
     only points.js missed every register point, fell back to the phone's frozen
     label, and printed "no EN name" about a component hme.js has named in both
     languages since the beginning. Checked through ucRefName, because this is
     the whole dashboard's naming rule and not this panel's. */
  const reg = await p.evaluate(() => {
    const rec = { equip: 'TK149', type: 'INSP', cls: 'HT' };
    const has = !!(window.COMP_BY || {})['DRS.FD'];
    return { inTable: has || !!(HME.components || []).find(c => c.code === 'DRS.FD'),
             en: ucRefName('DRS.FD', rec, 'en'),
             ru: ucRefName('DRS.FD', rec, 'ru'),
             // a code the register does not carry must still come back blank
             junk: ucRefName('NOPE.XX', rec, 'en'),
             // and a non-register round must not borrow a register name
             uc: ucRefName('DRS.FD', { equip: 'DZ001', type: 'UC', cls: 'DOZ' }, 'en') };
  });
  ok('the reference table does carry this component', reg.inTable);
  ok('  and an inspection point is named in English', reg.en === 'Final Drives', reg.en || '(blank)');
  ok('  and in Russian', reg.ru === 'Конечные передачи', reg.ru || '(blank)');
  ok('  a code the register does not carry still comes back blank',
     reg.junk === '', JSON.stringify(reg.junk));
  ok('  and a round that does not address components does not borrow one',
     reg.uc !== 'Final Drives', JSON.stringify(reg.uc));

  console.log('\n3. THE COUNT IS THE SAME NUMBER EVERYWHERE IT APPEARS');
  ok('the tile counts what the list shows',
     A.card !== null && A.card.indexOf(String(A.rows.length)) >= 0,
     `tile "${(A.card || '').replace(/\s+/g, ' ').trim()}" for ${A.rows.length}`);
  ok('the tab has a badge to carry the number', A.hasBadge);
  ok('and it says there is something in here',
     String(A.badge || '').trim() === String(A.rows.length),
     `badge "${A.badge}" for ${A.rows.length}`);
  /* The badge is written by two functions. Whichever ran last used to decide
     what the tab said, and they counted different things. */
  const both = await p.evaluate(() => {
    const el = document.getElementById('nbSync');
    renderSync();       const a = el.textContent;
    renderNavCounts();  const b = el.textContent;
    return { a: a, b: b };
  });
  ok('  and both writers of it agree, whichever ran last',
     both.a === both.b, `renderSync "${both.a}" vs renderNavCounts "${both.b}"`);

  console.log('\n3b. THE TILE IS SOMETHING A HAND CAN ACT ON');
  /* "Severity to settle · 6" shipped as a plain div. The first thing anybody
     does with a count of six outstanding decisions is press it; pressing it did
     nothing, with no cursor change to warn them. The list was on the page the
     whole time, a thousand pixels further down and half a screen wide. */
  const tile = await p.evaluate(() => {
    const el = document.getElementById('syGrade');
    if (!el) return null;
    return { cursor: getComputedStyle(el).cursor, role: el.getAttribute('role'),
             tab: el.getAttribute('tabindex'), title: el.getAttribute('title') || '' };
  });
  ok('the tile exists', !!tile);
  ok('  and looks pressable', !!tile && tile.cursor === 'pointer', tile && tile.cursor);
  ok('  and announces itself as a control', !!tile && tile.role === 'button', tile && tile.role);
  ok('  reachable from the keyboard, not the mouse alone',
     !!tile && tile.tab === '0', tile && tile.tab);
  ok('  and says where it goes', !!tile && tile.title.length > 0, tile && tile.title);

  const jumped = await p.evaluate(async () => {
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
    const before = scrollY;
    document.getElementById('syGrade').click();
    await new Promise(r => setTimeout(r, 900));
    const box = document.getElementById('sySevBox');
    const r2 = box.getBoundingClientRect();
    return { before: before, after: scrollY, inView: r2.top >= -5 && r2.top < innerHeight,
             flashed: box.classList.contains('flash') };
  });
  ok('pressing it brings the list into view', jumped.inView,
     `scroll ${jumped.before}→${jumped.after}`);
  ok('  and marks it, so arriving does not read as a mis-click', jumped.flashed);

  const viaKey = await p.evaluate(async () => {
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
    const el = document.getElementById('syGrade');
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 900));
    const r2 = document.getElementById('sySevBox').getBoundingClientRect();
    return r2.top >= -5 && r2.top < innerHeight;
  });
  ok('and Enter does the same thing as a click', viaKey);

  console.log('\n3c. THE LIST IS WHERE A DECISION LIST BELONGS');
  /* It first went into the right-hand column under the reconciliation ladder,
     between "where the number comes from" and "admin diagnostics" — the column
     that answers "is this dashboard telling the truth". This is a list of
     decisions with somebody's name on them and belongs above that. */
  const place = await p.evaluate(() => {
    /* The diagnostics are collapsed by default now; open them so their
       position on the page is a real one to compare against. */
    const ad = document.getElementById('syAdmin'); if (ad) ad.open = true;
    const y = id => { const e = document.getElementById(id);
                      return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; };
    const box = document.getElementById('sySevBox');
    return { sev: y('sySevBox'), diag: y('syDiag'), recon: y('syRecon'),
             kpis: y('syncKpis'), width: box ? Math.round(box.getBoundingClientRect().width) : 0,
             page: document.documentElement.scrollWidth };
  });
  ok('the list sits above the admin diagnostics', place.sev < place.diag,
     `list at ${place.sev}, diagnostics at ${place.diag}`);
  ok('  and above the reconciliation ladder', place.sev < place.recon,
     `list at ${place.sev}, ladder at ${place.recon}`);
  ok('  directly under the tiles rather than a page down',
     place.sev - place.kpis < 320, `${place.sev - place.kpis}px below the tiles`);
  ok('  and full width, not a half-width column with blank beside it',
     place.width > place.page * 0.7, `${place.width} of ${place.page}`);

  console.log('\n4. SETTING THE GRADE CLEARS A NO-GRADE ROW');
  await p.evaluate(k => openEdit(k), NGK);
  await p.waitForTimeout(500);
  const nsel = 'select[data-f="grade"][data-k="4D"]';
  ok('the row\'s button lands on a panel with the grade control', !!(await p.$(nsel)));
  await p.selectOption(nsel, '3');            // 3 · Degraded — the stored value's class
  await p.fill('#edBy', 'R. Marrero').catch(() => {});
  await p.click('#edSave');
  await p.waitForTimeout(1200);
  const stored = await fetch(EXEC + '?action=records').then(r => r.json())
    .then(j => (j.edits || []).find(e => e.key === NGK));
  ok('the decision reaches the endpoint, not just this tab', !!stored);
  ok('  carrying the grade the engineer chose',
     !!stored && ((stored.items || {})['4D'] || {}).grade === 3,
     JSON.stringify(stored && stored.items && stored.items['4D']));
  ok('  and the severity written from it, so the record cannot contradict itself',
     !!stored && ((stored.items || {})['4D'] || {}).sev === 'DEG',
     ((stored && stored.items && stored.items['4D']) || {}).sev);
  await p.evaluate(() => { const x = document.getElementById('edClose'); if (x) x.click(); });
  await p.waitForTimeout(700);
  const Bs = await p.evaluate(LIST + '()');
  ok('and the row is gone from the list', !(Bs.rows || []).some(x => x.startsWith('TK002:')),
     (Bs.rows || []).join(' '));

  console.log('\n5. A ROW WHOSE GRADE IS ALREADY RIGHT CAN STILL BE CLOSED');
  /* The dead end. Without an explicit way to agree, this row is permanent:
     re-picking grade B is not a change, so nothing is ever written. */
  await p.evaluate(k => openEdit(k), KEY);
  await p.waitForTimeout(500);
  const tick = 'input[data-cfok="4C"]';
  ok('the panel says the record contradicts itself', !!(await p.$(tick)));
  const said = await p.evaluate(() => {
    const n = document.querySelector('#edItems .note'); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; });
  ok('  naming both halves, so the engineer knows which one to doubt',
     /Incipient/.test(said) && /Degraded/.test(said), said.slice(0, 150));

  console.log('   first: saving WITHOUT ticking must change nothing');
  await p.fill('#edBy', 'R. Marrero').catch(() => {});
  await p.click('#edSave');
  await p.waitForTimeout(1200);
  const untouched = await fetch(EXEC + '?action=records').then(r => r.json())
    .then(j => (j.edits || []).find(e => e.key === KEY));
  ok('opening the panel and pressing Save does not rewrite the finding',
     !untouched || !((untouched.items || {})['4C'] || {}).sev,
     JSON.stringify(untouched && untouched.items));
  const C = await p.evaluate(LIST + '()');
  ok('  and the row is still there, because nobody has decided anything',
     (C.rows || []).some(x => x.startsWith('TK001:')), (C.rows || []).join(' '));

  console.log('   then: ticking it retires the superseded severity');
  await p.check(tick);
  await p.click('#edSave');
  await p.waitForTimeout(1200);
  const agreed = await fetch(EXEC + '?action=records').then(r => r.json())
    .then(j => (j.edits || []).find(e => e.key === KEY));
  ok('the agreement is stored', !!agreed && !!((agreed.items || {})['4C'] || {}).sev,
     JSON.stringify(agreed && agreed.items && agreed.items['4C']));
  ok('  as the severity the grade already implied, not a new opinion',
     !!agreed && ((agreed.items || {})['4C'] || {}).sev === 'INC',
     ((agreed && agreed.items && agreed.items['4C']) || {}).sev);
  ok('  and the grade itself is untouched — agreeing is not editing',
     !!agreed && !((agreed.items || {})['4C'] || {}).grade,
     JSON.stringify(((agreed && agreed.items && agreed.items['4C']) || {}).grade));
  ok('  signed, so the check is auditable rather than anonymous',
     !!agreed && !!((agreed.items || {})['4C'] || {}).gradeBy,
     ((agreed && agreed.items && agreed.items['4C']) || {}).gradeBy);
  await p.evaluate(() => { const x = document.getElementById('edClose'); if (x) x.click(); });
  await p.waitForTimeout(700);

  console.log('\n6. THE LIST CAN REACH EMPTY, AND SAYS SO IN WORDS');
  const D = await p.evaluate(LIST + '()');
  ok('every fixture finding has been settled', (D.rows || []).length === 0,
     (D.rows || []).join(' ') || 'none');
  ok('  and the panel states that rather than going blank',
     !!D.html && D.html.length > 0, D.html);
  ok('  with no stale rows left behind it', D.items === 1, D.items + ' items');
  ok('  and the badge stands down — the element is there and empty, not absent',
     D.hasBadge && String(D.badge) === '', `present ${D.hasBadge}, badge "${D.badge}"`);

  console.log('\n7. NEITHER LANGUAGE IS MISSING A WORD');
  const miss = await p.evaluate(() => {
    const keys = ['sy_sev', 'sy_sev_none', 'sy_sev_sub', 'sy_sev_go', 'sy_sev_ng', 'sy_sev_cf',
                  'sy_sev_ct', 'sy_k_grade', 'sy_k_grade_s', 'ed_stale', 'ed_stale_ok'];
    const out = [];
    ['en', 'ru'].forEach(L => keys.forEach(k => { if (!(I18N[L] || {})[k]) out.push(L + '.' + k); }));
    return out;
  });
  ok('every new string exists in English and Russian', miss.length === 0, miss.join(' '));
  /* Findings on units nobody has settled, so Russian is checked on the ROWS and
     not only on the one sentence the empty state shows — an empty panel
     translates trivially. Re-importing the original fixture would not do it:
     the corrections above still apply to those two keys, and they would come
     back already clean. */
  await p.evaluate(() => CMDash.importRecords([
    { equip: 'TK005', date: '2026-08-23', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '5500',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'B', sev: 'DEG' }] },
    { equip: 'TK006', date: '2026-08-23', type: 'MP', cls: 'HT', by: 'S. Volkov', smu: '5600',
      items: [{ key: '4D', label: 'Right Rear Final Drive', grade: '', sev: 'DEG' }] },
  ]));
  await p.waitForTimeout(900);
  const back = await p.evaluate(LIST + '()');
  ok('the two fresh findings are on the list to be translated', back.items === 2,
     back.items + ' rows');
  /* Through the control a reader actually presses, not by poking `lang` — the
     panel has to survive the same path the office takes. */
  await p.click('button[data-lang="ru"]');
  await p.waitForTimeout(600);
  const ru = await p.evaluate(() => {
    const box = document.getElementById('sySev');
    return box ? box.textContent.trim() : '';
  });
  ok('and the panel renders in Russian without falling back to a key',
     !!ru && !/^[a-z_]+$/.test(ru) && !/sy_sev/.test(ru), ru.slice(0, 90));

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
