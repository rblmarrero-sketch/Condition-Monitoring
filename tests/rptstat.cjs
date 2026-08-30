/* A REPORT HAS TO SAY WHETHER IT IS THE RECORD OF RECORD.

   Every report carried a title and a timestamp and nothing about its own
   completeness. So a copy printed while photographs were still climbing out of
   the pit looked exactly like one printed a week later with everything in —
   same heading, same date line, same four sections. Somebody signs the first
   one and files it, and the fact that three pictures were still on a phone in
   a haul truck is nowhere on the paper.

   The status is decided by FACTS ABOUT THE ROUNDS, never by which surface
   printed it. "Preliminary because a phone made it" would be wrong twice: a
   phone holds every photograph it took, so until the upload finishes its
   evidence is MORE complete than the office's — and a dashboard report can be
   missing twenty photographs and would still be calling itself final.

   Two conditions, each verifiable by the surface that answers it:

     delivered   the office has the round at all. True by construction on the
                 dashboard, because the record came out of the folder. On the
                 phone it is rec.up — every destination accepted every file —
                 and NOT "send was pressed".
     gap         the round's photographs are all accounted for.

   Anything unproven counts as outstanding: a phone that has never reached the
   server does not get to call its printout final for want of evidence to the
   contrary.

   Run: node tests/rptstat.cjs      (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const B = 'http://127.0.0.1:' + PORT;
const fails = [];
const ok = (c, n, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };

(async () => {
  await fetch(B + '/__seed').catch(() => {});
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true,
                                   hasTouch: true, timezoneId: 'Asia/Anadyr' });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(u => localStorage.setItem('up_dests', JSON.stringify(
    [{ id: 'gas', on: true, url: u, sec: 'letmein', folder: '' }])), B + '/exec');
  await p.goto(B + '/mobile/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1600);

  console.log('\n1. THE RULE IS ABOUT THE ROUNDS, NOT ABOUT THE SURFACE');
  /* Asked of the engine directly. Both surfaces call the same function with
     the same fields, so this is the one place the answer is decided. */
  /* Asked for by name, and its absence reported rather than thrown. A suite
     that dies on a build without the feature says nothing about that build;
     the runner shows a crash where it should show which property is missing. */
  const has = await p.evaluate(() => typeof (window.CMR || {}).__status === 'function');
  ok(has, 'the engine exposes the rule that decides what a document calls itself',
     has ? 'CMR.__status' : '(missing — no status rule in this build)');
  const r = has ? await p.evaluate(() => {
    const S = window.CMR.__status;         // exposed for exactly this
    const mk = (del, miss) => ({ delivered: del, gap: { expected: 6, received: 6 - miss, missing: miss } });
    return {
      allIn:      S([mk(true, 0), mk(true, 0)]),
      oneShort:   S([mk(true, 0), mk(true, 3)]),
      oneHeld:    S([mk(true, 0), mk(false, 0)]),
      both:       S([mk(false, 2), mk(true, 1)]),
      nothing:    S([]),
      unstated:   S([{}]),                 // a record that answers neither
    };
  }) : { allIn:{}, oneShort:{}, oneHeld:{}, both:{}, nothing:{}, unstated:{} };
  ok(r.allIn.final === true, 'delivered with every photograph is FINAL');
  ok(r.oneShort.final === false, '  a missing photograph is not final',
     JSON.stringify(r.oneShort));
  ok(r.oneShort.gapPhotos === 3 && r.oneShort.gapRounds === 1,
     '  and it says how many, on how many rounds',
     r.oneShort.gapPhotos + ' on ' + r.oneShort.gapRounds);
  ok(r.oneHeld.final === false, '  a round the office has not got is not final either');
  ok(r.oneHeld.undelivered === 1, '  and it says how many are still held',
     r.oneHeld.undelivered + '');
  ok(r.both.final === false && r.both.undelivered === 1 && r.both.gapPhotos === 3,
     '  both reasons are counted, not the first one found', JSON.stringify(r.both));
  ok(r.nothing.final === true, 'an empty report has nothing outstanding');
  ok(r.unstated.final === false,
     'a record that answers neither question is treated as outstanding, not as fine',
     JSON.stringify(r.unstated));

  /* The context the phone itself passes, not a minimal stand-in — the engine
     takes callbacks for the severity words and the wear forecast, and a report
     built without them is not the report the field gets. */
  await p.evaluate(() => {
    window.rptCtx = (lang, mode, records) => ({
      lang: lang, mode: mode, title: 'T', titleAlt: 'T', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s,
      forecast: (ref, series) => (window.WEAR ? WEAR.forecast(ref, series) : null),
      records: records });
  });

  console.log('\n2. THE PHONE ANSWERS FOR ITSELF HONESTLY');
  const phone = await p.evaluate(async () => {
    const shot = async n => await intake(new Blob([new Uint8Array(Array(64).fill(n))], { type: 'image/jpeg' }));
    const base = async (id, up) => ({ id: id, type: 'MP', equip: 'TK94' + id.slice(-1),
      date: '2026-07-28', cls: 'HT', by: 'R. Marrero', smu: 6400,
      created: new Date().toISOString(), up: up, upTo: up ? { gas: 1 } : {}, rev: 1,
      positions: { '4C': { grade: 'C', photos: [await shot(1), await shot(2)] } } });
    for (const r2 of [await base('id__a__1', 0), await base('id__b__2', 1)]) {
      await attSync(r2); await dbPut(r2);
    }
    const recs = await rptRecords();
    const mine = recs.filter(x => /^TK94/.test(x.equip));
    return mine.map(x => ({ eq: x.equip, del: x.delivered, miss: x.gap.missing, exp: x.gap.expected }));
  });
  console.log('   ' + JSON.stringify(phone));
  ok(phone.length === 2, 'both rounds reach the report', phone.length + '');
  ok(phone.every(x => x.miss === 0 && x.exp === 2),
     '  the phone holds its own photographs, so nothing is missing from its copy',
     JSON.stringify(phone.map(x => x.miss)));
  ok(phone.filter(x => x.del).length === 1,
     '  and only the round the server accepted counts as delivered',
     JSON.stringify(phone.map(x => x.del)));

  const banner = await p.evaluate(async () => {
    const recs = (await rptRecords()).filter(x => /^TK94/.test(x.equip));
    const secs = CMR.sections(rptCtx('en', 'fleet', recs));
    const html = secs.map(s => s.html).join('');
    const d = document.createElement('div'); d.innerHTML = html;
    const el = d.querySelector('.docst');
    return el ? { cls: el.className, text: el.textContent.replace(/\s+/g, ' ').trim() } : null;
  });
  ok(!!banner, 'the report prints a status at all', banner ? 'present' : '(no .docst)');
  ok(!!banner && /PRELIMINARY/.test(banner.text),
     '  and one round still on the phone makes it preliminary',
     banner && banner.text.slice(0, 90));
  ok(!!banner && /1 round/.test(banner.text),
     '  naming what is outstanding rather than only that something is',
     banner && banner.text.slice(0, 130));
  ok(!!banner && /still stand|stand as printed/.test(banner.text),
     '  while saying the findings themselves are not in doubt',
     banner && banner.text.slice(-90));

  console.log('\n3. A SINGLE-MACHINE REPORT DECLARES ITSELF TOO');
  /* The copy most likely to be printed at the machine and signed — and the one
     with nowhere to put a declaration. That sheet is already a full A4 page:
     a block, a field, and a few words on the type line were each tried and
     each pushed the track drawing over the fold (1191, 1098, 1127 px against a
     1089 budget), which pagecut.cjs and tray.cjs caught. So it rides in the
     page footer, drawn as text after layout — no height, and on every page. */
  const unit = await p.evaluate(async () => {
    const recs = (await rptRecords()).filter(x => x.equip === 'TK941');
    const secs = CMR.sections(rptCtx('en', 'unit', recs));
    const d = document.createElement('div'); d.innerHTML = secs.map(s => s.html).join('');
    return { n: recs.length, st: secs.status || null,
             inFlow: !!d.querySelector('.docst') };
  });
  ok(unit.n === 1, 'one machine, one round', unit.n + '');
  ok(!!unit.st, '  the section list carries the document status',
     unit.st ? JSON.stringify(unit.st) : '(none)');
  ok(!!unit.st && unit.st.final === false,
     '  and knows this one is not the record of record');
  /* PLAIN TEXT, not the bilingual markup. The footer is drawn with doc.text(),
     so a <span> carrying the other language would print as angle brackets
     across the bottom of every page — which is what the first cut of this did,
     and what asserting merely "there is a word" let through. */
  ok(!!unit.st && !!unit.st.word, '  carrying the word to print', unit.st && unit.st.word);
  ok(!!unit.st && !/[<>]/.test(unit.st.word || ''),
     '  as text a PDF can draw, not as markup', unit.st && unit.st.word);
  ok(!!unit.st && unit.st.word === 'PRELIMINARY',
     '  in the language the document is in', unit.st && unit.st.word);

  /* AND IT HAS TO SURVIVE INTO THE PDF, IN BOTH LANGUAGES.

     The footer is real PDF text, not raster, and jsPDF's built-in fonts carry
     no Cyrillic. A translated marker is therefore not merely wrong on a
     Russian report — it is absent: rendering one and reading the drawn text
     back out of its own content streams showed the word missing and no
     Cyrillic anywhere in the file. The stamp gone from exactly the copy that
     needs it, silently. Checked against what a printer would put on the page,
     not against what the code meant to say. */
  const drawn = await p.evaluate(async () => {
    const recs = (await rptRecords()).filter(x => x.equip === 'TK941');
    const out = {};
    for (const lg of ['en', 'ru']) {
      const secs = CMR.sections(rptCtx(lg, 'unit', recs));
      const doc = await CMR.paginate({ sections: secs, jsPDF: window.jspdf.jsPDF,
        html2canvas: window.html2canvas, docId: 'CM' });
      const raw = atob(doc.output('datauristring').split(',')[1]);
      out[lg] = { word: secs.status.word, inPdf: raw.indexOf(secs.status.word) >= 0 };
    }
    return out;
  });
  ok(drawn.en.inPdf, '  and the word is really drawn into the English PDF', drawn.en.word);
  ok(drawn.ru.inPdf, '  and into the Russian one, which needs it to be ASCII',
     drawn.ru.word + (drawn.ru.inPdf ? '' : ' — NOT IN THE FILE'));
  ok(!unit.inFlow,
     '  without spending any of the sheet, which has none to spare');

  console.log('\n4. BOTH LANGUAGES, AND NO KEY LEAKS ONTO THE PAPER');
  const ru = await p.evaluate(async () => {
    const recs = (await rptRecords()).filter(x => /^TK94/.test(x.equip));
    const secs = CMR.sections(rptCtx('ru', 'fleet', recs));
    const d = document.createElement('div'); d.innerHTML = secs.map(s => s.html).join('');
    const el = d.querySelector('.docst');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  ok(/ПРЕДВАРИТЕЛЬНЫЙ/.test(ru), 'the Russian copy says preliminary in Russian', ru.slice(0, 70));
  ok(!/st_prelim|st_undel|st_gap|st_final/.test(ru),
     '  with no untranslated key printed on it', ru.slice(0, 70));

  ok(fails.filter(f => /PAGEERROR/.test(f)).length === 0, 'no page errors',
     fails.filter(f => /PAGEERROR/.test(f)).join(' | ') || 'none');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
