/* The report, audited.

   Five things were asked of it and four of them are invisible from inside the
   code that produces them:

   · Both languages on every label. A key that only exists in English does not
     error — it prints in English and looks finished.
   · No jargon on the drawing. HGT / BUSH / P×4 / P×1 / GRSR shipped for months
     because an abbreviation renders exactly as well as a name.
   · Less, not more. A four-round unit report printed the same drawing four
     times; nothing counts sections, so nothing noticed.
   · Nothing off the edge of the paper. A table wider than 760px does not
     overflow visibly here — it is rasterised and the right-hand columns are
     simply absent from the PDF. That is the worst class of defect on this
     project: a real value rendered as nothing.
   · And a literal __N__ went out as a section number in every single-machine
     report, because the unit path never substituted the placeholder the fleet
     path did.

   So this suite reads the produced HTML rather than trusting the producer.
*/
const { chromium } = require(require('./pw.cjs'));
const B = (process.env.CMPORT ? 'http://127.0.0.1:' + process.env.CMPORT : 'http://127.0.0.1:8099')
        + '/dashboard/index.html';
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };
const note = (n, d) => console.log('   ·      ' + n + '   ' + d);

const SEED = () => {
  const series = {
    'IDLER.L-OUT': [24, 26.5, 29, 31.5], 'IDLER.R-OUT': [22, 24, 26, 27.5],
    'CARRIER.L-OUT': [185, 181, 177, 173], 'ROLLER.L1': [240, 230, 220, 213],
    'ROLLER.L2': [240, 232, 224, 218], 'ROLLER.R1': [240, 231, 222, 215],
    'CHAIN.L': [98, 101, 104, 107], 'SHOE.L': [null, null, null, null],
    'LINKH.L': [181, 176, 172, 168], 'BUSH.L': [98.5, 96, 94, 92.6],
  };
  const recs = ['2026-02-11', '2026-04-14', '2026-06-16', '2026-08-11'].map((d, n) => ({
    equip: 'DZ002', date: d, type: 'UC', cls: 'Dozer', by: 'R. Marrero', sup: 'V. Petrov',
    smu: String(9000 + n * 480), gps: { lat: 66.9021, lon: 168.1044 },
    items: Object.keys(series).map(k => ({ key: k, label: k, mm: series[k][n],
      reason: series[k][n] == null ? 'PACKED' : '' })),
  }));
  recs.push({ equip: 'DZ002', date: '2026-08-11', type: 'MP', cls: 'Dozer',
    by: 'R. Marrero', sup: 'V. Petrov', smu: '10440', items: [
      { key: '1A', label: 'Transmission', grade: 'C', defect: 'Ferrous debris — moderate',
        defectCode: 'DT14-03', cause: 'Gear wear', actionLabel: 'Schedule repair',
        prio: 'P2', wo: 'WO-88213', comment: 'Fine fuzz plus two flakes.', particle: '18/16/13' },
      { key: '2B', label: 'Final drive LH', grade: 'A' },
      { key: '3C', label: 'Final drive RH', grade: 'B', comment: 'Light fuzz only.' } ] });
  // a second machine, so the fleet path is exercised too
  recs.push({ equip: 'TK801', date: '2026-08-11', type: 'MP', cls: 'Haul truck',
    by: 'A. Sokolov', items: [{ key: '4C', label: 'Left Rear Final Drive', grade: 'X',
      defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', cause: 'Gear wear',
      actionLabel: 'Stop and repair', prio: 'P1' }] });
  CMDash.importRecords(recs);
  document.getElementById('dataOv').classList.add('hidden');
};

/* Build the sections through exactly the context report.js hands over, so the
   suite cannot pass on a report nobody generates. */
const BUILD = (scope, target) => {
  const other = f => { const was = lang; try { lang = was === 'ru' ? 'en' : 'ru'; return f(); }
                       finally { lang = was; } };
  const recs = CMReport.recsForScope(scope, target);
  return CMR.sections({
    lang, mode: (scope === 'one' || scope === 'unit') ? 'unit' : undefined,
    title: t('rep_title_doc'), titleAlt: other(() => t('rep_title_doc')),
    sub: t('r_' + scope) + ' — ' + target, subAlt: other(() => t('r_' + scope)) + ' — ' + target,
    stamp: new Date(), records: CMReport.normalise(recs, { photos: false }),
    sevLabel: s => (SEV[s] ? SEV[s].l : s),
    sevLabelAlt: s => other(() => (SEV[s] ? SEV[s].l : s)),
    extra: [{ nb: true, html: '<div class="sec"><span class="n">__N__</span>HOST</div>' }],
  });
};

const LAY = (secs) => {
  document.querySelectorAll('#rptProbe,#rptProbeCss').forEach(e => e.remove());
  const st = document.createElement('style'); st.id = 'rptProbeCss'; st.textContent = CMR.CSS;
  document.head.appendChild(st);
  const d = document.createElement('div');
  d.id = 'rptProbe'; d.className = 'rp';
  d.innerHTML = '<div id="rptRoot" style="width:760px">' + secs.map(s => s.html).join('') + '</div>';
  document.body.appendChild(d);
  return document.getElementById('rptRoot');
};

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => fails.push('PAGEERROR ' + e.message));
  await p.goto(B, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.evaluate(SEED);
  await p.waitForTimeout(300);

  /* ---------------------------------------------------------------- 1 */
  console.log('\nboth languages, on every label');
  const bi = await p.evaluate(({ BUILD }) => {
    const build = eval('(' + BUILD + ')');
    const out = {};
    ['en', 'ru'].forEach(L => {
      lang = L; applyLang();
      const html = build('unit', 'DZ002').map(s => s.html).join('');
      out[L] = {
        alt: (html.match(/class="alt[l2i]?"/g) || []).length,
        cyr: /[Ѐ-ӿ]/.test(html),
        lat: /[A-Za-z]{4}/.test(html),
      };
    });
    lang = "en"; applyLang();
    return out;
  }, { BUILD: BUILD.toString() });
  ['en', 'ru'].forEach(L => {
    note(L + ' report', JSON.stringify(bi[L]));
    /* A report in either language must carry BOTH alphabets. In Russian mode
       the old code produced a document with no Latin script in it at all. */
    ok(`  the ${L} report is written in Russian too`, bi[L].cyr);
    ok(`  and in English too`, bi[L].lat);
    ok(`  the pairing is applied broadly, not in one place`, bi[L].alt > 40, bi[L].alt + ' pairs');
  });

  /* Every dictionary key the report can reach exists in both halves. A missing
     Russian key silently falls through to the English one and reads finished. */
  const gaps = await p.evaluate(() =>
    Object.keys(CMR.dict.en).filter(k => !CMR.dict.ru[k]));
  ok('no report string is English-only in the Russian dictionary', gaps.length === 0,
     gaps.slice(0, 8).join(', ') || 'none');

  /* ---------------------------------------------------------------- 1b */
  console.log('\nevery round type, not just the undercarriage one');
  /* The first bilingual pass only ever asked the undercarriage reference for a
     name. A dump-body round fell through to the label the phone stored — one
     language, frozen at capture — so a TR60 printed 63 stations in Russian
     with no English anywhere, under a heading that said "Undercarriage
     measurements", over no drawing at all, below a title reading "method_TB".
     None of that errored. */
  const types = await p.evaluate(({ BUILD }) => {
    const build = eval('(' + BUILD + ')');
    const u = Object.keys(ASSET_BY).filter(x => bodyModelOf(x) === 'HM400')[0];
    const md = bodyModelOf(u);
    CMDash.importRecords([{ equip: u, date: '2026-08-11', type: 'TB', cls: 'AT',
      by: 'R. Marrero', sup: 'V. Petrov', smu: '22140',
      /* Labels stored in Russian only — exactly what the phone writes. */
      items: BODY.points(md).map((q, i) => ({ key: q.k, label: q.k + ' · ' + q.ru,
        mm: (6 + ((i * 7) % 40) / 10).toFixed(2) })) }]);
    const recs = CMReport.recsForScope('one', u + '|2026-08-11|TB');
    const norm = CMReport.normalise(recs, { photos: false });
    const html = build('one', u + '|2026-08-11|TB').map(s => s.html).join('');
    return {
      unit: u,
      name: norm[0].items[0].name, alt: norm[0].items[0].nameAlt,
      rawKey: /method_TB|method_GET/.test(html),
      titleEN: /Dump Body Thickness/.test(html), titleRU: /Замеры толщины кузова/.test(html),
      saysUndercarriage: /Undercarriage measurements|Замеры ходовой части/.test(html),
      bodyDrawn: /class="bodymap/.test(html),
      trackDrawn: /class="ucmap[\s"]/.test(html),
      ucKeyLeaked: /class="pkey"[\s\S]{0,400}(Sprocket|Звёздочка)/.test(html),
      faceKeyEN: /HEAD/.test(html), faceKeyRU: /ПЕРЁД/.test(html),
      zones: /class="tbzone/.test(html),
      zoneEN: /Floor — tail/.test(html), zoneRU: /Пол — разгрузка/.test(html),
      /* 63 rows each repeating the same four words is most of a page. */
      norefRows: (html.match(/no reference/g) || []).length,
    };
  }, { BUILD: BUILD.toString() });
  note('dump body on', types.unit);
  ok('a dump-body station is named in English', /Canopy/.test(types.name), types.name);
  ok('  and in Russian', /Козырёк/.test(types.alt), types.alt);
  /* T() falls back to the key, and a key is a truthy string — so a missing
     method_TB printed the words "method_TB" in 22px bold as the title. */
  ok('no dictionary key prints as a heading', !types.rawKey);
  ok('the document is titled for the round it is', types.titleEN && types.titleRU);
  ok('  and never calls a truck body an undercarriage', !types.saysUndercarriage);
  ok('the body is drawn', types.bodyDrawn);
  ok('  and not a track frame', !types.trackDrawn);
  ok('  with no undercarriage key hung off it', !types.ucKeyLeaked);
  ok('the words ON the drawing are resolved in both languages',
     types.faceKeyEN && types.faceKeyRU);
  ok('a zone table says how bad, not just where', types.zones);
  ok('  in English', types.zoneEN);
  ok('  and in Russian', types.zoneRU);
  ok('"no reference" is said once, not once per station', types.norefRows <= 1,
     types.norefRows + ' times');

  /* ---------------------------------------------------------------- 2 */
  console.log('\nthe drawing names what it points at');
  const draw = await p.evaluate(({ BUILD }) => {
    const build = eval('(' + BUILD + ')');
    const html = build('unit', 'DZ002').map(s => s.html).join('');
    /* The numbers printed on the machine, and the key that resolves them. The
       report draws the same photo walk the app draws, so the marks are numbers
       — the lettered schematic and its O/I/S pucks are gone. */
    const pucks = [...new Set([...html.matchAll(/<text class="um-n"[^>]*>([^<]*)<\/text>/g)].map(m => m[1].trim()))];
    const key = (html.match(/class="ckey">[\s\S]*?<\/div>/) || [""])[0];
    const named = [...key.matchAll(/<span class="n">([^<]*)<\/span><span class="t">([^<]*)<span class="alt">([^<]*)</g)]
      .map(m => ({ n: m[1].trim(), en: m[2].trim(), ru: m[3].trim() }));
    return { pucks, key, named,
             hasKey: /class="ckey"/.test(html),
             jargon: named.filter(x => /^(HGT|GRSR|BUSH|P×[0-9]|LINKH)$/i.test(x.en)).map(x => x.en) };
  }, { BUILD: BUILD.toString() });
  note('pucks read', draw.pucks.join(', '));
  note('key entries', draw.named.length + ': ' + draw.named.slice(0, 3).map(x => x.n + '=' + x.en).join(' | '));
  ok('a key spells the marks out', draw.hasKey && draw.named.length > 0, draw.named.length + ' entries');
  /* HGT / BUSH / P×4 / P×1 / GRSR shipped for months because an abbreviation
     renders exactly as well as a name. */
  ok('  in words, not abbreviations', draw.jargon.length === 0, draw.jargon.join(',') || 'none');
  ok('  in English', draw.named.every(x => /[A-Za-z]{3}/.test(x.en)),
     draw.named.filter(x => !/[A-Za-z]{3}/.test(x.en)).map(x => x.n).join(',') || 'all');
  ok('  and in Russian', draw.named.every(x => /[А-Яа-яЁё]{3}/.test(x.ru)),
     draw.named.filter(x => !/[А-Яа-яЁё]{3}/.test(x.ru)).map(x => x.n).join(',') || 'all');
  /* A number on the machine that the key does not resolve is worse than no
     number: the reader is told there is something to look up and cannot. */
  const orphan = draw.pucks.filter(n => n && !draw.named.some(x => x.n === n));
  ok('every number on the drawing is in the key', orphan.length === 0, orphan.join(',') || 'none');

  /* ---------------------------------------------------------------- 2b */
  console.log('\nthe phone and the dashboard draw the same machine');
  /* mapSVG accepts either a profile object or, for callers older than the
     profile, a bare roller count. The dashboard passed the bare count, so it
     took the legacy path with no machine family — and geom() then draws idler
     and sprocket the same size on everything. A dozer drives through a
     sprocket bigger than its idler and an excavator is the other way round.
     Nothing errored; the same round simply came out as two different drawings
     depending on which end printed it. */
  const frames = await p.evaluate(() => {
    const out = {};
    ['DZ002', 'EX001'].forEach(u => {
      const a = ASSET_BY[u] || {};
      const prof = WEAR.modelFor && a.m ? WEAR.modelFor(a.m) : null;
      if (!prof) { out[u] = { skip: true }; return; }
      const fam = (window.MFIG && MFIG.familyFor) ? MFIG.familyFor(u, a.cat || a.cls || '') : '';
      /* What the phone builds, from its own ucProfile shape. */
      const want = WEAR.mapSVG('L', { rollers: prof.rollers || WEAR.rollersDefault,
        high: prof.frame === 'highdrive', carriers: prof.carriers, fam, photo: '' },
        null, () => '', '', 'L');
      /* What the dashboard's report actually emits. */
      CMDash.importRecords([{ equip: u, date: '2026-08-11', type: 'UC',
        items: [{ key: 'IDLER.L-OUT', mm: 30 }] }]);
      const got = (CMReport.normalise(
        CMReport.recsForScope('one', u + '|2026-08-11|UC'), { photos: false })[0].mapHTML || '');
      const bare = h => h.replace(/aria-label="[^"]*"/g, '').replace(/<text class="um-side"[^>]*>[^<]*<\/text>/g, '');
      out[u] = { fam, match: bare(got).indexOf(bare(want).slice(180, 1000)) >= 0 };
    });
    return out;
  });
  Object.keys(frames).forEach(u => {
    if (frames[u].skip) { note(u, 'no undercarriage profile — skipped'); return; }
    note(u, 'family ' + (frames[u].fam || '(none)'));
    ok('  ' + u + ': the printed frame is the one the phone draws', frames[u].match);
  });

  /* ---------------------------------------------------------------- 3 */
  console.log('\nless, not more');
  const size = await p.evaluate(({ BUILD }) => {
    const build = eval('(' + BUILD + ')');
    const u = build('unit', 'DZ002');
    const one = build('one', 'DZ002|2026-08-11|UC');
    const html = u.map(s => s.html).join('');
    return {
      sections: u.length, chars: html.length, html: html.slice(0, 400),
      maps: (html.match(/class="ucmap[ "]/g) || []).length,
      signs: (html.match(/class="shsign"/g) || []).length,
      mh: /class="mh"/.test(html),
      /* Each earlier round reprinted as the office screen shows it. */
      older: (html.match(/class="sec olderr"/g) || []).length,
      /* The dated columns of the measurement history — how an undercarriage
         round with no photographs is still accounted for. */
      cols: (html.match(/class="r n" style="width:46px">\d\d-\d\d/g) || []).length,
      oneSections: one.length,
      oneMaps: (one.map(s => s.html).join('').match(/class="ucmap[ "]/g) || []).length,
    };
  }, { BUILD: BUILD.toString() });
  note('unit report', JSON.stringify(size));
  /* Four undercarriage rounds used to mean four copies of a two-frame drawing
     — 200 KB of SVG for a machine that looks the same in all four. */
  ok('the machine is drawn once per type, not once per round', size.maps === 2, size.maps + ' frames');
  ok('and signed once per type', size.signs <= 2, size.signs + ' signature blocks');
  ok('the document stays small', size.chars < 100000, Math.round(size.chars / 1024) + ' KB');
  ok('the sections stay few', size.sections <= 6, size.sections + '');
  /* Nothing is dropped, and there is no longer a summary table saying so.

     There used to be one — a line per earlier round — and it was struck out on
     a returned sheet as redundant, which it was: every fact on it is on the
     cards of the round it describes. What accounts for an earlier round now is
     the round itself, reprinted; and where a round is measured rather than
     graded and carries no photographs, its dated column in the measurement
     history. One of the two, never neither. */
  ok('no summary table survives', !/class="hist"/.test(size.html || ''), 'gone');
  ok('every earlier round is accounted for', size.older > 0 || size.cols >= 4,
     size.older + ' reprinted, ' + size.cols + ' dated column(s)');
  ok('and every reading is still comparable', size.mh);
  ok('a single-inspection report is a single sheet', size.oneSections <= 3, size.oneSections + '');
  ok('  with one drawing on it', size.oneMaps === 2, size.oneMaps + '');

  /* ---------------------------------------------------------------- 3b */
  console.log('\nthe page and the screen use the same words');
  /* The report keeps its own dictionary on purpose — one copy so neither end
     can ship a key showing. The cost is that the two can drift apart saying
     the same thing differently, which is exactly what happened: the wear band
     at the limit was "At or past condemn" on both in English, and two
     different sentences in Russian. Nothing detects that but a comparison. */
  const sync = await p.evaluate(() => {
    const pairs = [
      ['band_act', 'w_act', 'the band at the condemn limit'],
      ['ins', 'k_insp', 'the word for an inspection'],
      ['findings', 'k_find', 'the word for a finding'],
    ];
    return pairs.map(([rk, dk, what]) => {
      const was = lang, out = { what, rk, dk, same: {} };
      ['en', 'ru'].forEach(L => {
        lang = L;
        out.same[L] = [CMR.dict[L][rk], t(dk)];
      });
      lang = was;
      return out;
    });
  });
  sync.forEach(s => {
    ['en', 'ru'].forEach(L => {
      const [a, b] = s.same[L];
      ok(`${L}: ${s.what} is the same on both`, a === b, `report "${a}" vs screen "${b}"`);
    });
  });
  /* Severity is not compared — it cannot drift, because the report is handed
     the dashboard's own SEV labels rather than keeping a second set. */
  const sev = await p.evaluate(({ BUILD }) => {
    const build = eval('(' + BUILD + ')');
    const html = build('round', '2026-08-11').map(s => s.html).join('');
    return { crit: html.indexOf(SEV.CRI.l) >= 0, chipAlt: /class="alt2"/.test(html) };
  }, { BUILD: BUILD.toString() });
  ok('severity chips carry the dashboard\'s own wording', sev.crit);
  ok('  in both languages', sev.chipAlt);

  /* The four ISO 14224 categories had three different sets of Russian words:
     "Начальный / Ухудшено / Критично" on this screen, "Зарождающийся /
     Частичный / Критический" on the phone, and a third set again in the
     printed legend. Nothing was broken and nothing looked wrong — each surface
     was internally consistent, and the same finding simply had three names.
     The report's legend explains the chip, so the two have to agree word for
     word or the legend is explaining something else. */
  const sevRu = await p.evaluate(() => {
    const was = lang; lang = 'ru';
    const out = ['NOF', 'INC', 'DEG', 'CRI'].map(s => ({
      s, chip: SEV[s].l, legend: CMR.dict.ru['s_' + s].split(' — ')[0] }));
    lang = was; return out;
  });
  sevRu.forEach(x => ok('  ' + x.s + ': the chip and the legend agree in Russian',
    x.chip === x.legend, '"' + x.chip + '" vs "' + x.legend + '"'));

  /* ---------------------------------------------------------------- 4 */
  console.log('\nnothing prints off the edge of the paper');
  for (const [scope, target, label] of [
      ['unit', 'DZ002', 'one machine'],
      ['one', 'DZ002|2026-08-11|UC', 'one inspection'],
      ['round', '2026-08-11', 'a whole round']]) {
    const r = await p.evaluate(({ BUILD, scope, target }) => {
      const build = eval('(' + BUILD + ')');
      const secs = build(scope, target);
      document.querySelectorAll('#rptProbe,#rptProbeCss').forEach(e => e.remove());
      const st = document.createElement('style'); st.id = 'rptProbeCss'; st.textContent = CMR.CSS;
      document.head.appendChild(st);
      const d = document.createElement('div'); d.id = 'rptProbe';
      d.innerHTML = '<div id="rptRoot" style="width:760px">' + secs.map(s => s.html).join('') + '</div>';
      document.body.appendChild(d);
      const root = document.getElementById('rptRoot');
      const rb = root.getBoundingClientRect();
      const over = [...root.querySelectorAll('table,div,span,td,th,img,svg')]
        .filter(e => { const x = e.getBoundingClientRect();
                       return x.width > 0 && x.right > rb.right + 1; })
        .map(e => (e.tagName + '.' + (e.className.baseVal !== undefined ? e.className.baseVal : e.className)).slice(0, 40));
      return { w: root.scrollWidth, over: [...new Set(over)].slice(0, 6) };
    }, { BUILD: BUILD.toString(), scope, target });
    ok(label + ': the page is 760 wide', r.w <= 761, r.w + 'px');
    ok(label + ': nothing hangs past the margin', r.over.length === 0, r.over.join(' | ') || 'none');
  }

  /* ---------------------------------------------------------------- 5 */
  console.log('\nthe things that used to be wrong');
  const regress = await p.evaluate(({ BUILD }) => {
    const build = eval('(' + BUILD + ')');
    const u = build('unit', 'DZ002').map(s => s.html).join('');
    const f = build('round', '2026-08-11').map(s => s.html).join('');
    return { unitPlaceholder: /__N__/.test(u), fleetPlaceholder: /__N__/.test(f),
             unitNumbered: /HOST/.test(u) && />0\d</.test(u) };
  }, { BUILD: BUILD.toString() });
  /* This one shipped: a signed PDF whose trend page was numbered "__N__". */
  ok('no placeholder reaches a single-machine report', !regress.unitPlaceholder);
  ok('nor a fleet one', !regress.fleetPlaceholder);
  ok('the host section gets a real number instead', regress.unitNumbered);

  /* ---------------------------------------------------------------- 6 */
  console.log('\nand the report can be reached from where the inspection is');
  await p.evaluate(() => { showTab('equipment'); $('equipSel').value = 'DZ002'; renderHistory(); });
  await p.waitForTimeout(400);
  const reach = await p.evaluate(() => {
    const hdr = document.getElementById('histRpt');
    const cards = [...document.querySelectorAll('#history [data-rpt]')];
    const rows = document.querySelectorAll('#history .insp').length;
    return { hdr: !!hdr, hdrText: hdr ? hdr.textContent.trim() : '',
             cards: cards.length, rows,
             keys: cards.map(c => c.dataset.rpt).slice(0, 3),
             scopes: [...document.querySelectorAll('#rScope option')].map(o => o.value),
             defaultScope: document.getElementById('rScope').value };
  });
  ok('the history header offers a report', reach.hdr, reach.hdrText);
  ok('every inspection card offers one too', reach.cards === reach.rows && reach.rows > 0,
     reach.cards + ' of ' + reach.rows);
  ok('  each aimed at its own round', reach.keys.every(k => /\|/.test(k)), reach.keys.join(' '));
  ok('the Reports tab knows the single-inspection scope', reach.scopes.indexOf('one') >= 0,
     reach.scopes.join(','));
  /* Adding an option to the top of a <select> silently changes the default. */
  ok('  without changing what the tab opens on', reach.defaultScope === 'unit', reach.defaultScope);

  const picked = await p.evaluate(() => {
    const s = document.getElementById('rScope'); s.value = 'one'; s.onchange();
    const o = [...document.querySelectorAll('#rTarget option')];
    return { n: o.length, first: o[0] ? o[0].textContent : '', v: o[0] ? o[0].value : '' };
  });
  ok('  and lists inspections when it is chosen', picked.n > 0, picked.n + ': ' + picked.first);
  ok('  newest first', /2026-08-11/.test(picked.first), picked.first);
  ok('  keyed by the round, not the machine', /\|/.test(picked.v), picked.v);

  /* The button has to actually build something, not just exist. */
  const built = await p.evaluate(async () => {
    const recs = CMReport.recsForScope('one', 'DZ002|2026-08-11|UC');
    return { n: recs.length, equip: recs[0] && recs[0].equip, date: recs[0] && recs[0].date,
             type: recs[0] && recs[0].type };
  });
  ok('a card report is exactly that one inspection', built.n === 1
     && built.equip === 'DZ002' && built.date === '2026-08-11' && built.type === 'UC',
     JSON.stringify(built));

  await b.close();
  console.log(fails.length ? '\nFAILED ' + fails.length + ': ' + fails.join(' | ') : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
