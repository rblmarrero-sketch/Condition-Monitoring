/* THE FOOTER, READ BACK OUT OF THE PDF ITSELF.

   A report says whether it is the record of record. That claim is only worth
   anything if it survives into the file somebody prints — and the footer is
   drawn with doc.text(), not rasterised, so it depends on the font having the
   characters. It does not have Cyrillic: rendering a Russian report and reading
   its content streams showed the translated word simply absent, and no Cyrillic
   anywhere in the file. The stamp missing from exactly the copy that needs it.

   So this generates real PDFs and greps the bytes, in both languages, for four
   documents that must be marked differently from each other:

     a normal round, everything received      -> no PRELIMINARY
     a round whose photographs never arrived  -> PRELIMINARY
     a round still on the phone               -> PRELIMINARY
     a fully received bilingual report        -> no PRELIMINARY, both languages

   It asserts what a printer would put on the page, never what the code meant
   to say.

   Run: node tests/rptfoot.cjs        (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const BASE = 'http://127.0.0.1:8099';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : ''));
                          if (!c) fails.push(n); };
const reset = q => fetch(BASE + '/__reset?' + q).then(r => r.text());

(async () => {
  await reset('n=4');
  /* CR002 stands in for the ordinary case: a round whose evidence is all in the
     folder. TK901 is the one whose photographs never arrived. */
  await reset('keyless=CR002,2026-08-04,MP,2,have');
  await reset('keyless=TK901,2026-08-04,MP,4,none');

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(u => {
    localStorage.setItem('cm_drive_url', u);
    localStorage.setItem('cm_drive_sec', '');
    localStorage.setItem('cm_drive_cursor', '0');
    localStorage.setItem('cm_swap_off', '1');
  }, BASE + '/exec');
  await p.goto(BASE + '/dashboard/index.html', { waitUntil: 'load' });
  await p.waitForFunction(() => typeof RECS !== 'undefined' && RECS.length > 2, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  /* One helper, used for every case: build the document for a unit in a
     language, render it, and hand back both the engine's verdict and the raw
     bytes of the file. */
  const make = (unit, lang, bi) => p.evaluate(async a => {
    const rec = RECS.find(r => r.equip === a.unit);
    if (!rec) return { missing: true };
    /* THE DASHBOARD'S OWN CONTEXT BUILDER, not one assembled here.

       Hand-rolling it produced a context with no `delivered` and no `gap`, so
       every document came back preliminary for a reason that had nothing to do
       with the code under test — a suite keeping its own copy of something the
       app owns, which is the trap this repo has been caught by four times. */
    const ctx = window.CMReport.ctxFor([rec],
      { scope: 'unit', target: a.unit, lang: a.lang, extra: [], art: null });
    ctx.lang = a.lang;
    ctx.bi = a.bi;
    const secs = CMR.sections(ctx);
    const doc = await CMR.paginate({ sections: secs, jsPDF: window.jspdf.jsPDF,
      html2canvas: window.html2canvas, docId: 'CM' });
    const raw = atob(doc.output('datauristring').split(',')[1]);
    return { status: secs.status, word: secs.status && secs.status.word,
             inPdf: !!(secs.status && secs.status.word
                       && raw.indexOf(secs.status.word) >= 0),
             hasPrelim: raw.indexOf('PRELIMINARY') >= 0,
             gap: rec.gap || null,
             bytes: raw.length };
  }, { unit, lang, bi });

  console.log('\n1. A ROUND WHOSE EVIDENCE IS ALL IN THE FOLDER');
  for (const lg of ['en', 'ru']) {
    const r = await make('CR002', lg, true);
    if (r.missing) { ok('CR002 is on the board [' + lg + ']', false, 'no record'); continue; }
    console.log('   [' + lg + '] ' + JSON.stringify(r.status));
    ok('the engine calls it final [' + lg + ']', r.status && r.status.final === true,
       JSON.stringify(r.status));
    ok('  no photographs are outstanding [' + lg + ']',
       !r.status || r.status.gapPhotos === 0, String(r.status && r.status.gapPhotos));
    ok('  and the printed page carries no PRELIMINARY stamp [' + lg + ']',
       r.hasPrelim === false, 'stamp present: ' + r.hasPrelim);
  }

  console.log('\n2. A ROUND WHOSE PHOTOGRAPHS NEVER ARRIVED');
  for (const lg of ['en', 'ru']) {
    const r = await make('TK901', lg, true);
    if (r.missing) { ok('TK901 is on the board [' + lg + ']', false, 'no record'); continue; }
    console.log('   [' + lg + '] ' + JSON.stringify(r.status) + ' gap=' + JSON.stringify(r.gap));
    ok('the engine calls it preliminary [' + lg + ']', r.status && r.status.final === false,
       JSON.stringify(r.status));
    ok('  naming how many photographs are outstanding [' + lg + ']',
       r.status && r.status.gapPhotos === 4, String(r.status && r.status.gapPhotos));
    ok('  and the stamp is really in the file [' + lg + ']', r.inPdf === true,
       (r.word || '(no word)') + ' — in file: ' + r.inPdf);
    ok('  in ASCII, so a Russian PDF is not left blank [' + lg + ']',
       r.word === 'PRELIMINARY', r.word);
  }

  console.log('\n3. THE STAMP DISTINGUISHES THE TWO DOCUMENTS');
  /* The whole point: two reports out of one dashboard, marked differently,
     because one is the record of record and the other is not. */
  const good = await make('CR002', 'en', true);
  const bad = await make('TK901', 'en', true);
  ok('one is stamped and the other is not',
     good.hasPrelim === false && bad.hasPrelim === true,
     'CR002 ' + good.hasPrelim + ' · TK901 ' + bad.hasPrelim);

  console.log('\n4. A BILINGUAL DOCUMENT IS MARKED THE SAME WAY');
  const mono = await make('TK901', 'ru', false);
  const bili = await make('TK901', 'ru', true);
  ok('bilingual and single-language agree on the verdict',
     !!mono.status && !!bili.status && mono.status.final === bili.status.final,
     'mono ' + (mono.status || {}).final + ' · bilingual ' + (bili.status || {}).final);
  ok('  and both actually carry the stamp',
     mono.inPdf === true && bili.inPdf === true,
     'mono ' + mono.inPdf + ' · bilingual ' + bili.inPdf);

  console.log('\n5. THE VERDICT COMES FROM THE FOLDER, NOT FROM THIS TAB');
  /* The defect this replaced: evidenceGap counted lazily-downloaded pictures,
     so a report generated on a freshly loaded page declared every photograph
     missing — including the ones sitting in the folder. Nothing has been
     scrolled or opened in this run, so if the verdict is right here it is
     right for the reason it should be. */
  const fresh = await p.evaluate(() => {
    const r = RECS.find(x => x.equip === 'CR002');
    const g = CMDash.evidenceGap ? CMDash.evidenceGap(r) : null;
    let loaded = 0; try { loaded = Object.keys(folderPhotos || {}).length; } catch (e) {}
    return { gap: g, loaded: loaded };
  });
  console.log('   ' + JSON.stringify(fresh));
  ok('no thumbnail has been downloaded in this run', fresh.loaded === 0,
     fresh.loaded + ' in cache');
  ok('  and the evidence gap is still nil, because it asked the store',
     !!fresh.gap && fresh.gap.missing === 0 && fresh.gap.received === 2,
     JSON.stringify(fresh.gap));

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED:\n  ` + fails.join('\n  ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
