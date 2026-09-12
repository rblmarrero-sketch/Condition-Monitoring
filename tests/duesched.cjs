/* THE DUE TAB'S "SHOW 1C SCHEDULE" TOGGLE — off by default, additive only.

   Everything this suite checks comes from one promise: the toggle adds a
   line under a row that already exists, and changes NOTHING ELSE about
   the Due list — not the overdue math, not which rows appear, not their
   order. A row schedule_slim.json has nothing to say about must render
   exactly as it did before the toggle existed.

   The server below intercepts only GET /data/schedule_slim.json and
   answers with a fixed fixture, so this suite never touches the real
   (git-tracked, hourly-regenerated) file on disk.

   Run: node tests/duesched.cjs   (starts its own server) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(require('./pw.cjs'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8455);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const today = new Date();
const plus = n => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// DZ003: FC + INSP together, 13 days out — far enough that the pre-check
// note must NOT appear. TK107: INSP alone, 2 days out — inside the 3-day
// window, so the note MUST appear. GR016 deliberately has no entry at all.
// TK108: MP, plan TODAY, and no cm_hist entry at all — this is the case
// build 320 fixed: a round CM has never walked (so dueRows() never even
// sees it — it comes from the register via neverRows() instead, a
// SEPARATE row template) used to get no schedule line no matter what
// schedule_slim.json said, because that branch returned before reaching
// the lookup at all.
const FIXTURE = {
  generated: new Date().toISOString(),
  byUnit: {
    DZ003: [{ wo: 'WO-016563', hours: 500, types: ['FC', 'INSP'], plan: plus(13), priority: 'P3 Planned (PM)' }],
    TK107: [{ wo: 'WO-012177', hours: 500, types: ['INSP'], plan: plus(2), priority: 'P3 Planned (PM)' }],
    TK108: [{ wo: 'WO-016648', hours: 250, types: ['MP'], plan: plus(0), priority: 'P3 Planned (PM)' }],
  },
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/data/schedule_slim.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(FIXTURE));
    return;
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.end(fs.readFileSync(p));
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.addInitScript(() => {
    const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    // GR016 is overdue too, but carries NO schedule fixture entry.
    localStorage.setItem('cm_hist', JSON.stringify({
      'FC|DZ003': { d: ago(400), h: 8000 },
      'INSP|DZ003': { d: ago(400), h: 8000 },
      'INSP|TK107': { d: ago(400), h: 8000 },
      'FC|GR016': { d: ago(400), h: 8000 },
    }));
  });
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(300);

  console.log('\nbefore the toggle: the list is exactly what it always was');
  const before = await p.evaluate(() => document.getElementById('dueList').innerText);
  ok('the checkbox starts unchecked', await p.evaluate(() => !$('dueSchedOn').checked));
  ok('no schedule line anywhere yet', !/1C plan|WO-0/i.test(before), before.slice(0, 60));
  ok('the seeded rows are all there', ['DZ003', 'TK107', 'GR016'].every(u => before.includes(u)));

  console.log('\nturning it on adds exactly one line, only where 1C has one');
  await p.click('#dueSchedOn');
  await p.waitForTimeout(600);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#dueList .duerow')].map(r => r.innerText));
  const fcDz = rows.find(t => /^FC/.test(t) && t.includes('DZ003'));
  const inspDz = rows.find(t => /^INSP/.test(t) && t.includes('DZ003'));
  const inspTk = rows.find(t => t.includes('TK107'));
  const fcGr = rows.find(t => t.includes('GR016'));
  ok('the FC/DZ003 row got the schedule line', /1C plan.*13.*·\s*500h.*WO-016563/.test((fcDz || '').replace(/\s+/g, ' ')) || /WO-016563/.test(fcDz || ''), fcDz);
  ok('so did the INSP/DZ003 row, same WO', /WO-016563/.test(inspDz || ''), inspDz);
  ok('and the plan date and hours are both on it', /500h/.test(inspDz || '') && new RegExp(plus(13).slice(8, 10) + '\\.' + plus(13).slice(5, 7)).test(inspDz || ''), inspDz);
  ok('a PM 13 days out gets no pre-check note', !/walk ahead/i.test(inspDz || ''), inspDz);
  ok('a PM 2 days out DOES get the pre-check note', /WO-012177/.test(inspTk || '') && /walk ahead/i.test(inspTk || ''), inspTk);
  ok('a row schedule_slim.json says nothing about is untouched', !/1C plan|WO-/.test(fcGr || ''), fcGr);

  console.log('\na round CM has NEVER walked still gets the schedule line');
  // TK108 (AT, on MP's own stated onClass) has no MP history at all, so it
  // renders from neverRows() — a separate row template that returned before
  // ever reaching the schedule lookup, until build 320. Found via search,
  // the same way an inspector would look for one machine (search bypasses
  // the scope pills and the 200-row cap on purpose — see dueFind's own
  // comment in mobile/index.html).
  await p.fill('#dueFind', 'TK108');
  await p.waitForTimeout(400);
  const tk108Text = await p.evaluate(() => document.getElementById('dueList').innerText);
  ok('the never-inspected row is found', /TK108/.test(tk108Text) && /no inspection of this round on record/i.test(tk108Text), tk108Text);
  ok('and it now carries the schedule line', /WO-016648/.test(tk108Text), tk108Text);
  await p.fill('#dueFind', '');
  await p.waitForTimeout(400);

  console.log('\nit is off again exactly as fast as it went on');
  await p.click('#dueSchedOn');
  await p.waitForTimeout(300);
  const after = await p.evaluate(() => document.getElementById('dueList').innerText);
  ok('every schedule line is gone', !/1C plan|WO-0/i.test(after), after.slice(0, 60));
  ok('and the underlying rows read exactly as they did before', after === before);

  console.log('\nthe choice survives a reload, and nothing else changes because of it');
  await p.click('#dueSchedOn');
  await p.waitForTimeout(500);
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(600);
  ok('the checkbox remembers it was on', await p.evaluate(() => $('dueSchedOn').checked));
  const afterReload = await p.evaluate(() => document.getElementById('dueList').innerText);
  ok('and the schedule lines are back without a second tap', /WO-016563/.test(afterReload) && /WO-012177/.test(afterReload));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
