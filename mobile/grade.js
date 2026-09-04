/* THE CONDITION GRADE. One scale, one table, both surfaces.

   1 Normal · 2 Incipient · 3 Degraded · 4 Severe · 5 Critical

   The grade is the inspector's assessment of the condition found, and it is
   the ONLY condition field a record carries. Its name, its colour, the ISO
   14224 class it maps to for export, the action it calls for and what it means
   on a given round are all derived from the integer — here, and nowhere else.
   There is no separate severity to set, so a record can never carry two
   answers to one question.

   It replaced A / B / C / X. Those letters still exist in every sidecar written
   before the change, in the bundled spreadsheet import, in team-cache rows on
   phones that have not been opened since, and in the fixtures. `num()` reads
   them, so every ingest path accepts a letter and hands the rest of the app a
   number; nothing downstream sees a letter again. `D` was never issued on this
   fleet — the reliability team's scale was four steps — so 4 · Severe is a new
   value with no history behind it.

   In ISO 14224 terms the grade is an ASSESSMENT. Failure mode, mechanism and
   cause stay their own coded fields; measurements stay in millimetres and
   degrees beside the grade, never inside it.

   Written to `self` rather than `window`: the service worker imports this file
   to decide what to cache, and a service worker has no window. */
(function (G) {
  'use strict';

  var LEVELS = [1, 2, 3, 4, 5];

  /* Letters as the old scale wrote them. D is accepted for completeness — an
     import from elsewhere may carry a five-letter scale — and maps to Severe. */
  var LEGACY = { A: 1, B: 2, C: 3, D: 4, X: 5 };

  /* The ISO 14224 severity class each grade exports as, for 1C and for the
     sidecar's `sev` field. ISO has four classes; two grades share Degraded
     because "serious defect, repair soon" is still a degraded failure in the
     standard's sense, not a critical (immediate loss of function) one. */
  var ISO = { 1: 'NOF', 2: 'INC', 3: 'DEG', 4: 'DEG', 5: 'CRI' };
  /* The other way, for a limit table that concludes a class and needs to
     propose a grade the inspector can confirm. Degraded proposes 3, never 4:
     a limit says "over the line", a person says how far. */
  var FROM_ISO = { NOF: 1, INC: 2, DEG: 3, CRI: 5 };

  /* One green, one amber, one orange, one red-orange, one red — in the
     dashboard's own tokens, and as hex for the printed sheet where there are
     no tokens. The green is the dark one all three surfaces settled on for
     white text (6.13:1); amber takes dark ink. */
  var CSS = { 1: 'var(--good)', 2: 'var(--warning)', 3: 'var(--serious)', 4: 'var(--severe)', 5: 'var(--critical)' };
  var HEX = { 1: '#0a7134', 2: '#fab219', 3: '#ec835a', 4: '#d9511f', 5: '#c8232c' };
  var INK = { 1: '#fff', 2: '#3d2c00', 3: '#fff', 4: '#fff', 5: '#fff' };

  var NAME = {
    en: { 1: 'Normal', 2: 'Incipient', 3: 'Degraded', 4: 'Severe', 5: 'Critical' },
    ru: { 1: 'Норма', 2: 'Начальный', 3: 'Ухудшенное', 4: 'Серьёзное', 5: 'Критическое' }
  };
  /* What the number means, whatever the round. */
  var GLOSS = {
    en: { 1: 'Good condition', 2: 'Early warning', 3: 'Defect found', 4: 'Serious defect', 5: 'Unsafe or failure likely' },
    ru: { 1: 'Хорошее состояние', 2: 'Раннее предупреждение', 3: 'Обнаружен дефект', 4: 'Серьёзный дефект', 5: 'Опасно или вероятен отказ' }
  };
  /* The action each grade calls for by default. */
  var ACTION = {
    en: { 1: 'Continue operation', 2: 'Monitor and inspect sooner', 3: 'Plan repair', 4: 'Repair soon', 5: 'Stop and inspect immediately' },
    ru: { 1: 'Продолжать эксплуатацию', 2: 'Наблюдать, осмотреть раньше срока', 3: 'Запланировать ремонт', 4: 'Отремонтировать в ближайшее время', 5: 'Остановить и осмотреть немедленно' }
  };

  /* What the same number means on each kind of round. Keyed by the round
     family, not the round type: INSP, TEMP and TB read the general text, MP
     and FC have their own, and so on. `family()` says which. */
  var MEANING = {
    en: {
      mp:   { 1: 'Light paste; no particles', 2: 'Thick paste or fine fuzz', 3: 'Fine metal filings',
              4: 'Clear particles or sharp metal pieces', 5: 'Metal chips, chunks or large pieces' },
      fc:   { 1: 'No abnormal particles', 2: 'A few fine particles', 3: 'Noticeable particles or small flakes',
              4: 'Many particles, coarse flakes or sharp pieces', 5: 'Large fragments or component pieces' },
      uc:   { 1: '80–100% life remaining; even wear', 2: '60–79% remaining; minor wear',
              3: '40–59% remaining, or uneven wear starting', 4: '20–39% remaining, severe wear or near limit',
              5: 'Below 20%, past limit, broken or loose' },
      get:  { 1: '80–100% remaining; secure; no damage', 2: '60–79% remaining; minor wear',
              3: '40–59% remaining; worn but usable', 4: '20–39% remaining, damaged or near limit',
              5: 'Below 20%, past limit, broken, loose or missing' },
      gen:  { 1: 'No defect; working normally', 2: 'Slight abnormal condition; monitor',
              3: 'Clear defect; equipment remains usable', 4: 'Serious defect; repair soon',
              5: 'Unsafe, failed or not fit to operate' },
      lube: { 1: 'Correct level; clean lubricant; no leak', 2: 'Minor seepage, slight discoloration or level near limit',
              3: 'Incorrect level, dirty lubricant, small leak or poor greasing',
              4: 'Very low level, heavy contamination, significant leak, wrong lubricant or blocked grease point',
              5: 'No lubrication, major oil loss or immediate damage likely' }
    },
    ru: {
      mp:   { 1: 'Лёгкая паста; частиц нет', 2: 'Густая паста или мелкий «пух»', 3: 'Мелкая металлическая стружка',
              4: 'Явные частицы или острые кусочки металла', 5: 'Металлическая стружка, куски или крупные фрагменты' },
      fc:   { 1: 'Посторонних частиц нет', 2: 'Несколько мелких частиц', 3: 'Заметные частицы или мелкие чешуйки',
              4: 'Много частиц, крупные чешуйки или острые кусочки', 5: 'Крупные фрагменты или части деталей' },
      uc:   { 1: 'Остаток ресурса 80–100%; износ равномерный', 2: 'Остаток 60–79%; незначительный износ',
              3: 'Остаток 40–59% или начало неравномерного износа', 4: 'Остаток 20–39%, сильный износ или близко к пределу',
              5: 'Менее 20%, за пределом, сломано или ослаблено' },
      get:  { 1: 'Остаток 80–100%; закреплено; без повреждений', 2: 'Остаток 60–79%; незначительный износ',
              3: 'Остаток 40–59%; изношено, но пригодно', 4: 'Остаток 20–39%, повреждено или близко к пределу',
              5: 'Менее 20%, за пределом, сломано, ослаблено или отсутствует' },
      gen:  { 1: 'Дефектов нет; работает нормально', 2: 'Небольшое отклонение; наблюдать',
              3: 'Явный дефект; техника пригодна к работе', 4: 'Серьёзный дефект; ремонт в ближайшее время',
              5: 'Опасно, отказ или непригодно к эксплуатации' },
      lube: { 1: 'Уровень в норме; смазка чистая; утечек нет', 2: 'Небольшое подтекание, лёгкое потемнение или уровень у предела',
              3: 'Неверный уровень, грязная смазка, малая утечка или плохая смазка точек',
              4: 'Очень низкий уровень, сильное загрязнение, значительная утечка, не та смазка или забитая пресс-маслёнка',
              5: 'Смазки нет, большая потеря масла или повреждение неизбежно' }
    }
  };

  /* Which meaning column a round reads. Anything not listed is a general
     walk-around: INSP, TEMP, the dump body's visual checks. */
  var FAMILY = { MP: 'mp', FC: 'fc', UC: 'uc', GET: 'get', LUBE: 'lube' };
  function family(type) { return FAMILY[String(type || '').toUpperCase()] || 'gen'; }

  /* THE NORMALISER. Every value that can reach the app — a number, the string
     of one, an old letter in either case, blank, junk — becomes an integer
     1..5 or null. A grade of 0 is not a grade: emptiness is tested by
     truthiness in a dozen places, and 0 would make a filled point look empty. */
  function num(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return (v >= 1 && v <= 5 && v === Math.floor(v)) ? v : null;
    var s = String(v).trim().toUpperCase();
    if (/^[1-5]$/.test(s)) return Number(s);
    if (LEGACY[s] != null) return LEGACY[s];
    return null;
  }
  /* Was this value written in the old scale? A migration counts these. */
  function isLegacy(v) { return v != null && v !== '' && LEGACY[String(v).trim().toUpperCase()] != null; }

  function lang(l) { return (l === 'ru') ? 'ru' : 'en'; }
  function name(n, l)    { n = num(n); return n ? NAME[lang(l)][n] : ''; }
  function gloss(n, l)   { n = num(n); return n ? GLOSS[lang(l)][n] : ''; }
  function action(n, l)  { n = num(n); return n ? ACTION[lang(l)][n] : ''; }
  /* "3 – Degraded": the number and the name, always together. */
  function label(n, l)   { n = num(n); return n ? n + ' – ' + NAME[lang(l)][n] : ''; }
  function meaning(n, type, l) { n = num(n); return n ? (MEANING[lang(l)][family(type)] || MEANING[lang(l)].gen)[n] : ''; }
  function iso(n)        { n = num(n); return n ? ISO[n] : ''; }
  function fromIso(s)    { return FROM_ISO[String(s || '').toUpperCase()] || null; }
  function css(n)        { n = num(n); return n ? CSS[n] : 'var(--none)'; }
  function hex(n)        { n = num(n); return n ? HEX[n] : '#8a939b'; }
  function ink(n)        { n = num(n); return n ? INK[n] : '#fff'; }
  function cls(n)        { n = num(n); return n ? 'g' + n : 'g0'; }

  /* THE ROUND'S GRADE: the worst of its positions. A graded position counts by
     its grade; a measured one — undercarriage, tray, teeth — by the grade its
     remaining life maps to, the same rule the dashboard scores it with. The
     machine's own photographs carry no grade. Null when nothing on the round
     says anything, which is a fact worth keeping distinct from "1". */
  function roundGrade(items) {
    var w = 0;
    (items || []).forEach(function (i) {
      if (!i || i.general || i.key === '__general') return;
      var n = num(i.grade);
      if (!n && i.wearPct !== '' && i.wearPct != null && isFinite(Number(i.wearPct))) n = fromWorn(Number(i.wearPct));
      if (n && n > w) w = n;
    });
    return w || null;
  }
  /* The worst of a list — the number a round is summarised by. */
  function worst(list) {
    var w = null;
    (list || []).forEach(function (v) { var n = num(v && typeof v === 'object' ? v.grade : v); if (n && (w == null || n > w)) w = n; });
    return w;
  }
  /* Attention starts at 3: a defect has been found. 1 and 2 are not findings. */
  function isFinding(n) { n = num(n); return !!n && n >= 3; }
  function isCritical(n) { return num(n) === 5; }

  /* A MEASURED point grades itself from remaining life. Undercarriage and GET
     scales in the table above are in percent of life REMAINING; the app's wear
     figure is percent WORN (100 = at the condemn limit), so the two are the
     same number read from opposite ends. Past the limit is past 100% worn. */
  function fromRemaining(pctRemaining) {
    var r = Number(pctRemaining);
    if (!isFinite(r)) return null;
    if (r >= 80) return 1;
    if (r >= 60) return 2;
    if (r >= 40) return 3;
    if (r >= 20) return 4;
    return 5;
  }
  function fromWorn(pctWorn) {
    var w = Number(pctWorn);
    if (!isFinite(w)) return null;
    return fromRemaining(100 - w);
  }

  /* What each grade demands before a round can be saved. Read by the phone's
     Save gate and by the dashboard's review, so the two agree on what a
     complete finding is. */
  var REQUIRE = {
    1: {}, 2: {},
    3: { action: 1, target: 1 },
    4: { action: 1, comment: 1, closeup: 1, target: 1 },
    5: { action: 1, comment: 1, closeup: 1, target: 1, notify: 1, defect: 1 }
  };
  function requires(n) { n = num(n); return n ? REQUIRE[n] : {}; }

  G.GRADE = {
    LEVELS: LEVELS, LEGACY: LEGACY, ISO: ISO, HEX: HEX, CSS: CSS,
    num: num, isLegacy: isLegacy, name: name, gloss: gloss, action: action, label: label,
    meaning: meaning, family: family, iso: iso, fromIso: fromIso,
    css: css, hex: hex, ink: ink, cls: cls, worst: worst, roundGrade: roundGrade,
    isFinding: isFinding, isCritical: isCritical,
    fromRemaining: fromRemaining, fromWorn: fromWorn, requires: requires,
    NAME: NAME, MEANING: MEANING, ACTION: ACTION, GLOSS: GLOSS
  };
})(typeof self !== 'undefined' ? self : this);
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof self !== 'undefined' ? self : this).GRADE;
