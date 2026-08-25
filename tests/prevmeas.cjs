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

/* A one-pixel PNG standing in for a plug photograph — enough for the report to
   have something real to place, and small enough that a page count means what
   it says. */
const SHOT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* TK160's own case, from the sheet the inspector sent back. Four plug points,
   the names written the way this fleet writes them — with the point code in
   front — and the component and oil hours identical on every point, because
   they are the MACHINE's. That is what makes them the thing that must not be
   repeated down every row. */
const PLUG = (dates, opts) => dates.map(([d, smu, grades, pcs], n) => ({
  equip: 'TK160', date: d, type: 'MP', cls: 'TRUCK, DUMP', by: 'Хасенов', smu: String(smu),
  items: ['4C', '4D', '4E', '4F'].map((k, i) => ({
    key: k, label: k + ' ' + (i % 2 ? 'RIGHT' : 'LEFT') + ' REAR FINAL DRIVE',
    grade: grades[i], particle: String(pcs[i]),
    comp: String(smu), oil: '500',
    photo: (opts && opts.photos) ? SHOT : '',
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
/* The same two rounds with the photographs the inspector actually took. */
const TWO_SHOT = PLUG([
  ['2026-07-29', 7180, ['C', 'C', 'C', 'C'], [34, 37, 40, 43]],
  ['2026-08-25', 7725, ['B', 'B', 'B', 'B'], [21, 24, 27, 30]],
], { photos: true });
/* An earlier round where every point was fine and nobody photographed
   anything. There is nothing to reprint, and a header with no evidence under
   it is a section that exists to hold its own heading. */
const TWO_QUIET = PLUG([
  ['2026-07-29', 7180, ['A', 'A', 'A', 'A'], [4, 5, 6, 4]],
  ['2026-08-25', 7725, ['C', 'C', 'C', 'C'], [46, 41, 52, 44]],
]);
/* Eight earlier rounds, all with something to show, so the cap is real. */
const NINE = PLUG(['2026-01-07', '2026-02-11', '2026-03-04', '2026-04-08', '2026-05-13',
                   '2026-06-17', '2026-07-01', '2026-07-29', '2026-08-25']
  .map((d, n) => [d, 5100 + n * 340, ['C', 'C', 'C', 'C'], [20 + n, 21 + n, 22 + n, 23 + n]]));
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
const BUILD = `(unit, withPhotos) => {
  const other = f => { const was = lang; try { lang = was === 'ru' ? 'en' : 'ru'; return f(); }
                       finally { lang = was; } };
  const recs = CMReport.recsForScope('unit', unit);
  return CMR.sections({
    lang, mode: 'unit',
    title: t('rep_title_doc'), titleAlt: other(() => t('rep_title_doc')),
    sub: unit, subAlt: unit, stamp: new Date(),
    records: CMReport.normalise(recs, { photos: !!withPhotos }),
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
  const root = document.getElementById('rptRoot');
  return { pages: page, wide,
           html: root.innerHTML,
           text: root.textContent.replace(/\\s+/g, ' '),
           /* Every section that is one of the earlier rounds reprinted: a
              .machhd inside a .sec that is not the masthead. */
           full: [...root.querySelectorAll('.sec.olderr .machhd')].map(h => ({
             head: h.textContent.replace(/\\s+/g, ' ').trim(),
             cards: h.closest('.sec').querySelectorAll('.cel').length,
             shots: h.closest('.sec').querySelectorAll('img.ph,.phg img').length,
             chips: h.closest('.sec').querySelectorAll('.chips').length,
           })) };
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
const run = async (p, recs, unit, want, photos) => {
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(900);
  return p.evaluate(({ recs, unit, want, photos, BUILD, LAY }) => {
    window.CM_DATA = null;
    if (want) { lang = want; applyLang(); }
    CMDash.importRecords(recs);
    document.getElementById('dataOv').classList.add('hidden');
    return eval('(' + LAY + ')')(eval('(' + BUILD + ')')(unit, photos));
  }, { recs, unit, want: want || "", photos: !!photos, BUILD, LAY });
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

  console.log('\nand the comparison does not demand a sheet of its own');
  /* The original complaint: a page 45% white, followed by a second holding a
     table of one row. State it about the TABLES — a report that also reprints
     an earlier round in full is longer because it carries more, which is not
     the same defect and is the thing that was asked for. */
  ok('nothing runs off the right-hand edge', !r.wide.length, r.wide.join(' ') || 'all within 760px');
  r = await run(p, TWO_QUIET, 'TK160');
  ok('an earlier round with nothing to show is not reprinted', !r.full.length,
     r.full.map(x => x.head).join(' | ') || 'no full reprint');
  ok('and its summary and comparison sit on the page above, not a new one',
     r.pages === 1, r.pages + ' page(s)');
  ok('while still being counted and listed', /2026-07-29/.test(r.text));

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
  /* The six-sheet report this collapse exists to prevent: the same drawing of
     the same dozer, once per round. The millimetres are compared in the table
     above, which is where an undercarriage round's record belongs. */
  ok('and its earlier round does not reprint the drawing and the grid',
     !r.full.length, r.full.map(x => x.head).join(' | ') || 'not reprinted');

  console.log('\nthe earlier round, as it was reported');
  /* The second complaint, in the reader's own words: "we should be seeing the
     previous round with photo and same format". The photographs were fetched
     with everything else and attached to the record; only the printing was
     missing. */
  r = await run(p, TWO_SHOT, 'TK160', '', true);
  ok('the earlier round gets a section of its own', r.full.length === 1,
     r.full.map(x => x.head).join(' | ') || 'none');
  const jul = r.full[0] || {};
  ok('headed by its date, type, hour meter and inspector',
     /2026-07-29/.test(jul.head || '') && /7180/.test(jul.head || '')
     && /Хасенов/.test(jul.head || ''), jul.head);
  ok('and its verdict, in the same words the summary table uses',
     /Watch/i.test(jul.head || ''), jul.head);
  ok('one card per point, the same cards the latest round uses', jul.cards === 4, String(jul.cards));
  ok('with the photographs the inspector took', jul.shots === 4, String(jul.shots));
  ok('and the grade and severity chips on each', jul.chips === 4, String(jul.chips));
  /* What collapsing the earlier rounds was FOR. */
  ok('but not a second masthead', (r.html.match(/class="mast"/g) || []).length === 1,
     String((r.html.match(/class="mast"/g) || []).length) + ' masthead(s)');
  ok('nor a second signature block', (r.html.match(/class="shsign"/g) || []).length === 1,
     String((r.html.match(/class="shsign"/g) || []).length) + ' signature block(s)');
  ok('and the masthead does not still claim the round was left out',
     !/rather than reprinted/i.test(r.text), (r.text.match(/earlier round[^.]*\./i) || [""])[0]);

  console.log('\nthe things that were being said twice');
  /* "Ferrous debris — moderate · Ferrous debris — moderate +2" reads as four
     different findings until you read it twice. */
  const worst = (r.text.match(/Ferrous debris — moderate/g) || []).length;
  ok('one defect on four points is named once in the summary row',
     !/moderate · Ferrous debris/.test(r.text), (r.text.match(/Watch[^|]{0,90}/) || [""])[0]);
  /* Names on this fleet are written "4C LEFT REAR FINAL DRIVE" and the card
     prints the code above the name in its own line. */
  ok('a point code is not printed above a name that already starts with it',
     !/4C<\/div><div class="pn">4C/.test(r.html) && !/>4C 4C</.test(r.html),
     (r.html.match(/class="pk">[^<]*<\/div><div class="pn">[^<]{0,30}/) || [""])[0]);
  ok('and not appended to it in the comparison table either',
     !/4C LEFT REAR FINAL DRIVE[^<]*<span class="code">4C/.test(r.html));

  console.log('\na machine with a long history is capped, and says so');
  r = await run(p, NINE, 'TK160');
  ok('at most six earlier rounds are reprinted in full', r.full.length === 6,
     r.full.length + ' reprinted');
  ok('and the ones that were not are counted, not dropped silently',
     /further round/i.test(r.text), (r.text.match(/\d+ further round[^.]*\./i) || [""])[0]);
  ok('every one of them is still listed in the table above',
     ['2026-01-07', '2026-02-11', '2026-07-01'].every(d => r.text.indexOf(d) >= 0));

  console.log('\nRussian');
  r = await run(p, TWO, 'TK160', 'ru');
  ok('the new table is translated, not left in English',
     /По точкам/.test(r.text), (r.text.match(/По точкам.{0,40}/) || [""])[0]);
  ok('the inspector\'s own readings are not translated away', /PC 12/.test(r.text));
  ok('with nothing off the edge', !r.wide.length, r.wide.join(' ') || 'within 760px');
  ok('and the earlier round is headed in Russian too',
     /Магнитная пробка/.test((r.full[0] || {}).head || ''), (r.full[0] || {}).head);

  console.log('\none round has no history to show');
  r = await run(p, TWO.slice(1), 'TK160');
  ok('a single round prints no earlier-rounds section', !/earlier rounds/i.test(r.text));
  ok('and no empty point-by-point table', !/point by point/i.test(r.text));
  ok('and nothing is reprinted below it', !r.full.length, r.full.length + ' section(s)');
  ok('and is one page', r.pages === 1, r.pages + ' page(s)');

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ')
                           : '\nall previous-measurement checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
