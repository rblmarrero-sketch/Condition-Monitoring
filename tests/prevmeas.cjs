/* What it was last time — as the office screen shows it, and nothing else.

   Three rounds of the same complaint, and the answer got simpler each time.

   FIRST, the previous reading was missing. A magnetic plug report on a truck
   with an earlier visit printed one summary line — "2026-07-29 · Magnetic Plug
   · 4 points · Watch" — and nothing about what each POINT was. That was in the
   data and printed nowhere: a real value rendered as nothing.

   SECOND, the photographs were missing. They had been fetched with everything
   else and attached to the record; only the printing was absent. A reader
   looking at "4C was C in July and is B today" wants to see July's plug.

   THIRD — and this is what the sheet came back with, struck through in red —
   the two comparison tables were redundant. They were. Every fact in them is
   on a card: the grade, the severity, the reading, the finding, and the date
   and hour meter in the header above them. Three renderings of one truth is
   not thoroughness, it is three places for them to disagree.

   So what a unit report is now: the latest round, then every earlier round as
   the office screen shows it — photographs, with what that point was under
   each — compact enough that four or five fit a page. One table survives, and
   only for rounds recorded in millimetres, because a condemn limit, a rate of
   wear and a forecast are on no card and cannot be reconstructed by looking.

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
    + secs.map(s => '<div class="secwrap" data-nb="' + (s.nb ? 1 : 0) + '"'
        + ' data-gap="' + (s.gap != null ? s.gap : 14) + '">' + s.html + '</div>').join('')
    + '</div>';
  document.body.insertBefore(d, document.body.firstChild);
  const PH = 842, M = 38, FOOT = 22, top = M, bottom = PH - M - FOOT, cw = 595 - 2 * M;
  let y = top, page = 1, drew = false;
  const blocks = [];
  [...document.querySelectorAll('#rptProbe .secwrap')].forEach((el, i) => {
    const hh = el.getBoundingClientRect().height * (cw / 760);
    if (el.dataset.nb === '1' && drew) { page++; y = top; }
    else if (drew && hh <= bottom - top && y + hh > bottom) { page++; y = top; }
    const start = page;
    let rem = hh;
    while (rem > 0) { const take = Math.min(bottom - y, rem); y += take; rem -= take;
      drew = true; if (rem > 0.5) { page++; y = top; } else break; }
    /* The gap the paginator actually leaves after this section, not a literal
       14 — an earlier round asks for less, and that is the difference between
       four to a page and five. A harness that assumes the old number measures
       a document that never prints. */
    y += Number(el.dataset.gap);
    blocks.push({ i, h: Math.round(hh), page: start,
                  olderr: el.querySelector('.olderr') ? 1 : 0 });
  });
  const wide = [...document.querySelectorAll('#rptRoot table')]
    .map(t => Math.round(t.getBoundingClientRect().width)).filter(w => w > 762);
  const root = document.getElementById('rptRoot');
  return { pages: page, wide, blocks,
           html: root.innerHTML,
           text: root.textContent.replace(/\\s+/g, ' '),
           /* Every section that is one of the earlier rounds reprinted: a
              .machhd inside a .sec that is not the masthead. */
           full: [...root.querySelectorAll('.sec.olderr .ohd')].map(h => ({
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

  console.log('the earlier round, as the office screen shows it');
  let r = await run(p, TWO_SHOT, 'TK160', '', true);
  ok('it gets a block of its own', r.full.length === 1,
     r.full.map(x => x.head).join(' | ') || 'none');
  const jul = r.full[0] || {};
  ok('headed by its date, type, hour meter and inspector',
     /2026-07-29/.test(jul.head || '') && /7180/.test(jul.head || '')
     && /Хасенов/.test(jul.head || ''), jul.head);
  ok('and its verdict, in the same words the latest round uses',
     /Watch/i.test(jul.head || ''), jul.head);
  /* T.both's block variants put the translation on its own line, which is
     right in a table cell and wrong on a header — it printed "Magnetic
     PlugМагнитная пробка", two words run together with nothing between. */
  ok('with the two languages separated rather than run together',
     !/PlugМагнитная/.test(jul.head || ''), jul.head);
  ok('one card per point, the same cards the latest round uses', jul.cards === 4, String(jul.cards));
  ok('with the photographs the inspector took', jul.shots === 4, String(jul.shots));
  ok('and the grade and severity on each', jul.chips === 4, String(jul.chips));

  console.log('\nwhat each point was, on the card and not in a table');
  ok('July\'s reading for a named point is printed', /PC 34/.test(r.text),
     (r.text.match(/2026-07-29.{0,120}/) || [""])[0]);
  ok('every point carries its own, not just the first',
     ['PC 34', 'PC 37', 'PC 40', 'PC 43'].every(x => r.text.indexOf(x) >= 0),
     ['PC 34', 'PC 37', 'PC 40', 'PC 43'].filter(x => r.text.indexOf(x) < 0).join(' ') || 'all four');
  ok('and today\'s beside it', /PC 21/.test(r.text));

  console.log('\nthe tables that said it a third time are gone');
  ok('no earlier-rounds summary table', !/earlier rounds/i.test(r.text),
     (r.text.match(/Earlier rounds/i) || ["absent"])[0]);
  ok('no point-by-point grid', !/point by point/i.test(r.text),
     (r.text.match(/Point by point/i) || ["absent"])[0]);
  ok('and a plug report carries no table at all',
     !/<table/.test(r.html), String((r.html.match(/<table/g) || []).length) + ' table(s)');

  console.log('\nbut not the furniture');
  ok('one masthead, not one per round', (r.html.match(/class="mast"/g) || []).length === 1,
     String((r.html.match(/class="mast"/g) || []).length));
  ok('one signature block', (r.html.match(/class="shsign"/g) || []).length === 1,
     String((r.html.match(/class="shsign"/g) || []).length));

  console.log('\nthe things that were being said twice');
  ok('a point code is not printed above a name that already starts with it',
     !/class="pk">4C<\/div><div class="pn">4C/.test(r.html),
     (r.html.match(/class="pk">[^<]*<\/div><div class="pn">[^<]{0,30}/) || [""])[0]);
  /* One finding on four points, repeated once per point, reads as four
     different findings until you read it twice. */
  ok('one finding shared by every point is stated once, above them',
     /class="ocommon"/.test(r.html) && !/moderate · Ferrous debris/.test(r.text),
     (r.text.match(/Same on all[^P]{0,70}/i) || [""])[0]);

  console.log('\nfour or five rounds to a page');
  /* The number that was asked for, measured on the document that prints. */
  r = await run(p, NINE, 'TK160', '', true);
  ok('eight earlier rounds are all reprinted — no silent cap', r.full.length === 8,
     r.full.length + ' reprinted');
  const perPage = {};
  r.blocks.filter(x => x.olderr).forEach(x => { perPage[x.page] = (perPage[x.page] || 0) + 1; });
  const most = Math.max(...Object.values(perPage));
  ok('a page of history holds at least four of them', most >= 4,
     Object.entries(perPage).map(([k, v]) => `p${k}:${v}`).join(' '));
  ok('and no more than five, so each one is still readable', most <= 5, String(most));
  ok('nine rounds come to a handful of sheets, not one each', r.pages <= 4,
     r.pages + ' page(s) for 9 rounds');
  ok('nothing runs off the right-hand edge', !r.wide.length, r.wide.join(' ') || 'within 760px');

  console.log('\na round with nothing to show gets no block');
  r = await run(p, TWO_QUIET, 'TK160');
  ok('no header standing over an empty space', !r.full.length,
     r.full.map(x => x.head).join(' | ') || 'none');
  ok('and the sheet is one page', r.pages === 1, r.pages + ' page(s)');

  console.log('\na measured round keeps the one table that cannot be looked at');
  r = await run(p, UC, 'DZ002');
  ok('millimetres are still lined up in columns', /measurement history/i.test(r.text));
  ok('the readings are the ones printed', /29/.test(r.text) && /220/.test(r.text));
  ok('and it is not repeated as a second table in grades', !/point by point/i.test(r.text));
  /* The six-sheet report this collapse exists to prevent: the same drawing of
     the same dozer, once per round. */
  ok('its earlier round does not reprint the drawing and the grid', !r.full.length,
     r.full.map(x => x.head).join(' | ') || 'not reprinted');

  console.log('\nRussian');
  r = await run(p, TWO, 'TK160', 'ru');
  ok('the earlier round is headed in Russian', /Магнитная пробка/.test(r.text),
     (r.full[0] || {}).head);
  ok('the inspector\'s own readings are not translated away', /PC 12/.test(r.text));
  ok('with nothing off the edge', !r.wide.length, r.wide.join(' ') || 'within 760px');
  ok('and the point names come from the reference, in the reader\'s language',
     /редуктор/.test(r.text), (r.text.match(/[А-Яа-я ]*редуктор/) || [""])[0]);

  console.log('\none round has no history to show');
  r = await run(p, TWO.slice(1), 'TK160');
  ok('nothing is reprinted below it', !r.full.length, r.full.length + ' section(s)');
  ok('and no table appears with nothing to put in it', !/<table/.test(r.html));
  ok('and is one page', r.pages === 1, r.pages + ' page(s)');

  console.log(fails.length ? '\nFAILURES:\n  ' + [...new Set(fails)].join('\n  ')
                           : '\nall previous-measurement checks passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
