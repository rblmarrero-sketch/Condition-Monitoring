const REPO = require('path').join(__dirname, '..');
/* The undercarriage reference table and, more importantly, how a reading gets
   judged. A baseline measured on the machine has to beat the catalogue from its
   own date forward, without rewriting what an earlier round was judged against. */
const fs = require('fs');
const path = REPO + '/mobile/wear.js';
const win = {};
new Function('window', fs.readFileSync(path, 'utf8'))(win);
const W = win.WEAR;

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const near = (a, b) => a != null && Math.abs(a - b) < 0.05;

console.log('the table itself');
ok('16 models carry a reference', Object.keys(W.models).length === 16, Object.keys(W.models).length);
ok('every register model string resolves or is deliberately blank',
  Object.entries(W.map).every(([, v]) => v.m === null || W.models[v.m]));
ok('the D155A figures are the ones off the DZ001 tab',
  W.models['Komatsu D155A'].pts.GROUSER.n === 80 && W.models['Komatsu D155A'].pts.GROUSER.c === 30);
ok('direction is read from the figures, not assumed',
  W.models['Komatsu D155A'].pts.IDLER.d === 'grow' &&
  W.models['Komatsu D155A'].pts.ROLLER.d === 'shrink');
ok('the D9R is marked as an elevated-sprocket frame',
  W.models['CAT D9R'].frame === 'highdrive');
ok('every other model is an oval frame',
  Object.entries(W.models).filter(([k]) => k !== 'CAT D9R').every(([, m]) => m.frame === 'oval'));

console.log('\nmachines that must never be offered this round');
ok('the wheeled ZX210W is excluded', !W.eligible('HITACHI ZX210W-5A'));
ok('with the reason recorded', W.exclude['HITACHI ZX210W-5A'] === 'wheeled');
ok('a tracked excavator is still eligible', W.eligible('HITACHI ZX330-5G RB'));
ok('a model with no reference is eligible but resolves to nothing',
  W.eligible('KOMATSU PC2000-8 BH') && W.modelFor('KOMATSU PC2000-8 BH') === null);

console.log('\nthe register name is not the workbook name');
ok('KOMATSU D375A.6 finds the D375A figures',
  W.modelFor('KOMATSU D375A.6').pts.BUSH.n === 98.5);
ok('HITACHI EX1200-6BH finds the ZX 1200 figures',
  W.modelFor('HITACHI EX1200-6BH') === W.models['Hitachi ZX 1200']);
ok('the LCR variant is flagged as borrowing from the LC', W.map['HITACHI ZX470LCR-5G'].via === 'inherited');

console.log('\nreferences the workbook itself gets wrong');
let r = W.refFor('DZ018', 'SHANTUI SD90-C5', 'BUSH', 'L', '2026-07-01');
ok('the SD90 bushing reference is marked borrowed', r.x === 'borrowed', r.x);
ok('so the 116 mm reading gets no percentage', W.wear(r, 116) === null);
ok('but it is still flagged as impossible', W.implausible(r, 116) === 'over-new');
r = W.refFor('EX008', 'HITACHI ZX330-5G RB', 'PITCH1', 'L', '2026-07-01');
ok('the ZX 330 1-link pitch is marked as having a rival', r.x === 'rival');
ok('the rival figures are carried, not dropped', r.rivals && r.rivals.length === 1,
  JSON.stringify(r.rivals));
ok('and no percentage is computed either way', W.wear(r, 216) === null);

console.log('\na clean reading against a sound reference');
r = W.refFor('DZ001', 'KOMATSU D155A.5', 'GROUSER', 'L', '2026-07-14');
ok('it comes from the catalogue', r.src === 'catalogue');
ok('60 mm on an 80 → 30 grouser is 40% worn', near(W.wear(r, 60), 40), W.wear(r, 60));
ok('32 mm is 96% worn — the DZ001 sheet says the same', near(W.wear(r, 32), 96));
ok('a sane reading raises nothing', W.implausible(r, 60) === null);
ok('95 mm on a point that only wears down is questioned', W.implausible(r, 95) === 'over-new');
r = W.refFor('DZ001', 'KOMATSU D155A.5', 'IDLER', 'L-OUT', '2026-07-14');
ok('the idler counts up: 23 mm on 21 → 33.5 is 16%', near(W.wear(r, 23), 16), W.wear(r, 23));
ok('a reading below "new" on a growing point is questioned',
  W.implausible(r, 18) === 'under-new');

console.log('\nthe baseline: measured on this machine when it was new');
W.setBaselines([
  { unit: 'DZ018', point: 'BUSH', pos: '', n: 118, c: 108, from: '2026-08-01',
    by: 'RM', why: 'new undercarriage fitted' },
]);
r = W.refFor('DZ018', 'SHANTUI SD90-C5', 'BUSH', 'L', '2026-09-15');
ok('after its date the baseline wins', r.src === 'baseline', r.src);
ok('and the borrowed-reference block is lifted', !r.x);
ok('114 mm now scores properly', near(W.wear(r, 114), 40), W.wear(r, 114));
ok('and stops being flagged as impossible', W.implausible(r, 114) === null);

console.log('  history must not move under it');
r = W.refFor('DZ018', 'SHANTUI SD90-C5', 'BUSH', 'L', '2026-07-01');
ok('a round taken before the baseline still uses the catalogue', r.src === 'catalogue');
ok('so it is still correctly refused a percentage', W.wear(r, 116) === null);

console.log('  a baseline is per position when it needs to be');
W.setBaselines([
  { unit: 'DZ001', point: 'ROLLER', pos: 'L3', n: 248, c: 210, from: '2026-06-01', by: 'RM',
    why: 'roller replaced' },
]);
const rep = W.refFor('DZ001', 'KOMATSU D155A.5', 'ROLLER', 'L3', '2026-07-14');
const old = W.refFor('DZ001', 'KOMATSU D155A.5', 'ROLLER', 'L4', '2026-07-14');
ok('the replaced roller uses its own baseline', rep.src === 'baseline' && rep.n === 248);
ok('its neighbour is untouched', old.src === 'catalogue' && old.n === 250);

console.log('  a baseline with no condemn figure cannot invent one');
W.setBaselines([
  { unit: 'EX021', point: 'SPROCKET', pos: '', n: 281, c: null, from: '2026-01-01', by: 'RM',
    why: 'new sprocket' },
]);
r = W.refFor('EX021', 'LiuGong CLG990FHD', 'SPROCKET', 'L', '2026-07-22');
ok('the sprocket baseline is taken', r.n === 281);
ok('but with no limit anywhere, it still scores nothing', r.x === 'nolimit' && W.wear(r, 275) === null);
W.setBaselines([]);

console.log('\nthe walk');
const w = W.walk('KOMATSU D155A.5');
ok('36 positions, the same as the paper tab', w.length === 36, w.length);
ok('the idler is four readings, outer and inner both sides',
  w.filter(x => x.point === 'IDLER').map(x => x.pos).join(',') === 'L-OUT,L-IN,R-OUT,R-IN');
ok('the carrier roller is four as well', w.filter(x => x.point === 'CARRIER').length === 4);
ok('rollers are 8 a side', w.filter(x => x.point === 'ROLLER').length === 16);
ok('and the single-reading points are two each',
  ['PITCH4', 'PITCH1', 'LINKH', 'BUSH', 'GROUSER', 'SPROCKET']
    .every(p => w.filter(x => x.point === p).length === 2));
ok('a machine with no reference still gets a walk', W.walk('KOMATSU PC2000-8 BH').length === 36);
ok('keys are unique', new Set(w.map(x => x.k)).size === w.length);

console.log('\nreasons an inspector can give instead of a number');
ok('the guard is one of them — it is what they already write',
  W.reasons.some(x => x.code === 'GUARD' && x.ru === 'Кожух'));
ok('"not fitted" is there, so the roller count corrects itself',
  W.reasons.some(x => x.code === 'NOFIT'));
ok('every reason is bilingual', W.reasons.every(x => x.en && x.ru && x.code));

console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
process.exit(fails.length ? 1 : 0);
