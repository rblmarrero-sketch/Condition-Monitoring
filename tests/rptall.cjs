/* EVERY REPORT, BOTH LANGUAGES, READ OFF THE PAPER.

   Field report, build 268, a unit sheet for EX015: the photograph captions
   printed as "Equipment overview <span class="alti">/ Общий вид машины</span>"
   — the bilingual label escaped a second time on its way to the page — the
   "Evidence incomplete" note the same, the Action row in English only under a
   Russian heading, and no undercarriage drawing at all, where EX009's sheet
   had one. EX015 is a PC2000 the wear reference has no profile for, and the
   dashboard drew nothing rather than the walk with the reference's defaults.

   So this suite builds a sheet for EVERY round type the app has, through the
   dashboard's own report module, in English and in Russian, and reads what
   would be printed:
     · no markup printed as text, anywhere;
     · every bilingual label carries the other language, and the action row
       does too;
     · the drawing is on every sheet that has one to draw: an undercarriage
       with a profile, an undercarriage WITHOUT one, a GET tool, a dump body;
     · the dictionary has a Russian line for every English one.

   Run: node tests/rptall.cjs   (needs tests/mock.cjs on 8099) */
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099') + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const CYR = /[Ѐ-ӿ]/, LAT = /[A-Za-z]{3}/;

/* One round of every type, on machines the register can name — the tray on
   a truck with a body model, the GET on a machine with a tool profile, the
   undercarriage twice: a dozer the wear reference profiles, and EX015. */
const SEED = () => {
  const has = (f) => (window.ASSETS || []).find(f);
  const tb = has(a => typeof bodyModelOf === 'function' && bodyModelOf(a.n));
  const get = has(a => window.GET && GET.profileFor(a.n, a.cat || a.cls || '', a.m || ''));
  const noProf = has(a => a.n === 'EX015') || has(a => a.m && WEAR.map[a.m] && !WEAR.map[a.m].m);
  const uc = has(a => a.m && (WEAR.map[a.m] || {}).m);
  const recs = [
    { equip: 'TK151', date: '2026-09-01', type: 'MP', cls: 'HT', by: 'R. Marrero', smu: '7100',
      items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 4, defect: 'Ferrous debris — heavy / chips / flakes', defectCode: 'DT14-03',
                cause: 'Gear wear', causeCode: 'CS-01', action: 'MON', actionLabel: 'Monitor / re-inspect next PM', prio: 'P2', wo: 'WO-1' }] },
    { equip: 'TK152', date: '2026-09-01', type: 'FC', cls: 'HT', by: 'R. Marrero', smu: '7100',
      items: [{ key: 'ENG', label: 'Engine filter', grade: 3, defect: 'Ferrous debris — moderate', defectCode: 'DT14-02', action: 'SCH', actionLabel: 'Schedule repair' }] },
    { equip: 'TK153', date: '2026-09-01', type: 'INSP', cls: 'HT', by: 'R. Marrero', smu: '7100',
      items: [{ key: 'GEN', label: 'General', grade: 2, comment: 'weep at the hose' }] },
    { equip: 'TK156', date: '2026-09-01', type: 'TEMP', cls: 'HT', by: 'R. Marrero', smu: '7100',
      items: [{ key: 'BRK', label: '', tempC: '96', grade: 3, action: 'MON' }] },
    { equip: 'TK154', date: '2026-09-01', type: 'LUBE', cls: 'HT', by: 'R. Marrero', smu: '7100',
      items: [{ key: 'HYD', label: 'Hydraulic tank', grade: 1, lubeProduct: 'Mobil DTE 10', lubeEvidence: 'label' }] },
  ];
  if (uc) recs.push({ equip: uc.n, date: '2026-09-01', type: 'UC', cls: 'DOZ', by: 'R. Marrero', smu: '9000',
    items: [{ key: 'IDLER.L-OUT', label: 'IDLER.L-OUT', mm: 24 }, { key: 'BUSH.L', label: 'BUSH.L', mm: 90, action: 'MON' }] });
  if (noProf) recs.push({ equip: noProf.n, date: '2026-09-01', type: 'UC', cls: 'EXC', by: 'R. Marrero', smu: '9000',
    items: [{ key: 'IDLER.L-OUT', label: 'Idler tread — Left · outer', mm: 23, grade: 1, action: 'MON', actionLabel: 'Monitor / re-inspect next PM' }] });
  if (get) recs.push({ equip: get.n, date: '2026-09-01', type: 'GET', cls: get.cls || '', by: 'R. Marrero', smu: '9000',
    items: [{ key: (GET.walk(get.n, get.cat || get.cls || '', get.m || '')[0] || {}).k || 'TOOTH', mm: 200, grade: 2 }] });
  if (tb) recs.push({ equip: tb.n, date: '2026-09-01', type: 'TB', cls: 'AT', by: 'R. Marrero', smu: '9000',
    items: [{ key: 'F62', label: 'F62', detection: 'DM-02', mm: 4, newMM: 20, condemnMM: 3, refSrc: 'tray:HM400' }] });
  CMDash.importRecords(recs);
  document.getElementById('dataOv').classList.add('hidden');
  return { uc: uc && uc.n, noProf: noProf && noProf.n, get: get && get.n, tb: tb && tb.n, units: recs.map(r => r.equip + '/' + r.type) };
};

/* Built through the module's own context — the same call the PDF makes. */
const RENDER = (unit, L) => {
  lang = L; applyLang();
  const recs = CMReport.recsForScope('unit', unit);
  const secs = CMR.sections(CMReport.ctxFor(recs, { scope: 'unit', target: unit, extra: [], art: {} }));
  document.querySelectorAll('#rptProbe,#rptProbeCss').forEach(e => e.remove());
  const st = document.createElement('style'); st.id = 'rptProbeCss'; st.textContent = CMR.CSS; document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'rptProbe'; d.className = 'rp';
  d.innerHTML = '<div id="rptRoot" style="width:760px">' + secs.map(s => s.html).join('') + '</div>';
  document.body.appendChild(d);
  const root = document.getElementById('rptRoot');
  const text = root.innerText;
  /* Each translation with the line it translates, so a gap names its key. */
  const alti = [...root.querySelectorAll('.alti,.alt,.altl')].map(e => ({ alt: e.textContent.trim(),
    of: (e.parentElement ? e.parentElement.textContent : '').replace(e.textContent, '').trim().slice(0, 50) }));
  const actions = [...root.querySelectorAll('dt')].filter(dt => /^(Action|Действие)/.test(dt.textContent.trim())).map(dt => (dt.nextElementSibling || {}).textContent || '');
  return { text, markup: /<\/?span|class="|<b>|<\/b>/.test(text), alti, actions,
           drawing: !!root.querySelector('.ucmapwrap svg, .ucmap, .mapblock svg, .bodymap svg, svg.bmap, .bodymapwrap svg'),
           svgs: root.querySelectorAll('svg').length, types: recs.map(r => r.type).join(',') };
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const S = await p.evaluate(SEED);
  await p.waitForTimeout(300);
  ok('the seed found an undercarriage with a profile, one without, a GET tool and a dump body', !!(S.uc && S.noProf && S.get && S.tb), JSON.stringify(S));

  console.log('\nthe dictionary');
  const dict = await p.evaluate(() => { const en = Object.keys(CMR.dict.en), ru = CMR.dict.ru || {}; return { n: en.length, missing: en.filter(k => ru[k] == null) }; });
  ok('every English line has a Russian one (' + dict.n + ' keys)', dict.missing.length === 0, dict.missing.slice(0, 10).join(', ') || 'none missing');

  for (const u of [...new Set(S.units.map(x => x.split('/')[0]))]) {
    for (const L of ['en', 'ru']) {
      const R = await p.evaluate(({ u, L, RENDER }) => eval('(' + RENDER + ')')(u, L), { u, L, RENDER: RENDER.toString() });
      const tag = u + ' (' + R.types + ') in ' + L.toUpperCase();
      console.log('\n' + tag);
      ok('no markup is printed as text', !R.markup, R.markup ? (R.text.match(/.{0,40}<\/?span.{0,40}/) || [])[0] : R.text.length + ' chars');
      const other = L === 'en' ? CYR : LAT;
      const bad = R.alti.filter(x => x.alt && !other.test(x.alt) && !/^\/?\s*[\d.,%\s°C–-]+$/.test(x.alt));
      ok('every bilingual label carries the other language (' + R.alti.length + ' labels)', R.alti.length > 0 && bad.length === 0,
         bad.slice(0, 5).map(x => '"' + x.of + '" → "' + x.alt + '"').join(' | ') || 'all paired');
      if (R.actions.length) ok('the action row is in both languages', R.actions.every(a => CYR.test(a) && LAT.test(a)), R.actions.join(' | '));
      if (/UC|GET|TB/.test(R.types)) ok('the drawing is on the sheet', R.drawing, R.svgs + ' svg(s)');
    }
  }

  /* The two lines the field screenshot showed with their markup printed:
     a machine photograph's caption and the "Evidence incomplete" note. The
     engine is handed a round with a general photograph and a gap directly,
     the way the phone hands it one, in both languages. */
  console.log('\nthe photograph caption and the evidence note');
  for (const L of ['en', 'ru']) {
    const R = await p.evaluate(L => {
      const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const secs = CMR.sections({ lang: L, mode: 'unit', title: 'x', titleAlt: 'y', stamp: new Date(), sevLabel: s => s, sevLabelAlt: s => s,
        records: [{ equip: 'EX015', clsLabel: 'EXCAVATOR', model: 'PC2000', type: 'UC', typeLabel: 'UC', date: '2026-09-06', by: 'S', smu: '1',
          gap: { missing: 2, expected: 5, received: 3 },
          items: [{ key: '__general', name: 'Machine', nameAlt: 'Машина', general: 1, cats: ['OVERVIEW', 'GET'], photos: [png, png], grade: '', sev: '' },
                  { key: 'IDLER.L-OUT', name: 'Idler tread — Left · outer', nameAlt: 'Направляющее колесо — Слева · внешнее', grade: 1, sev: 'NOF',
                    action: L === 'ru' ? 'Наблюдать' : 'Monitor', actionAlt: L === 'ru' ? 'Monitor' : 'Наблюдать', opstat: 'RUN', gradeWhy: 'looks fine',
                    w: { mm: 23, newMM: 20, condemnMM: 29, pct: 33, band: 'done' } }] }] });
      const d = document.createElement('div'); d.className = 'rp'; d.innerHTML = '<div style="width:760px">' + secs.map(s => s.html).join('') + '</div>';
      document.body.appendChild(d);
      const text = d.innerText;
      const caps = [...d.querySelectorAll('figcaption')].map(f => ({ text: f.textContent.trim(), alt: (f.querySelector('.alti') || {}).textContent || '' }));
      const gap = (text.match(/(Evidence incomplete|Фотоматериал неполный)[^\n]*/) || [''])[0];
      d.remove();
      return { markup: /<\/?span|class="/.test(text), caps, gap };
    }, L);
    const other = L === 'en' ? CYR : LAT;
    ok('in ' + L.toUpperCase() + ' no markup is printed as text', !R.markup);
    ok('  the captions are paired, not escaped', R.caps.length === 2 && R.caps.every(c => other.test(c.alt) && !/[<>]/.test(c.text)), JSON.stringify(R.caps));
    ok('  the evidence note is paired, not escaped', !!R.gap && other.test(R.gap) && !/[<>]/.test(R.gap) && /2/.test(R.gap) && /5/.test(R.gap), R.gap.slice(0, 120));
  }

  await b.close();
  console.log(fails.length ? '\nFAILED: ' + fails.length + '\n' + fails.join('\n') : '\nall green');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL harness: ' + (e && e.stack || e)); process.exit(1); });
