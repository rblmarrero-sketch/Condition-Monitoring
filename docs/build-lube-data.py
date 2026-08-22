"""Generate mobile/lube.js from the site's own Lubrication Masterlist.

   docs/source/Lube_Matrix_Oil_Analysis_Sampling.xlsm  ->  mobile/lube.js

THE CODES AND THE FIGURES ARE THE CLIENT'S, NOT OURS.
The component codes (1, 2, 3, 3A, 4A, 4AL … 16) are already on the printed
forms in the ute, on the per-machine sampling sheets, and in the fitters'
heads. An invented scheme would have bought nothing and cost all three. Same
for the capacities and the change intervals: they came out of OEM manuals, and
anything this script "improves" is a number somebody will later have to defend.

WHAT THIS SCRIPT DOES NOT DO is decide anything. Where the masterlist is
ambiguous or self-contradictory it carries the contradiction through and flags
it, because a generator that quietly resolves the client's data is a generator
that hides the one thing they need to see.

Run: python3 docs/build-lube-data.py
"""
import json, os, re, sys, warnings, collections
warnings.filterwarnings("ignore")
from openpyxl import load_workbook

ROOT = os.environ.get("CM_ROOT", "/home/user/Condition-Monitoring")
SRC  = os.path.join(ROOT, "docs/source/Lube_Matrix_Oil_Analysis_Sampling.xlsm")
ASSETS = os.path.join(ROOT, "mobile/assets.js")
OUT  = os.path.join(ROOT, "mobile/lube.js")
REPORT = os.path.join(ROOT, "docs/lube-import-report.txt")
SHEET = "Lube Frequency BMSK"

# ── the site's products ──────────────────────────────────────────────────
# Read from row 1 of the masterlist, columns M..T. NOT from the Lube Legend
# tab: its column letters are stale — it calls column N the hydraulic oil, and
# column N is the TO-4. The sheet is the live document, so the sheet wins.
#
# TYPE is what the fitter sees on the wall. The site already colour-codes by
# type — blue engine, red hydraulic, yellow compressor, green rock-drill, cream
# grease — and that is the right choice for a poster: eight colours to learn,
# and the colour survives a change of supplier. Colour by PRODUCT would have to
# be relearned the day a drum changes.
PRODUCT_COL = list(range(13, 21))            # M..T
TYPE_BY_CODE = {
    "0W40":       ("engine",     "Engine oil",      "Моторное"),
    "5W30":       ("powertrain", "Powertrain / TO-4","Трансмиссионное TO-4"),
    "NEXVG32":    ("hydraulic",  "Hydraulic",       "Гидравлическое"),
    "75W140":     ("gear",       "Gear oil",        "Трансмиссионное"),
    "EXVG32":     ("rockdrill",  "Rock-drill oil",  "Буровое"),
    "Grease":     ("grease",     "Grease",          "Смазка"),
    "Coolant":    ("coolant",    "Coolant",         "Антифриз"),
    "Compressor": ("compressor", "Compressor oil",  "Компрессорное"),
}
# The site's own colours, taken from the fills already used on the sheet.
# Kept as data because they are the client's convention, not a design choice.
TYPE_HUE = {
    "engine":     "#0070c0",   # blue   — the fill on the Engine column
    "hydraulic":  "#e34948",   # red    — the fill on the Hydraulic column
    "compressor": "#eda100",   # yellow — the fill on the Compressor column
    "rockdrill":  "#00b050",   # green  — the fill on the DTH hammer column
    "grease":     "#8a6d3b",   # cream on the sheet, darkened so it reads on paper
    "gear":       "#4a3aa7",
    "powertrain": "#1baf7a",
    "coolant":    "#2a78d6",
}

# ── which product serves which component ─────────────────────────────────
# From the Lube Legend tab's own component table, by TYPE rather than by its
# stale column letters.
LEGEND_TYPE = {
    "1":"engine", "2":"gear", "3":"hydraulic", "3A":"gear",
    "4":"gear","4A":"gear","4B":"gear","4C":"gear","4E":"gear","4F":"gear",
    "4AL":"gear","4AR":"gear","4BL":"gear","4BR":"gear","4CL":"gear","4CR":"gear",
    "4I":"gear","4J":"gear","4K":"gear","4L":"gear","4M":"gear","4N":"gear",
    "4O":"gear","4P":"grease",
    "5":"gear","5A":"gear","5B":"gear",
    "6":"gear","6A":"gear","6B":"gear","6C":"gear","6D":"gear","6E":"grease",
    "7":"gear","7B":"gear",
    "8":"compressor", "9":"coolant", "10":None,
    "11A":"gear","11B":"gear","11C":"gear","11D":"rockdrill","11E":"grease",
    "12A":"gear","12B":"gear","12C":"gear","12D":"gear","12E":"gear",
    "12F":"gear","12G":"gear","12H":"gear",
    "13":"grease",
    "14A":"gear","14B":"gear","14C":"gear","14E":"gear",
    "15":"wirerope", "16":"opengear",
}
# Flagged, not resolved. The Legend files the transmission under gear oil, but
# the OEM codes on the sheet for those same compartments read TO10 / TO-4 SAE
# 50, and the site stocks a TO-4. Transmission and final drive are different
# friction chemistry — a wet clutch needs the TO-4 frictional properties and a
# gear set does not — so this is an engineer's decision, not an importer's.
QUESTION_TYPES = {"2"}

# ── model names ──────────────────────────────────────────────────────────
# One canonical name per machine, and it is the MASTERLIST's, because that is
# the name on the sampling forms. The register's spellings are aliases onto it.
# Confirmed by R. Marrero: the 27 articulated trucks filed as "KOMATSU", and
# the one filed as "KOMATSU HM400", are all HM400-3MO.
CANON = {
    "KOMATSU":            {"AT": "Komatsu HM400-3MO"},
    "KOMATSU HM400":      {"AT": "Komatsu HM400-3MO"},
}

# Register spelling -> masterlist spelling, where the two documents name the
# same machine differently and no general rule can safely bridge them.
#
# EVERY LINE HERE IS A JUDGEMENT, not a rule, and every one is printed in
# docs/lube-import-report.txt so it can be argued with. They are here rather
# than in the matcher because a fuzzy rule loose enough to catch "D275.5D" =
# "D275A-5" is loose enough to catch things that are not the same machine, and
# this project has already put a loader on a truck's compartments once.
ALIAS = {
    "KOMATSU D275.5D":          "Komatsu D275A-5",
    "Boart Longyear LF-90D":    "Boart Longyear LF90D Drill",
    "HITACHI ZX330-5G RB":      "Hitachi ZX 330-5G",
    "HITACHI ZX470LC-5G":       "Hitachi ZX 470",
    "HITACHI ZX470LCR-5G":      "Hitachi ZX 470",
    "KOMATSU PC2000-8 BH":      "KOMATSU PC2000-8",
    "KOMATSU PC800-8E0 (SE)":   "Komatsu PC800-8EO",
    "LiuGong CLG990FHD":        "Luigong 990FHD",
    "TLP-4M":                   "TLP-4M-030 (ТЛП-4М-030)",
    "CHSDM DZ-98V.00100-111":   "CHSDM DZ-98V",
    # NOT aliased on purpose, and listed so the omission is visible:
    #   CATERPILLAR 336-07  vs  CAT 336D — a 336-07 is not a 336D.
    #   HITROCK HMB4500 / HB3500 / HB4500+ — no breaker in the masterlist yet.
}

# ── matching a masterlist name to a register name ────────────────────────
# The same machine is spelled several ways across the two documents:
# Liugong / LiuGong / Luigong, CAT / CATERPILLAR, PC800-8EO with a letter O
# against PC800-8E0 with a zero, LF90D against LF-90D, and a trailing
# description ("Dump Truck", "Excavator") on one side and not the other.
#
# Guessing across those is how a loader gets a truck's compartments, so the
# rule is narrow: strip punctuation, fold the manufacturer synonyms, drop the
# words that describe what a machine IS rather than which model it is, and
# treat letter-O and zero as the same character. What survives has to match
# EXACTLY. Anything that does not is reported, never guessed.
MAKE_SYN = {
    "CATERPILLAR": "CAT", "LUIGONG": "LIUGONG", "KOMATSU": "KOMATSU",
    "HITACHI": "HITACHI", "SHANTUI": "SHANTUI", "BOARTLONGYEAR": "LONGYEAR",
    "BOART": "", "MCCLOSKEY": "MCCLOSKEY", "NHL": "NHL",
}
DESCRIPTORS = [
    "DUMPTRUCK","TRACTORTRUCK","TRUCKDUMP","TRUCKTRACTOR","TRUCKBOOM",
    "TRUCKWATER","TRUCKTANKER","TRUCKMECHANIC","TRACKDRILL","TRACKLOADER",
    "SKIDSTEERLOADER","SKIDSTEER","TELESCOPICHANDLER","TYREHANDLER",
    "CYLINDERHANDLER","WHEELCRANE","TRUCKCRANE","CRANEMOBILE","MOBILECRANE",
    "ALLTERRAINVEHICLE","WHEELDOZER","STEAMGENERATOR","INDUSTRIALHEATER",
    "WELDINGMACHINE","KONTAINERLOADER","CONTAINERLOADER","EMERGENCYEQUIPMENT",
    "EXCAVATOR","COMPACTOR","ROLLERDRUM","MANLIFT","GENERATOR","GENSET",
    "CRANE","LOADER","DOZER","DRILL","TRUCK","PICKUP","CREWBUS","BUS",
    "FIRETRUCK","FORKLIFT","TRACTOR",
]
def _base(s):
    s = re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
    for k, v in MAKE_SYN.items():
        if s.startswith(k): s = v + s[len(k):]; break
    return s
def keys(s):
    """Every normal form this name could legitimately be written as."""
    b = _base(s)
    out = {b}
    for d in DESCRIPTORS:
        if b.endswith(d) and len(b) > len(d) + 2: out.add(b[:-len(d)])
        if b.startswith(d) and len(b) > len(d) + 2: out.add(b[len(d):])
    more = set()
    for k in out:
        more.add(k.replace("O", "0"))          # PC800-8EO  vs  PC800-8E0
    out |= more
    return {k for k in out if len(k) >= 4}

def norm(s):
    return _base(s)

def read_products(ws):
    out = []
    for c in PRODUCT_COL:
        name = str(ws.cell(1, c).value or "").strip()
        code = str(ws.cell(2, c).value or "").strip()
        if not name or not code: continue
        t = TYPE_BY_CODE.get(code)
        if not t:
            print("  ! unknown product code in row 2:", code); continue
        out.append({"p": name, "code": code, "t": t[0], "en": t[1], "ru": t[2],
                    "hue": TYPE_HUE.get(t[0], "#8b969c")})
    return out

def read_components(ws):
    """Every component triple: the code is in row 2 over the CAPACITY column,
       the next column is the interval and the one after is the OEM string."""
    comps = []
    for c in range(23, ws.max_column + 1):
        code = ws.cell(2, c).value
        if code is None: continue
        name = str(ws.cell(1, c).value or "").replace("\n", " ").strip()
        if not name or name.lower().startswith("none"): continue
        if str(ws.cell(1, c + 1).value or "").strip().lower() != "frequency of replacements":
            continue                       # not a component triple
        en, ru = split_bilingual(name)
        comps.append({"k": str(code).strip(), "en": en, "ru": ru, "col": c})
    return comps

CYR = re.compile(r"[А-Яа-яЁё]")
def split_bilingual(s):
    """The headers carry both languages in one cell: "Engine/ORS Двигатель".
       Split on the first Cyrillic character so each language gets its own
       field, rather than every label being shown twice on a bilingual app."""
    s = re.sub(r"\s+", " ", s).strip()
    m = CYR.search(s)
    if not m: return s, s
    en = s[:m.start()].strip(" /–-—")
    ru = s[m.start():].strip()
    return (en or s), (ru or s)

def main():
    if not os.path.exists(SRC):
        sys.exit("masterlist not found: " + SRC)
    wbv = load_workbook(SRC, data_only=True)
    wbf = load_workbook(SRC)                      # a second pass, for the fills
    wv, wf = wbv[SHEET], wbf[SHEET]

    products = read_products(wv)
    comps    = read_components(wv)
    notes, questions = [], []

    # the register, so masterlist rows can be tied to real machines
    raw = open(ASSETS, encoding="utf-8").read()
    assets = json.loads(re.search(r"window\.ASSETS\s*=\s*(\[.*?\]);", raw, re.S).group(1))
    reg = collections.defaultdict(set)            # normal form -> {(cls, model)}
    counts = collections.Counter()
    for a in assets:
        m, cls = a.get("m") or "", a.get("cls") or ""
        if not m: continue
        canon = CANON.get(m.upper(), {}).get(cls) or ALIAS.get(m)
        for k in keys(canon or m): reg[k].add((cls, m))
        counts[(cls, m)] += 1

    PURPLE, TEAL = "FFCC99FF", "FF00B0B0"
    models, unmatched, matched = {}, [], []
    for r in range(3, wv.max_row + 1):
        label = wv.cell(r, 2).value
        if not label or str(label).strip() in ("Fleet", "TOTAL"): continue
        label = re.sub(r"\s+", " ", str(label)).strip()

        got = []
        for cp in comps:
            cap  = wv.cell(r, cp["col"]).value
            freq = wv.cell(r, cp["col"] + 1).value
            oem  = wv.cell(r, cp["col"] + 2).value
            if cap in (None, 0, "") and not oem: continue
            fill = wf.cell(r, cp["col"]).fill
            rgb  = fill.fgColor.rgb if (fill and fill.fgColor) else None
            rgb  = rgb if isinstance(rgb, str) else None
            cm   = wf.cell(r, cp["col"]).comment

            c = {"k": cp["k"], "en": cp["en"], "ru": cp["ru"]}
            if isinstance(cap, (int, float)) and cap: c["cap"] = round(float(cap), 2)
            if isinstance(freq, (int, float)) and freq: c["iv"] = int(freq)
            if oem: c["oem"] = re.sub(r"\s+", " ", str(oem)).strip()
            ty = LEGEND_TYPE.get(cp["k"])
            if ty: c["t"] = ty
            # The site's own flags, carried across as data instead of as a fill
            # colour nobody outside Excel can see.
            if rgb == PURPLE or (cm and "VERIFY" in str(cm.text).upper()):
                c["verify"] = 1
            if rgb == TEAL or ("cap" in c and "iv" not in c):
                c["noiv"] = 1
            if str(c.get("oem", "")).upper() == "VERIFY":
                c["verify"] = 1
            if cp["k"] in QUESTION_TYPES and c.get("oem"):
                c["ask"] = 1
            got.append(c)
        if not got: continue

        hits = set()
        for k in keys(label): hits |= reg.get(k, set())
        seen = sorted(hits)
        if seen: matched.append((label, sorted({r for _, r in seen})))
        if not seen:
            unmatched.append(label)
            models["?|" + label] = {"cls": "?", "m": label, "n": 0, "regs": [], "comps": got,
                                    "sourced": sum(1 for c in got if "cap" in c)}
            continue
        # ONE entry per class per machine, keyed by the MASTERLIST's name.
        # The register spells the same truck three ways — "KOMATSU", "KOMATSU
        # HM400", and nothing at all — and keeping one entry per spelling means
        # the canonical name resolves to two rivals and therefore to neither,
        # while the unit count is split across them. They are one machine, so
        # they are one row, and every spelling is an alias onto it.
        by_cls = collections.defaultdict(list)
        for (cls, regname) in seen: by_cls[cls].append(regname)
        for cls, regnames in by_cls.items():
            key = cls + "|" + label
            n = sum(counts[(cls, rn)] for rn in regnames)
            models[key] = {"cls": cls, "m": label, "regs": sorted(regnames),
                           "n": n, "comps": got,
                           "sourced": sum(1 for c in got if "cap" in c)}

    # ── what the import could not answer ─────────────────────────────────
    oems = collections.Counter()
    verify = noiv = ask = 0
    for M in models.values():
        for c in M["comps"]:
            if c.get("oem"): oems[c["oem"]] += 1
            verify += c.get("verify", 0); noiv += c.get("noiv", 0); ask += c.get("ask", 0)

    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("LUBRICATION MASTERLIST — IMPORT REPORT\n")
        f.write("=" * 62 + "\n\n")
        f.write("Generated by docs/build-lube-data.py. Everything here is a question\n")
        f.write("for the reliability engineer, not a fault in the import.\n\n")
        f.write("models imported            %5d\n" % len(models))
        f.write("compartment entries        %5d\n" % sum(len(m["comps"]) for m in models.values()))
        f.write("distinct OEM spec strings  %5d   <- the standardisation problem\n" % len(oems))
        f.write("flagged VERIFY             %5d\n" % verify)
        f.write("missing change interval    %5d\n" % noiv)
        f.write("transmission oil to decide %5d\n\n" % ask)
        f.write("MODELS IN THE MASTERLIST WITH NO MACHINE ON THE REGISTER (%d)\n" % len(unmatched))
        f.write("They are imported and carry no unit count, so they cost nothing\n")
        f.write("and appear the moment a matching machine is registered.\n")
        for u in sorted(unmatched): f.write("   " + u + "\n")
        f.write("\nEXPLICIT ALIASES — every one a judgement, check them (%d)\n" % len(ALIAS))
        for k, v in sorted(ALIAS.items()):
            f.write("   register %-28s = masterlist %s\n" % (k, v))
        f.write("\nNAMES MATCHED ACROSS THE TWO DOCUMENTS (%d)\n" % len(matched))
        f.write("Every one of these is a judgement the importer made. Check them.\n")
        for lab, regs in sorted(matched):
            if [lab] != regs:
                f.write("   %-42s = %s\n" % (lab, ", ".join(regs)))
        f.write("\nOEM SPEC STRINGS, MOST USED FIRST\n")
        for k, v in oems.most_common(): f.write("  %4d  %s\n" % (v, k))

    HEAD = '''/* Lubrication reference — GENERATED from the site's own masterlist.

   Source: docs/source/Lube_Matrix_Oil_Analysis_Sampling.xlsm, sheet
   "Lube Frequency BMSK". Rebuild with docs/build-lube-data.py.
   Import questions: docs/lube-import-report.txt

   THE CODES AND THE FIGURES ARE THE CLIENT'S. The component codes (1, 2, 3,
   3A, 4AL … 16) are on the printed sampling forms and in the fitters' heads;
   the capacities and intervals came out of OEM manuals. Nothing here is
   invented, and where the masterlist contradicts itself the contradiction is
   carried through and flagged rather than quietly resolved.

   FLAGS, which were cell colours in Excel and are data here:
     verify  the figure is a placeholder to confirm against the manual (purple)
     noiv    a capacity with no change interval, so it totals nothing (teal)
     ask     the Legend files this under gear oil but the OEM code reads TO-4;
             wet-clutch friction chemistry is an engineer's decision

   THE FIELD NEVER SEES `oem`. It is 91 different strings for eight products —
   Japanese full-width, Russian, brand names, multi-line — and asking a fitter
   in gloves to read it is how the wrong oil goes in. It is kept because it is
   what the standard is DECIDED against, on the dashboard, once. */
(function (G) {
'''

    TAIL = '''
  /* Colour is by LUBRICANT TYPE, which is the site's own convention: blue
     engine, red hydraulic, yellow compressor, green rock-drill. Eight colours
     to learn, and they survive a change of supplier — colouring by product
     would have to be relearned the day a drum changes. */
  function typeOf(k){ return (COMP_TYPE[k] || null); }
  function productFor(k){
    var t = typeOf(k); if(!t) return null;
    return CATALOG.filter(function(p){ return p.t === t; })[0] || null;
  }
  function norm(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
  function resolve(model, cls){
    if(!model) return null;
    if(cls && MODELS[cls + "|" + model]) return cls + "|" + model;
    var n = norm(model), hits = [];
    Object.keys(MODELS).forEach(function(k){
      var r = MODELS[k];
      /* The canonical name, or any spelling the register uses for it. */
      var names = [r.m].concat(r.regs || []);
      if(!names.some(function(x){ return norm(x) === n; })) return;
      if(cls && r.cls !== cls) return;
      hits.push(k);
    });
    return hits.length === 1 ? hits[0] : null;
  }

  G.LUBE = {
    models:   Object.keys(MODELS),
    of:       function(model, cls){ var k = resolve(model, cls); return k ? MODELS[k] : null; },
    ambiguous:function(model){
                var n = norm(model), c = 0;
                Object.keys(MODELS).forEach(function(k){
                  var r = MODELS[k];
                  if([r.m].concat(r.regs || []).some(function(x){ return norm(x) === n; })) c++;
                });
                return c > 1;
              },
    comps:    function(model, cls){ var r = this.of(model, cls); return r ? r.comps : []; },
    comp:     function(model, k, cls){
                return this.comps(model, cls).filter(function(c){ return c.k === k; })[0] || null; },
    label:    function(model, k, lang, cls){
                var c = this.comp(model, k, cls);
                return c ? (lang === "ru" ? c.ru : c.en) : k; },
    /* Sourced means a capacity that is not a placeholder. A purple cell in the
       masterlist is a typical figure somebody filled in to make the totals
       work, and counting it as known is how a guess becomes a fact. */
    sourced:  function(model, k, cls){
                var c = this.comp(model, k, cls);
                return !!(c && c.cap != null && !c.verify); },
    catalog:  CATALOG,
    product:  function(name){
                return CATALOG.filter(function(p){ return norm(p.p) === norm(name); })[0] || null; },
    /* What belongs in this compartment: one product, by type. The whole point
       of the exercise — the fitter is never offered a choice of eight. */
    forComp:  function(model, k, cls){
                var c = this.comp(model, k, cls);
                return c ? productFor(c.k) : null; },
    typeOf:   typeOf,
    types:    TYPES,
    hue:      function(t){ return (TYPES[t] && TYPES[t].hue) || "#8b969c"; },
    site:     SITE,
    /* Everything the masterlist could not answer, as a work list rather than a
       cell colour: figures to confirm, intervals that are missing, and the
       transmission-oil question. */
    gaps:     function(){
                var out = { verify:[], noiv:[], ask:[] };
                Object.keys(MODELS).forEach(function(k){
                  MODELS[k].comps.forEach(function(c){
                    ["verify","noiv","ask"].forEach(function(f){
                      if(c[f]) out[f].push({ key:k, m:MODELS[k].m, k:c.k,
                                             en:c.en, cap:c.cap, oem:c.oem });
                    });
                  });
                });
                return out;
              },
    EVID: [
      { k:"label", rank:2, en:"Label photographed", ru:"Фото этикетки" },
      { k:"batch", rank:2, en:"Tank / pump batch",  ru:"Партия из ёмкости" },
      { k:"told",  rank:1, en:"Reported, not shown",ru:"Со слов" }
    ],
    evidRank: function(k){
      var e = this.EVID.filter(function(x){ return x.k === k; })[0];
      return e ? e.rank : 0;
    }
  };
})(window);
'''

    comp_type = {k: v for k, v in LEGEND_TYPE.items() if v}
    types = {}
    for p in products:
        types[p["t"]] = {"en": p["en"], "ru": p["ru"], "hue": p["hue"]}
    types.setdefault("wirerope", {"en":"Wire rope lube","ru":"Смазка канатов","hue":"#5b686f"})
    types.setdefault("opengear", {"en":"Open gear grease","ru":"Смазка открытых передач","hue":"#8c5a2b"})

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(HEAD)
        f.write("  var SITE = " + json.dumps(
            {"design": -40, "winter": -45, "summer": 28, "hoursPerYear": 5000,
             "units": len(assets)}) + ";\n\n")
        f.write("  /* The eight products actually on site, from row 1 of the masterlist. */\n")
        f.write("  var CATALOG = " + json.dumps(products, ensure_ascii=False) + ";\n\n")
        f.write("  var TYPES = " + json.dumps(types, ensure_ascii=False) + ";\n\n")
        f.write("  var COMP_TYPE = " + json.dumps(comp_type, ensure_ascii=False) + ";\n\n")
        f.write("  var MODELS = " + json.dumps(models, ensure_ascii=False,
                                               separators=(",", ":")) + ";\n")
        f.write(TAIL)

    print("models          %5d" % len(models))
    print("entries         %5d" % sum(len(m["comps"]) for m in models.values()))
    print("products        %5d" % len(products))
    print("OEM strings     %5d" % len(oems))
    print("VERIFY flags    %5d" % verify)
    print("missing interval%5d" % noiv)
    print("unmatched models%5d  (see docs/lube-import-report.txt)" % len(unmatched))
    print("bytes           %5d" % len(open(OUT, encoding="utf-8").read()))

main()
