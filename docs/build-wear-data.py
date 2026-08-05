#!/usr/bin/env python3
"""Generate mobile/wear.js — the undercarriage measurement reference.

Source of truth is docs/wear-limits.json, extracted from the two inspection
workbooks (EX and DZ). That file records, per model and per point, the new and
condemn figures the workbook itself uses, how many tabs agree, and any rival
values found. Nothing here is invented: every number traces to a cell.

Two things this file deliberately does NOT do.

  It does not guess roller counts. The workbook gives every machine eight
  positions whether or not the machine has eight. Rather than substitute one
  guess for another, the count stays at the workbook's eight and the app offers
  "not fitted" as a reason. After a round, the real count is in the data.

  It does not judge a reading against a reference it knows is wrong. Where a
  model's figures are disputed — the SD90 carrying SD32 values, the ZX 330
  carrying two different link pitches — the reference is marked and the app
  records the millimetres without computing a percentage.

Run:  python3 docs/build-wear-data.py
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs', 'wear-limits.json')
OUT = os.path.join(ROOT, 'mobile', 'wear.js')

# ---------------------------------------------------------------- the points
# order is the walk: front of the machine to the back, chain last.
POINTS = [
    dict(code='IDLER',   en='Idler tread',          ru='Направляющее колесо',
         pos='WHEEL', tool='straightedge + depth rule'),
    dict(code='CARRIER', en='Carrier roller',       ru='Поддерживающий каток',
         pos='WHEEL', tool='caliper'),
    dict(code='ROLLER',  en='Track roller',         ru='Опорный каток',
         pos='ROLLERS', tool='caliper'),
    dict(code='SPROCKET',en='Sprocket',             ru='Звёздочка',
         pos='SIDE', tool='tape across the teeth'),
    dict(code='LINKH',   en='Link height',          ru='Высота звена',
         pos='SIDE', tool='caliper'),
    dict(code='BUSH',    en='Bushing OD',           ru='Втулка',
         pos='SIDE', tool='caliper'),
    dict(code='PITCH4',  en='Link pitch — 4 link',  ru='Шаг звеньев, 4 звена',
         pos='SIDE', tool='tape'),
    dict(code='PITCH1',  en='Link pitch — 1 link',  ru='Шаг звеньев, 1 звено',
         pos='SIDE', tool='tape'),
    dict(code='GROUSER', en='Grouser height',       ru='Высота грунтозацепа',
         pos='SIDE', tool='rule'),
]

# register model string -> the model key in wear-limits.json
MODEL_MAP = {
    'CATERPILLAR 336-07':     ('CAT 336',          'exact'),
    'CATERPILLAR D9R':        ('CAT D9R',          'exact'),
    'HITACHI EX1200-6BH':     ('Hitachi ZX 1200',  'exact'),
    'HITACHI EX1200-7BH':     ('Hitachi ZX 1200',  'inherited'),
    'HITACHI ZX280-5G':       ('Hitachi ZX 280',   'exact'),
    'HITACHI ZX330-5G RB':    ('Hitachi ZX 330',   'exact'),
    'HITACHI ZX470LC-5G':     ('Hitachi ZX 470LC', 'exact'),
    'HITACHI ZX470LCR-5G':    ('Hitachi ZX 470LC', 'inherited'),
    'KOMATSU D155A.5':        ('Komatsu D155A',    'exact'),
    'KOMATSU D275.5D':        ('Komatsu 275A',     'exact'),
    'KOMATSU D375A.6':        ('Komatsu D375A',    'exact'),
    'KOMATSU PC800-8E0 (SE)': ('Komatsu PC800SE',  'exact'),
    'LiuGong CLG970E':        ('liuGong 970Е',     'exact'),
    'LiuGong CLG990FHD':      ('liuGong 990F',     'exact'),
    'SHANTUI SD32':           ('Shantui SD32',     'exact'),
    'SHANTUI SD34-B3':        ('Shantui SD34',     'exact'),
    'SHANTUI SD60-C5':        ('Shantui SD60',     'exact'),
    'SHANTUI SD90-C5':        ('Shantui SD90',     'exact'),
    'KOMATSU PC2000-8 BH':    (None,               'none'),
}

# machines with no undercarriage to measure — never offer the round for these
EXCLUDE = {
    'HITACHI ZX210W-5A': 'wheeled',
}

# elevated-sprocket frames: the drive wheel sits above the frame, so the walk
# and the frame drawing are not the same as an oval track
HIGH_DRIVE = {'CAT D9R'}

# why a position carries no number. Кожух / X / П are what inspectors already
# write into the cells today.
REASONS = [
    dict(code='GUARD',   en='Behind the guard',        ru='Кожух'),
    dict(code='NOFIT',   en='Not fitted on this machine', ru='Не установлен'),
    dict(code='PACKED',  en='Packed with mud or ice',  ru='Забито грязью/льдом'),
    dict(code='ACCESS',  en='Cannot reach it',         ru='Нет доступа'),
    dict(code='PARK',    en='Machine parked wrong',    ru='Машина стоит неудобно'),
    dict(code='TOOL',    en='No tool for it',          ru='Нет инструмента'),
    dict(code='OTHER',   en='Other — see comment',     ru='Другое — см. комментарий'),
]

ROLLERS_DEFAULT = 8
DISPUTE_NOTE = {
    'Shantui SD90': 'Carries the SD32 figures. Bushings on both SD90s measure 114-116 mm '
                    'against a 79 mm "new" — impossible. Set a baseline instead.',
    'Hitachi ZX 330': 'Two different link pitches under one model name: 250 mm on EX007/EX019 '
                      'and 216 mm on EX008/EX020. Two undercarriage builds, one label.',
}


def direction(new, con):
    """Which way the number moves. Taken from the figures, never assumed."""
    return 'grow' if con > new else 'shrink'


def build():
    if not os.path.exists(SRC):
        sys.exit('missing ' + SRC)
    raw = json.load(open(SRC, encoding='utf-8'))

    models, warn = {}, []
    sd32 = raw.get('Shantui SD32', {}).get('pts', {})
    for key, m in raw.items():
        pts, disputed = {}, {}
        for code, r in m['pts'].items():
            new, con = r['new'], r['condemn']
            row = {'n': new, 'c': con, 'd': direction(new, con)}
            why = None
            if 'rival' in r:
                why = 'rival'
                row['rivals'] = [{'n': x['new'], 'c': x['condemn']} for x in r['rival']]
            if key == 'Shantui SD90' and code in sd32 \
               and sd32[code]['new'] == new and sd32[code]['condemn'] == con:
                why = 'borrowed'
            if why:
                row['x'] = why                       # x = do not compute a percentage
                disputed[code] = why
            pts[code] = row
        models[key] = {'pts': pts, 'units': m['units'],
                       'rollers': ROLLERS_DEFAULT,
                       'frame': 'highdrive' if key in HIGH_DRIVE else 'oval'}
        if disputed:
            models[key]['disputed'] = disputed
            models[key]['note'] = DISPUTE_NOTE.get(key, '')
        missing = [p['code'] for p in POINTS if p['code'] not in pts]
        if missing:
            models[key]['missing'] = missing
            warn.append(f'{key}: no reference for {", ".join(missing)}')

    mmap = {}
    for reg, (key, via) in MODEL_MAP.items():
        if key and key not in models:
            sys.exit(f'MODEL_MAP points {reg!r} at unknown model {key!r}')
        mmap[reg] = {'m': key, 'via': via}

    data = {
        'built': datetime.date.today().isoformat(),
        'points': POINTS,
        'models': models,
        'map': mmap,
        'exclude': EXCLUDE,
        'reasons': REASONS,
        'rollersDefault': ROLLERS_DEFAULT,
    }

    head = f'''/* Undercarriage wear reference — GENERATED by docs/build-wear-data.py.
   Do not hand-edit; edit docs/wear-limits.json or the build script and re-run.

   Every new/condemn pair here came out of a cell in the EX or DZ workbook.
   Where the workbook's own figures cannot be right, the point is marked `x`
   and the app records the millimetres without scoring them:

     x:"borrowed"  the model's figures belong to a different model
     x:"rival"     two tabs of the same model disagree

   THE REFERENCE IS NOT THE LAST WORD. A baseline measured on this unit when the
   undercarriage was new supersedes the catalogue figure from its date forward —
   see WEAR.refFor(). Old readings keep being judged against whatever reference
   was in force when they were taken, so history never silently changes.

   {len(models)} models, {sum(len(m['pts']) for m in models.values())} reference pairs.
*/
window.WEAR = '''
    js = head + json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=False) + ';\n'
    js += '''
/* ---- reference resolution -------------------------------------------------
   catalogue  the model figures above
   baseline   measured on THIS unit when the part was new, and dated
   override   an engineer's correction, with a reason

   Baselines and overrides arrive as records, exactly like inspections, so they
   sync, they can be voided, and they never rewrite what came before. */
(function (W) {
  W.baselines = [];                       // [{unit,point,pos,n,c,from,by,why}]

  W.setBaselines = function (rows) { W.baselines = rows || []; };

  W.modelFor = function (regModel) {
    var e = W.map[regModel];
    return e && e.m ? W.models[e.m] : null;
  };
  W.eligible = function (regModel) { return !W.exclude[regModel]; };

  /* The reference in force for one unit, one point, one position, on one date. */
  W.refFor = function (unit, regModel, point, pos, atISO) {
    var at = atISO || '9999-12-31', best = null;
    for (var i = 0; i < W.baselines.length; i++) {
      var b = W.baselines[i];
      if (b.unit !== unit || b.point !== point) continue;
      if (b.pos && pos && b.pos !== pos) continue;      // a blank pos covers the whole point
      if (b.from > at) continue;
      if (!best || b.from > best.from) best = b;
    }
    var cat = null, m = W.modelFor(regModel);
    if (m && m.pts[point]) cat = m.pts[point];
    if (best) {
      return { n: best.n, c: (best.c != null ? best.c : (cat ? cat.c : null)),
               d: cat ? cat.d : (best.c > best.n ? 'grow' : 'shrink'),
               src: best.why === 'override' ? 'override' : 'baseline',
               from: best.from, by: best.by,
               /* a baseline replaces "new" only; without a condemn figure from
                  somewhere there is still nothing to score against */
               x: (best.c == null && !cat) ? 'nolimit' : null };
    }
    if (!cat) return null;
    return { n: cat.n, c: cat.c, d: cat.d, src: 'catalogue', x: cat.x || null,
             rivals: cat.rivals || null };
  };

  /* Percent of the way from new to condemn. Null whenever it would be a lie. */
  W.wear = function (ref, mm) {
    if (!ref || mm == null || ref.x) return null;
    if (ref.n == null || ref.c == null) return null;
    var span = ref.c - ref.n;
    if (!span) return null;
    return ((mm - ref.n) / span) * 100;
  };

  /* Does the reading disagree with the reference badly enough to ask again?
     Never a block: the SD90s prove the reference can be the thing that is wrong. */
  W.implausible = function (ref, mm) {
    if (!ref || mm == null || ref.n == null || ref.c == null) return null;
    var tol = Math.max(1, Math.abs(ref.n) * 0.02);
    if (ref.d === 'shrink' && mm > ref.n + tol) return 'over-new';
    if (ref.d === 'grow' && mm < ref.n - tol) return 'under-new';
    var p = W.wear(ref, mm);
    if (p != null && p > 130) return 'past-condemn';
    return null;
  };

  /* ---- how long has it got -------------------------------------------------

     Percent worn says where a part is. It does not say when to order the
     replacement, and that is the number planning actually needs. Two dated
     readings and a condemn limit give it, and — this is the useful part — the
     "new" figure is not required at all. A point whose catalogue figures are
     missing, borrowed or disputed can still be forecast the moment somebody
     supplies a condemn limit.

     What it will not do is guess. It returns a reason instead of a number
     whenever the honest answer is "not yet":

       few       one reading is a dot, not a line
       soon      the interval is too short for the caliper to out-measure itself
       flat      no measurable movement — a rate of zero forecasts forever
       away      moving away from the limit, which is a data problem, not a life
       past      already at or past condemn; the band has said so

     Hours are preferred over days because a machine parked for a month has not
     worn, and SMU is what parts are ordered against. Calendar is the fallback
     when the hour meter was not written down, converted at a stated assumption
     so nobody mistakes it for a measured figure. */
  W.MIN_HOURS = 100;          // below this the caliper's own error dominates
  W.MIN_DAYS  = 14;
  W.HOURS_PER_DAY = 12;       // one shift; only used when SMU is missing

  /* series: [{mm, at, smu}] oldest first, INCLUDING the reading being taken.
     `at` is an ISO date, `smu` the hour meter if it was recorded. */
  W.forecast = function (ref, series) {
    if (!ref || ref.c == null || !series || series.length < 2) return { why: 'few' };
    var pts = series.filter(function (r) { return r && r.mm != null; });
    if (pts.length < 2) return { why: 'few' };

    /* One x axis for the whole series, in hours. SMU if every point has it and
       it advances; otherwise calendar, flagged so the caller can say so. */
    var useSmu = pts.every(function (r) { return r.smu != null && r.smu !== '' && isFinite(Number(r.smu)); });
    if (useSmu) {
      var s0 = Number(pts[0].smu);
      for (var i = 1; i < pts.length; i++) if (Number(pts[i].smu) < s0) { useSmu = false; break; }
    }
    var x = pts.map(function (r) {
      if (useSmu) return Number(r.smu) - Number(pts[0].smu);
      return (Date.parse(r.at + 'T00:00:00Z') - Date.parse(pts[0].at + 'T00:00:00Z'))
             / 86400000 * W.HOURS_PER_DAY;
    });
    var span = x[x.length - 1] - x[0];
    if (!isFinite(span) || span <= 0) return { why: 'soon' };
    if (useSmu ? span < W.MIN_HOURS : span < W.MIN_DAYS * W.HOURS_PER_DAY)
      return { why: 'soon', basis: useSmu ? 'smu' : 'days' };

    /* Least squares over three or more points, because a caliper on a cold
       roller is worth about a millimetre and two points make that millimetre
       the whole trend. Two points get the plain slope, which is all there is. */
    var y = pts.map(function (r) { return Number(r.mm); }), slope;
    if (pts.length >= 3) {
      var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (var j = 0; j < n; j++) { sx += x[j]; sy += y[j]; sxx += x[j] * x[j]; sxy += x[j] * y[j]; }
      var den = n * sxx - sx * sx;
      if (!den) return { why: 'soon' };
      slope = (n * sxy - sx * sy) / den;                 // mm per hour, signed
    } else {
      slope = (y[1] - y[0]) / (x[1] - x[0]);
    }

    var now = y[y.length - 1];
    var down = ref.d !== 'grow';                          // most points wear down
    var rate = down ? -slope : slope;                     // mm/h toward the limit
    var left = down ? (now - ref.c) : (ref.c - now);      // mm still to go

    if (left <= 0) return { why: 'past', basis: useSmu ? 'smu' : 'days' };
    /* A rate under a hundredth of a millimetre per thousand hours is noise
       wearing a decimal point. Treat it as no movement rather than 4,000,000 h. */
    if (rate <= 0.00001) return { why: rate < -0.00001 ? 'away' : 'flat',
                                  basis: useSmu ? 'smu' : 'days' };

    return { hours: left / rate,
             rate: rate * 1000,                           // mm per 1,000 hours
             left: left,
             basis: useSmu ? 'smu' : 'days',
             pts: pts.length,
             fit: pts.length >= 3 ? 'ls' : 'two' };
  };

  /* Every position on one machine, in walk order. */
  W.walk = function (regModel) {
    var m = W.modelFor(regModel), out = [];
    var n = (m && m.rollers) || W.rollersDefault;
    W.points.forEach(function (p) {
      var list = p.pos === 'SIDE' ? ['L', 'R']
               : p.pos === 'WHEEL' ? ['L-OUT', 'L-IN', 'R-OUT', 'R-IN']
               : [];
      if (p.pos === 'ROLLERS') {
        for (var s = 0; s < 2; s++)
          for (var i = 1; i <= n; i++) list.push((s ? 'R' : 'L') + i);
      }
      list.forEach(function (pos) { out.push({ point: p.code, pos: pos, k: p.code + '.' + pos }); });
    });
    return out;
  };
})(window.WEAR);
'''
    open(OUT, 'w', encoding='utf-8').write(js)

    print(f'wrote {OUT}  ({os.path.getsize(OUT)/1024:.0f} KB)')
    print(f'  {len(models)} models, {len(mmap)} register model strings mapped, '
          f'{len(EXCLUDE)} excluded')
    dis = {k: v['disputed'] for k, v in models.items() if 'disputed' in v}
    for k, v in dis.items():
        print(f'  DISPUTED {k}: {v}')
    for w in warn:
        print(f'  gap      {w}')


if __name__ == '__main__':
    build()
