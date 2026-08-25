/* When is this machine next due, and how does the app know?

   The schedule the fleet gave is in HOURS — a plug every 250, an engine filter
   every 500 and the rest every 1000, undercarriage and ground engaging tools
   every 500, a dump body every 1000 — and the due list used to be in days, with
   a default of 90 that came from nowhere in particular. Converting them once by
   hand would have been the wrong fix: hours are what the machine wears in, and
   a truck parked for three weeks on a broken wheel motor has not put debris on
   its plugs.

   So this checks the arithmetic the schedule is actually made of:

     the intervals are the fleet's, in hours, with the filter split intact;
     the calendar is a RENDERING of them at a stated rate, not the schedule;
     a machine that has been inspected twice is counted at its OWN rate, and one
       that has not is counted at the assumption and says so;
     a rate the readings cannot support is refused rather than believed;
     the format change did not cost anybody their history;
     and where two measurements forecast a condemn limit sooner than the
       interval, the forecast wins and the list says why.

   Run: node tests/duehours.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL  = `http://127.0.0.1:${PORT}/mobile/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const mk = `((id,ty,u,d,smu,pos)=>({id,type:ty,equip:u,date:d,by:'S. Volkov',sup:'A. Sokolov',
  smu:String(smu==null?'':smu), cls:'', gps:null, dev:'PH-01', sign:null,
  positions:pos||{}, created:d+'T06:00:00.000Z', up:0, upTo:{}, rev:1}))`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);

  console.log('\n  the intervals are the ones the fleet gave');
  const iv = await p.evaluate(() => ({
    hpd: DUE.HOURS_PER_DAY,
    MP: [DUE.hours('MP'), DUE.days('MP')],
    FCr: [DUE.hours('FC'), DUE.days('FC')],
    FCe: [DUE.hours('FC', 'ENG'), DUE.days('FC', 'ENG')],
    FCh: [DUE.hours('FC', 'HYD'), DUE.days('FC', 'HYD')],
    UC: [DUE.hours('UC'), DUE.days('UC')],
    GET: [DUE.hours('GET'), DUE.days('GET')],
    TB: [DUE.hours('TB'), DUE.days('TB')],
    INSP: [DUE.hours('INSP'), DUE.days('INSP')],
    TEMP: [DUE.hours('TEMP'), DUE.days('TEMP')],
    at500: DUE.partsDue('FC', 600), at1000: DUE.partsDue('FC', 1100),
  }));
  ok('a machine is assumed to run 20 hours a day', iv.hpd === 20, iv.hpd + ' h/day');
  ok('magnetic plug every 250 h', iv.MP[0] === 250 && iv.MP[1] === 12.5, iv.MP.join(' h → ') + ' d');
  ok('undercarriage and ground engaging tools every 500 h',
    iv.UC[0] === 500 && iv.GET[0] === 500 && iv.UC[1] === 25, 'UC ' + iv.UC.join('/') + ' GET ' + iv.GET.join('/'));
  ok('dump body every 1000 h', iv.TB[0] === 1000 && iv.TB[1] === 50, iv.TB.join(' h → ') + ' d');
  ok('the engine filter every 500 h and the rest every 1000',
    iv.FCe[0] === 500 && iv.FCh[0] === 1000, 'ENG ' + iv.FCe[0] + ' · HYD ' + iv.FCh[0]);
  ok('and the round itself comes due at the shortest of them',
    iv.FCr[0] === 500, 'FC round ' + iv.FCr[0] + ' h');
  ok('a 600-hour visit is the engine filter only',
    JSON.stringify(iv.at500) === '["ENG"]', JSON.stringify(iv.at500));
  ok('and an 1100-hour visit is all of them',
    iv.at1000.length === 5, JSON.stringify(iv.at1000));
  ok('the walk-around every 500 h', iv.INSP[0] === 500 && iv.INSP[1] === 25,
    iv.INSP.join(' h → ') + ' d');
  /* Nobody has given the temperature round or the lubrication audit an hour
     figure. Carrying the calendar they already ran on is the honest answer;
     inventing 600 h for them is not. */
  ok('a round with no hour figure keeps its calendar and says so',
    iv.TEMP[0] === null && iv.TEMP[1] === 30, 'TEMP ' + iv.TEMP[1] + ' d');

  console.log('\n  the due list counts in hours');
  const one = await p.evaluate(async ([MK]) => {
    const mk = eval(MK);
    localStorage.removeItem('cm_hist'); localStorage.removeItem('cm_smu');
    histSave({}); smuSave({});
    /* One truck inspected twice, hour meter moving 558 h in 31 days — 18 h/day,
       which is what this machine actually does. One inspected once, with no
       meter reading at all. */
    noteDone(mk('a', 'MP', 'TK146', '2026-07-01', 20000));
    noteDone(mk('b', 'MP', 'TK146', '2026-08-01', 20558));
    noteDone(mk('c', 'MP', 'TK149', '2026-08-01', ''));
    const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 300));
    const rate = { own: unitRate('TK146'), none: unitRate('TK149') };
    const at = d => ({
      own:  DUE.next({ type: 'MP', last: histEntry(histAll()['MP|TK146']), today: d, rate: unitRate('TK146') }),
      none: DUE.next({ type: 'MP', last: histEntry(histAll()['MP|TK149']), today: d, rate: unitRate('TK149') }),
    });
    /* Day 13 is where the two answers separate: 13 x 20 = 260 h, past a
       250-hour round; 13 x 18 = 234 h, not. */
    return { rate, hist: histAll(), smu: smuAll(),
             d13: at('2026-08-14'), d14: at('2026-08-15'), d25: at('2026-08-26') };
  }, [mk]);

  ok('the hour meter is kept with the date, not thrown away',
    one.hist['MP|TK146'] && one.hist['MP|TK146'].h === 20558,
    JSON.stringify(one.hist['MP|TK146']));
  ok('two readings measure the machine\'s own rate', one.rate.own === 18, one.rate.own + ' h/day');
  ok('and one reading measures nothing, rather than guessing', one.rate.none === null,
    String(one.rate.none));
  /* 250 h at 20 h/day is 12.5 days; at this truck's 18 it is 13.9. The machine
     that has told us what it does gets the longer interval, and it is not a
     rounding — it is a day and a half of a fitter's week. */
  ok('a machine with no meter is counted at the assumption and is overdue on day 13',
    one.d13.none.over && !one.d13.none.measured && one.d13.none.hoursSince === 260,
    'day 13: ' + one.d13.none.hoursSince + ' h at ' + one.d13.none.rate + ' h/day');
  ok('and the one that runs slower is not overdue with it',
    !one.d13.own.over && one.d13.own.measured && one.d13.own.dueInHours === 16,
    'day 13: ' + one.d13.own.hoursSince + ' h at ' + one.d13.own.rate
      + ' h/day, ' + one.d13.own.dueInHours + ' h left');
  ok('it comes due a day later, once its own hours are spent',
    one.d14.own.over && one.d25.own.over,
    'day 14 ' + one.d14.own.dueInHours + ' h · day 25 ' + one.d25.own.dueInHours + ' h');
  ok('the hours since are the machine\'s hours, not the calendar\'s',
    one.d14.own.hoursSince === 252 && one.d14.none.hoursSince === 280,
    one.d14.own.hoursSince + ' h at 18 · ' + one.d14.none.hoursSince + ' h at 20');
  ok('and the hour meter now is reported, not just the one written down',
    one.d14.own.smuNow === 20810, String(one.d14.own.smuNow));

  console.log('\n  a rate the readings cannot support is refused');
  const bad = await p.evaluate(() => ({
    tooSoon: DUE.rateFrom([{ d: '2026-08-01', h: 100 }, { d: '2026-08-03', h: 140 }]),
    absurd:  DUE.rateFrom([{ d: '2026-07-01', h: 100 }, { d: '2026-08-01', h: 40000 }]),
    backwards: DUE.rateFrom([{ d: '2026-07-01', h: 900 }, { d: '2026-08-01', h: 100 }]),
    one: DUE.rateFrom([{ d: '2026-07-01', h: 900 }]),
    good: DUE.rateFrom([{ d: '2026-07-01', h: 1000 }, { d: '2026-07-31', h: 1300 }]),
  }));
  ok('two readings days apart do not measure a daily rate', bad.tooSoon === null);
  ok('a meter that jumped 40,000 hours is not an operating pattern', bad.absurd === null);
  ok('nor is one that ran backwards', bad.backwards === null);
  ok('one reading is not two', bad.one === null);
  ok('and a believable one is believed', bad.good === 10, String(bad.good));

  console.log('\n  the format change cost nobody their history');
  const old = await p.evaluate(async () => {
    /* Exactly what a build before this one wrote: a bare date string. */
    localStorage.setItem('cm_hist', JSON.stringify({ 'MP|TK150': '2026-07-20' }));
    histSave(JSON.parse(localStorage.getItem('cm_hist')));
    const s = document.getElementById('typeSel'); s.value = 'MP'; s.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 300));
    showPane('paneSystem'); renderDue();
    await new Promise(r => setTimeout(r, 200));
    return { entry: histEntry(histAll()['MP|TK150']),
             list: document.getElementById('dueList').textContent.replace(/\s+/g, ' ').trim() };
  });
  ok('an entry written by an older build still reads',
    old.entry && old.entry.d === '2026-07-20', JSON.stringify(old.entry));
  ok('and the unit is still on the due list', /TK150/.test(old.list), old.list.slice(0, 80));

  console.log('\n  what the list is counting in, said out loud');
  const basis = await p.evaluate(() => document.getElementById('dueBasis').textContent);
  ok('the interval and the assumed rate are on the screen',
    /250 h/.test(basis) && /20 h\/day/.test(basis), basis);
  const box = await p.evaluate(() => document.getElementById('dueInt').value);
  ok('and the box the inspector can change is in hours', box === '250', box + ' in the box');

  console.log('\n  the second measurement brings the round forward');
  const wear = await p.evaluate(async ([MK]) => {
    const mk = eval(MK);
    localStorage.removeItem('cm_hist'); histSave({});
    const s = document.getElementById('typeSel'); s.value = 'UC'; s.dispatchEvent(new Event('change'));
    selectEquip('DZ004');
    await new Promise(r => setTimeout(r, 400));
    const ks = items().map(x => x.k);
    /* Two rounds 500 hours apart on the same machine, the second much closer to
       the condemn limit than the first — a real wear rate, and a short life. */
    const at = f => { const o = {};
      ks.forEach((k, i) => { const sp = ucSplit(k);
        const rf = WEAR.refFor('DZ004', (ASSET_BY['DZ004'] || {}).m, sp[0], sp[1], '2026-08-01');
        if (!rf || rf.x || rf.c == null) return;
        o[k] = { mm: Math.round((rf.n + (rf.c - rf.n) * f) * 10) / 10, stood: 0, reason: '', photos: [], video: null }; });
      return o; };
    const r1 = mk('w1', 'UC', 'DZ004', '2026-06-01', 7000, at(0.55));
    const r2 = mk('w2', 'UC', 'DZ004', '2026-07-01', 7500, at(0.92));
    await dbPut(r1); noteDone(r1);
    await dbPut(r2); noteDone(r2);
    await noteWear(r2);
    const last = histEntry(histAll()['UC|DZ004']);
    const plain = DUE.next({ type: 'UC', last: { d: last.d, h: last.h }, today: '2026-07-11' });
    const withF = DUE.next({ type: 'UC', last: last, today: '2026-07-11' });
    renderDue();
    await new Promise(r => setTimeout(r, 200));
    return { last, plain, withF,
             list: document.getElementById('dueList').textContent.replace(/\s+/g, ' ').trim() };
  }, [mk]);

  ok('a round with two measurements records what it forecast',
    wear.last && wear.last.f > 0, JSON.stringify(wear.last));
  ok('the forecast is shorter than the interval', wear.last.f < 500, wear.last.f + ' h vs 500 h');
  ok('so the machine is due sooner than the schedule says',
    wear.withF.dueInHours < wear.plain.dueInHours,
    'wear ' + wear.withF.dueInHours + ' h vs interval ' + wear.plain.dueInHours + ' h');
  ok('and the list says wear is why, not the interval',
    wear.withF.why === 'wear' && /wear, not the interval/.test(wear.list),
    wear.list.slice(0, 110));

  console.log('\n  and a round somebody else walked moves the date too');
  const team = await p.evaluate(async ([MK]) => {
    const mk = eval(MK);
    const row = teamRow(mk('t1', 'MP', 'TK161', '2026-08-02', 31234));
    localStorage.removeItem('cm_hist'); histSave({}); smuSave({});
    teamMergeRows([row], true);
    return { row: row, entry: histEntry(histAll()['MP|TK161']), trail: smuAll()['TK161'] };
  }, [mk]);
  ok('the summary row carries the hour meter', team.row.s === 31234, JSON.stringify(team.row));
  ok('and it reaches the history index', team.entry && team.entry.h === 31234,
    JSON.stringify(team.entry));
  ok('and the machine\'s hour trail', (team.trail || []).length === 1,
    JSON.stringify(team.trail));

  await b.close();
  console.log(fails.length ? '\n' + fails.length + ' FAILED' : '\nall good');
  process.exit(fails.length ? 1 : 0);
})();
