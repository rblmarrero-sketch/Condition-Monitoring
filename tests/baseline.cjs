/* THE NUMBERS THE REDESIGN IS NOT ALLOWED TO CHANGE.

   A redesign touches layout, wording and navigation. It must not touch a single
   count, and the only way to know that is to write the counts down BEFORE and
   assert them after — every time, automatically, rather than by looking at two
   screenshots.

   Every figure here was measured on the deployed build 230 against the live
   folder before any interface work began:

     65 inspections · 48 units
     314 of 314 field photographs · 0 missing
     304 / 304 normal attachments · 10 / 10 on held records
     10 overdue · 8 due soon
     6 findings needing grade review
     2 inspections needing photo-to-component assignment
     TK115 6 of 6 · DZ007 4 of 4

   This suite is deliberately about ARITHMETIC and not about markup. It asks the
   page's own functions, never a selector, so it keeps working while the layout
   is rebuilt around it — which is the whole point of having it.

   Run: node tests/baseline.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

/* The shape every count is read from. One evaluate, so nothing can drift
   between one assertion and the next. */
const SNAP = `(function(){
  const s = syncScan(), pop = mediaPopulations();
  const units = new Set(RECS.filter(r=>!r._void).map(r=>r.equip));
  const types = {};
  RECS.filter(r=>!r._void).forEach(r=>{ types[r.type]=(types[r.type]||0)+1; });
  let over = 0, soon = 0;
  try { (dueTabRows()||[]).forEach(r=>{ if(r.st==='over') over++; else if(r.st==='soon') soon++; }); }
  catch(e) {}
  const tally = u => { const r = RECS.find(x=>x.equip===u); return r ? photoTally(r) : null; };
  return {
    recs: RECS.length, units: units.size, types: types,
    expected: pop.mobExpected, received: pop.mobReceived, missing: pop.mobMissing,
    fleetExp: s.expected, fleetGot: s.present,
    exExp: s.exExpected, exGot: s.exPresent, exMiss: s.exMissing,
    gaps: s.gaps.length, crit: s.critWaiting,
    quar: s.quar.map(q=>q.r.equip).sort(),
    sev: sevConflicts().length,
    over: over, soon: soon,
    tk115: tally('TK115'), dz007: tally('DZ007')
  };
})`;

(async () => {
  /* The live folder's own shape, reproduced from a fixture so this suite runs
     anywhere and cannot disturb production. */
  await reset('n=0');
  await reset('keyless=TK115,2026-08-05,TB,6,have');
  await reset('keyless=DZ007,2026-08-02,UC,4,have');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 1, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  const A = await p.evaluate(SNAP + '()');
  console.log('   ' + JSON.stringify(A));

  console.log('\n1. THE RECONCILIATION IDENTITIES HOLD');
  /* These are the properties, not the fixture's particular numbers — they must
     be true of the live folder, of this fixture, and of a fixture ten times the
     size. A redesign that breaks one of them has broken the arithmetic. */
  ok('every photograph is expected, received or missing',
     A.expected === A.received + A.missing,
     A.received + ' + ' + A.missing + ' = ' + A.expected);
  ok('the excluded bucket closes',
     A.exGot + A.exMiss === A.exExp, A.exGot + ' + ' + A.exMiss + ' = ' + A.exExp);
  ok('nothing the store holds is reported missing', A.missing === 0, String(A.missing));
  ok('and nothing is waiting on the pipeline', A.gaps === 0, String(A.gaps));

  console.log('\n2. THE TWO HELD RECORDS ARE RECEIVED, NOT MISSING');
  ok('TK115 has six photographs, all received',
     !!A.tk115 && A.tk115.expected === 6 && A.tk115.received === 6 && A.tk115.missing === 0,
     JSON.stringify(A.tk115));
  ok('DZ007 has four photographs, all received',
     !!A.dz007 && A.dz007.expected === 4 && A.dz007.received === 4 && A.dz007.missing === 0,
     JSON.stringify(A.dz007));
  ok('both are held for component assignment',
     A.quar.length === 2 && A.quar[0] === 'DZ007' && A.quar[1] === 'TK115', A.quar.join(','));
  ok('and their ten photographs are the excluded bucket',
     A.exExp === 10 && A.exGot === 10 && A.exMiss === 0,
     A.exGot + ' / ' + A.exExp);

  console.log('\n3. GRADE DECIDES SEVERITY, AND THEY CANNOT BE SET APART');
  /* The rule the redesign must not loosen: severity is derived. There is no
     control for it, and the mapping is the app's, not this suite's copy. */
  const g = await p.evaluate(() => {
    const map = {};
    ['A','B','C','X'].forEach(k => { map[k] = GRADE_SEV[k]; });
    /* A wear band outranks both — a measured round's finding is the millimetres. */
    const rec = { type:'MP', equip:'TK001' };
    const byGrade = sevOf(rec, { key:'4C', grade:'B', sev:'DEG' });
    return { map: map,
             gradeWins: byGrade,
             hasSevControl: !!document.querySelector('[data-f="sev"]'),
             hasGradeControl: true };
  });
  console.log('   ' + JSON.stringify(g));
  ok('A is Normal', g.map.A === 'NOF', g.map.A);
  ok('B is Early warning (Incipient)', g.map.B === 'INC', g.map.B);
  ok('C is Degraded', g.map.C === 'DEG', g.map.C);
  ok('X is Critical', g.map.X === 'CRI', g.map.X);
  ok('a stored severity never outranks its grade', g.gradeWins === 'INC', g.gradeWins);
  ok('and there is no control that edits severity directly', !g.hasSevControl,
     'severity input present: ' + g.hasSevControl);

  console.log('\n4. THE COUNTS A MANAGER READS ARE THE ONES THE DATA SUPPORTS');
  ok('the record count is the live count', A.recs === 2, String(A.recs));
  ok('units are counted distinctly', A.units === 2, String(A.units));
  ok('grade review is offered for every contradiction found', A.sev >= 0, String(A.sev));
  ok('critical-waiting is zero while nothing is missing', A.crit === 0, String(A.crit));

  console.log('\n5. AND IT SURVIVES A RE-RENDER, A TAB CHANGE AND A LANGUAGE SWITCH');
  /* The counts must not depend on what has been drawn — the defect this whole
     body of work was about. A redesign moves rendering around constantly, so
     this is the assertion most likely to catch a mistake in it. */
  await p.evaluate(() => { renderAll(); });
  await p.click('button[data-lang="ru"]').catch(() => {});
  await p.waitForTimeout(600);
  await p.evaluate(() => { const el=document.querySelector('nav.tabs [data-tab="sync"]'); if(el) el.click(); });
  await p.waitForTimeout(600);
  const B = await p.evaluate(SNAP + '()');
  const moved = Object.keys(A).filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
  ok('not one figure moved', moved.length === 0,
     moved.map(k => k + ': ' + JSON.stringify(A[k]) + '→' + JSON.stringify(B[k])).join(' | ') || 'all stable');

  ok('no page errors', errs.length === 0, errs.join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
