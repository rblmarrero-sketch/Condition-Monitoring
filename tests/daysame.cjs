/* THE PHONE AND THE OFFICE, ROW FOR ROW, ON A FROZEN DAY.

   clock.cjs proves the arithmetic. This proves the two APPLICATIONS, each
   running its own row builder over the same folder, produce the same verdict
   for every unit and every round — and that neither of them changes its mind
   because of where the person reading it happens to be standing.

   What it is guarding against, measured on the deployed builds before the fix:

     phone  today 2026-08-30   over 9   INSP|TK109 INSP|TK152 + seven MP
     office today 2026-08-29   over 7   seven MP
     rows compared 54   rows that differ 54

   Every row. The phone built the BROWSER's day, the dashboard built the UTC
   day, and Baimskaya is UTC+12 — so for twelve hours out of twenty-four they
   were reading different calendars and every number was one out.

   Four timezones on purpose. Anadyr is the site. UTC is where a server thinks
   it lives. Denver is the far side of the world from the site — the report
   comments have used it as the example for years. Kiritimati is UTC+14, two
   hours AHEAD of the site, so a bug that merely assumed "the phone is always
   ahead of UTC" still fails here.

   Run: node tests/daysame.cjs        (needs tests/mock.cjs on 8098) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8098';

const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

const ZONES = ['Asia/Anadyr', 'UTC', 'America/Denver', 'Pacific/Kiritimati'];

/* The days that have to be looked at, and why each one is here. */
const DAYS = [
  ['2026-08-29', 'the day the office thought it was'],
  ['2026-08-30', 'the day the phone thought it was'],
  ['2026-08-10', 'a day when the plug rounds are not yet overdue'],
  ['2026-01-31', 'a month end'],
  ['2026-02-01', 'the day after a month end'],
  ['2024-02-28', 'the day before a leap day'],
  ['2024-02-29', 'a leap day'],
  ['2024-03-01', 'the day after a leap day'],
  ['2026-03-08', 'the US spring-forward day'],
  ['2026-10-25', 'the EU fall-back day'],
  ['2026-11-01', 'the US fall-back day'],
  ['2026-12-31', 'a year end'],
  ['2027-01-01', 'a new year'],
  ['2026-07-29', 'the day the disputed rounds were walked — zero days since'],
  ['2026-06-01', 'before any of them — every round in the future'],
];

/* The field cases the specification names, written as the folder writes them.
   The seven overdue plug rounds, and the two INSP rounds that sat exactly on
   the boundary and were called overdue on one screen and due soon on the other. */
const SEVEN = ['TK147', 'TK152', 'TK153', 'TK155', 'TK157', 'TK158', 'TK161'];
const NAMED = SEVEN.map(u => `${u},2026-07-29,MP`)
  .concat(['TK109,2026-08-04,INSP', 'TK152,2026-08-04,INSP']);

/* One row, reduced to everything a person acts on. If any of these differ, the
   two surfaces are telling one inspector two different things. */
const COLLECT = `(function(rows){
  return rows.map(function(r){ return {
    k: r.ty + '|' + r.unit,
    st: r.st,
    last: r.last && r.last.d,
    daysSince: r.n && r.n.daysSince,
    dueInDays: r.n && r.n.dueInDays,
    dueInHours: r.n && r.n.dueInHours,
    over: !!(r.n && r.n.over),
    rate: r.n && r.n.rate,
    basis: r.n && r.n.basis,
    why: (r.n && r.n.why) || '',
  }; }).sort(function(a,b){ return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
})`;

async function phone(b, tz) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                   hasTouch: true, timezoneId: tz });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR phone/' + tz + ' ' + e.message));
  await p.addInitScript(u => {
    localStorage.setItem('up_dests', JSON.stringify([{ id: 'gas', on: true, url: u, sec: '', folder: '' }]));
    localStorage.setItem('cm_team_full_v1', '1');
    localStorage.setItem('cm_hist_full_v1', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => showPane('paneDue'));
  await p.click('#dueFull');
  await p.waitForFunction(() => typeof dueRows === 'function' && dueRows().length > 20, null,
                          { timeout: 60000 });
  return { ctx, p, read: day => p.evaluate(([c, d]) =>
    (DUE.setToday(d), eval(c)(dueRows())), [COLLECT, day]) };
}

async function office(b, tz) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: tz });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR office/' + tz + ' ' + e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof dueTabRows === 'function' && dueTabRows().length > 20, null,
                          { timeout: 60000 });
  return { ctx, p, read: day => p.evaluate(([c, d]) =>
    (DUE.setToday(d), eval(c)(dueTabRows())), [COLLECT, day]) };
}

/* What differs between two row sets, named field by field so a failure says
   which number moved rather than "they are not equal". */
function diff(a, b) {
  const A = new Map(a.map(x => [x.k, x])), B = new Map(b.map(x => [x.k, x]));
  const keys = [...new Set([...A.keys(), ...B.keys()])].sort();
  const out = [];
  keys.forEach(k => {
    const x = A.get(k), y = B.get(k);
    if (!x || !y) { out.push(k + ' present on only one surface'); return; }
    const f = [];
    Object.keys(x).forEach(n => { if (n !== 'k' && x[n] !== y[n]) f.push(`${n} ${x[n]}≠${y[n]}`); });
    if (f.length) out.push(k + ' ' + f.join(', '));
  });
  return out;
}

(async () => {
  await reset('n=12&' + NAMED.map(r => 'rec=' + encodeURIComponent(r)).join('&'));
  /* __reset takes one rec= per call, so the named rounds go in one at a time. */
  for (const r of NAMED) await reset('rec=' + encodeURIComponent(r));

  const b = await chromium.launch();
  const surf = {};
  for (const tz of ZONES) {
    surf[tz] = { phone: await phone(b, tz), office: await office(b, tz) };
  }

  console.log('\n1. THE TWO SURFACES AGREE, ON EVERY DAY, IN EVERY TIMEZONE');
  let rowsChecked = 0;
  for (const tz of ZONES) {
    for (const [day, why] of DAYS) {
      const m = await surf[tz].phone.read(day);
      const d = await surf[tz].office.read(day);
      const bad = diff(m, d);
      rowsChecked += m.length;
      ok(`${tz.padEnd(19)} ${day}  ${String(m.length).padStart(3)} rows   ${why}`,
         bad.length === 0 && m.length > 0, bad.slice(0, 4).join(' | '));
    }
  }

  console.log('\n2. AND THE SITE’S SCHEDULE DOES NOT MOVE WITH THE READER');
  for (const [day, why] of DAYS) {
    const base = await surf['Asia/Anadyr'].phone.read(day);
    for (const tz of ZONES.slice(1)) {
      const other = await surf[tz].phone.read(day);
      const bad = diff(base, other);
      ok(`phone  ${day}  Anadyr vs ${tz.padEnd(19)} ${why}`, bad.length === 0,
         bad.slice(0, 3).join(' | '));
    }
    const obase = await surf['Asia/Anadyr'].office.read(day);
    for (const tz of ZONES.slice(1)) {
      const other = await surf[tz].office.read(day);
      const bad = diff(obase, other);
      ok(`office ${day}  Anadyr vs ${tz.padEnd(19)} ${why}`, bad.length === 0,
         bad.slice(0, 3).join(' | '));
    }
  }

  console.log('\n3. THE ROUNDS THE FIELD ASKED ABOUT BY NAME');
  const at = async day => ({ m: await surf['Asia/Anadyr'].phone.read(day),
                             d: await surf['Asia/Anadyr'].office.read(day) });
  const find = (rows, k) => rows.find(r => r.k === k);
  for (const day of ['2026-08-29', '2026-08-30']) {
    const { m, d } = await at(day);
    SEVEN.forEach(u => {
      const a = find(m, 'MP|' + u), b2 = find(d, 'MP|' + u);
      ok(`${u} · MP on ${day}: both surfaces say "${a && a.st}"`,
         !!a && !!b2 && a.st === b2.st && a.st === 'over',
         `phone ${a && a.st} / office ${b2 && b2.st}`);
      ok(`${u} · MP on ${day}: same days since`, !!a && !!b2 && a.daysSince === b2.daysSince,
         `${a && a.daysSince} / ${b2 && b2.daysSince}`);
    });
    ['TK109', 'TK152'].forEach(u => {
      const a = find(m, 'INSP|' + u), b2 = find(d, 'INSP|' + u);
      ok(`${u} · INSP on ${day}: both say "${a && a.st}", not one each`,
         !!a && !!b2 && a.st === b2.st, `phone ${a && a.st} / office ${b2 && b2.st}`);
    });
  }
  /* The tip itself: the same record must change verdict on the same day on
     both surfaces, not a day apart. */
  {
    const a = await at('2026-08-29'), b3 = await at('2026-08-30');
    ['TK109', 'TK152'].forEach(u => {
      const k = 'INSP|' + u;
      ok(`${u} · INSP tips from due-soon to overdue on the SAME day on both`,
         find(a.m, k).st === find(a.d, k).st && find(b3.m, k).st === find(b3.d, k).st
         && find(a.m, k).st !== find(b3.m, k).st,
         `29th ${find(a.m, k).st}/${find(a.d, k).st}  30th ${find(b3.m, k).st}/${find(b3.d, k).st}`);
    });
  }

  console.log('\nrows compared: ' + rowsChecked);
  for (const tz of ZONES) { await surf[tz].phone.ctx.close(); await surf[tz].office.ctx.close(); }
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED\n` : '\nall passed\n');
  process.exit(fails.length ? 1 : 0);
})();
