/* A LOOKUP TABLE'S OPINION IS NOT A FINDING — AND IS NOT A FAULT EITHER.

   The deployed dashboard reported 469 inspection points carrying fields it
   could not classify. Measured, they were six names:

     newMM      466      the new-part dimension, from the reference table
     condemnMM  466      the condemn limit, from the same table
     band       466      the wear band, derived from the two and the reading
     wearPct    434      the same derivation as a percentage
     stood       12      the technician saying the machine was stood right
     mapSev       2      the dashboard's severity, derived from the grade

   None of it was wrong and all of it was noise. A diagnostic that cries wolf
   on four hundred and sixty-six healthy rows is the noise a real finding hides
   in, which is the same defect as saying nothing.

   The classification has to be exact in BOTH directions, and that is what this
   suite pins:

     a wear point a technician measured stays a real point
     a keyless row carrying only table values is removed quietly and counted
     a keyless row carrying a real finding STAYS, for somebody to correct
     none of the six is ever dropped from a record — they are kept, always

   Run: node tests/wearfields.cjs */
'use strict';
const fs = require('fs'), path = require('path');
let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log('  FAIL  ' + w + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + w + (d !== undefined ? '   ' + d : '')); return c; };

const G = {};
new Function('self', fs.readFileSync(path.join(__dirname, '..', 'mobile', 'normalize.js'), 'utf8'))(G);
const N = G.CMNorm;

/* Exactly what mobile/index.html writes beside a tray measurement. */
const wearPoint = extra => Object.assign({
  key: 'F31', label: 'Front floor 31',
  mm: 12, stood: 1,
  newMM: 20, condemnMM: 8, wearPct: 66, band: 'C',
  refSrc: 'tray:HM400', zone: 'A', zoneLabel: 'Front',
}, extra || {});

console.log('\n1. THE SIX NAMES ARE CLASSIFIED');
['newMM', 'condemnMM', 'wearPct', 'band', 'mapSev'].forEach(f =>
  ok(N.DEFAULTED.indexOf(f) >= 0, `${f} is written by the app, not by a person`,
     N.DEFAULTED.indexOf(f) >= 0 ? 'defaulted' : 'UNCLASSIFIED'));
ok(N.OPERATIONAL.indexOf('stood') >= 0,
   'stood is the technician\'s own input and counts as content',
   N.OPERATIONAL.indexOf('stood') >= 0 ? 'operational' : 'not operational');
ok(N.unknown(wearPoint()).length === 0,
   'so a measured wear point reports no unclassified field',
   JSON.stringify(N.unknown(wearPoint())));
ok(N.unknown({ key: 'F31', mapSev: 'CRI', grade: 'X' }).length === 0,
   'and neither does a graded point carrying the derived severity',
   JSON.stringify(N.unknown({ key: 'F31', mapSev: 'CRI', grade: 'X' })));

console.log('\n2. AND NOTHING IS THROWN AWAY');
{
  const rec = { equip: 'TK105', date: '2026-08-05', type: 'TB', items: [wearPoint()] };
  const out = N.record(rec).rec;
  const kept = out.items[0];
  ['mm', 'stood', 'newMM', 'condemnMM', 'wearPct', 'band', 'refSrc', 'zone', 'zoneLabel']
    .forEach(f => ok(kept[f] === wearPoint()[f], `${f} survives normalisation`, String(kept[f])));
  ok(N.record(rec).removed === 0, 'and the point is not removed');
}

console.log('\n3. A ROW NOBODY FILLED IN IS STILL A ROW NOBODY FILLED IN');
{
  /* The table has an opinion about every position on the sheet whether or not
     anybody measured it. With no key and no reading, that is not a finding —
     it is an empty row, and it goes quietly. */
  const blankRow = { newMM: 20, condemnMM: 8, wearPct: '', band: '',
                     refSrc: 'tray:HM400', zone: 'A', zoneLabel: 'Front' };
  ok(N.classify(blankRow) === 'empty',
     'a keyless row carrying only the table is empty', N.classify(blankRow));
  const rec = { equip: 'TK115', date: '2026-08-05', type: 'TB',
                items: [wearPoint(), blankRow] };
  const res = N.record(rec);
  ok(res.removed === 1, 'it is removed', 'removed ' + res.removed);
  ok(res.orphans === 0, 'and it raises nothing for anybody to answer', 'orphans ' + res.orphans);
  ok(res.rec.items.length === 1, 'leaving the measured point alone', res.rec.items.length + ' item(s)');
}

console.log('\n4. BUT A REAL FINDING WITH NO COMPONENT MUST STILL BE SEEN');
[
  ['a grade',        { grade: 'X' }],
  ['a millimetre',   { mm: 9 }],
  ['a comment',      { comment: 'plate cracked at the weld' }],
  ['a defect',       { defect: 'Cracked', defectCode: 'DT14-03' }],
  ['an action',      { action: 'STOP', actionLabel: 'Stop the machine' }],
  ['a photograph',   { photos: 2 }],
  ['a video',        { video: 1 }],
].forEach(([what, extra]) => {
  const row = Object.assign({ newMM: 20, condemnMM: 8, band: 'C', refSrc: 'tray:HM400' }, extra);
  ok(N.classify(row) === 'orphan', `a keyless row with ${what} stays, for correction`,
     N.classify(row));
});

/* And the other direction, which is the half that keeps this honest.
   OPERATIONAL says a field name is CLASSIFIED. It does not say the field is a
   finding — carries() asks a deliberately much shorter question, because every
   extra field is another way for a blank row to look populated, and three
   builds shipped that mistake. So `stood` on its own, with no reading and no
   component, is a checkbox somebody left ticked: not a finding, not a fault,
   and not something to put in front of a technician. */
console.log('\n4b. AND A TICK WITH NOTHING BESIDE IT IS NOT A FINDING');
ok(N.classify({ stood: 1, newMM: 20, condemnMM: 8 }) === 'empty',
   'stood with no reading and no component is an empty row',
   N.classify({ stood: 1, newMM: 20, condemnMM: 8 }));
ok(N.classify({ stood: 1, mm: 9 }) === 'orphan',
   'but stood beside a millimetre is a finding waiting for its component',
   N.classify({ stood: 1, mm: 9 }));
ok(N.unknown({ stood: 1 }).length === 0,
   'and either way it is never reported as unclassified',
   JSON.stringify(N.unknown({ stood: 1 })));

console.log('\n5. THE DIAGNOSTIC IS ABOUT FIELDS, AND SAYS WHERE TO LOOK');
{
  /* Whatever IS still unclassified must arrive with its point, so the line can
     name one place to go and look rather than four arbitrary machines. */
  const recs = [1, 2, 3].map(n => ({ equip: 'TK10' + n, date: '2026-08-0' + n, type: 'TB',
    items: [wearPoint({ key: 'F3' + n, somethingNew: 'x' })] }));
  const st = N.list(recs);
  ok(st.unknown.length === 3, 'one entry per point that carries it', st.unknown.length);
  ok(st.unknown.every(u => u.rec && u.key), 'each naming its machine and its point',
     JSON.stringify(st.unknown[0]));
  ok(st.unknown.every(u => u.fields.join() === 'somethingNew'),
     'and only the field nobody has classified', JSON.stringify(st.unknown[0].fields));
  /* The grouping the dashboard does with it. */
  const by = new Map();
  st.unknown.forEach(x => x.fields.forEach(f => {
    const e = by.get(f) || { n: 0, eg: '' };
    e.n++; if (!e.eg) e.eg = x.rec + ' · ' + x.key; by.set(f, e); }));
  ok(by.size === 1 && by.get('somethingNew').n === 3,
     'which collapses to one field name and a count', JSON.stringify([...by]));
}

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);
