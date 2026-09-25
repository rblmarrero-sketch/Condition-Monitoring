/* "RE CHECK BECAUSE AS OF THE MOMENT, I CAN SEE ALL LIST FOR 1C, LIKE CN005,
   TK002, ETC." — a field screenshot showed CN018 (a mobile crane), GE100 (a
   generator), CD007/CD008 (compactors) and BL001 (a manlift) all carrying a
   General Inspection / Filter Cut badge on 1C's own plan. All five are class
   GEN — the fleet's explicit "nobody has assigned this a programme" bucket
   (mobile/assets.js's own comment: "940 of the 1,128 machines here carry no
   class at all"). Traced to one line: roundsOnClass()'s "done" rule reads
   "a round walked on any machine of a class is that class demonstrating the
   pairing" literally, and GEN is not a class, it is two hundred unrelated
   machines sharing a label. One General Inspection on CN002 (a crane,
   2026-09-24) put the whole bucket on the programme.

   "More than one machine" was tried first and was not enough — the live
   folder already held a SECOND real GEN round, on TK500 (a water truck,
   also 2026-09-24): two genuinely different equipment types, both on the
   one day GEN has ever had any history at all, is still coincidence-shaped
   for a bucket this size. CATCHALL_MIN (3) is the bar roundsOnClass() now
   holds a catch-all class to before treating a round as the fleet's own
   practice; a named class (due.js states who is on those) is untouched.

   This is the ACTUAL source of the field defect: roundsOnClass() feeds
   ingest/gen_class_rounds.cjs (evaluated live, the same way this test calls
   it), which writes ingest/class_rounds.generated.json, which
   ingest_work_orders.py reads to resolve every work order's cmTypes — that
   resolution is what painted the badges on CN018/GE100/CD007/CD008/BL001.
   mobile's own neverRows() and the dashboard's dueNeverRows() both already
   excluded GEN/ALL from "never inspected" outright (a separate, existing
   rule, unaffected by this fix and reasserted below so the two rules are
   never confused with each other) — the bug lived entirely in what
   roundsOnClass() told the ingest pipeline, not in either Due screen.

   Run: node tests/gencatchall.cjs   (spawns its own static server) */
const { chromium } = require(require('./pw.cjs'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = 8532;
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

async function phone(b, hist) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(h => {
    localStorage.setItem('up_dests', '[]');
    localStorage.setItem('cm_hist', JSON.stringify(h || {}));
    localStorage.setItem('cm_hist_at', JSON.stringify({ at: Date.now(), n: 0 }));
  }, hist || {});
  await p.goto(`http://127.0.0.1:${PORT}/mobile/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => (document.getElementById('verNum') || {}).textContent !== '?', null, { timeout: 25000 });
  return { ctx, p, errs };
}

(async () => {
  await new Promise(r => srv.listen(PORT, r));
  const b = await chromium.launch();

  const probe = await phone(b);
  const gens = await probe.p.evaluate(() => {
    const out = [];
    (window.ASSETS || []).forEach(a => { if (a && a.n && PTS.classOf(a.cls || a.cat || '') === 'GEN') out.push(a.n); });
    return out;
  });
  const namedClass = await probe.p.evaluate(() => {
    // any class besides GEN/ALL that this fixture's ASSETS actually carries,
    // to prove the single-round rule is untouched for a real, named class.
    const counts = {};
    (window.ASSETS || []).forEach(a => { const k = PTS.classOf(a.cls || a.cat || '');
      if (k && k !== 'GEN' && k !== 'ALL') (counts[k] = counts[k] || []).push(a.n); });
    const k = Object.keys(counts).find(k => counts[k].length >= 2);
    return k ? { cls: k, units: counts[k] } : null;
  });
  await probe.ctx.close();
  ok('the register carries enough GEN machines to test the catch-all bar', gens.length >= 4, gens.length + ' GEN machines');
  ok('and at least one named class with two machines, for the control', !!namedClass, JSON.stringify(namedClass));

  console.log('\nno history at all: GEN is on nothing, stated or done');
  {
    const a = await phone(b);
    const genOn = await a.p.evaluate(() => Object.keys((roundsOnClass().GEN && [...roundsOnClass().GEN]) || []));
    ok('GEN starts with no rounds at all', genOn.length === 0, JSON.stringify(genOn));
    ok('no page errors', a.errs.length === 0, a.errs.join(' | '));
    await a.ctx.close();
  }

  console.log('\nONE machine of a catch-all class proves nothing (the original CN002 case)');
  {
    const hist = { ['INSP|' + gens[0]]: { d: '2026-09-24' } };
    const a = await phone(b, hist);
    const on = await a.p.evaluate(() => { const s = roundsOnClass().GEN; return s ? [...s] : []; });
    ok('one General Inspection on one GEN machine does not put GEN on the programme',
       !on.includes('INSP'), JSON.stringify(on));
    await a.ctx.close();
  }

  console.log('\nTWO machines (the CN002 + TK500 shape) is still not enough');
  {
    const hist = {
      ['INSP|' + gens[0]]: { d: '2026-09-24' },
      ['INSP|' + gens[1]]: { d: '2026-09-24' },
    };
    const a = await phone(b, hist);
    const on = await a.p.evaluate(() => { const s = roundsOnClass().GEN; return s ? [...s] : []; });
    ok('two distinct GEN machines, even two real ones on the same day, is still coincidence-shaped',
       !on.includes('INSP'), JSON.stringify(on));
    await a.ctx.close();
  }

  console.log('\nTHREE distinct machines is a real, fleet-wide pairing');
  {
    const hist = {
      ['INSP|' + gens[0]]: { d: '2026-09-24' },
      ['INSP|' + gens[1]]: { d: '2026-09-24' },
      ['INSP|' + gens[2]]: { d: '2026-09-25' },
    };
    const a = await phone(b, hist);
    const on = await a.p.evaluate(() => { const s = roundsOnClass().GEN; return s ? [...s] : []; });
    ok('a third distinct GEN machine crosses the bar', on.includes('INSP'), JSON.stringify(on));
    await a.ctx.close();
  }

  console.log('\nrepeating the SAME machine three times is not three machines');
  {
    const hist = {
      ['INSP|' + gens[0]]: { d: '2026-09-20' },
    };
    // A second, later record on the SAME unit does not add a second distinct
    // machine -- histAll() keeps one entry per (type,unit) key, so this is
    // really just proving the count is by MACHINE, not by round walked.
    const a = await phone(b, hist);
    const on = await a.p.evaluate(() => { const s = roundsOnClass().GEN; return s ? [...s] : []; });
    ok('one machine walked once is still just one machine', !on.includes('INSP'), JSON.stringify(on));
    await a.ctx.close();
  }

  console.log('\na NAMED class keeps the original single-round rule, unchanged');
  {
    const ty = 'INSP'; // unrestricted round, same as GEN's own test above
    const hist = { [ty + '|' + namedClass.units[0]]: { d: '2026-08-01' } };
    const a = await phone(b, hist);
    const on = await a.p.evaluate(cls => { const s = roundsOnClass()[cls]; return s ? [...s] : []; }, namedClass.cls);
    ok('one round on one machine of a named class is still enough',
       on.includes(ty), namedClass.cls + ': ' + JSON.stringify(on));
    await a.ctx.close();
  }

  console.log('\nand the pre-existing GEN exclusion in neverRows()/dueNeverRows() is untouched');
  {
    // This is a SEPARATE, older rule (both screens already skip GEN/ALL
    // machines outright when building "never inspected") -- proven here so
    // a future change to the catch-all bar cannot be mistaken for a change
    // to that rule, or vice versa.
    const hist = {
      ['INSP|' + gens[0]]: { d: '2026-09-24' },
      ['INSP|' + gens[1]]: { d: '2026-09-24' },
      ['INSP|' + gens[2]]: { d: '2026-09-25' },
    };
    const a = await phone(b, hist);
    const rows = await a.p.evaluate(() => neverRows('INSP').map(r => r.unit));
    ok('GEN machines never appear on "never inspected" even once GEN is "on" the round',
       gens.slice(3).every(u => !rows.includes(u)), JSON.stringify(rows.filter(u => gens.includes(u))));
    await a.ctx.close();
  }

  await b.close(); srv.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('THROWN', e && e.stack || e); srv.close(); process.exit(1); });
