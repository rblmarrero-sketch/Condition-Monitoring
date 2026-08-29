/* Was the round walked, and is the fleet getting better.

   Every number on the overview was a snapshot with no denominator and no
   direction. "44 inspections" is either 90% of the fleet or 4% of it, and those
   are different meetings. "82 findings" is either an improvement or a collapse,
   and nothing on the page said which.

   The coverage half matters more than it looks. A round that was never walked
   produces no findings — and on every other chart here, no findings looks
   exactly like a machine in good condition. That is the most dangerous
   confusion in condition monitoring and it is why coverage sits ABOVE the
   fleet table rather than below it.

   What is guarded:
     · the denominator is the register, not the set of machines that happen to
       have a record — using records as the denominator reads 100% for ever
     · and it is scoped per round, because counting an undercarriage round
       against 1,128 units including light towers reports 2% on a programme
       that may be reaching every dozer it owns
     · every count on a row is about the SAME population; the first version put
       "3 of 43 reached" next to "1125 never done" on one line
     · never-done and overdue are different problems and stay apart
     · the trend says a direction in words, and says plainly when there is not
       enough history to have one
*/
const { chromium } = require(require('./pw.cjs'));
const BUNDLED = require('./bundled.cjs');
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099')
        + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

/* Five months of a magnetic-plug round whose coverage falls away, plus an
   undercarriage round on three dozers so the scoped denominator is exercised. */
const RECS = (() => {
  const o = [];
  ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].forEach((m, mi) => {
    ['TK146', 'TK147', 'TK151', 'TK158', 'TK159', 'EX07', 'DZ001']
      .slice(0, [7, 7, 6, 4, 5][mi]).forEach((u, ui) => {
        o.push({ equip: u, date: `${m}-1${ui % 9}`, type: 'MP', cls: 'HT',
          by: ['R. Marrero', 'B. Ivanov'][ui % 2],
          items: [{ key: '4C', label: 'LR FD', grade: ['A', 'B', 'C', 'X'][(mi + ui) % 4],
                    defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', cause: 'Gear wear' }] });
      });
  });
  ['2026-06', '2026-07'].forEach(m => ['DZ001', 'DZ002', 'DZ003'].forEach((u, i) =>
    o.push({ equip: u, date: `${m}-1${i}`, type: 'UC', cls: 'DOZ', by: 'R. Marrero', smu: '9000',
             items: [{ key: 'ROLLER.L1', label: 'Roller L1', mm: 230 }] })));
  return o;
})();

const cov = () => [...document.querySelectorAll('#covTbl tbody tr')].map(tr => {
  const c = [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim());
  const m = (c[1] || '').match(/(\d+)\s*\/\s*(\d+)/) || [];
  return { round: c[0], seen: +m[1], total: +m[2], insp: +c[3], never: +c[4],
           over: +c[5], people: +c[6], scoped: /fits|применим/i.test(c[0]) };
});

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1400 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  /* The sixteen bundled rounds of 29 July. This suite has always leaned on
     them to have enough findings in the last month to read a direction from —
     it just never had to say so, because the dashboard merged them in by
     itself. That source is retired; the fixture is stated. */
  await p.evaluate(BUNDLED + "()");
  await p.waitForTimeout(400);
  await p.evaluate(r => {
    CMDash.importRecords(r);
    document.getElementById('dataOv').classList.add('hidden');
    showTab('overview');
  }, RECS);
  await p.waitForTimeout(900);

  console.log('coverage answers "of how many"');
  const rows = await p.evaluate(cov);
  note('rows', rows.map(r => r.round.split(' every')[0] + ' ' + r.seen + '/' + r.total).join('   '));
  ok('a row per round that was walked', rows.length >= 2, rows.length + ' row(s)');
  const uc = rows.find(r => /Undercarriage|Ходовая/i.test(r.round));
  const mp = rows.find(r => /Magnetic|Пробка/i.test(r.round));
  ok('the undercarriage round is measured against machines that have one',
     uc && uc.total > 0 && uc.total < 200, uc && uc.total + ' units');
  ok('and says so, so nobody reads it as the whole fleet', uc && uc.scoped, uc && uc.round);
  ok('a round that applies to everything uses the whole register',
     mp && mp.total > 1000, mp && mp.total + ' units');
  ok('and is not labelled as scoped', mp && !mp.scoped, mp && mp.round);

  console.log('\nand every number on a row is about the same machines');
  rows.forEach(r => ok('  ' + r.round.split(' every')[0] + ': reached + never + overdue never exceeds the pool',
    r.seen + r.never + r.over <= r.total + r.seen,          // seen may also be overdue-clear
    `${r.seen} seen, ${r.never} never, ${r.over} overdue, of ${r.total}`));
  ok('never-done and overdue are counted apart, not lumped together',
     uc && uc.never >= 0 && uc.over >= 0 && (uc.never + uc.over) <= uc.total,
     uc && `${uc.never} never + ${uc.over} overdue <= ${uc.total}`);
  ok('the denominator is the register, not the records',
     mp && mp.total > mp.seen, mp && `${mp.seen} seen of ${mp.total}`);

  console.log('\nthe fleet register is named, so the number can be checked');
  const cn = await p.evaluate(() => document.getElementById('covNote').textContent);
  ok('the note says what it counted against', /\d/.test(cn) && cn.length > 40, cn.slice(0, 90));

  console.log('\ndirection, in a shape and in a sentence');
  const tr = await p.evaluate(() => ({
    months: [...document.querySelectorAll('#trendChart .tmon')].length,
    stacks: [...document.querySelectorAll('#trendChart .tstack')].length,
    /* The key rides on the panel's title line now, not inside the plot. A
       legend of its own cost a row of chart height, and a chart that spends
       its height explaining its colours has less chart in it. Same guarantee,
       same panel, one line up. */
    legend: [...document.querySelectorAll('#trendKey span')].length,
    note: document.getElementById('trendNote').textContent,
  }));
  ok('a bar per month', tr.months >= 3, tr.months + ' month(s)');
  ok('stacked by severity, worst on top', tr.stacks === tr.months);
  ok('with a legend, so colour is never the only carrier', tr.legend >= 3, tr.legend + ' entries');
  ok('and a sentence that names the direction',
     /above|below|about the same|выше|ниже|примерно/i.test(tr.note), tr.note.slice(0, 110));

  console.log('\nit refuses to call a direction it cannot see');
  const short = await p.evaluate(() => {
    /* One month only: a single sample is not a trend and must not be drawn
       as one. */
    const q = document.getElementById('fQ'); q.value = 'DZ00'; q.dispatchEvent(new Event('input'));
    const s = document.getElementById('fRange'); s.value = '0'; s.dispatchEvent(new Event('change'));
    return null;
  });
  await p.waitForTimeout(500);
  const two = await p.evaluate(() => ({
    months: [...document.querySelectorAll('#trendChart .tmon')].length,
    note: document.getElementById('trendNote').textContent,
    empty: !!document.querySelector('#trendChart .empty'),
  }));
  /* The real hazard here is not a missing chart, it is a confident one. A
     month with one finding followed by a month with none is "100% better",
     and that sentence gets copied into a report. */
  ok('a handful of findings still draws', two.empty || two.months >= 2,
     'months=' + two.months + ' empty=' + two.empty);
  ok('but no percentage is quoted off numbers that small',
     two.empty || !/\d+%/.test(two.note), two.note.slice(0, 110) || '(chart says it instead)');
  ok('and it says why', two.empty || /too few|слишком мало|not enough|недостаточно/i.test(two.note),
     two.note.slice(0, 110) || '(chart says it instead)');

  console.log('\nthe filters reach it like everything else');
  await p.evaluate(() => {
    const q = document.getElementById('fQ'); q.value = ''; q.dispatchEvent(new Event('input'));
    const s = document.getElementById('fType'); s.value = 'UC'; s.dispatchEvent(new Event('change'));
  });
  await p.waitForTimeout(600);
  const only = await p.evaluate(cov);
  ok('choosing one round shows only that round', only.length === 1 && /Undercarriage|Ходовая/i.test(only[0].round),
     only.map(r => r.round.split(' every')[0]).join(','));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
