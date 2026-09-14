/* THE ESTIMATE HAS TO BE TRUE OF THE DOCUMENT IT IS ABOUT.

   The report panel says how many pages, how large, and how long — before
   anything is rasterised. Two of those three were guesses, and the time was
   wrong by fifteen times: it promised fourteen seconds for a nine-page round
   report that was timed nine separate ways and took three and a half
   minutes every time. A planner told "fourteen seconds" leaves the page,
   which cancels the run.

   This suite is the guard against that drifting back. It makes a real PDF,
   times it, and holds the estimate the panel gave beforehand against what
   actually happened — pages exactly, size and time within a stated factor.
   It also proves the panel learns: the rate is written down after a run and
   the next estimate is quoted from this machine rather than from the
   constant the code shipped with.

   Run: node tests/rptest.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const SEED = () => {
  const it = (o) => Object.assign({ key: '4C', label: 'Left Rear Final Drive', defect: 'Ferrous debris',
    defectCode: 'DT14-03', action: 'SCH', actionLabel: 'Schedule repair' }, o);
  CMDash.importRecords([
    { equip: 'TK101', date: '2026-08-20', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '1200',
      items: [it({ grade: 4, owner: 'A. Sokolov', due: '2026-12-01', comment: 'Ferrous debris across the plug face, heavier on the outboard half.' }),
              { key: '4D', label: 'Right Rear Final Drive', grade: 1 }] },
    { equip: 'TK101', date: '2026-07-20', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '900', items: [it({ grade: 2 })] },
    { equip: 'TK101', date: '2026-06-18', type: 'MP', cls: 'HT', by: 'Ivanov', smu: '620', items: [it({ grade: 2 })] },
  ]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { localStorage.setItem('cm_drive_url', ''); localStorage.setItem('cm_dash_lang', 'en'); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(SEED); await p.waitForTimeout(300);

  console.log('1. THE FIGURE THE CODE SHIPS WITH IS THE MEASURED ONE');
  const start = await p.evaluate(() => ({ rate: CMReport.rate(), saved: localStorage.getItem('cm_rpt_secpp') }));
  ok('nothing is remembered yet, so the estimate quotes the measured default',
     start.saved === null && start.rate >= 10 && start.rate <= 60, 'rate ' + start.rate + ' s/page');

  const OPT = { lang: 'en', bi: false, photos: true, scale: 1.8 };
  const est = await p.evaluate(o => CMReport.estimate('unit', 'TK101', o), OPT);
  ok('  and it is quoted per page, not as a flat two seconds',
     est.seconds >= est.pages * 10, JSON.stringify(est));

  console.log('\n2. AGAINST A DOCUMENT THAT WAS ACTUALLY MADE');
  const dl = p.waitForEvent('download', { timeout: 600000 }); dl.catch(() => {});
  const t0 = Date.now();
  const pages = await p.evaluate(o => window.CMReport.generate('unit', 'TK101', o), OPT);
  const d = await dl;
  const path = require('path').join(require('os').tmpdir(), 'cm-rptest.pdf');
  await d.saveAs(path);
  const took = (Date.now() - t0) / 1000;
  const bytes = require('fs').statSync(path).size;
  console.log('     made ' + pages + ' page(s), ' + (bytes / 1048576).toFixed(2) + ' MB, in ' + took.toFixed(1) + ' s');

  ok('the page count was exact', est.pages === pages, est.pages + ' estimated / ' + pages + ' made');
  const bf = bytes / est.bytes;
  ok('the size was within a factor of two', bf > 0.5 && bf < 2,
     (est.bytes / 1048576).toFixed(2) + ' MB estimated / ' + (bytes / 1048576).toFixed(2) + ' MB made (×' + bf.toFixed(2) + ')');
  /* Wide, because a test machine is not an office machine and the point is to
     catch an order of magnitude, which is what went wrong. */
  const tf = took / est.seconds;
  ok('the time was within a factor of four — an order of magnitude cannot pass',
     tf > 0.25 && tf < 4, est.seconds + ' s estimated / ' + took.toFixed(1) + ' s taken (×' + tf.toFixed(2) + ')');

  console.log('\n3. AND THE PANEL LEARNS THIS MACHINE');
  const learnt = await p.evaluate(() => ({ rate: CMReport.rate(), saved: localStorage.getItem('cm_rpt_secpp') }));
  ok('the run was written down', learnt.saved !== null && learnt.rate > 0, learnt.saved + ' s/page');
  /* THE ONE CASE THIS COULD NOT SEE WAS THE ONE WHERE NOTHING SHOULD HAPPEN.
     It demanded the rate move by more than 0.05 — but when the run comes in at
     exactly the rate already stored (22 against 22.0, which is what a settled
     estimate on a steady machine looks like), a correct learner moves by zero
     and the suite failed on working code. Worse, it could not tell "the
     learner is broken" from "the learner was already right": both read as no
     movement. The invariant is not that the figure MOVES, it is where it ends
     up — between what was stored and what was seen, never all the way to the
     new run, so one slow afternoon cannot become the quote for ever. */
  const seen = took / pages, gap = Math.abs(seen - start.rate);
  /* The figure is QUOTED to the nearest second, so a gap of a tenth cannot
     move it and demanding movement fails on a learner working perfectly. What
     is actually being protected is where the figure LANDS: between what was
     stored and what this run saw, never out past the new observation — so one
     slow afternoon cannot become the quote for ever. Movement is only
     required where there is enough gap for a whole second of it. */
  const lo = Math.min(start.rate, seen) - 0.51, hi = Math.max(start.rate, seen) + 0.51;
  const landed = learnt.rate >= lo && learnt.rate <= hi;
  const moved = gap < 2 || Math.abs(learnt.rate - start.rate) >= 0.5;
  ok('  and it moved towards what was seen, without jumping past it',
     landed && moved,
     'was ' + start.rate + ', seen ' + seen.toFixed(1) + ', now ' + learnt.rate
       + (gap < 2 ? ' (gap ' + gap.toFixed(1) + ' s — under the second it is quoted in)' : ''));
  const est2 = await p.evaluate(o => CMReport.estimate('unit', 'TK101', o), OPT);
  ok('  the next estimate is quoted from it', est2.secPp === learnt.rate, JSON.stringify(est2));

  /* A wild figure from one bad run must not become the estimate for ever. */
  const clamped = await p.evaluate(() => { localStorage.setItem('cm_rpt_secpp', '99999'); const a = CMReport.rate();
    localStorage.setItem('cm_rpt_secpp', 'not a number'); const c = CMReport.rate();
    localStorage.removeItem('cm_rpt_secpp'); return { a, c }; });
  ok('an impossible remembered rate is ignored, not believed',
     clamped.a === start.rate && clamped.c === start.rate, JSON.stringify(clamped));

  console.log('\n4. AND IT IS READ AS TIME, NOT AS A COUNT OF SECONDS');
  const words = await p.evaluate(() => ({ s: mmss(42), m: mmss(200), edge: mmss(59), over: mmss(61) }));
  ok('under a minute stays in seconds', /^42\s*s$/.test(words.s) && /^59\s*s$/.test(words.edge), words.s + ' · ' + words.edge);
  ok('  and three minutes is said as minutes, not as "200 s"',
     /min/.test(words.m) && !/\bs$/.test(words.m) && /min/.test(words.over), words.m + ' · ' + words.over);
  await p.click('.lang button[data-lang="ru"]'); await p.waitForTimeout(300);
  const ru = await p.evaluate(() => ({ s: mmss(42), m: mmss(200) }));
  ok('  both in Russian', /[А-Яа-я]/.test(ru.s) && /[А-Яа-я]/.test(ru.m), ru.s + ' · ' + ru.m);

  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
