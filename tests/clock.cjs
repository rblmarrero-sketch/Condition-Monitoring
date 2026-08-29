/* ONE DAY, ONE SITE, WHOEVER IS ASKING.

   The defect this suite exists to keep dead:

     mobile/index.html  todayISO()   the BROWSER's local day
     due.js             isoToday()   the BROWSER's local day
     dashboard          todayISO()   the UTC day

   Baimskaya is UTC+12. For twelve hours out of every twenty-four the phone at
   the machine and the laptop in the office were therefore on different
   calendar days, and every row on the due list differed by exactly one:
   32 days since instead of 31, 19 overdue instead of 18, and two rounds
   sitting on the boundary called OVERDUE on the phone and DUE SOON in the
   office. Measured on the deployed builds against the live folder: 54 rows
   compared, 54 rows different.

   No browser here. This is the arithmetic on its own, which means it can run
   in a second and can be pointed at any timezone on earth by re-running the
   process — because the one property that matters is that the answer does NOT
   depend on where the reader is standing.

   Run: node tests/clock.cjs
        node tests/clock.cjs --tz America/Denver     (one zone, for debugging)
*/
'use strict';
const { execFileSync } = require('child_process');
const path = require('path'), fs = require('fs');

const DUE_JS = path.join(__dirname, '..', 'mobile', 'due.js');
const ONE_TZ = (() => { const i = process.argv.indexOf('--tz');
  return i > 0 ? process.argv[i + 1] : null; })();

let fail = 0;
const ok = (c, w, d) => { if (!c) { fail++; console.log('  FAIL  ' + w + (d !== undefined ? '   ' + d : '')); }
                          else console.log('  PASS  ' + w + (d !== undefined ? '   ' + d : '')); return c; };

function load() {
  const G = {};
  new Function('self', fs.readFileSync(DUE_JS, 'utf8'))(G);
  if (!G.DUE) throw new Error('due.js did not export DUE');
  return G.DUE;
}

/* ---------------------------------------------------------------------------
   1. The site's day is the site's day, from anywhere on earth.

   Run in a child process per zone, because Node fixes its idea of local time
   at startup. Denver is chosen deliberately: the comment in report-core has
   said "8/1/2026 means one thing in Anadyr and another in Denver" since long
   before anybody checked that the code agreed. */
const ZONES = ['UTC', 'Asia/Anadyr', 'America/Denver', 'Europe/Moscow',
               'Australia/Sydney', 'Pacific/Kiritimati', 'Pacific/Midway'];

/* Instants chosen to sit either side of every midnight that matters: UTC's,
   the site's, and the reader's. Each is an exact ISO instant so the expected
   Anadyr day can be written down by hand. */
const INSTANTS = [
  ['2026-08-29T11:59:00Z', '2026-08-29', 'just before site midnight'],
  ['2026-08-29T12:00:00Z', '2026-08-30', 'site midnight exactly'],
  ['2026-08-29T12:01:00Z', '2026-08-30', 'just after site midnight'],
  ['2026-08-29T23:59:00Z', '2026-08-30', 'just before UTC midnight'],
  ['2026-08-30T00:00:00Z', '2026-08-30', 'UTC midnight'],
  ['2026-08-30T11:59:00Z', '2026-08-30', 'the site day holds all day'],
  /* Month ends */
  ['2026-01-31T12:00:00Z', '2026-02-01', 'January into February'],
  ['2026-04-30T12:00:00Z', '2026-05-01', 'thirty-day month end'],
  ['2026-12-31T12:00:00Z', '2027-01-01', 'year end'],
  ['2026-12-31T11:59:00Z', '2026-12-31', 'year end, one minute earlier'],
  /* Leap years — 2024 was one, 2026 is not, 2000 was, 2100 will not be */
  ['2024-02-28T12:00:00Z', '2024-02-29', 'into a leap day'],
  ['2024-02-29T12:00:00Z', '2024-03-01', 'out of a leap day'],
  ['2028-02-28T12:00:00Z', '2028-02-29', 'the next leap year'],
  /* Daylight saving, which the SITE does not observe and the READER does.
     These instants sit inside the US and EU changeovers; the site's day must
     not move because somebody else's clock did. */
  ['2026-03-08T09:59:00Z', '2026-03-08', 'US spring-forward instant'],
  ['2026-03-08T10:00:00Z', '2026-03-08', 'US spring-forward, one minute on'],
  ['2026-11-01T08:59:00Z', '2026-11-01', 'US fall-back instant'],
  ['2026-03-29T00:59:00Z', '2026-03-29', 'EU spring-forward instant'],
  ['2026-10-25T00:59:00Z', '2026-10-25', 'EU fall-back instant'],
];

function childCheck(tz) {
  const src = `
    const fs=require('fs');
    const G={}; new Function('self', fs.readFileSync(${JSON.stringify(DUE_JS)},'utf8'))(G);
    const D=G.DUE, out=[];
    ${JSON.stringify(INSTANTS)}.forEach(function(r){
      out.push([r[0], D.today(new Date(r[0])), r[1], r[2]]);
    });
    out.push(['SITE_TZ', D.SITE_TZ, 'Asia/Anadyr', 'the operational timezone is stated']);
    out.push(['OFFSET', String(D.SITE_OFFSET_MIN), '720', 'the fallback offset is UTC+12']);
    process.stdout.write(JSON.stringify(out));
  `;
  const o = execFileSync(process.execPath, ['-e', src], { env: Object.assign({}, process.env, { TZ: tz }) });
  return JSON.parse(o.toString());
}

console.log('\n1. THE SITE DAY, READ FROM SEVEN TIMEZONES');
(ONE_TZ ? [ONE_TZ] : ZONES).forEach(tz => {
  const rows = childCheck(tz);
  const bad = rows.filter(r => r[1] !== r[2]);
  ok(bad.length === 0, `${tz.padEnd(20)} all ${rows.length} instants give the site's day`,
     bad.length ? bad.map(r => `${r[0]} -> ${r[1]} want ${r[2]} (${r[3]})`).join('; ') : '');
});

/* ---------------------------------------------------------------------------
   2. The arithmetic itself. */
const D = load();

console.log('\n2. DATE-ONLY ARITHMETIC');
ok(D.dayDiff('2026-07-29', '2026-08-29') === 31, 'the disputed span: 29 Jul to 29 Aug is 31 days');
ok(D.dayDiff('2026-07-29', '2026-08-30') === 32, 'and to 30 Aug is 32 — the two answers that were both on screen');
ok(D.dayDiff('2024-02-28', '2024-03-01') === 2, 'across a leap day, 2 days');
ok(D.dayDiff('2026-02-28', '2026-03-01') === 1, 'a non-leap February, 1 day');
ok(D.dayDiff('2026-12-31', '2027-01-01') === 1, 'across a year end');
ok(D.dayDiff('2026-08-29', '2026-08-29') === 0, 'a date is zero days from itself');
ok(D.dayDiff('2026-08-30', '2026-08-29') === -1, 'a future date is negative, not clamped');
ok(D.dayDiff('', '2026-08-29') === null && D.dayDiff(null, '2026-08-29') === null,
   'no date at all is null, never 0 — a machine with no round is not due today');
ok(D.dayDiff('31.07.2026', '2026-08-29') === null,
   'a date this folder writes but ISO cannot read is null, not a guess');

/* DST cannot enter the arithmetic: these are calendar dates, parsed at UTC
   midnight, and a 23- or 25-hour day is not one of the things they can be. */
ok(D.dayDiff('2026-03-07', '2026-03-09') === 2, 'a 23-hour local day is still one day');
ok(D.dayDiff('2026-10-31', '2026-11-02') === 2, 'a 25-hour local day is still one day');

console.log('\n3. SHIFTING THE CALENDAR');
ok(D.shift('2026-08-30', -1) === '2026-08-29', 'one day back');
ok(D.shift('2026-03-01', -1) === '2026-02-28', 'back across a non-leap February');
ok(D.shift('2024-03-01', -1) === '2024-02-29', 'back onto a leap day');
ok(D.shift('2026-12-31', 1) === '2027-01-01', 'forward across a year end');
ok(D.shift('2026-08-30', 0) === '2026-08-30', 'no shift is the same day');
ok(D.shift('2026-11-01', -30) === '2026-10-02', 'thirty days back across a fall-back');
ok(D.shift('nonsense', -1) === null, 'an unreadable date shifts to null, not to today');

console.log('\n4. FREEZING THE DAY');
const wasFrozen = D.frozen();
ok(D.frozen() === null, 'nothing is frozen until a test freezes it');
D.setToday('2026-08-30');
ok(D.today() === '2026-08-30', 'the frozen day is what today() answers');
ok(D.frozen() === '2026-08-30', 'and it says so');
ok(D.today(new Date('2026-01-05T00:00:00Z')) === '2026-01-05',
   'an explicit instant still gets a real answer — freezing only fixes "now"');
D.setToday('rubbish');
ok(D.frozen() === null, 'a malformed frozen date is refused, not stored');
ok(/^\d{4}-\d{2}-\d{2}$/.test(D.today()), 'and today() is back to the real site day');
D.setToday(wasFrozen);

console.log('\n5. THE VERDICT RULE, WHICH USED TO BE WRITTEN OUT TWICE');
const mk = (type, cls, lastD, today, smu) =>
  D.next({ type, cls, last: { d: lastD, h: smu }, today });
const verdict = (type, cls, lastD, today, defer) => {
  const n = mk(type, cls, lastD, today);
  return D.status({ type, cls, n, last: { d: lastD }, defer, today });
};

/* The seven trucks the field and the office both name, on the site's day. */
const SEVEN = ['TK147', 'TK152', 'TK153', 'TK155', 'TK157', 'TK158', 'TK161'];
SEVEN.forEach(u => {
  const v = verdict('MP', 'HT', '2026-07-29', '2026-08-30');
  ok(v.st === 'over', `${u} · MP walked 29 Jul is overdue on 30 Aug`, v.st);
});
{
  const n = mk('MP', 'HT', '2026-07-29', '2026-08-30');
  ok(n.daysSince === 32, 'and it is 32 days since, not 31', n.daysSince);
  ok(n.dueInDays === -19, 'and 19 days overdue, not 18', n.dueInDays);
}

/* TK109 and TK152 on their INSP round — the two that tipped. The point is not
   which answer is right; it is that ONE day produces ONE answer. */
[['2026-08-29', 'soon'], ['2026-08-30', 'over']].forEach(([today, want]) => {
  const v = verdict('INSP', 'HT', '2026-08-04', today);
  ok(v.st === want, `TK109/TK152 · INSP walked 4 Aug reads "${want}" on ${today}`, v.st);
});

/* Exactly due is DUE, not overdue. A round you can still walk today is not a
   round somebody missed, and it must not read one way in the field and the
   other in the office.

   The plug round cannot be landed on exactly: 250 h at 20 h/day is 12.5 days
   and no whole day hits it. INSP is 500 h — exactly 25 days — so that is the
   round this case can actually be written for. */
{
  const n = mk('MP', 'HT', '2026-08-30', '2026-09-11');   /* 12 days, 240 h of 250 */
  ok(n.over === false, 'ten hours to go is not overdue');
  const e = mk('INSP', 'HT', '2026-08-05', '2026-08-30'); /* 25 days, exactly 500 h */
  ok(e.daysSince === 25, 'twenty-five days on a 500 h round', e.daysSince);
  ok(e.dueInHours === 0, 'exactly at the interval, zero hours remain', e.dueInHours);
  ok(e.over === false, 'and exactly due is NOT overdue');
  ok(D.status({ type: 'INSP', cls: 'HT', n: e, last: { d: '2026-08-05' }, today: '2026-08-30' }).st === 'soon',
     'exactly due reads "soon" — the same word on both screens');
  const p = mk('INSP', 'HT', '2026-08-05', '2026-08-31');
  ok(p.over === true, 'one day past exactly due IS overdue');
  ok(p.dueInHours === -20, 'by one shift', p.dueInHours);
}

/* A calendar round — TEMP and LUBE carry 30 days because nobody has stated an
   hour figure, and inventing one would be worse than saying so. */
{
  const e = mk('TEMP', 'HT', '2026-07-31', '2026-08-30');
  ok(e.basis === 'days', 'a round with no hour figure is scheduled on days', e.basis);
  ok(e.dueInDays === 0, 'thirty days on is exactly due', e.dueInDays);
  ok(e.over === false, 'and exactly due is not overdue on the calendar either');
  ok(mk('TEMP', 'HT', '2026-07-30', '2026-08-30').over === true, 'thirty-one days on is');
}

/* A round walked today, and one walked in the future. */
ok(mk('MP', 'HT', '2026-08-30', '2026-08-30').daysSince === 0, 'walked today: zero days since');
ok(mk('MP', 'HT', '2026-08-30', '2026-08-30').over === false, 'walked today is not overdue');
{
  const f = mk('MP', 'HT', '2026-09-30', '2026-08-30');
  ok(f.daysSince === -31, 'a date in the future is negative days since, not zero', f.daysSince);
  ok(f.over === false, 'and is not overdue');
}

console.log('\n6. DEFERRALS, THE SAME RULE AT BOTH ENDS');
{
  const late = { at: '2026-08-20', until: '2026-09-15', why: 'on a low-loader' };
  const v = verdict('MP', 'HT', '2026-07-29', '2026-08-30', late);
  ok(v.st === 'put', 'put off to a later date: "put", not "over"', v.st);
  ok(v.deferLive === true, 'and the deferral is live');
  ok(v.daysToRelease === 16, 'with the days until it comes back stated', v.daysToRelease);
}
{
  const cancelled = { at: '2026-08-20', until: null, why: 'sold' };
  ok(verdict('MP', 'HT', '2026-07-29', '2026-08-30', cancelled).st === 'off',
     'cancelled outright: "off"');
}
{
  const spent = { at: '2026-07-01', until: '2026-12-01' };
  const v = verdict('MP', 'HT', '2026-07-29', '2026-08-30', spent);
  ok(v.deferLive === false, 'a deferral written BEFORE the last round is spent');
  ok(v.st === 'over', 'and the machine is back on the list', v.st);
}
{
  const expired = { at: '2026-08-20', until: '2026-08-29' };
  ok(verdict('MP', 'HT', '2026-07-29', '2026-08-30', expired).st === 'over',
     'a deferral whose date has passed returns the round on its own');
  ok(verdict('MP', 'HT', '2026-07-29', '2026-08-29', expired).st === 'over',
     'and on the day itself — "until" is the day it comes back');
}

console.log('\n7. THE INTERVAL IS STILL A PROPERTY OF THE MACHINE');
ok(D.status({ type: 'UC', cls: 'DOZ', n: mk('UC', 'DOZ', '2026-08-01', '2026-08-30'),
              last: { d: '2026-08-01' }, today: '2026-08-30' }).interval === 1000,
   'a dozer undercarriage is 1000 h');
ok(D.status({ type: 'UC', cls: 'EXC', n: mk('UC', 'EXC', '2026-08-01', '2026-08-30'),
              last: { d: '2026-08-01' }, today: '2026-08-30' }).interval === 4000,
   'an excavator undercarriage is 4000 h');
ok(D.status({ type: 'MP', cls: 'HT', n: mk('MP', 'HT', '2026-08-01', '2026-08-30'),
              last: { d: '2026-08-01' }, today: '2026-08-30' }).soonH === 50,
   '"soon" on a 250 h round is 50 h');

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);
