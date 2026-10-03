/* Articulated truck magnetic plugs: the six lubrication-sheet codes, and the
   retired FRD / CTR / RRD still named on records captured under them. */
global.self = global; require('../mobile/points.js');
const P = self.PTS; let bad = 0;
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d ? '   ' + d : '')); if (!c) bad++; };
const keys = P.CLASSES.AT.MP.map(m => m.k);
ok('AT plug list is 4AL 4AR 4CL 4CR 4BL 4BR TRANS', keys.join() === '4AL,4AR,4CL,4CR,4BL,4BR,TRANS', keys.join());
ok('the old FRD / CTR / RRD are no longer offered', !keys.some(k => ['FRD', 'CTR', 'RRD'].includes(k)));
['4AL', '4AR', '4CL', '4CR', '4BL', '4BR'].forEach(k =>
  ok(k + ' is named in both languages', !!P.label('AT', 'MP', k, 'en') && !!P.label('AT', 'MP', k, 'ru')));
['FRD', 'CTR', 'RRD'].forEach(k =>
  ok(k + ' on an older record still has a name', !!P.label('AT', 'MP', k, 'en') && !!P.label('AT', 'MP', k, 'ru')));
ok('a point nobody knows still answers empty, not the key', P.label('AT', 'MP', 'ZZ', 'en') === '');
ok('another class is untouched (HT keeps 4E/4F)', P.CLASSES.HT.MP.map(m => m.k).join() === '1,4,4E,4F');
console.log(bad ? 'FAILED: ' + bad : 'all passed'); process.exit(bad ? 1 : 0);
