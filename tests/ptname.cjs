/* What a position is CALLED, and who gets to say.

   A unit report on TK156 printed the same four plugs, on the same truck, in
   two languages — "4C LEFT REAR FINAL DRIVE" for the July round and "Левый
   задний бортовой редуктор" for the August one, one above the other, in a
   document whose entire purpose is comparing them. Neither record was wrong.
   Neither could be rendered in the reader's own language either, because the
   name had been FROZEN AT CAPTURE rather than looked up: the phone wrote
   whichever language it was set to into `label`, and the office had no
   reference of its own to name a plug position from, so it printed the label.

   Every other round type had solved this years earlier. uc-points.js names an
   undercarriage station, get.js a ground engaging tool, body-points.js a dump
   body panel, lube.js a compartment — each a file of its own, each holding
   both languages, each loaded by the phone AND the dashboard. The magnetic
   plug, the filter cut and the walk-around inspection were the exceptions:
   their vocabulary lived inside mobile/index.html, which the dashboard does
   not load and cannot.

   So it moved to points.js with the rest, and this suite is the thing that
   stops it drifting back — because the failure is silent. A frozen label
   renders perfectly. It is just the wrong language for half the readers, and
   nothing anywhere reports an error.

   Run: node tests/ptname.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099')
        + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* TK156's own case: two rounds of the same four plugs, captured on phones set
   to different languages, so `label` disagrees where the reference does not. */
const RECS = [
  { equip: 'TK156', date: '2026-07-29', type: 'MP', cls: 'HT', by: 'Хасенов', smu: '7180',
    items: [{ key: '4C', label: '4C LEFT REAR FINAL DRIVE', grade: 'C' },
            { key: '4D', label: '4D RIGHT REAR FINAL DRIVE', grade: 'C' }] },
  { equip: 'TK156', date: '2026-08-14', type: 'MP', cls: 'HT', by: 'Хасенов', smu: '7506',
    items: [{ key: '4C', label: 'Левый задний бортовой редуктор', grade: 'B' },
            { key: '4D', label: 'Правый задний бортовой редуктор', grade: 'B' }] },
];
/* A filter cut and a walk-around, because the fix has to cover the round types
   that had the same hole rather than the one that was reported. */
const OTHER = [
  { equip: 'TK156', date: '2026-08-14', type: 'FC', cls: 'HT', by: 'X', smu: '7506',
    items: [{ key: 'ENG', label: 'какая-то строка', grade: 'A' }] },
  { equip: 'TK156', date: '2026-08-14', type: 'INSP', cls: 'HT', by: 'X', smu: '7506',
    items: [{ key: 'COOL', label: '', grade: 'B' }] },
  /* A thermal survey walks the inspection's points and has never had a list of
     its own. It must not fall through to the raw key. */
  { equip: 'TK156', date: '2026-08-14', type: 'TEMP', cls: 'HT', by: 'X', smu: '7506',
    items: [{ key: 'BRK', label: '', tempC: '96' }] },
];

const names = (p, recs, unit, L) => p.evaluate(({ recs, unit, L }) => {
  window.CM_DATA = null;
  lang = L; applyLang();
  CMDash.importRecords(recs);
  document.getElementById('dataOv').classList.add('hidden');
  return CMReport.normalise(CMReport.recsForScope('unit', unit), { photos: false })
    .map(r => ({ date: r.date, type: r.type,
                 names: r.items.map(i => i.name), alt: r.items.map(i => i.nameAlt) }));
}, { recs, unit, L });

const fresh = async (p) => { await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(900); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await fresh(p);

  console.log('the vocabulary is a file both ends load');
  ok('the office has it at all', await p.evaluate(() => !!(window.PTS && PTS.label)));
  ok('and it answers in both languages', await p.evaluate(() =>
     PTS.label('HT', 'MP', '4C', 'en') === 'Left Rear Final Drive'
     && PTS.label('HT', 'MP', '4C', 'ru') === 'Левый задний бортовой редуктор'),
     await p.evaluate(() => PTS.label('HT', 'MP', '4C', 'en') + ' / ' + PTS.label('HT', 'MP', '4C', 'ru')));
  /* "" and not the key. A caller handed back a key cannot tell a real name
     from a fallback, and every one of them already knows how to print a key. */
  ok('a point it has never heard of gets "", not the key back',
     await p.evaluate(() => PTS.label('HT', 'MP', 'ZZZ', 'en') === ''));

  console.log('\ntwo rounds captured in two languages');
  let r = await names(p, RECS, 'TK156', 'en');
  const en = r.flatMap(x => x.names);
  ok('both rounds name the same point the same way in English',
     en.every(n => n === 'Left Rear Final Drive' || n === 'Right Rear Final Drive'), en.join(' | '));
  ok('and neither is the string the phone happened to freeze',
     !en.some(n => /ЛЕВЫЙ|Левый|LEFT REAR FINAL DRIVE/.test(n)), en.join(' | '));
  await fresh(p);
  r = await names(p, RECS, 'TK156', 'ru');
  const ru = r.flatMap(x => x.names);
  ok('and the same way in Russian', ru.every(n => /редуктор$/.test(n)), ru.join(' | '));
  ok('with the other language available beside it, on both rounds',
     r.every(x => x.alt.every(a => /Final Drive$/.test(a))), r.flatMap(x => x.alt).join(' | '));

  console.log('\nthe round types that had the same hole');
  await fresh(p);
  r = await names(p, OTHER, 'TK156', 'ru');
  const by = {}; r.forEach(x => by[x.type] = x);
  ok('a filter cut names its filter, not the phone\'s string',
     (by.FC || {}).names && by.FC.names[0] === 'Фильтр моторного масла', (by.FC || {}).names);
  ok('a walk-around names its system even with no label recorded',
     (by.INSP || {}).names && by.INSP.names[0] === 'Система охлаждения', (by.INSP || {}).names);
  ok('a thermal survey borrows the inspection\'s points rather than printing a code',
     (by.TEMP || {}).names && by.TEMP.names[0] === 'Тормоза и ретардер', (by.TEMP || {}).names);
  ok('and each carries the other language too',
     ['FC', 'INSP', 'TEMP'].every(t => by[t] && by[t].alt[0] && !/^[A-Z]{3,5}$/.test(by[t].alt[0])),
     ['FC', 'INSP', 'TEMP'].map(t => (by[t] || {}).alt).join(' | '));

  console.log('\nthe phone and the office read one copy');
  /* Not "both produce the same string today" — that is true of two copies on
     the day they are written. The check is that there is only one file. */
  const app = await fetch((process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT
                           : 'http://127.0.0.1:8099') + '/mobile/index.html').then(x => x.text());
  ok('the app loads points.js', /<script src="points\.js/.test(app));
  ok('and does not keep its own copy of the vocabulary beside it',
     !/^const CLASSES = \{/m.test(app) && !/^const COMP = \{/m.test(app),
     (app.match(/^const (CLASSES|COMP)[^\n]{0,40}/gm) || []).join(' | ') || 'one copy');
  ok('the service worker caches it, so it is there offline',
     /"\.\/points\.js\?v="/.test(await fetch((process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT
       : 'http://127.0.0.1:8099') + '/mobile/sw.js').then(x => x.text())));

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ')
                           : '\nall point-name checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
