/* Ground Engaging Tools — the parts that touch the rock.

   GET is the fastest-wearing thing on a mine site and the least well recorded.
   It is bought by the pallet, changed on backshift, and the only number anyone
   can usually produce afterwards is how many teeth were ordered. Meanwhile a
   tooth lost into a crusher is a day, and an adapter run past its nose is a
   lip repair instead of a five-minute change.

   So this round is built to be walked in two minutes and still leave a trend:

     Every position always gets a grade. A/B/C/X, a defect and an action — the
     same judgement the walk-around already uses, which every inspector on site
     already knows. A round is complete on grades alone.

     Any position may also get a millimetre. Where a fitter has a tape, the
     remaining length goes in and the app works out how far through its life
     that tooth is against new and condemn, exactly the way the undercarriage
     round works. Where nobody has a tape, nothing is blocked and nothing is
     invented.

   Positions come from the machine, not from a fixed list: a bucket's tooth
   count is a property of the bucket, a dozer has cutting edges and a ripper,
   a grader has a moldboard. Same idea as the roller count on the track frame.

   Limits are per family and generic, and say so — every reading against one is
   labelled "generic limit" wherever it appears. They are honest starting points — the real numbers come off the
   supplier's wear charts, and when the client supplies them they replace these
   and lose the flag. A generic limit is better than no trend; a generic limit
   presented as measured fact is not. */
(function () {
  'use strict';

  /* ---- what a position is ------------------------------------------------
     code — the item key that goes in the file name and to 1C
     en/ru — what the inspector reads
     tool  — what they need in their hand to measure it, if they measure it
     n/c   — new and condemn, in mm, of the dimension named by `dim` */
  var POINTS = {
    TOOTH:   { en: 'Tooth',              ru: 'Зуб',                  dim: 'length remaining', tool: 'tape' },
    ADAPTER: { en: 'Adapter / nose',     ru: 'Адаптер / носок',      dim: 'nose remaining',   tool: 'tape' },
    SHROUD:  { en: 'Lip shroud',         ru: 'Защита кромки',        dim: 'thickness',        tool: 'caliper' },
    WING:    { en: 'Wing shroud',        ru: 'Боковая защита',       dim: 'thickness',        tool: 'caliper' },
    HEEL:    { en: 'Heel shroud',        ru: 'Пяточная защита',      dim: 'thickness',        tool: 'caliper' },
    LIP:     { en: 'Bucket lip',         ru: 'Кромка ковша',         dim: 'thickness',        tool: 'caliper' },
    EDGE:    { en: 'Cutting edge',       ru: 'Режущая кромка',       dim: 'height remaining', tool: 'rule' },
    ENDBIT:  { en: 'End bit',            ru: 'Боковой нож',          dim: 'height remaining', tool: 'rule' },
    SHANK:   { en: 'Ripper shank',       ru: 'Стойка рыхлителя',     dim: 'thickness',        tool: 'caliper' },
    RTIP:    { en: 'Ripper tip',         ru: 'Наконечник рыхлителя', dim: 'length remaining', tool: 'tape' },
    SIDEBAR: { en: 'Side bar protector', ru: 'Боковая защита стойки',dim: 'thickness',        tool: 'caliper' },
    BIT:     { en: 'Drill bit',          ru: 'Буровая коронка',      dim: 'gauge diameter',   tool: 'caliper' },
    STAB:    { en: 'Stabiliser pad',     ru: 'Опорный башмак',       dim: 'thickness',        tool: 'caliper' },
    MOLD:    { en: 'Moldboard',          ru: 'Отвал',                dim: 'thickness',        tool: 'caliper' },
  };

  /* Position suffixes. A tooth is numbered from the left of the bucket looking
     at it from the machine, because that is the order a fitter walks the lip.
     Everything that comes in pairs is L/R. */
  function num(n) { var a = [], i; for (i = 1; i <= n; i++) a.push(String(i)); return a; }

  /* ---- the walk, per machine family --------------------------------------
     Ordered the way the work is done: teeth left to right along the lip, then
     the things behind them, then the sides, then the separate tool. */
  var FAMILIES = {
    ex: {                                  // excavator / rock breaker bucket
      en: 'Bucket', ru: 'Ковш',
      teeth: 5,
      walk: [
        { pt: 'TOOTH',   pos: 'n' },
        { pt: 'ADAPTER', pos: 'n' },
        { pt: 'SHROUD',  pos: ['1', '2', '3', '4'] },
        { pt: 'WING',    pos: ['L', 'R'] },
        { pt: 'HEEL',    pos: ['L', 'R'] },
        { pt: 'LIP',     pos: [''] },
      ],
      lim: { TOOTH: { n: 320, c: 130 }, ADAPTER: { n: 250, c: 190 }, SHROUD: { n: 60, c: 25 },
             WING: { n: 60, c: 25 }, HEEL: { n: 50, c: 20 }, LIP: { n: 90, c: 60 } },
    },
    ld: {                                  // wheel loader bucket
      en: 'Bucket', ru: 'Ковш',
      teeth: 4,
      walk: [
        { pt: 'TOOTH',   pos: 'n' },
        { pt: 'ADAPTER', pos: 'n' },
        { pt: 'EDGE',    pos: ['L', 'C', 'R'] },
        { pt: 'HEEL',    pos: ['L', 'R'] },
        { pt: 'LIP',     pos: [''] },
      ],
      lim: { TOOTH: { n: 280, c: 115 }, ADAPTER: { n: 220, c: 165 }, EDGE: { n: 50, c: 20 },
             HEEL: { n: 45, c: 18 }, LIP: { n: 80, c: 55 } },
    },
    dz: {                                  // dozer blade and ripper
      en: 'Blade & ripper', ru: 'Отвал и рыхлитель',
      walk: [
        { pt: 'EDGE',    pos: ['L', 'C', 'R'] },
        { pt: 'ENDBIT',  pos: ['L', 'R'] },
        { pt: 'SHANK',   pos: ['1', '2', '3'] },
        { pt: 'RTIP',    pos: ['1', '2', '3'] },
        { pt: 'SIDEBAR', pos: ['1', '2', '3'] },
      ],
      lim: { EDGE: { n: 60, c: 25 }, ENDBIT: { n: 60, c: 25 }, SHANK: { n: 110, c: 80 },
             RTIP: { n: 300, c: 150 }, SIDEBAR: { n: 40, c: 15 } },
    },
    gr: {                                  // motor grader moldboard
      en: 'Moldboard', ru: 'Отвал грейдера',
      walk: [
        { pt: 'EDGE',   pos: ['L', 'C', 'R'] },
        { pt: 'ENDBIT', pos: ['L', 'R'] },
        { pt: 'MOLD',   pos: [''] },
      ],
      lim: { EDGE: { n: 50, c: 18 }, ENDBIT: { n: 50, c: 18 }, MOLD: { n: 20, c: 10 } },
    },
    dr: {                                  // blasthole drill
      en: 'Drill tooling', ru: 'Буровой инструмент',
      walk: [
        { pt: 'BIT',  pos: [''] },
        { pt: 'STAB', pos: ['1', '2', '3', '4'] },
      ],
      lim: { BIT: { n: 251, c: 244 }, STAB: { n: 40, c: 20 } },
    },
  };

  /* Tooth counts that are not the family default. A bucket is the thing that
     has teeth, not the machine, so this is keyed on the model — the same shape
     as the undercarriage table, and the same place a real figure goes when the
     client supplies one. */
  var TEETH_BY_MODEL = {
    'HITACHI EX1200-6BH': 6, 'HITACHI EX1200-7BH': 6, 'KOMATSU PC2000-8 BH': 6,
    'HITACHI ZX470LC-5G': 5, 'HITACHI ZX470LCR-5G': 5,
    'HITACHI ZX330-5G RB': 4, 'HITACHI ZX280-5G': 4, 'CATERPILLAR 336-07': 4,
    'LiuGong CLG990FHD': 5, 'LiuGong CLG970E': 5,
    'KOMATSU PC800-8E0 (SE)': 5,
  };

  function familyFor(unit, cls) {
    return (window.MFIG ? MFIG.familyFor(unit, cls) : '');
  }

  /* Is there a GET round to do on this machine at all? A haul truck, a light
     vehicle and a generator have no ground engaging tools, and offering an
     empty round is worse than not offering one. */
  function profileFor(unit, cls, model) {
    var fam = familyFor(unit, cls);
    var f = FAMILIES[fam];
    if (!f) return null;
    var teeth = f.teeth ? (TEETH_BY_MODEL[model] || f.teeth) : 0;
    return { fam: fam, en: f.en, ru: f.ru, teeth: teeth, lim: f.lim, walk: f.walk };
  }

  /* Every position of the round, in walking order. k is "POINT.POS", the same
     "point dot position" shape the undercarriage round uses, so the file
     naming, the report and 1C all keep one rule. */
  function walk(unit, cls, model) {
    var p = profileFor(unit, cls, model);
    if (!p) return [];
    var out = [];
    p.walk.forEach(function (step) {
      var list = step.pos === 'n' ? num(p.teeth) : step.pos;
      (list || []).forEach(function (pos) {
        // A point that comes as one — a bucket lip, a moldboard — is keyed on
        // the point alone. "LIP." would carry a dangling separator into the
        // file name, the CSV and 1C for no reason.
        out.push({ k: pos ? step.pt + '.' + pos : step.pt, point: step.pt, pos: pos });
      });
    });
    return out;
  }

  /* The reference for one position, or null where there is none. Shaped exactly
     like WEAR.refFor's result so the millimetre field, the wear bar and the
     bands can be shared rather than reimplemented. GET always wears down, so
     the direction is always "shrink". */
  /* `src` and not `x`. In the undercarriage table `x` means "do not score this"
     — a borrowed or disputed figure that would produce a false percentage. A
     generic GET limit is not that: it is a real, plausible limit that simply did
     not come off the supplier's chart. It is scored, and it says where it came
     from, so a trend exists from day one and nobody mistakes it for gospel.
     When the client supplies the real charts, `src` becomes the chart and the
     word "generic" stops appearing. */
  function refFor(unit, cls, model, point) {
    var p = profileFor(unit, cls, model);
    var L = p && p.lim && p.lim[point];
    if (!L) return null;
    return { n: L.n, c: L.c, d: 'shrink', src: L.src || 'generic' };
  }

  function label(point, lang) {
    var P = POINTS[point];
    return P ? (lang === 'ru' ? P.ru : P.en) : point;
  }
  function toolFor(point) { return (POINTS[point] || {}).tool || ''; }
  function dimFor(point) { return (POINTS[point] || {}).dim || ''; }

  window.GET = {
    points: POINTS,
    families: FAMILIES,
    familyFor: familyFor,
    profileFor: profileFor,
    walk: walk,
    refFor: refFor,
    label: label,
    toolFor: toolFor,
    dimFor: dimFor,
    teethByModel: TEETH_BY_MODEL,
  };
})();
