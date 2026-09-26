/* "CAN WE USE 1C LIST FOR THE MEANTIME... SO WE KNOW WHETHER TO FOLLOW 1C.
   OR WE HAVE A COMPARISON."

   Two clocks tell an inspector when a round is due: this app's own interval
   table (due.js, rendered to a calendar) and 1C's own planned work orders.
   CLAUDE.md's own standing rule is that they are never folded into one
   ("1C plan" is its own scope, not a filter on Overdue/Due soon) — but until
   now nothing put the two dates on the same row so anyone could see whether
   they actually agree.

   scheduleCompareRows() (mobile/index.html) and its dashboard mirror answer
   exactly that, deliberately scoped to the INTERSECTION: a row needs BOTH a
   CM-computed due date (this app has walked the round on this machine
   before) AND 1C's own nearest planned date for the SAME machine and round.
   A machine only one schedule mentions is a coverage question, not this one.

   Run: node tests/schedcompare.cjs   (spawns its own static server) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8533;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

const DUE = (() => { const G = {};
  new Function('self', fs.readFileSync(path.join(__dirname, '..', 'mobile', 'due.js'), 'utf8'))(G);
  return G.DUE; })();
const TODAY = DUE.today();
const on = n => DUE.shift(TODAY, n);
const ago = n => DUE.shift(TODAY, -n);

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  console.log('THE PHONE — scheduleCompareRows()');
  {
    /* MP is 250 h = 12.5 days at the fleet's 20 h/day. Last done 5 days ago
       leaves 7.5 days -> Math.round -> 8, so CM's own due date is on(8). */
    const hist = { 'MP|ZZ001': { d: ago(5) } };
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(h => {
      localStorage.setItem('up_dests', '[]');
      localStorage.setItem('cm_hist', JSON.stringify(h));
      localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
    }, hist);
    await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 25000 });
    await p.evaluate(d => { DUE.setToday(d); }, TODAY);
    /* Seed SCHED directly -- schedOrdersFor() reads SCHED.byUnit, and this is
       the exact shape schedule_slim.json's own byUnit carries. */
    await p.evaluate(sched => { SCHED = sched; try { localStorage.setItem('cm_sched', JSON.stringify(sched)); } catch (e) {} }, {
      generated: new Date().toISOString(),
      byUnit: {
        ZZ001: [{ wo: 'WO-1', hours: 250, types: ['MP'], plan: on(8), priority: 'P3 Planned (PM)' }],
        ZZ002: [{ wo: 'WO-2', hours: 250, types: ['MP'], plan: on(30), priority: 'P3 Planned (PM)' }],   // 1C only -- CM has never walked ZZ002
      },
    });
    const r = await p.evaluate(() => scheduleCompareRows(''));
    ok('a machine both schedules have an opinion on gets exactly one row',
       r.length === 1, JSON.stringify(r));
    ok('  it is the machine, not the 1C-only one', r[0] && r[0].unit === 'ZZ001', JSON.stringify(r[0]));
    ok('and the CM date is computed from due.js, not copied from 1C',
       r[0] && r[0].cmDate === on(8), r[0] && r[0].cmDate);
    ok('a same-day plan reads as agreement (gap 0, status ok)',
       r[0] && r[0].gap === 0 && r[0].st === 'ok', JSON.stringify(r[0]));
    ok('a machine 1C mentions and CM has never walked is not comparable',
       !r.some(x => x.unit === 'ZZ002'), JSON.stringify(r));

    console.log('\n  a real disagreement');
    /* The phone's own "Compare" pill is gone from the Due tab now — 1C's
       data has its own tab (1C PM, tests/duepm.cjs) and the CM tab's merged
       agenda never mixed CM's own judgement with 1C's — so scheduleCompareRows()
       has no caller left on this screen. It is unchanged, still directly
       tested here; the dashboard's own Compare tab below is untouched. */
    await p.evaluate(sched => { SCHED = sched; }, {
      generated: new Date().toISOString(),
      byUnit: { ZZ001: [{ wo: 'WO-1', hours: 250, types: ['MP'], plan: on(30), priority: 'P3 Planned (PM)' }] },
    });
    const r2 = await p.evaluate(() => scheduleCompareRows(''));
    ok('1C 22 days later than our own date diverges (past the 7-day bar)',
       r2[0] && r2[0].gap === 22 && r2[0].st === 'soon', JSON.stringify(r2[0]));

    console.log('\n  it never changes what Overdue/Due soon/1C plan already meant');
    const others = await p.evaluate(() => ({
      over: dueRows('').filter(r => r.st === 'over').length,
      plan: planRows('').length,
    }));
    ok('Overdue is untouched by this feature existing', typeof others.over === 'number');
    ok('1C plan is untouched too', typeof others.plan === 'number');
    ok('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  console.log('\nTHE DASHBOARD — scheduleCompareRows() mirror');
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
    await p.evaluate(() => { localStorage.clear(); window.CM_DATA = null; });
    await p.evaluate(d => { DUE.setToday(d); }, TODAY);
    await p.evaluate(r => { CMDash.importRecords(r); }, [
      { equip: 'ZZ001', date: ago(5), type: 'MP', by: 'Slam', smu: '1000', items: [] },
    ]);
    await p.evaluate(wo => { window.CM_WO_DATA = wo; }, {
      generated: new Date().toISOString(),
      workOrders: [
        { equip: 'ZZ001', planStart: on(8), hours: 250, cmTypes: ['MP'], cmLabel: '250h service', woNumber: 'WO-1', open: true },
        { equip: 'ZZ002', planStart: on(8), hours: 250, cmTypes: ['MP'], cmLabel: '250h service', woNumber: 'WO-2', open: true },
      ],
    });
    await p.evaluate(() => document.getElementById('dataOv').classList.add('hidden'));
    await p.click('[data-tab="due"]');
    await p.waitForTimeout(300);

    const r = await p.evaluate(() => scheduleCompareRows(''));
    ok('the office computes the identical intersection the phone does',
       r.length === 1 && r[0].unit === 'ZZ001', JSON.stringify(r));
    ok('agreeing on the same date', r[0] && r[0].gap === 0 && r[0].st === 'ok', JSON.stringify(r[0]));

    await p.selectOption('#ddScope', 'cmp');
    await p.waitForTimeout(300);
    const seg = await p.evaluate(() => {
      const b2 = document.querySelector('#ddSeg [data-dd="cmp"]');
      return b2 ? b2.textContent.trim() : null;
    });
    ok('the Compare tab is on the segmented control', seg === 'Compare1', seg);
    const rowTxt = (await p.evaluate(() => (document.querySelector('#ddList tbody tr') || {}).textContent || '')).replace(/\s+/g, ' ').trim();
    ok('the row names 1C\'s own plan and the work order', /1C plans/.test(rowTxt) && /WO-1/.test(rowTxt), rowTxt);
    ok('and says the dates agree', /same date/.test(rowTxt), rowTxt);

    console.log('\n  the other tabs never moved');
    const overN = await p.evaluate(() => dueTabRows().filter(r => r.st === 'over').length);
    ok('Overdue is untouched', typeof overN === 'number');
    ok('no page errors', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
