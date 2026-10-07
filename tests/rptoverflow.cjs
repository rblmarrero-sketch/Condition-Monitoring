/* NOTHING IN A REPORT RUNS OUT OF ITS BOX, ON ANY ROUND TYPE, IN ANY LANGUAGE.

   Read off a real TK105 Magnetic Plug report (2026-10-07): on a board of four
   plug cards, 4CR's action, work order, owner, target date and status ran down
   two and a half pages ONE LETTER TO A LINE, and under the board the line
   naming the plug nobody walked printed its own HTML: `<span class="alti">/
   Также …</span>`. Two defects, both in the shared engine:

     - a card's facts were a two-column grid, `auto 1fr`, and a value may break
       anywhere — so a value's narrowest is one character, and in a quarter-
       width card the label column grew to its longest label's one-line width
       and left the value one letter wide;
     - T.I() already returns escaped, marked-up HTML, and that line escaped it
       again.

   This builds every round type the engine prints, with long sentences, long
   actions, owners and dates on every point, renders the real sections
   (CMDash.importRecords -> CMReport.sectionsFor) at the report's own width in
   English, Russian and bilingual, and asks the LAID-OUT page:

     (every round type on its own sheet, and the unit history, the condition
     summary, a day's round and a month's report built from them)

     1. no markup printed as text
     2. no fact squeezed: every value at least 48px wide
     3. nothing printed vertically: no text box many times taller than it is wide
     4. nothing visibly past its card, its table cell, or the page
     5. no card says a field's label again inside its own value - the
        "RESPONSIBLE / Responsible: ..." of the same sheet (build 536)

   Run: node tests/rptoverflow.cjs [port]   (needs tests/mock.cjs on the port) */
const { chromium } = require(require('./pw.cjs'));
const PORT = Number(process.argv[2] || 8099);
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

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
      const x = c.getContext('2d'); x.fillStyle = 'rgb(' + rgb.join(',') + ')'; x.fillRect(0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.9); };
    const P2 = [jpeg([200, 60, 40]), jpeg([40, 120, 200], 300, 400)];
    const LONG = 'Ferrous flakes and fine metal paste on the plug; washed and refitted, oil sample taken. Металлическая стружка на пробке, промыто, отобрана проба масла.';
    const ACT = 'Monitor / re-inspect next PM / Наблюдать / проверить на следующем ТО';
    const RESP = 'Начальник по обслуживанию и ремонту горного оборудования';
    const full = (key, label, grade, extra) => Object.assign({ key, label, grade, comment: LONG, action: ACT, wo: 'WO-017887',
      resp: RESP, target: '2026-10-14', opstat: 'RUN', defect: 'Metal particles — heavy / Металлические частицы — обильно',
      cause: 'Bearing wear / Износ подшипника', photos: P2 }, extra || {});
    const recs = [
      /* the reported shape: four plug cards across, one heavily graded, one not walked */
      { equip: 'TK105', date: '2026-10-07', type: 'MP', cls: 'HT', by: 'Irek Rayanov', smu: '34769',
        items: [ full('4AL', 'Front-Left Final Drive', 1), full('4BL', 'Rear-Left Final Drive', 1),
                 full('4CR', 'Centre Differential Right', 4), full('4AR', 'Front-Right Final Drive', 1),
                 { key: '4BR', label: 'Rear-Right Final Drive', grade: '' } ] },
      /* an earlier visit, so the unit report prints the older-round cards too */
      { equip: 'TK105', date: '2026-09-20', type: 'MP', cls: 'HT', by: 'Irek Rayanov', smu: '34500',
        items: [ full('4AL', 'Front-Left Final Drive', 2), full('4BL', 'Rear-Left Final Drive', 3),
                 full('4CR', 'Centre Differential Right', 4), full('4AR', 'Front-Right Final Drive', 2) ] },
      { equip: 'TK108', date: '2026-10-07', type: 'RTW', cls: 'AT', by: 'Senior Mechanic', smu: '1000',
        rtwWo: 'WO-016593', rtwWoType: '250 Hours service Planned', rtwSchedHours: 250, rtwSchedDate: '2026-10-05', rtwWoPriority: 'P3 Planned (PM)',
        items: [ { key: '1.1', label: 'Engine oil level', mark: 'pass', comment: LONG },
                 { key: '1.2', label: 'Hydraulic hoses and fittings', mark: 'attn', comment: LONG + ' ' + LONG, photos: P2 },
                 { key: '2.1', label: 'Service sheet signed', mark: 'na', comment: '' } ] },
      { equip: 'TK106', date: '2026-10-07', type: 'MP', cls: 'HT', by: 'Irek Rayanov', smu: '1000',
        items: [ full('4AL', 'Front-Left Final Drive', 3), full('4CR', 'Centre Differential Right', 4), full('4AR', 'Front-Right Final Drive', 2) ] },
      { equip: 'TK107', date: '2026-10-07', type: 'MP', cls: 'HT', by: 'Irek Rayanov', smu: '1000',
        items: [ full('4AL', 'Front-Left Final Drive', 3, { photos: [P2[0]] }), full('4CR', 'Centre Differential Right', 4, { photos: [P2[1]] }) ] },
      { equip: 'FCX01', date: '2026-10-07', type: 'INSP', cls: 'HT', by: 'Ivanov', smu: '1000',
        items: [ full('HS.CYL', 'Cylinders', 3), full('DRS.AXL', 'Axles', 5), full('ELS.ALT', 'Alternator', 2, { photos: [] }),
                 { key: 'ENG.OIL', label: 'Engine oil', grade: 1 } ] },
      { equip: 'FCX02', date: '2026-10-07', type: 'FC', cls: 'HT', by: 'Ivanov', smu: '2000',
        items: [ full('ENG', 'Engine Oil Filter', 4, { particle: '9', comp: '500', oil: '500', readings: ['PC 9', 'comp 500 h', 'oil 500 h'] }),
                 full('HYD', 'Hydraulic Filter', 3, { comp: '1000', readings: ['comp 1000 h'] }) ] },
      { equip: 'FCX03', date: '2026-10-07', type: 'TEMP', cls: 'EXC', by: 'Ivanov', smu: '3000',
        items: [ full('BRG', 'Slew bearing', 3, { tempC: 78, ambC: 22, tempM: 'IR', readings: ['78 °C / 22'] }),
                 full('MTR', 'Swing motor', 4, { tempC: 91, ambC: 22, tempM: 'IR', readings: ['91 °C / 22'] }) ] },
      { equip: 'FCX04', date: '2026-10-07', type: 'LUBE', cls: 'HT', by: 'Ivanov', smu: '3000',
        items: [ full('1', 'Engine', 3, { lube: { product: 'EXSOIL HD TRUCK ARCTIC 0W-40 SYNTHETIC', evid: { en: 'Label on the drum and the service sheet', ru: 'Этикетка на бочке и сервисный лист' }, samp: true, sno: '07102026-FCX04-1', filt: true } }),
                 full('3', 'Hydraulic', 4, { lube: { product: 'NEXXOL HYDRAULIC SYNTHETIC HVLP 32', want: 'SHELL TELLUS S4 VX 32', off: true, samp: false } }) ] },
    ];
    window.CMDash.importRecords(recs);
    const ov = document.getElementById('dataOv'); if (ov) ov.classList.add('hidden');
    return recs.map(r => 'one:' + r.equip + '|' + r.date + '|' + r.type)
      .concat(['unit:TK105', 'summary:TK105', 'round:2026-10-07', 'month:2026-10']);
  });

  const scan = (key, lang, bi) => p.evaluate(async ({ key, lang, bi }) => {
    const i = key.indexOf(':');
    const secs = CMReport.sectionsFor(key.slice(0, i), key.slice(i + 1), { lang, bi, photos: true });
    let st = document.getElementById('ofst'); if (!st) { st = document.createElement('style'); st.id = 'ofst'; st.textContent = CMR.CSS; document.head.appendChild(st); }
    const old = document.getElementById('rptRoot'); if (old) old.remove();
    const d = document.createElement('div'); d.id = 'rptRoot'; d.style.cssText = 'position:absolute;left:0;top:0;width:760px;background:#fff';
    d.innerHTML = secs.map(s => '<div class="secwrap">' + s.html + '</div>').join('');
    document.body.appendChild(d);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const R = e => e.getBoundingClientRect();
    const txt = e => (e.innerText || '').replace(/\s+/g, ' ').trim();
    const out = { markup: [], squeezed: [], vertical: [], past: [], twice: [], cells: d.querySelectorAll('.cel').length, dds: 0 };
    /* 1 */ (txt(d).match(/<\/?(span|div|b|i)\b[^>]*>?|&lt;|&quot;|&amp;[a-z]+;/g) || []).forEach(m => out.markup.push(m));
    /* 2 */ d.querySelectorAll('.cel dd').forEach(dd => { if (!txt(dd)) return; out.dds++;
      if (R(dd).width < 48) out.squeezed.push(Math.round(R(dd).width) + 'px: ' + txt(dd).slice(0, 30)); });
    /* 5 */ d.querySelectorAll('.cel dt').forEach(dt => { const dd = dt.nextElementSibling; if (!dd) return;
      const lab = txt(dt).split(' / ')[0].trim();
      if (lab && new RegExp('(^|[\\s·])' + lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:', 'i').test(txt(dd))) out.twice.push(lab + ' → ' + txt(dd).slice(0, 40)); });
    /* 3 */ d.querySelectorAll('dd, dt, td, th, .cm, .sv, .sk, .pk, .muted, .rnote').forEach(e => {
      const r = R(e), t = txt(e);
      if (t.length > 12 && r.width > 0 && r.height > 8 * r.width && r.height > 60) out.vertical.push(e.tagName + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ': ' + t.slice(0, 24)); });
    /* 4 */ const clipped = (e, box) => { for (let x = e.parentElement; x && x !== box; x = x.parentElement)
        if (getComputedStyle(x).overflowX !== 'visible') return true; return false; };
    d.querySelectorAll('.cel').forEach(c => { const rc = R(c);
      c.querySelectorAll('dd, dt, .cm, .pk, .chips, b, span').forEach(e => { const r = R(e);
        if (r.width > 0 && (r.right > rc.right + 1 || r.left < rc.left - 1) && !clipped(e, c)) out.past.push('card: ' + txt(e).slice(0, 30)); }); });
    d.querySelectorAll('td, th').forEach(td => { if (td.scrollWidth > td.clientWidth + 2 && getComputedStyle(td).overflowX === 'visible') out.past.push('cell: ' + txt(td).slice(0, 30)); });
    if (d.scrollWidth > 761) {
      /* name the outermost thing that runs past the page edge, not just the width */
      const over = new Set([...d.querySelectorAll('*')].filter(e => R(e).right > 762));
      const top = [...over].filter(e => !over.has(e.parentElement)).slice(0, 2)
        .map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + Math.round(R(e).width) + 'px "' + txt(e).slice(0, 40) + '"');
      out.past.push('page ' + d.scrollWidth + 'px wide: ' + top.join(' ; '));
    }
    d.remove();
    return out;
  }, { key, lang, bi });

  for (const key of keys) {
    for (const [lang, bi, tag] of [['en', false, 'EN'], ['ru', false, 'RU'], ['en', true, 'EN+RU']]) {
      const s = await scan(key, lang, bi);
      const sc = key.slice(0, key.indexOf(':')), tg = key.slice(key.indexOf(':') + 1);
      const name = (sc === 'one' ? tg.split('|')[2] + ' ' + tg.split('|')[0] + ' ' + tg.split('|')[1] : sc + ' ' + tg) + ' ' + tag;
      console.log(`\n${name}: ${s.cells} cards, ${s.dds} facts read`);
      ok(`${name}: no markup printed as text`, s.markup.length === 0, s.markup.slice(0, 3).join(' | '));
      ok(`${name}: no fact squeezed under 48px`, s.squeezed.length === 0, s.squeezed.slice(0, 3).join(' | '));
      ok(`${name}: nothing printed one letter to a line`, s.vertical.length === 0, s.vertical.slice(0, 3).join(' | '));
      ok(`${name}: nothing past its card, cell or the page`, s.past.length === 0, s.past.slice(0, 3).join(' | '));
      ok(`${name}: no card says a field's label again inside its value`, s.twice.length === 0, s.twice.slice(0, 2).join(' | '));
    }
  }
  /* the scan must be able to see: the reported card has facts to read */
  const seen = await scan(keys[0], 'en', true);
  ok('the scan read the reported board: four cards and their facts', seen.cells >= 4 && seen.dds >= 12, seen.cells + ' cards, ' + seen.dds + ' facts');
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
