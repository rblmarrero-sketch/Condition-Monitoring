/* THE MACHINE'S OWN PHOTOGRAPH IS NOT A FINDING, AND "NOT A FINDING" WAS
   NEVER A REASON TO LEAVE IT OFF THE MACHINE'S OWN REPORT.

   sane() (report-core.js, run once at the top of CMR.sections) moves every
   general-photograph item out of rec.items and into rec.general before ANY
   round-body function's own code runs. unitSheets() — the DEFAULT compact
   document, the one an "Equipment Trend Report" actually is — built its
   own "Photographs" board from `pairs`, which explicitly skips `it.general`
   and falls back to including general photographs only when there is NO
   significant finding at all. Both of those checks were already dead by
   the time sane() shipped: an item with `.general` set never survives into
   `rec.items` for either of them to see, so the machine's own
   overview/left/right/tray photographs had NO path into this document,
   compact or not, whether or not the machine also had findings.

   Read off TK109's own report, 2026-09-20: three findings, three
   positions' worth of photographs printed under PHOTOGRAPHS, and the
   machine's own overview shot — taken the same visit — nowhere in the
   three-page document. fullUnitSheets (the opt-in appendix) reads
   rec.general correctly via evidenceSections; this fixes the DEFAULT
   document to do the same, unconditionally, not only when photoPairs would
   otherwise be empty.

   Run: node tests/unitgenphoto.cjs   (needs tests/ed-srv.cjs on 8093) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8093);
const URL = `http://127.0.0.1:${PORT}/dashboard/index.html`;
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('lang', 'en'); });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR, { timeout: 20000 });

  const r = await p.evaluate(async () => {
    const solid = (w, h, rgb) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, w, h); return c.toDataURL('image/png'); };
    const overviewPhoto = solid(1200, 800, [80, 120, 200]);
    // TK109-shaped: an MP round with a graded finding AND a machine general
    // photo item, plus a second round (so recs.length > 1, reaching
    // unitSheets' own compact path rather than the single-round detail one).
    const recs = [
      { equip: 'TK109', clsLabel: 'HT', model: 'X', type: 'MP', typeLabel: 'MP', date: '2026-09-20', by: 'R', smu: '33513',
        items: [
          { key: 'RRD', name: 'Rear Differential', grade: 2, defect: 'Ferrous debris', action: 'Monitor', photos: [solid(600, 400, [210, 40, 40])] },
          { key: '__general', name: 'Machine', general: true, cats: ['OVERVIEW'], photos: [overviewPhoto] },
        ] },
      { equip: 'TK109', clsLabel: 'HT', model: 'X', type: 'INSP', typeLabel: 'INSP', date: '2026-09-20', by: 'R', smu: '33513',
        items: [{ key: 'GEN', name: 'General Inspection', grade: 2, defect: 'oil level', action: 'Monitor', photos: [solid(600, 400, [30, 180, 60])] }] },
    ];
    const secs = window.CMR.sections({ lang: 'en', bi: false, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(),
      sevLabel: s => s, sevLabelAlt: s => s, records: recs });
    const html = secs.map(s => s.html).join('\n');
    return {
      sectionsCount: secs.length,
      hasOverviewImgTag: html.includes(overviewPhoto.slice(0, 60)),
      hasGenRowClass: /genrow/.test(html),
      hasGenHeading: /General evidence|Общий фотоматериал/.test(html),
      hasFindingPhotos: /Rear Differential|Задний дифференциал/.test(html),
    };
  });

  ok('the compact document still carries the finding\'s own photographs', r.hasFindingPhotos, JSON.stringify(r));
  ok('THE FIX: the machine\'s own overview photograph is ALSO in the document, even though a significant finding exists',
     r.hasOverviewImgTag, JSON.stringify(r));
  ok('  under its own "General evidence" heading, in its own genrow board', r.hasGenRowClass && r.hasGenHeading, JSON.stringify(r));

  ok(fails.filter(f => f.startsWith('PAGEERROR')).length === 0, 'no page errors throughout');
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
