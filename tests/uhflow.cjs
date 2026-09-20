/* THE MACHINE'S OWN REPORT, RESHAPED — three real defects, read off EX021's
   actual "Equipment History and Trend" PDF beside its own single-round
   Undercarriage report and reported as "the header is different... the flow
   of the report is a mess... looking at it the first time it's confusing".

   1. THE REPORT CODE COLLIDED WITH UNRELATED DASHBOARD CHROME. The dashboard's
      own Report Builder wizard has a bare, global ".rnum" rule for its
      numbered step circles (background/border-radius:50%/height/display/
      flex, dashboard/index.html). report-core.js's masthead used the same
      class name for the document's own reference number and only ever reset
      three unrelated properties (font-weight/letter-spacing/padding-left) —
      so on the dashboard, and ONLY on the dashboard (the phone has no such
      class), the reference number rendered as a solid copper pill instead of
      plain grey text, while the identical document opened on the phone
      looked nothing like it. Renamed to ".repno", which nothing else in
      either app's stylesheet touches.

   2. THE MACHINE'S WORST FINDING COULD BE ABSENT FROM "SIGNIFICANT FINDINGS"
      ENTIRELY. That table (historyFindings, now retired) was built by its
      own separate walk that only ever took an item with `.grade >= 2` or
      `.defect` — a wear roll-up (an Undercarriage or Dump Body round's own
      "N points at or past condemn") carries neither, so a Condition 5
      Critical undercarriage finding had a row in "Consolidated actions" and
      NO row at all in "Significant findings", the two tables silently
      disagreeing about the machine's own worst problem. One merged table now
      ("Findings & required actions", over scan()'s X.act, which already
      combines both shapes) — a reader cannot see one without the other.

   3. EIGHT ROWS FOR TWO ROUNDS WALKED. The Overall Condition table printed
      every one of the eight round types this fleet has, "Not inspected" or
      not, so a haul truck that only ever gets three of them showed five grey
      rows above the two that said anything. Rows are printed only for a
      round type this machine has history for; the rest are named once, in
      one quiet line, never silently dropped.

   Run: node tests/uhflow.cjs [port]   (needs tests/ed-srv.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(1200);

  const r = await p.evaluate(() => {
    /* Built directly through CMR.sections (bypassing CMDash.importRecords'
       own wear-reference lookup, the way tests/rptall.cjs's own second
       fixture already does for a UC round) — .w is supplied pre-computed,
       exactly the shape mobile/normalize.js itself would produce from a
       model+key+mm lookup, so this suite is about the REPORT, not about
       reproducing that lookup. */
    const recs = [
      { equip: 'EX900', clsLabel: 'EXCAVATOR', model: 'LiuGong CLG990FHD', type: 'FC', typeLabel: 'FC', date: '2026-09-14', by: 'Rayanov', smu: '7941',
        items: [{ key: 'ENG', name: 'Engine Oil Filter', grade: 1 }] },
      { equip: 'EX900', clsLabel: 'EXCAVATOR', model: 'LiuGong CLG990FHD', type: 'INSP', typeLabel: 'INSP', date: '2026-09-14', by: 'Rayanov', smu: '7941',
        items: [{ key: 'HS.DL', name: 'Hydraulic Lines', grade: 2, defect: 'Weeping at hose fitting', action: 'Repair at next scheduled service' }] },
      { equip: 'EX900', clsLabel: 'EXCAVATOR', model: 'LiuGong CLG990FHD', type: 'UC', typeLabel: 'UC', date: '2026-09-14', by: 'Rayanov', smu: '7941',
        items: [
          { key: 'CARRIER.R-OUT', name: 'Carrier roller — outer', w: { mm: 187, newMM: 200, condemnMM: 192, pct: 175, band: 'act' } },
          { key: 'CARRIER.R-IN', name: 'Carrier roller — inner', w: { mm: 187, newMM: 200, condemnMM: 192, pct: 163, band: 'act' } },
          { key: 'CARRIER.L-OUT', name: 'Carrier roller — outer (L)', w: { mm: 186, newMM: 200, condemnMM: 192, pct: 175, band: 'act' } },
          { key: 'CARRIER.L-IN', name: 'Carrier roller — inner (L)', w: { mm: 187, newMM: 200, condemnMM: 192, pct: 163, band: 'act' } },
        ] },
    ];
    const secs = CMR.sections({ lang: 'en', bi: true, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs });
    const st = document.createElement('style'); st.textContent = CMR.CSS; document.head.appendChild(st);
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot';
    d.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);

    const title = (d.querySelector('.mast .m1') || {}).textContent || '';
    const repEl = d.querySelector('.mast .rno .repno');
    const repStyle = repEl ? getComputedStyle(repEl) : null;
    const repnoBg = repStyle ? repStyle.backgroundColor : null;
    const repnoRadius = repStyle ? repStyle.borderRadius : null;
    const rnumSurvivor = d.querySelector('.mast .rno .rnum');

    const stripLabels = [...d.querySelectorAll('.rrate .rk')].map(e => e.textContent.trim());
    const stripValues = [...d.querySelectorAll('.rrate .rv')].map(e => e.textContent.trim());

    const condRows = [...d.querySelectorAll('.sumtbl')[0].querySelectorAll('tbody tr, tr')].slice(1); // skip header row
    const condTypeNames = condRows.map(tr => (tr.querySelector('td') || {}).textContent || '');
    const notCovered = [...d.querySelectorAll('.muted')].map(e => e.textContent)
      .find(t => t.includes('Not yet inspected')) || '';

    const findRows = [...d.querySelectorAll('.sechd .h2')].length
      ? [...d.querySelector('.sechd').closest('.sec').querySelectorAll('table.sumtbl tr')].slice(1)
      : [];
    const findText = findRows.map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
    const hasCriticalRoll = findText.some(t => /(Critical|CRI)/.test(t) && /condemn/.test(t));
    const gradeChips = [...d.querySelectorAll('.sechd')].length
      ? [...d.querySelector('.sechd').closest('.sec').querySelectorAll('table.sumtbl .g, table.sumtbl .sev')]
      : [];

    const heading = (d.querySelector('.sechd .h2') || {}).textContent || '';
    const oldHeadingsPresent = d.textContent.includes('Significant findings') || /Consolidated actions/.test((d.querySelector('.sechd .h2') || {}).textContent || '');

    d.remove(); st.remove();
    return {
      title, hasRepnoClass: !!repEl, repnoBg, repnoRadius, rnumSurvivor: !!rnumSurvivor,
      stripLabels, stripValues, condTypeCount: condTypeNames.filter(Boolean).length,
      condTypeNames: condTypeNames.filter(Boolean), notCovered,
      heading, findRowCount: findText.length, findText, hasCriticalRoll, gradeChipCount: gradeChips.length,
      oldHeadingsPresent,
    };
  });

  console.log('1. THE REPORT CODE NO LONGER COLLIDES WITH DASHBOARD CHROME');
  ok('the title is distinct from the Condition Summary report',
     /^Equipment Trend Report/.test(r.title) && !/Equipment Condition Summary/.test(r.title), r.title);
  ok('  the reference number uses the renamed .repno class', r.hasRepnoClass);
  ok('  and no element still carries the colliding .rnum class', !r.rnumSurvivor);
  ok('  it is not painted as a filled pill (no background colour)',
     r.repnoBg === 'rgba(0, 0, 0, 0)' || r.repnoBg === 'transparent', r.repnoBg);
  ok('  and not rounded into a badge shape', r.repnoRadius === '0px', r.repnoRadius);

  console.log('\n2. THE RATING / OPEN ITEMS / DECISION STRIP REPLACES THE REPEATED UNIT/MODEL/SMU/DATE ONE');
  ok('three cells: rating, open items, decision', r.stripLabels.length === 3, JSON.stringify(r.stripLabels));
  ok('  the rating is the worst grade (5)', r.stripValues[0] === '5', JSON.stringify(r.stripValues));
  ok('  open items counts the merged table\'s own rows', r.stripValues[1] === '2', JSON.stringify(r.stripValues));

  console.log('\n3. THE OVERALL CONDITION TABLE SHOWS ONLY WHAT WAS WALKED');
  ok('exactly the three round types this machine has (of eight)', r.condTypeCount === 3, JSON.stringify(r.condTypeNames));
  ok('  the other five are named once, in a quiet note, not silently dropped',
     /Magnetic Plug/.test(r.notCovered) && /Thermography/.test(r.notCovered) && /Lubrication/.test(r.notCovered), r.notCovered);

  console.log('\n4. ONE MERGED TABLE, AND THE CRITICAL WEAR FINDING IS IN IT');
  ok('the section is headed "Findings & required actions", not two headings', /Findings & required actions/i.test(r.heading), r.heading);
  ok('  the old two-table headings are gone', !r.oldHeadingsPresent, r.oldHeadingsPresent);
  ok('  THE FIX: the Critical undercarriage roll-up has its own row', r.hasCriticalRoll, JSON.stringify(r.findText));
  ok('  every row carries a grade or severity chip, not colour alone', r.gradeChipCount === r.findRowCount, r.gradeChipCount + ' chips for ' + r.findRowCount + ' rows');

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
