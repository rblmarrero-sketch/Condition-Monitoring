/* What it was last time, and how many sheets it takes to say so.

   Two complaints about one report, and they turn out to be the same report
   telling the reader less than it holds.

   ONE — the previous reading was missing. A magnetic plug report on a truck
   with an earlier visit printed a summary line — "2026-07-29 · Magnetic Plug ·
   4 points · Watch · None flagged" — and nothing else about that visit. What
   each POINT was is in the data and was printed nowhere: 4C was A with twelve
   particles in July and is C with forty-six today, which is the entire reason
   somebody opens a unit report, and it was a real value rendered as nothing.
   The code said so out loud — "only for machines that were measured, a plug
   round has nothing to line up in columns" — and that was simply wrong. A plug
   round IS measured. It is measured in grades and particle counts.

   TWO — it took two sheets. Page one was 45% white and the earlier-rounds
   table, one row of it, started page two, because the history section carried
   an unconditional page break. Right for a unit report holding eight rounds of
   undercarriage; pure waste for the ordinary case, which is a short round and a
   short history. Times a fleet of 1,128, printed and filed.

   Run: node tests/prevmeas.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099')
        + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* TK160's own case, from the sheet the inspector sent back. Four plug points,
   two visits, all four walking from A/B to C. The component and oil hours are
   the MACHINE's and are recorded identically on every point — which is what
   makes them the thing that must not be repeated down every row. */
const PLUG = (dates) => dates.map(([d, smu, grades, pcs], n) => ({
  equip: 'TK160', date: d, type: 'MP', cls: 'TRUCK, DUMP', by: 'Хасенов', smu: String(smu),
  items: ['4C', '4D', '4E', '4F'].map((k, i) => ({
    key: k, label: (i % 2 ? 'Right' : 'Left') + ' Rear Final Drive',
    grade: grades[i], particle: String(pcs[i]),
    comp: String(smu), oil: '500',
    defect: grades[i] === 'C' ? 'Ferrous debris — moderate' : '',
    defectCode: grades[i] === 'C' ? 'DT14-03' : '',
    cause: grades[i] === 'C' ? 'Gear wear' : '',
    actionLabel: grades[i] === 'C' ? 'Monitor / re-inspect next PM' : '',
  })),
}));

const TWO = PLUG([
  ['2026-07-29', 7180, ['A', 'A', 'B', 'A'], [12, 10, 22, 9]],
  ['2026-08-25', 7725, ['C', 'C', 'C', 'C'], [46, 41, 52, 44]],
]);
/* Six visits, so the four-column cap and the "+2" that admits to it are real. */
const SIX = PLUG([
  ['2026-03-04', 5100, ['A', 'A', 'A', 'A'], [4, 5, 6, 4]],
  ['2026-04-08', 5600, ['A', 'A', 'A', 'A'], [6, 6, 8, 5]],
  ['2026-05-13', 6100, ['A', 'B', 'A', 'A'], [8, 14, 9, 7]],
  ['2026-06-17', 6600, ['B', 'B', 'A', 'A'], [15, 18, 11, 8]],
  ['2026-07-29', 7180, ['B', 'B', 'B', 'A'], [19, 22, 16, 9]],
  ['2026-08-25', 7725, ['C', 'C', 'C', 'C'], [46, 41, 52, 44]],
]);
/* A measured round. It already had its millimetre table and must keep exactly
   that — not a second table saying the same thing in grades. */
const UC = ['2026-06-16', '2026-08-11'].map((d, n) => ({
  equip: 'DZ002', date: d, type: 'UC', cls: 'Dozer', by: 'R. Marrero', smu: String(9000 + n * 480),
  items: [['IDLER.L-OUT', 29 + n * 2.5], ['ROLLER.L1', 220 - n * 7], ['CHAIN.L', 104 + n * 3]]
    .map(([k, mm]) => ({ key: k, label: k, mm })),
}));

/* Build through exactly the context the report button hands over, so this
   cannot pass on a report nobody generates. */
const BUILD = `(unit) => {
  const other = f => { const was = lang; try { lang = was === 'ru' ? 'en' : 'ru'; return f(); }
                       finally { lang = was; } };
  const recs = CMReport.recsForScope('unit', unit);
  return CMR.sections({
    lang, mode: 'unit',
    title: t('rep_title_doc'), titleAlt: other(() => t('rep_title_doc')),
    sub: unit, subAlt: unit, stamp: new Date(),
    records: CMReport.normalise(recs, { photos: false }),
    sevLabel: s => (SEV[s] ? SEV[s].l : s),
    sevLabelAlt: s => other(() => (SEV[s] ? SEV[s].l : s)),
  });
}`;

/* CMR.paginate's own placement arithmetic, run over measured heights. A page
   count asserted any other way is a page count asserted about a different
   document from the one that gets printed. */
const LAY = `(secs) => {
  document.querySelectorAll('#rptProbe,#rptProbeCss').forEach(e => e.remove());
  const st = document.createElement('style'); st.id = 'rptProbeCss'; st.textContent = CMR.CSS;
  document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'rptProbe'; d.className = 'rp';
  d.innerHTML = '<div id="rptRoot" style="width:760px;background:#fff">'
    + secs.map(s => '<div class="secwrap" data-nb="' + (s.nb ? 1 : 0) + '">' + s.html + '</div>').join('')
    + '</div>';
  document.body.insertBefore(d, document.body.firstChild);
  const PH = 842, M = 38, FOOT = 22, top = M, bottom = PH - M - FOOT, cw = 595 - 2 * M;
  let y = top, page = 1, drew = false;
  [...document.querySelectorAll('#rptProbe .secwrap')].forEach(el => {
    const hh = el.getBoundingClientRect().height * (cw / 760);
    if (el.dataset.nb === '1' && drew) { page++; y = top; }
    else if (drew && hh <= bottom - top && y + hh > bottom) { page++; y = top; }
    let rem = hh;
    while (rem > 0) { const take = Math.min(bottom - y, rem); y += take; rem -= take;
      drew = true; if (rem > 0.5) { page++; y = top; } else break; }
    y += 14;
  });
  const wide = [...document.querySelectorAll('#rptRoot table')]
    .map(t => Math.round(t.getBoundingClientRect().width)).filter(w => w > 762);
  return { pages: page, wide,
           html: document.getElementById('rptRoot').innerHTML,
           text: document.getElementById('rptRoot').textContent.replace(/\\s+/g, ' ') };
}`;

/* A fresh page per case, and the storage cleared BEFORE the page reads it.

   importRecords merges into an in-memory array that the page fills from
   localStorage on load, so a clear-then-seed inside the page cleared nothing
   that mattered: the previous case's rounds were already in memory. The
   six-round seed leaked into the two-round case and made a one-page sheet come
   out at two — the suite measuring a document its own case never described,
   which is precisely the defect class it exists to catch. An init script runs
   before the page's own scripts on every navigation, so each case starts from
   an empty machine. */
const run = async (p, recs, unit, want) => {
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(900);
  return p.evaluate(({ recs, unit, want, BUILD, LAY }) => {
    window.CM_DATA = null;
    if (want) { lang = want; applyLang(); }
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
    return eval('(' + LAY + ')')(eval('(' + BUILD + ')')(unit));
  }, { recs, unit, want: want || "", BUILD, LAY });
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1200);

  console.log('the plug round says what each point was last time');
  let r = await run(p, TWO, 'TK160');
  ok('there is a point-by-point table at all', /point by point/i.test(r.text), r.text.slice(-90));
  /* The whole complaint, in one line: July's reading for 4C. */
  ok('the earlier grade for a named point is printed', /PC 12/.test(r.text),
     (r.text.match(/Point by point.{0,140}/i) || [""])[0]);
  ok('and today\'s beside it', /PC 46/.test(r.text));
  ok('every point carries its earlier reading, not just the first',
     ['PC 12', 'PC 10', 'PC 22', 'PC 9'].every(x => r.text.indexOf(x) >= 0),
     ['PC 12', 'PC 10', 'PC 22', 'PC 9'].filter(x => r.text.indexOf(x) < 0).join(' ') || 'all four');
  /* A grade with no reason behind it is half a record. */
  ok('a defect raised at a point shows on that point\'s cell',
     (r.html.match(/class="gr-d"/g) || []).length === 4,
     String((r.html.match(/class="gr-d"/g) || []).length));
  ok('the earlier column is dated and carries its hour meter',
     /2026-07-29/.test(r.text) && /7180/.test(r.text));
  ok('and the reader is told which column is today',
     /this round/i.test(r.text) && /gr-now/.test(r.html));

  console.log('\nthe machine\'s readings are not repeated down every row');
  /* comp and oil hours belong to the compartment, not the plug. Printed on all
     four rows they are four times the ink for one fact, and they crowd out the
     particle count, which is the number that differs. */
  const pbp = r.html.slice(r.html.search(/class="mh gh"/));
  ok('shared component hours are dropped from the cells', !/comp 7725/.test(pbp),
     (pbp.match(/comp[^<]*/) || ["none"])[0]);
  ok('but the reading that differs between points is kept',
     /PC 46/.test(pbp) && /PC 52/.test(pbp));

  console.log('\nand it fits on one sheet');
  ok('a short round with one earlier round is one page, not two', r.pages === 1, r.pages + ' page(s)');
  ok('nothing runs off the right-hand edge', !r.wide.length, r.wide.join(' ') || 'all within 760px');

  console.log('\na long history is capped, and says so');
  r = await run(p, SIX, 'TK160');
  const cols = (r.html.slice(r.html.search(/class="mh gh"/)).match(/class="gr-dt"/g) || []).length;
  ok('at most four rounds become columns', cols === 4, cols + ' columns');
  ok('and the rounds left out are counted rather than dropped silently',
     /\+ ?2/.test(r.text), (r.text.match(/Point by point[^·]*·[^A-Za-zА-Яа-я]*\d/i) || [""])[0]);
  ok('the table above still lists every one of them',
     ['2026-03-04', '2026-04-08', '2026-05-13', '2026-06-17', '2026-07-29']
       .every(d => r.text.indexOf(d) >= 0));
  ok('six columns of history still fit the paper', !r.wide.length, r.wide.join(' ') || 'within 760px');

  console.log('\na measured round keeps the table it already had');
  r = await run(p, UC, 'DZ002');
  ok('millimetres are still lined up in columns', /measurement history/i.test(r.text));
  ok('and are not repeated as a second table in grades', !/point by point/i.test(r.text),
     (r.text.match(/Point by point/i) || ["absent"])[0]);
  ok('the millimetre readings are the ones printed', /29/.test(r.text) && /220/.test(r.text));

  console.log('\nRussian');
  r = await run(p, TWO, 'TK160', 'ru');
  ok('the new table is translated, not left in English',
     /По точкам/.test(r.text), (r.text.match(/По точкам.{0,40}/) || [""])[0]);
  ok('the inspector\'s own readings are not translated away', /PC 12/.test(r.text));
  ok('and the Russian sheet is one page too', r.pages === 1, r.pages + ' page(s)');
  ok('with nothing off the edge', !r.wide.length, r.wide.join(' ') || 'within 760px');

  console.log('\none round has no history to show');
  r = await run(p, TWO.slice(1), 'TK160');
  ok('a single round prints no earlier-rounds section', !/earlier rounds/i.test(r.text));
  ok('and no empty point-by-point table', !/point by point/i.test(r.text));
  ok('and is one page', r.pages === 1, r.pages + ' page(s)');

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ')
                           : '\nall previous-measurement checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
