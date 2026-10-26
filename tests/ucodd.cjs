/* A READING ON THE WRONG SIDE OF "NEW" IS A QUESTION, NOT A PASS.

   EX002, 24 Oct 2026: both link heights read 180 mm. The ZX 1200's reference
   said new 116 / condemn 109 — the ZX 280's row, carried into the workbook —
   so the office printed "-914 %" and then, under the table, "All N measured
   points inside limits". Hitachi's own page (W155-03-07-001, row A) gives
   181 / 171, and 180 mm is 10 % worn.

   Two things are held here, on both office pages and on the report:
     1. the ZX 1200 link height is 181 / 171, so 176 mm is 50 % worn;
     2. a reading outside the reference (wear.js outOfRange) gets no
        percentage, is named as outside the reference, and is never counted
        among the points "inside limits" — nor called normal by the report.

   Run: node tests/ucodd.cjs [port]   (needs tests/mock.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8099);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const ODD = { equip: 'EX002', date: '2026-10-24', type: 'UC', cls: 'EXC', by: 'Ivanov', smu: '41000',
  items: [ { key: 'LINKH.L', mm: 195 }, { key: 'LINKH.R', mm: 176 }, { key: 'ROLLER.L1', mm: 285 } ] };
const ALLODD = { equip: 'EX001', date: '2026-10-24', type: 'UC', cls: 'EXC', by: 'Ivanov', smu: '40000',
  items: [ { key: 'LINKH.L', mm: 195 }, { key: 'LINKH.R', mm: 196 } ] };

(async () => {
  const b = await chromium.launch();
  for (const surf of ['dashboard', 'dashboard-next']) {
    for (const lang of ['en', 'ru']) {
      console.log(`\n${surf} · ${lang}`);
      const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
      const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.addInitScript(l => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', l); localStorage.setItem('cm_dash_lang', l); }, lang);
      await p.goto(`http://127.0.0.1:${PORT}/${surf}/index.html`, { waitUntil: 'load' });
      await p.waitForFunction(() => window.CMR && window.CMReport && window.CMDash && window.WEAR, { timeout: 20000 });
      await p.waitForTimeout(600);

      if (surf === 'dashboard' && lang === 'en') {
        const r = await p.evaluate(() => {
          const OR = WEAR.outOfRange || (() => 'missing');
          const ref = WEAR.refFor('EX002', 'HITACHI EX1200-6BH', 'LINKH', 'L', '2026-10-24');
          return { n: ref.n, c: ref.c, at180: WEAR.wear(ref, 180), at176: WEAR.wear(ref, 176),
                   at195: WEAR.wear(ref, 195), out195: OR(ref, 195), out176: OR(ref, 176),
                   imp195: WEAR.implausible(ref, 195), grow: OR({ n: 20, c: 29, d: 'grow' }, 15) };
        });
        ok('ZX 1200 link height is 181 / 171 (Hitachi W155-03-07-001)', r.n === 181 && r.c === 171, `${r.n}/${r.c}`);
        ok('EX002\'s 180 mm is 10 % worn', Math.round(r.at180) === 10, r.at180);
        ok('176 mm is 50 % worn', Math.round(r.at176) === 50, r.at176);
        ok('195 mm has no percentage', r.at195 === null, r.at195);
        ok('195 mm is outside the reference; 176 mm is not', r.out195 === 'over-new' && r.out176 === null);
        ok('the capture challenge still asks about it', r.imp195 === 'over-new');
        ok('a part that wears up, measured under new, is outside too', r.grow === 'under-new');
      }

      const d = await p.evaluate(({ a, b2 }) => {
        const t1 = ucBlock(a), t2 = ucBlock(b2);
        const div = document.createElement('div'); div.innerHTML = t1; const x1 = div.innerText;
        div.innerHTML = t2; const x2 = div.innerText;
        return { x1, x2, ok: t('uc_sum_ok', { n: 2 }), okAny: t('uc_sum_ok', { n: 9 }).split('9')[1], odd: t('uc_sum_odd', { n: 1 }),
                 mark: t('uc_odd') };
      }, { a: ODD, b2: ALLODD });
      ok('the board names the reading outside the reference', d.x1.includes(d.odd), d.x1.slice(0, 160));
      ok('the cell says so instead of a percentage', d.x1.includes(d.mark));
      ok('no negative percentage anywhere', !/-\d+\s*%/.test(d.x1));
      ok('"inside limits" counts only the two it can score', d.x1.includes(d.ok));
      ok('a round of nothing but out-of-reference readings is never "inside limits"', !d.x2.includes(d.okAny.trim()), d.x2.slice(0, 160));
      ok('…and says how many are outside', d.x2.includes(d.odd.replace('1', '2')));

      const rp = await p.evaluate(async ({ recs, lang }) => {
        window.CMDash.importRecords(recs);
        const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
        const key = recs[0].equip + '|' + recs[0].date + '|' + recs[0].type;
        const secs = CMReport.sectionsFor('one', key, { lang, bi: false, photos: false });
        const div = document.createElement('div'); div.innerHTML = secs.map(s => s.html).join('');
        document.body.appendChild(div);
        const txt = div.innerText.replace(/\s+/g, ' ');
        div.remove();
        const T = CMR.makeT ? CMR.makeT(lang, false) : null;
        return { txt, oddN: T ? T.S('odd_n', { n: 1 }) : '', short: T ? T('odd_short') : '',
                 normal: T ? T.S('verdict_ok', { of: 3 }) : '' };
      }, { recs: [ODD], lang });
      ok('report: the verdict names the reading outside the reference', rp.oddN && rp.txt.includes(rp.oddN), rp.txt.slice(0, 200));
      ok('report: the round is not called normal', rp.normal && !rp.txt.includes(rp.normal));
      ok('report: the register marks it', rp.short && rp.txt.includes(rp.short));
      ok('report: no negative percentage', !/-\d+\s*%/.test(rp.txt));
      ok('no page errors', !errs.length, errs.join(' | '));
      await p.close();
    }
  }
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
