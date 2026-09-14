/* THE SHEET SAYS WHAT IT KNOWS, ONCE, AND IN THE COLOUR OF WHAT IT FOUND.

   Six things the office returned on 2026-09-14, all of them on one Filter Cut
   sheet and all of them the same two defects wearing different clothes: a page
   claiming a gap it has no evidence for, and a page rendering a real value as
   nothing.

   1  "1000h · PM 07.09" spelled TEN O'CLOCK, on data carrying no time at all.
      (That one is the plan grid — tests/progchg.cjs.)
   2  A round of nothing but Normals printed "Direct cause: Not recorded" on
      every row and five more under Maintenance action. "Not recorded" is the
      word for a field that SHOULD carry something; a clean position has no
      cause because nothing caused anything.
   3  A component card was cut across the page fold. atomBands has told the
      cutter where it may not fall since v2 — and its list said `.cell`, a
      class no element on this report has ever carried. The card's class is
      `cel`. One letter, no error, nothing protected, for as long as the list
      has existed. Even with the name right, the cap on how tall an atom may
      be was a literal 520 canvas pixels — about a fifth of a page — so a card
      with a photograph in it was over it three times over.
   4  The inspector's own words never reached the office sheet at all: a
      table-bodied round has no column for the comment and had no row under
      the position either.
   5  MODEL / SMU / INSPECTED BY / EQUIPMENT, three centimetres under a
      masthead that already says the model and the SMU, and an approval table
      at the foot that already names the inspector.
   6  A five-step condition scale set in one grey line, and a column headed
      LEVEL for something ISO 14224 already names.

   Everything here is measured off the REAL engine — sections built by
   CMReport.sectionsFor and laid out at the paginator's own width and room, so
   "it does not get cut" is arithmetic on the shipped layout rather than a
   promise about a stylesheet the rasteriser ignores.

   What this fixture ISOLATES is the selector: put `.cell` back and section 6
   fails with a 631 px card sheared across the fold. The cap is a reasoned
   widening on top of it — a card is 814 canvas pixels where the limit was
   520 — and section 6 asserts the property (a card well over the old cap is
   not cut) rather than claiming to fail on that change alone. Said here so
   nobody reads a green run as proof of more than it is.

   Run: node tests/rptclean.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* One clean Filter Cut — the sheet the office sent back — and one with a real
   finding on it, because half of what is asserted here is that the quiet
   wording appears ONLY where there is nothing to say. Photographs are data
   URIs so the cards have real height and the fold has something to fall
   through; a fixture whose cards are 20 px tall proves nothing about a page.

   REAL UNITS OFF THE REGISTER, not invented ones. The masthead takes the model
   from mobile/assets.js — that is where a machine's model lives — so a made-up
   TK900 has no model, and a suite asserting "the model is still on the sheet"
   would have failed on working code for the one reason that has nothing to do
   with the change. */
const SEED = () => {
  const px = (w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#556'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#cda'; x.fillRect(4, 4, w - 8, h - 8);
    return c.toDataURL('image/jpeg', 0.6);
  };
  const ph = px(320, 240);
  const clean = {
    equip: 'TK147', date: '2026-09-13', type: 'FC', cls: 'HT', by: 'R. Ayanov',
    smu: '8047',
    items: [
      { key: 'ENG', label: 'Engine Oil Filter', grade: 1, comment: 'Clean',
        action: 'Monitor / re-inspect next PM', photos: [ph, ph] },
      { key: 'TRANS', label: 'Transmission Filter', grade: 1, comment: 'Clean',
        action: 'Monitor / re-inspect next PM', photos: [ph, ph] },
      { key: 'HYD', label: 'Hydraulic Filter', grade: 1,
        action: 'Monitor / re-inspect next PM', photos: [ph] },
    ],
  };
  const found = {
    equip: 'TK152', date: '2026-09-13', type: 'FC', cls: 'HT', by: 'R. Ayanov',
    smu: '8100',
    items: [
      { key: 'ENG', label: 'Engine Oil Filter', grade: 4, defect: 'Coarse flakes',
        cause: 'Bearing wear', comment: 'Metal throughout the pleats',
        action: 'Repair soon', resp: 'Slam', target: '2026-09-20', photos: [ph, ph] },
      { key: 'TRANS', label: 'Transmission Filter', grade: 1,
        action: 'Monitor / re-inspect next PM', photos: [ph] },
    ],
  };
  /* AND ONE CARD TALLER THAN THE OLD CAP. The selector fix alone is proved by
     the two rounds above, whose cards are about 340 px of a 1,089 px page —
     under the literal 520 the cap used to be, so they were protected the
     moment the class name was right. A card with six photographs on it is
     over 520 and was skipped for that reason as well; both had to go, and a
     suite that only exercises the first proves half the fix. */
  const tall = {
    equip: 'TK153', date: '2026-09-13', type: 'FC', cls: 'HT', by: 'R. Ayanov',
    smu: '8200',
    items: [{ key: 'ENG', label: 'Engine Oil Filter', grade: 3,
              defect: 'Fine filings across the pleats', cause: 'Bearing wear',
              comment: 'Filings on every pleat, heaviest at the inlet end.',
              action: 'Plan repair', photos: [ph, ph, ph, ph, ph, ph] }],
  };
  CMDash.importRecords([clean, found, tall]);
  const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
};

/* The paginator's own arithmetic — same width, same room, same atom bands —
   reporting where every card lands and whether any of them straddles a fold.
   This is CMR.paginate's loop with the rasterising taken out. */
const LAY = ([equip]) => {
  const secs = CMReport.sectionsFor('one', equip + '|2026-09-13|FC', { lang: 'en', photos: true });
  const st = document.createElement('style'); st.id = 'cleancss'; st.textContent = CMR.CSS;
  document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'rptRoot';
  d.style.cssText = 'position:fixed;left:-99999px;top:0;width:760px;background:#fff;';
  d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
  document.body.appendChild(d);
  const PW = 595, PH = 842, M = 38, FOOT = 22, cw = PW - 2 * M;
  const k = cw / 760, roomPx = (PH - M - FOOT - M) / k;
  /* CANVAS PIXELS, NOT CSS PIXELS — the units the cutter actually works in.
     html2canvas rasterises at CMR's default scale, so `sc` in the paginator is
     canvas width over element width, i.e. that scale; every band, every fold
     and every card edge below is in those units. Measured at 1 instead, a
     339 px card looks like 339 against a cap of 520 and is comfortably under
     it — while in production the same card is 814 and was skipped. A suite
     that gets the units wrong here proves the opposite of what it claims. */
  const SC = 2.4, roomC = roomPx * SC;
  const html = secs.map(s => s.html).join('\n');

  /* Every card, where it starts and ends inside its own section, and where
     the folds would fall — exactly as the paginator computes them. A card
     that contains a fold is a card printed in two halves. */
  const cut = [];
  [...d.children].forEach((el, i) => {
    const er = el.getBoundingClientRect();
    const cards = [...el.querySelectorAll('.cel,figure')].map(c => {
      const r = c.getBoundingClientRect();
      return { top: (r.top - er.top) * SC, bot: (r.bottom - er.top) * SC, h: r.height * SC };
    }).filter(c => c.h > 0);
    if (!cards.length) return;
    /* Where the folds land in this section, honouring the atom bands the
       shipped engine builds — asked for through the engine, never recomputed
       here, or this measures a copy of the rule and not the rule. */
    const bands = (CMR.__atomBands || (() => []))(el, SC, roomC);
    let y = 0;
    while (y + roomC < er.height * SC) {
      let f = y + roomC;
      for (let j = 0; j < bands.length; j++)
        if (f > bands[j][0] + 0.5 && f < bands[j][1] - 0.5 && bands[j][0] > y + 60 * SC) f = bands[j][0];
      cards.forEach(c => { if (f > c.top + 0.5 && f < c.bot - 0.5) cut.push(Math.round(c.h)); });
      if (f <= y) break;
      y = f;
    }
  });
  const out = {
    html, cut, cards: d.querySelectorAll('.cel,figure').length,
    roomPx: Math.round(roomC),
    tall: [...d.querySelectorAll('.cel,figure')].map(c => Math.round(c.getBoundingClientRect().height * SC)),
  };
  st.remove(); d.remove();
  return out;
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof CMDash !== 'undefined' && typeof CMReport !== 'undefined',
                          null, { timeout: 30000 });
  await p.evaluate(SEED);
  await p.waitForTimeout(400);

  const clean = await p.evaluate(LAY, ['TK147']);
  const found = await p.evaluate(LAY, ['TK152']);
  const tall  = await p.evaluate(LAY, ['TK153']);

  console.log('1. a clean round is not a form somebody failed to fill in');
  ok('no "Not recorded" against a cause on an all-Normal round',
     !/Direct cause<\/th>[\s\S]*?Not recorded/.test(clean.html)
     && /class="muted">—</.test(clean.html),
     (clean.html.match(/Not recorded/g) || []).length + ' "Not recorded" left on the sheet');
  ok('  the maintenance section says so in a sentence, not five empty fields',
     /class="mact none"/.test(clean.html) && /No action required/.test(clean.html));
  ok('  and it is still THERE — an absent heading reads as a lost section',
     /Maintenance action/.test(clean.html));

  console.log('\n2. a round with a real finding still says what is missing');
  ok('the finding\'s own cause is printed', /Bearing wear/.test(found.html));
  ok('  the maintenance strip carries the fields, not the sentence',
     !/class="mact none"/.test(found.html) && /Repair soon/.test(found.html));
  ok('  and a field that SHOULD carry something still reads "Not recorded"',
     /Not recorded/.test(found.html));

  console.log('\n3. the inspector\'s own words reach the sheet, in the grade\'s ink');
  ok('a comment on a table-bodied round is printed',
     /Metal throughout the pleats/.test(found.html) && /Clean/.test(clean.html));
  ok('  under its own position, in the note row', /class="[^"]*rnote/.test(clean.html));
  ok('  a Normal comment takes the Normal ink', /color:#0a7134">Clean/.test(clean.html));
  ok('  a Severe one does not', /color:#b03a14">Metal throughout/.test(found.html));
  ok('  and the ink is the ramp made for paper, never the chip fill',
     !/color:#fab219|color:#ec835a/.test(clean.html + found.html));

  console.log('\n4. the masthead is not repeated three centimetres below itself');
  ok('the four-cell MODEL / SMU / INSPECTED BY strip is gone',
     !/class="mstrip"/.test(clean.html));
  ok('  the model and the SMU are still on the sheet, in the masthead',
     /NHL TR60/.test(clean.html) && /8047/.test(clean.html));
  ok('  and the inspector is still on it, in the approval table',
     /R\. Ayanov/.test(clean.html) && /<table class="appr">/.test(clean.html));

  console.log('\n5. the scale is colour-coded and says what the app says');
  /* SEVERITY, and the ISO class as a chip beside the grade rather than as the
     column's name. The heading read "SEVERITY / ISO 14224" for a day and it
     overclaimed: this fleet's scale has five steps and ISO 14224 has four, so
     the grade is the site's and only the CODE is the standard's — "almost ISO
     14224", in the office's own words. */
  ok('the heading is the proper name for what the column holds',
     />SEVERITY</.test(clean.html) && !/>LEVEL</.test(clean.html)
     && !/SEVERITY \/ ISO/.test(clean.html));
  ok('  the grade carries its ISO class', /class="isoc">NOF</.test(clean.html)
     && /class="isoc">DEG</.test(found.html));
  ok('  every step of the scale wears its own colour',
     (clean.html.match(/class="rsg"/g) || []).length === 5);
  ok('  with the number inside the swatch, so it survives a mono printer',
     /class="rsh"><i style="background:#0a7134[^>]*>1<\/i>/.test(clean.html));
  /* THE KEY SAYS WHAT THE APP SAYS. Asked for in one line — "follow what we
     have" — with the phone's grade cards open beside it. The second line on
     those cards is GRADE.meaning, and it is PER ROUND: a 3 on a filter cut is
     "Noticeable particles or small flakes", not the general "Clear defect".
     Taken from grade.js so the inspector who graded it and the manager
     reading it see one sentence, never the report's own fifth restatement. */
  const meanings = await p.evaluate(() => [1, 2, 3, 4, 5].map(g => GRADE.meaning(g, 'FC', 'en')));
  ok('  every step carries the meaning THIS round type has in the app',
     meanings.every(m => m && clean.html.indexOf(m) >= 0), meanings[2]);
  ok('  and they are the round\'s own, not the general ones',
     meanings[2] !== (await p.evaluate(() => GRADE.meaning(3, 'INSP', 'en'))),
     meanings[2]);

  console.log('\n6. a component is never printed in two halves');
  ok('the fixture actually produces cards to cut', clean.cards + found.cards > 0,
     clean.cards + ' + ' + found.cards + ' card(s), tallest '
     + Math.max(0, ...clean.tall, ...found.tall) + ' of ' + clean.roomPx + ' px of page');
  ok('  no card on the clean sheet straddles a fold', clean.cut.length === 0,
     clean.cut.join(',') || 'none');
  ok('  nor on the sheet with a finding', found.cut.length === 0,
     found.cut.join(',') || 'none');
  /* The cap: a card of six photographs is taller than the 520 canvas pixels
     the limit used to be, so it was skipped even once the class name was
     right. What decides now is the paper — anything that fits on a page is
     moved whole, anything taller must still be allowed to break. */
  ok('  a card taller than the old 520 px cap is protected too',
     Math.max(0, ...tall.tall) > 520 && tall.cut.length === 0,
     'tallest ' + Math.max(0, ...tall.tall) + ' px, ' + (tall.cut.join(',') || 'none cut'));

  console.log('\n7. the rule that does the protecting is reachable, and names a real class');
  const rule = await p.evaluate(() => ({
    fn: typeof CMR.__atomBands === 'function',
    /* The selector must match something on a real sheet. `.cell` matched
       nothing for months and nobody could tell. */
    hits: (() => {
      const d = document.createElement('div');
      d.innerHTML = '<div class="cel"><figure></figure></div><table><tr><td>x</td></tr></table>';
      document.body.appendChild(d);
      const n = d.querySelectorAll('tr,.lgrow,.pkey > *,.ckey > *,.mapkey > *,figure,.cel').length;
      d.remove(); return n;
    })(),
  }));
  ok('atomBands is asked of the engine, not copied into this suite', rule.fn === true);
  ok('  and its selector matches the card, the figure and the row', rule.hits === 3,
     rule.hits + ' of 3');

  ok('no page errors throughout', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
