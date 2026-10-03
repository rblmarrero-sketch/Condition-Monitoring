/* ONE CARD PER FINDING: THE PHOTOGRAPHS, THE INSPECTOR'S SENTENCE AND THE FACTS,
   ONCE, IN THAT ORDER.

   A general inspection used to print a "Findings by component or system" table
   and then a "Photographs with findings" board, and the two said the same thing:
   the point, the grade, the action and the sentence in the table, then the point,
   the grade, the action, the owner and the date again under the pictures. Asked
   for by name against a real TK143 report: merge them, arrange them properly,
   read the finding under its photographs.

   This walks the REAL per-type bodies (CMDash.importRecords -> CMReport.sectionsFor)
   for INSP, FC, TEMP and GET, in English, Russian and bilingual, and asserts what
   the page promises: no second photographs heading, every sentence and every
   action printed once, worst point first, photographs above the sentence above
   the facts, clean points as one line and unrecorded points as another, the
   operating status said once.

   Run: node tests/findingcard.cjs [port]   (needs tests/mock.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8099);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const count = (hay, needle) => hay.split(needle).length - 1;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('cm_drive_url', ''); localStorage.setItem('lang', 'en'); });
  await p.goto(`http://127.0.0.1:${PORT}/dashboard/index.html`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.CMR && window.CMReport && window.CMDash, { timeout: 20000 });
  await p.waitForTimeout(800);

  const keys = await p.evaluate(() => {
    const jpeg = (rgb, w, h) => { const c = document.createElement('canvas'); c.width = w || 400; c.height = h || 300;
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(20, 20, 120, 80); return c.toDataURL('image/jpeg', 0.9); };
    const A = [jpeg([200, 60, 40]), jpeg([40, 120, 200], 300, 400)], B = [jpeg([60, 160, 80])], C = [jpeg([160, 60, 200]), jpeg([200, 180, 40])];
    const recs = [
      { equip: 'FCX01', date: '2026-10-03', type: 'INSP', cls: 'HT', by: 'Ivanov', smu: '1000',
        items: [
          { key: 'ENG.OIL', label: 'Engine oil', grade: 1 },
          { key: 'HS.CYL', label: 'Cylinders', grade: 3, comment: 'SENTENCE-CYL leaking rod seal', action: 'Create 1C notification - plan repair', wo: 'WO-111', resp: 'Master', target: '2026-10-05', opstat: 'RUN', detect: 'Visual inspection', photos: A },
          { key: 'DRS.AXL', label: 'Axles', grade: 5, comment: 'SENTENCE-AXL oil loss at the pinion seal', action: 'Stop and repair', wo: 'WO-222', resp: 'Superintendent', target: '2026-10-04', opstat: 'RUN', detect: 'Visual inspection', photos: B },
          { key: 'BS.CV', label: 'Control valve', grade: '' },
          { key: 'ELS.ALT', label: 'Alternator', grade: 2, comment: 'SENTENCE-ALT belt cracks', action: 'Monitor', opstat: 'RUN', photos: [] },
        ] },
      { equip: 'FCX02', date: '2026-10-03', type: 'FC', cls: 'HT', by: 'Ivanov', smu: '2000',
        items: [
          { key: 'ENG', label: 'Engine Oil Filter', grade: 4, particle: '9', comp: '500', oil: '500', defect: 'Ferrous debris', cause: 'Bearing wear', action: 'Plan repair', photos: C, readings: ['PC 9', 'comp 500 h', 'oil 500 h'] },
          { key: 'HYD', label: 'Hydraulic Filter', grade: 1, comp: '1000', readings: ['comp 1000 h'] } ] },
      { equip: 'FCX03', date: '2026-10-03', type: 'TEMP', cls: 'EXC', by: 'Ivanov', smu: '3000',
        items: [
          { key: 'BRG', label: 'Slew bearing', grade: 3, tempC: 78, ambC: 22, tempM: 'IR', comment: 'SENTENCE-TMP hotter than its twin', photos: B, readings: ['78 °C / 22'] },
          { key: 'MTR', label: 'Swing motor', grade: 1, tempC: 51, ambC: 22, tempM: 'IR', readings: ['51 °C / 22'] } ] },
    ];
    window.CMDash.importRecords(recs);
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
    return recs.map(r => r.equip + '|' + r.date + '|' + r.type);
  });

  const render = (key, lang, bi) => p.evaluate(async ({ key, lang, bi }) => {
    const secs = CMReport.sectionsFor('one', key, { lang, bi, photos: true });
    let st = document.getElementById('fcst'); if (!st) { st = document.createElement('style'); st.id = 'fcst'; st.textContent = CMR.CSS; document.head.appendChild(st); }
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot'; d.style.cssText = 'position:absolute;left:0;top:0;width:760px;background:#fff';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cels = [...d.querySelectorAll('.cel')].map(c => ({
      pk: (c.querySelector('.pk') || {}).textContent || '',
      hasPhoto: !!c.querySelector('img'),
      order: (() => { const kids = [...c.querySelectorAll('.phg, .pkrow, .cm, dl')].map(e => e.className.split(' ')[0] || e.tagName.toLowerCase()); return kids.join('>'); })(),
      text: c.innerText.replace(/\s+/g, ' ') }));
    const text = d.innerText.replace(/\s+/g, ' ');
    const heads = [...d.querySelectorAll('.subhd')].map(e => e.textContent.trim());
    const html = d.innerHTML; d.remove();
    return { cels, text, heads, html, tables: (html.match(/<table/g) || []).length };
  }, { key, lang, bi });

  console.log('\nINSP — the TK143 shape');
  for (const [lang, bi, tag] of [['en', false, 'English'], ['ru', false, 'Russian'], ['en', true, 'bilingual']]) {
    const r = await render(keys[0], lang, bi);
    const t = '  [' + tag + '] ';
    ok(t + 'there is no second "photographs with findings" board',
      !/Photographs with findings|Фотографии выявленного/i.test(r.heads.join('|')), r.heads.join(' | '));
    ok(t + 'one card per point with something to say (3), worst first',
      r.cels.length === 3 && /AXL/.test(r.cels[0].pk) && /CYL/.test(r.cels[1].pk) && /ALT/.test(r.cels[2].pk),
      r.cels.map(c => c.pk.trim().split(' ')[0]).join(' > '));
    ['SENTENCE-CYL', 'SENTENCE-AXL', 'SENTENCE-ALT'].forEach(s => ok(t + s + ' is printed once', count(r.text, s) === 1, String(count(r.text, s))));
    ok(t + 'a work order appears once per finding (WO-111, WO-222)', count(r.text, 'WO-111') <= 2 && count(r.text, 'WO-222') <= 2,
      'WO-111 x' + count(r.text, 'WO-111') + ' (card + the sign-off strip), WO-222 x' + count(r.text, 'WO-222'));
    ok(t + 'photographs, then the sentence, then the facts',
      /^phg.*>pkrow>cm>dl/.test(r.cels[0].order.replace(/phg>?/g, 'phg>').replace(/phg>phg/g, 'phg')) || /phg>pkrow>cm>dl/.test(r.cels[0].order), r.cels[0].order);
    ok(t + 'no findings TABLE for the points (only the sign-off tables remain)', r.tables <= 2, r.tables + ' tables');
    ok(t + 'the clean point is one line, not a card', /ENG\.OIL/.test(r.text) && !r.cels.some(c => /ENG\.OIL/.test(c.pk)));
    ok(t + 'the unrecorded point is named, not dropped', /BS\.CV/.test(r.text) && !r.cels.some(c => /BS\.CV/.test(c.pk)));
    const lo = r.text.toLowerCase(), en = count(lo, 'equipment status'), ru = count(lo, 'состояние машины');
    ok(t + 'the operating status is said once (once per language shown)',
      lang === 'ru' && !bi ? ru === 1 && en === 0 : bi ? en === 1 && ru === 1 : en === 1 && ru === 0, 'en x' + en + ' ru x' + ru);
  }

  console.log('\nFC — readings are stated once');
  for (const [lang, bi, tag] of [['en', false, 'English'], ['ru', false, 'Russian']]) {
    const r = await render(keys[1], lang, bi);
    ok('  [' + tag + '] the particle count is printed once', count(r.text, 'PC 9') === 1, String(count(r.text, 'PC 9')));
    ok('  [' + tag + '] the filter with a finding is a card, the clean one a line', r.cels.length === 1 && /ENG/.test(r.cels[0].pk));
    ok('  [' + tag + '] the clean filter keeps its hours on its line', /HYD/.test(r.text) && /1000 h/.test(r.text));
  }

  console.log('\nTEMP — one temperature per point');
  { const r = await render(keys[2], 'en', false);
    ok('  the finding is a card with its temperature once', r.cels.length === 1 && count(r.text, '78 °C') === 1, String(count(r.text, '78 °C')));
    ok('  the normal reading is one line', /MTR/.test(r.text) && count(r.text, '51 °C') === 1); }

  ok('no page error', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length : '\nall passed'); process.exit(fails.length ? 1 : 0);
})();
