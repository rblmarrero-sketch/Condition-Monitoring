/* THE PHONE'S HALF OF 1C: TODAY, DONE, AND ARRIVING BY ITSELF.

   Three things the field asked for on 2026-09-13, all of them about the same
   feed and all of them the same failure in different clothes — a real value
   rendered as nothing.

   1. "add a toggle to show today not only two weeks". The agenda draws
      fifteen days, most of them next week's work, and an inspector standing
      in the yard at the start of a shift has to read past all of it to find
      the list they are about to walk. The chip narrows the DAYS DRAWN and
      nothing else, so the two settings can never disagree about what is on
      a day, and it counts what is left TO DO rather than what is on screen.

   2. "if they finished the round, it would synchronise that it is done".
      The List's 1C scope has dropped walked rounds since build 330 — the
      rule was written inline inside planRows and nowhere else, so the
      agenda knew nothing about it and went on listing a round somebody had
      walked that morning for the rest of the fortnight. Two screens, one
      fact, two answers. The rule is schedWalkedFor now and both read it; the
      agenda MARKS it done rather than dropping it, because a calendar with
      the work struck off it is the answer to "did we do it" and a blank day
      is not.

   3. "the 1C list still not updated". The file was fetched on three
      occasions, every one of them requiring somebody to touch the Due
      screen. A phone opened at the crib room and carried around all day
      showed breakfast's plan while the pull behind it refreshed six times.

   The server here answers /data/schedule_slim.json from a fixture it can
   change under the page's feet, and COUNTS the requests, so "it asks by
   itself" is a number rather than a promise.

   Run: node tests/duetoday.cjs   (starts its own server on 8471) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(require('./pw.cjs'));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8471);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* TODAY IS ASKED OF THE PAGE, NEVER COMPUTED HERE. todayISO() is the app's
   own answer and it is not this process's UTC date: a browser three hours
   ahead is already on tomorrow while node still says today, and a fixture
   built on node's date puts every "today" row on yesterday. The whole suite
   then passes its fortnight assertions and fails its today ones, which reads
   like a broken toggle and is a broken test. Filled in below, before any
   fixture is built. */
let TODAY = null;
const day = n => { const d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
                   return d.toISOString().slice(0, 10); };

/* Four units, chosen so every case this suite is about is on screen at once:
   · DZ003 today, and NOT walked          — today's work
   · TK107 today, and walked today        — today's work, done
   · TK108 four days out                  — outside "today", inside the fortnight
   · GR016 five days ago, not walked      — a day already gone, still outstanding */
const mkFixture = stamp => ({
  generated: stamp,
  byUnit: {
    DZ003: [{ wo: 'WO-016563', hours: 1000, types: ['FC'], plan: TODAY, priority: 'P3 Planned (PM)' }],
    TK107: [{ wo: 'WO-012177', hours: 250, types: ['MP'], plan: TODAY, priority: 'P3 Planned (PM)' }],
    TK108: [{ wo: 'WO-016648', hours: 250, types: ['MP'], plan: day(4), priority: 'P3 Planned (PM)' }],
    GR016: [{ wo: 'WO-019001', hours: 1000, types: ['FC'], plan: day(-5), priority: 'P3 Planned (PM)' }],
  },
});
let served = { generated: new Date().toISOString(), byUnit: {} };
let asked = 0;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/data/schedule_slim.json') {
    asked++;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(served));
  }
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.end(fs.readFileSync(p));
});

const agenda = p => p.evaluate(() => [...document.querySelectorAll('#dueWeekList .agitem')]
  .map(el => ({ txt: el.innerText.replace(/\s+/g, ' ').trim(), done: el.classList.contains('done') })));
const chips = p => p.evaluate(() => [...document.querySelectorAll('#dueSpanF button')]
  .map(b => ({ k: b.dataset.dw, on: b.classList.contains('on'),
               n: Number((b.querySelector('.n') || {}).textContent) })));

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const b = await chromium.launch();

  /* Phase one: ask the app what day it is on, and build every fixture from
     that. Nothing is asserted here. */
  {
    const probe = await (await b.newContext()).newPage();
    await probe.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await probe.waitForFunction(() => typeof todayISO === 'function', null, { timeout: 20000 });
    TODAY = await probe.evaluate(() => todayISO());
    await probe.context().close();
  }
  served = mkFixture(new Date().toISOString());
  asked = 0;

  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  /* Nothing to upload and nowhere to upload to — this suite is about what
     comes IN. */
  await p.addInitScript(() => localStorage.setItem('up_dests', '[]'));
  await p.addInitScript(t => {
    /* TK107's plug round was walked TODAY: the round the inspector finished
       and expects to see struck off. Everything else is a year old, so the
       units are on the Due list for their own reasons too. */
    const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    localStorage.setItem('cm_hist', JSON.stringify({
      'MP|TK107': { d: t, h: 9000 },
      'FC|DZ003': { d: ago(400), h: 8000 },
      'MP|TK108': { d: ago(400), h: 8000 },
      'FC|GR016': { d: ago(400), h: 8000 },
    }));
    localStorage.setItem('cm_due_view', 'week');
  }, TODAY);
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.waitForTimeout(400);
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(900);

  console.log('1. the fortnight is what it always was, and it is the default');
  let c = await chips(p);
  ok('the chip row offers today and the whole agenda', c.length === 2 && c[0].k === 'today' && c[1].k === 'all',
     c.map(x => x.k).join('/'));
  ok('  and opens on the fortnight, as it always did', (c.find(x => x.k === 'all') || {}).on === true);
  let rows = await agenda(p);
  ok('  all four units are drawn', ['DZ003', 'TK107', 'TK108', 'GR016']
     .every(u => rows.some(r => r.txt.includes(u))), rows.length + ' row(s)');

  console.log('\n2. a round already walked is MARKED done, not dropped');
  const tk107 = rows.find(r => r.txt.includes('TK107')) || {};
  ok('TK107 is still on the day 1C wants it', !!tk107.txt, tk107.txt);
  ok('  and it says so: a tick, the word, and the date', tk107.done === true
     && /✓/.test(tk107.txt) && /(inspected|выполнено)/i.test(tk107.txt), tk107.txt);
  const dz003 = rows.find(r => r.txt.includes('DZ003')) || {};
  ok('  the round nobody has walked is not marked', dz003.done === false, dz003.txt);
  ok('  and outstanding work sorts above finished work on its day',
     rows.findIndex(r => r.txt.includes('DZ003')) < rows.findIndex(r => r.txt.includes('TK107')));

  console.log('\n3. the counts are about WORK, so a finished round is not in them');
  c = await chips(p);
  const nToday = (c.find(x => x.k === 'today') || {}).n;
  ok('today offers one thing to do, not two', nToday === 1, String(nToday));
  const head = await p.evaluate(() => [...document.querySelectorAll('#dueWeekList .dayhd')]
    .map(h => h.innerText.replace(/\s+/g, ' ').trim()));
  const todayHd = head.find(h => /(Today|Сегодня)/i.test(h)) || '';
  ok('  and the day heading says both figures rather than one', /1.*·.*1/.test(todayHd), todayHd);

  console.log('\n4. today narrows the days drawn and nothing else');
  await p.click('#dueSpanF [data-dw="today"]');
  await p.waitForTimeout(300);
  rows = await agenda(p);
  ok('the two units planned for today are there', rows.some(r => r.txt.includes('DZ003'))
     && rows.some(r => r.txt.includes('TK107')), rows.map(r => r.txt.slice(0, 12)).join(' | '));
  ok('  and nothing from another day is', !rows.some(r => r.txt.includes('TK108'))
     && !rows.some(r => r.txt.includes('GR016')), String(rows.length));
  ok('  the finished round is still marked done, not re-opened',
     (rows.find(r => r.txt.includes('TK107')) || {}).done === true);
  const days = await p.evaluate(() => document.querySelectorAll('#dueWeekList .daygroup').length);
  ok('  one day is drawn', days === 1, days + ' day group(s)');
  const sub = await p.evaluate(() => ({ txt: ($('dueWeekSub') || {}).innerText || '',
                                        key: ($('dueWeekSub') || {}).dataset.i18n }));
  ok('  and the wording under the heading follows the chip', sub.key === 'due_week_sub_today',
     String(sub.key));

  console.log('\n5. the choice survives a reload, because a shift is long');
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 20000 });
  await p.evaluate(() => showPane('paneDue'));
  await p.waitForTimeout(900);
  c = await chips(p);
  ok('today is still the chosen span', (c.find(x => x.k === 'today') || {}).on === true);
  await p.click('#dueSpanF [data-dw="all"]');
  await p.waitForTimeout(300);
  ok('  and going back to the fortnight brings the other days with it',
     (await agenda(p)).some(r => r.txt.includes('TK108')));

  console.log('\n6. the List and the agenda agree about what is done');
  /* planRows leaves a walked round OUT — it is a worklist — and the agenda
     marks it done. Different treatment, ONE rule: schedWalkedFor. What must
     never happen is the agenda calling outstanding what the List calls
     finished. */
  const both = await p.evaluate(d => {
    const plan = planRows('').map(r => r.unit + '|' + r.ty);
    const week = dueWeekRows().map(e => ({ k: e.unit + '|' + e.code, done: !!e.done }));
    return { plan, week,
             walked: !!schedWalkedFor('TK107', 'MP', d),
             notWalked: !!schedWalkedFor('DZ003', 'FC', d) };
  }, TODAY);
  ok('the rule answers for a round walked on the plan date', both.walked === true);
  ok('  and does not for one nobody has walked', both.notWalked === false);
  ok('  the List leaves the finished round out', both.plan.indexOf('TK107|MP') < 0,
     both.plan.join(' '));
  ok('  the agenda keeps it and marks it done',
     (both.week.find(x => x.k === 'TK107|MP') || {}).done === true);
  ok('  and nothing the List still calls work is marked done in the agenda',
     both.week.filter(x => x.done).every(x => both.plan.indexOf(x.k) < 0),
     both.week.filter(x => x.done).map(x => x.k).join(' '));

  console.log('\n7. it asks for the file by itself');
  /* The throttle is the point: schedEnsureLoaded refuses inside
     SCHED_STALE_MS, which is what stops a timer, a visibility change and a
     paint arriving together from making three requests at one file. */
  const wired = await p.evaluate(() => ({ ms: SCHED_MS, stale: SCHED_STALE_MS, timer: !!schedTimer }));
  ok('a timer is running', wired.timer === true);
  ok('  at ten minutes or better, for an hourly source', wired.ms > 0 && wired.ms <= 600000,
     Math.round(wired.ms / 60000) + ' min');
  ok('  and the copy in hand goes stale well inside the hour', wired.stale <= 900000,
     Math.round(wired.stale / 60000) + ' min');
  let n0 = asked;
  await p.evaluate(() => schedRefresh('test'));
  await p.waitForTimeout(200);
  ok('  a refresh inside the freshness window asks for nothing', asked === n0,
     (asked - n0) + ' request(s)');

  console.log('\n8. a pull that has moved lands without anybody pressing anything');
  const before = await p.evaluate(() => SCHED.generated);
  served = mkFixture(new Date(Date.now() + 1000).toISOString());
  served.byUnit.EX021 = [{ wo: 'WO-020500', hours: 4000, types: ['UC'], plan: TODAY, priority: 'P3 Planned (PM)' }];
  n0 = asked;
  const moved = await p.evaluate(() => schedEnsureLoaded(true));
  ok('the file is asked for', asked > n0, (asked - n0) + ' request(s)');
  ok('  and the page takes the newer pull', moved === true
     && (await p.evaluate(() => SCHED.generated)) !== before, before);
  await p.evaluate(() => renderDue());
  await p.waitForTimeout(300);
  ok('  the new machine is on the agenda', (await agenda(p)).some(r => r.txt.includes('EX021')));

  console.log('\n9. the same pull twice is not a change, and does not repaint');
  const same = await p.evaluate(() => schedEnsureLoaded(true));
  ok('an unchanged file reports nothing to do', same === false, String(same));

  console.log('\n10. and the screen says how old 1C\'s half of it is');
  const note = await p.evaluate(() => ($('dueBasis') || {}).innerText || '');
  ok('the Due screen states the age of the plan', /(1C plan pulled|план 1С загружен)/i.test(note),
     note.slice(0, 160));

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close(); server.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
