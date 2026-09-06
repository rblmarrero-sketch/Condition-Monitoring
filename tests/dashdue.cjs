/* The office's half of "what is due, and what we missed".

   The phone has always known what was due — it computes it from the same
   due.js and shows it to the inspector standing in the yard. The office never
   did. A folder full of inspections can say when a machine was LAST looked at;
   it cannot say whether the reason nobody went last week was that the machine
   was on a low-loader to the workshop or that nobody read the list. Those two
   look identical in a folder and are completely different to a planner.

   So both halves have to arrive: the schedule, computed here from the same
   file the phones use so the two can never drift; and the reasons, which the
   inspectors type on the phone and which now travel in _meta/deferrals and
   land on the row that would otherwise just be red.

   What this suite is really guarding is the absence of a lie. Three ways this
   screen can lie, and one check each:

     - a machine that IS overdue not appearing (the count is honest)
     - a machine that was deliberately put off appearing as a failure
       (deferred is not missed)
     - a deferral that has been overtaken by an actual inspection still
       excusing the machine (a reason has to expire, and nothing deletes it)

   Run: node tests/dashdue.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const URL = 'http://127.0.0.1:8099/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* Dates relative to today, so the suite does not go red in November — and
   relative to the SITE's today, which is the only calendar the application
   uses. Built from Date.now() in UTC, every fixture date was a day older than
   this suite intended for twelve hours out of every twenty-four, and a machine
   placed deliberately at "due soon" was reported overdue. The suite has to ask
   due.js what day it is for the same reason the two applications do.

   And the day is FROZEN, in the fixture and in the page alike, so a sweep that
   runs across site midnight cannot have the records built on one day and read
   on the next. */
const fs = require('fs'), path = require('path');
const DUE = (() => { const G = {};
  new Function('self', fs.readFileSync(path.join(__dirname, '..', 'mobile', 'due.js'), 'utf8'))(G);
  return G.DUE; })();
const TODAY = DUE.today();
const ago = n => DUE.shift(TODAY, -n);
const on  = n => DUE.shift(TODAY,  n);

/* At 20 h/day the intervals land at: MP 250 h = 12.5 d, UC/GET/INSP 500 h =
   25 d, TB 1000 h = 50 d. Every unit below is placed against one of those
   deliberately, not by picking a number that looked overdue. */
const RECS = [
  // 40 days on a 12.5-day round: badly overdue, and nobody has said why.
  { equip: 'TK101', date: ago(40), type: 'MP', by: 'R. Marrero', smu: '9000', items: [] },
  /* 70 days on a 50-day round: overdue, and deferred to next week with a
     reason. These are articulated trucks, and an undercarriage round on a
     class the fleet has not given a figure for keeps the round's own 1,000 h
     — 50 days at 20 h/day — rather than inheriting a dozer's or an
     excavator's. The suite was written when UC was a flat 500 h for every
     machine on site, which is the number that walked the excavators eight
     times more often than anybody asked for. */
  { equip: 'TK102', date: ago(70), type: 'UC', by: 'R. Marrero', smu: '8000', items: [] },
  // 2 days on a 12.5-day round: nowhere near due.
  { equip: 'TK103', date: ago(2),  type: 'MP', by: 'B. Ivanov',  smu: '7000', items: [] },
  // 12 days on a 12.5-day round: inside the last fifth — due soon, not missed.
  { equip: 'TK104', date: ago(12), type: 'MP', by: 'B. Ivanov',  smu: '6000', items: [] },
  /* TK105 was put off a month ago — and then somebody actually walked it a
     week ago. The reason is spent: it must not still be excusing the machine.
     Nothing is deleted for that to be true. */
  { equip: 'TK105', date: ago(7),  type: 'GET', by: 'S. Volkov', smu: '5000', items: [] },
  /* TK106 has two hour-meter readings 30 days apart and 300 hours: 10 h/day,
     half the fleet assumption. Its 250-hour round is 25 days at its own rate,
     not 12.5 — at 20 days it is NOT overdue, and a screen that says it is has
     put a light vehicle on a haul truck's calendar. */
  { equip: 'TK106', date: ago(50), type: 'MP', by: 'S. Volkov', smu: '1000', items: [] },
  { equip: 'TK106', date: ago(20), type: 'MP', by: 'S. Volkov', smu: '1300', items: [] },
  /* A second machine past due with nobody's reason on it, so "explained" is
     one of two rather than one of one. A tile that can only ever read 100%
     is a tile that has never been read. */
  { equip: 'TK107', date: ago(65), type: 'UC', by: 'R. Marrero', smu: '4000', items: [] },
];

const DEFS = [
  { u: 'TK102', t: 'UC',  until: on(7), why: 'on a low-loader to the workshop', by: 'S. Volkov', at: ago(3) },
  { u: 'TK105', t: 'GET', until: on(20), why: 'no bucket fitted',              by: 'S. Volkov', at: ago(30) },
];

const rows = p => p.$$eval('#ddList tbody tr', a => a.map(tr => ({
  cls: tr.className,
  text: tr.textContent.replace(/\s+/g, ' ').trim(),
  unit: tr.querySelector('td b') ? tr.querySelector('td b').textContent.trim() : '',
})));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_/.test(m.text())) fails.push('CONSOLE ' + m.text()); });

  await p.goto(URL, { waitUntil: 'load' });
  /* The page ships a bundled magnetic-plug history so it is never blank on a
     first run. Every unit below is placed against a specific interval on
     purpose, and seventeen sample trucks sitting in the same list would make
     every count in this suite a count of the sample data. Clear it, so the
     numbers asserted here are the numbers this suite put there. */
  await p.evaluate(() => { localStorage.clear(); window.CM_DATA = null; });
  await p.evaluate(d => { DUE.setToday(d); }, TODAY);   // the same day the fixture was built on
  await p.evaluate(r => { CMDash.importRecords(r); }, RECS);
  await p.evaluate(d => { CMDash.setDeferrals(d, { replace: true }); }, DEFS);
  await p.evaluate(() => document.getElementById('dataOv').classList.add('hidden'));
  await p.click('[data-tab="due"]');
  await p.waitForTimeout(300);

  console.log('the tab is reachable and renders');
  ok('there is a tab for it', await p.evaluate(() => !!document.querySelector('[data-tab="due"]')));
  ok('and it opens', await p.evaluate(() => !document.getElementById('tab-due').classList.contains('hidden')));
  ok('the heading is in words, not a key',
     !/^dd_/.test((await p.textContent('#tab-due h2')).trim()), (await p.textContent('#tab-due h2')).trim().slice(0, 50));

  console.log('\nwhat is missed');
  let r = await rows(p);
  ok('the overdue machine nobody explained is listed',
     r.some(x => x.unit === 'TK101'), r.map(x => x.unit).join(' '));
  ok('and is marked as past due', (r.find(x => x.unit === 'TK101') || {}).cls === 'dd-over');
  ok('a machine done two days ago is not on the missed list',
     !r.some(x => x.unit === 'TK103'), r.map(x => x.unit).join(' '));
  ok('nor is one that is merely due soon',
     !r.some(x => x.unit === 'TK104'), r.map(x => x.unit).join(' '));
  ok('the row says how overdue in days AND in hours',
     /\d+\s*d/.test((r.find(x => x.unit === 'TK101') || {}).text || '')
     && /\d+\s*h/.test((r.find(x => x.unit === 'TK101') || {}).text || ''),
     (r.find(x => x.unit === 'TK101') || {}).text);

  console.log('\ndeferred is not missed');
  ok('a machine put off with a reason is off the missed list',
     !r.some(x => x.unit === 'TK102'), r.map(x => x.unit).join(' '));
  await p.selectOption('#ddScope', 'put'); await p.waitForTimeout(200);
  r = await rows(p);
  ok('it is on the put-off list instead', r.some(x => x.unit === 'TK102'), r.map(x => x.unit).join(' '));
  const put = r.find(x => x.unit === 'TK102') || {};
  ok('carrying the reason the inspector typed', /low-loader/.test(put.text || ''), put.text);
  ok('and who said it', /Volkov/.test(put.text || ''));
  ok('and the date it is put off to', put.text.indexOf(on(7)) >= 0, put.text);
  ok('marked as a decision, not a failure', put.cls === 'dd-put', put.cls);

  console.log('\na reason is spent by an actual inspection');
  ok('a machine walked after it was put off is not still excused',
     !r.some(x => x.unit === 'TK105'), r.map(x => x.unit).join(' '));
  ok('and the deferral was not deleted to make that true',
     await p.evaluate(() => !!CMDash.deferrals()['GET|TK105']));

  console.log('\nthe machine\'s own rate, not the fleet\'s');
  await p.selectOption('#ddScope', 'all'); await p.waitForTimeout(200);
  r = await rows(p);
  const m = r.find(x => x.unit === 'TK106') || {};
  ok('a machine measured at half the fleet rate is not called overdue',
     m.cls !== 'dd-over', `${m.cls} — ${m.text}`);
  ok('and the row shows the rate it was scheduled on', /\b10\b/.test(m.text || ''), m.text);
  const assumed = r.find(x => x.unit === 'TK101') || {};
  ok('a machine with no measurement says the rate was assumed',
     /\*/.test(assumed.text || ''), assumed.text);

  console.log('\nthe counts');
  const kpi = await p.$$eval('#dueKpis .kpi', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  ok('four tiles, each a number with a denominator', kpi.length === 4, kpi.join(' | '));
  /* Seven seeded unit-rounds. Two are past due and unexcused — TK101's plug at
     40 days on a 12.5-day round and TK107's undercarriage at 65 on a 50-day
     one. TK102 is past due too but was put off with a reason, and a machine
     somebody made a decision about is not a machine anybody missed: it belongs
     in the put-off count, not this one. TK103 is fresh, TK104 and TK106 are
     due soon, TK105's reason was spent by an actual inspection. Counted from
     the intervals, not read off the screen and written down. */
  const kv = await p.$$eval('#dueKpis .kpi .v', a => a.map(x => x.textContent.trim()));
  ok('the past-due tile counts what nobody explained away', kv[0] === '2', `${kv[0]} — ${kpi[0]}`);
  ok('a machine put off on purpose is counted as a decision, not a miss',
     kv[2] === '1', `${kv[2]} — ${kpi[2]}`);
  /* Three rounds are past their interval: TK101, TK107 and TK102. One of them
     carries a reason. The tile that counts reasons must count against all
     three, or it excludes the only row that has one and reports "1 of 2". */
  ok('the explained tile counts against every round past its interval, not just the unexcused ones',
     kv[3] === '1' && /\b3\b/.test(kpi[3]), `${kv[3]} explained — ${kpi[3]}`);
  ok('pressing a tile filters to what it counts', await (async () => {
    await p.click('#dueKpis [data-dd="put"]'); await p.waitForTimeout(200);
    return (await p.evaluate(() => document.getElementById('ddScope').value)) === 'put';
  })());

  console.log('\nnarrowing to one round');
  await p.selectOption('#ddScope', 'all');
  await p.selectOption('#ddType', 'MP'); await p.waitForTimeout(200);
  r = await rows(p);
  ok('only that round is listed', r.length > 0 && r.every(x => / MP /.test(' ' + x.text + ' ') || /MP/.test(x.text)),
     r.map(x => x.unit).join(' '));
  ok('and machines whose only round is another type drop out',
     !r.some(x => x.unit === 'TK102'), r.map(x => x.unit).join(' '));
  await p.selectOption('#ddType', ''); await p.waitForTimeout(200);

  console.log('\nthe page is one page');
  /* </main> was closed three sections early, so Lubrication, Reports and this
     tab rendered full-bleed against the window edge while every other tab sat
     centred at 1240px. On a 24" monitor the dashboard visibly changed shape
     when you pressed a tab. Nothing about it errored, and nothing about it was
     right — which is why it survived so long. Every tab, one frame. */
  const widths = {};
  for (const tab of ['overview', 'failure', 'wear', 'actions', 'due', 'equipment', 'lube', 'reports']) {
    await p.click(`[data-tab="${tab}"]`); await p.waitForTimeout(120);
    widths[tab] = await p.evaluate(id => {
      const r = document.getElementById('tab-' + id).getBoundingClientRect();
      return Math.round(r.left) + ':' + Math.round(r.width);
    }, tab);
  }
  const distinct = [...new Set(Object.values(widths))];
  ok('every tab is laid out in the same frame', distinct.length === 1,
     Object.entries(widths).map(([k, v]) => `${k} ${v}`).join('  '));
  await p.click('[data-tab="due"]'); await p.waitForTimeout(150);

  console.log('\nno control on screen that does nothing');
  /* The bar at the top of the page narrows records by type, class and PERIOD.
     A period filter over a due list is not merely useless, it is wrong: a round
     walked 60 days ago and excluded by a 30-day window would make a machine
     that is up to date look like one nobody has ever visited. So it is put away
     here, and the tab carries its own controls instead. */
  ok('the global record filters are put away on this tab',
     await p.evaluate(() => document.querySelector("main > .controls").classList.contains("hidden")));
  ok('and come back on a tab they do work on', await (async () => {
    await p.click('[data-tab="overview"]'); await p.waitForTimeout(150);
    const back = await p.evaluate(() => !document.querySelector("main > .controls").classList.contains("hidden"));
    await p.click('[data-tab="due"]'); await p.waitForTimeout(150);
    return back;
  })());

  console.log('\nlooking for one machine');
  await p.selectOption('#ddScope', 'all');
  await p.fill('#ddQ', 'TK10'); await p.waitForTimeout(250);
  r = await rows(p);
  ok('the tab has its own search and it narrows the list',
     r.length > 0 && r.every(x => /^TK10/.test(x.unit)), r.map(x => x.unit).join(' '));
  await p.fill('#ddQ', 'TK106'); await p.waitForTimeout(250);
  r = await rows(p);
  /* Since Phase 4 the All view also lists the rounds this machine has never
     had, so "one machine" is every row being TK106 — not one row. */
  ok('down to one machine', r.length >= 1 && r.every(x => x.unit === 'TK106'), r.map(x => x.unit).join(' '));
  const onScreen = r.length;
  /* An export that quietly widens back to the whole fleet is how a filtered
     screen becomes an unfiltered spreadsheet with nobody noticing. */
  const csv = await p.evaluate(() => {
    let got = null;
    const real = URL.createObjectURL;
    URL.createObjectURL = blob => { got = blob; return "blob:stub"; };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    dueCsv();
    URL.createObjectURL = real; HTMLAnchorElement.prototype.click = click;
    return got ? got.text() : "";
  });
  const lines = csv.trim().split('\n');
  ok('the export is the list on screen, not the whole fleet',
     lines.length === onScreen + 1 && lines.slice(1).every(l => /^TK106,/.test(l)), `${lines.length - 1} row(s) for ${onScreen} on screen`);
  ok('and it carries the reason column even when this row has none',
     /^unit,round,/.test(lines[0].replace(/^\ufeff/, '')) && /reason/.test(lines[0]), lines[0].slice(0, 60));
  await p.fill('#ddQ', ''); await p.waitForTimeout(250);

  console.log('\nRussian');
  await p.evaluate(() => { lang = 'ru'; applyLang(); });
  await p.waitForTimeout(300);
  await p.click('[data-tab="due"]'); await p.waitForTimeout(200);
  const ru = (await p.textContent('#tab-due')).replace(/\s+/g, ' ');
  ok('the tab is translated, not left in English',
     /[А-Яа-я]/.test(ru) && !/dd_|undefined/.test(ru), ru.slice(0, 60));
  ok('and the inspector\'s own words are not translated away',
     /low-loader/.test(await p.evaluate(async () => {
       document.getElementById('ddScope').value = 'put';
       renderDueTab(); return document.getElementById('ddList').textContent; })));
  await p.evaluate(() => { lang = 'en'; applyLang(); });

  console.log('\nnothing to show');
  /* A round nobody has walked yet is the ordinary way to reach an empty list —
     an office picks the lubrication round on day one and gets nothing. It must
     say so, not show a table with a head and no body. */
  await p.selectOption('#ddScope', 'all');
  await p.selectOption('#ddType', 'LUBE'); await p.waitForTimeout(200);
  const empty = (await p.textContent('#ddList')).trim();
  ok('an empty list says so in a sentence, with no empty table',
     empty.length > 5 && !/undefined|NaN|\[object/.test(empty)
     && !(await p.$('#ddList table')), empty.slice(0, 60));

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ') : '\nall dashboard due checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
