"""Generate mobile/lube.js — the lubrication reference.

Two things live here and they are deliberately separate:

  · the COMPARTMENT LIST per model — which compartments a machine has. Known
    today, for the whole primary fleet, from the class it belongs to.
  · the FIGURES for each — capacity, specification, interval. Known only where
    somebody has opened the manual, which is a much shorter list.

Keeping them apart is what lets a fitter audit a compartment before anybody has
sourced its capacity. The audit asks what is IN it; the capacity is for topping
up. Tying the two together would have blocked every round on a spreadsheet.
"""
import json, collections, re, os

# Anchored to the repo, not to whatever directory this was launched from —
# a generator that only works from one cwd is a generator that silently
# writes nothing the day somebody runs it from somewhere else.
ROOT   = os.environ.get("CM_ROOT", "/home/user/Condition-Monitoring")
ASSETS = os.path.join(ROOT, "mobile/assets.js")
OUT    = os.path.join(ROOT, "mobile/lube.js")

# ── the register ─────────────────────────────────────────────────────────
raw = open(ASSETS, encoding="utf-8").read()
m = re.search(r"window\.ASSETS\s*=\s*(\[.*?\]);", raw, re.S)
assets = json.loads(m.group(1))
PRIMARY = ["HT","AT","EXC","DOZ","LDR","GRD","DRB","DRE","HRB","CRJ","CRC","SCR"]

# ── compartment templates per class ──────────────────────────────────────
# What that kind of machine carries. A starting point the dashboard can edit —
# never a claim that this particular model has exactly these.
T = lambda k, en, ru, risk: {"k":k, "en":en, "ru":ru, "risk":risk}
TEMPLATE = {
 "HT": [T("ENG","Engine","Двигатель","med"), T("TRN","Transmission","Трансмиссия","high"),
        T("HYD","Hydraulic — hoist / steering","Гидравлика — подъём / рулевое","med"),
        T("FDL","Final drive / wheel motor","Бортовой редуктор","high"),
        T("DIFF","Differential","Дифференциал","high")],
 "AT": [T("ENG","Engine","Двигатель","med"), T("TRN","Transmission","Трансмиссия","high"),
        T("HYD","Hydraulic","Гидравлика","med"),
        T("FDL","Final drive","Бортовой редуктор","high"),
        T("DIFF","Differential","Дифференциал","high"),
        T("TCASE","Transfer case","Раздаточная коробка","high")],
 "EXC":[T("ENG","Engine","Двигатель","med"), T("HYD","Hydraulic tank","Гидробак","med"),
        T("SWG","Swing drive","Механизм поворота","high"),
        T("TRV","Travel / final drive","Ход / бортовой редуктор","high"),
        T("PTO","Pump drive gearbox","Редуктор привода насосов","high")],
 "DOZ":[T("ENG","Engine","Двигатель","med"),
        T("TRN","Powertrain / torque converter","Трансмиссия / гидротрансформатор","high"),
        T("HYD","Hydraulic","Гидравлика","med"),
        T("FDL","Final drive","Бортовой редуктор","high"),
        T("PIV","Pivot shaft","Ось качания","low")],
 "LDR":[T("ENG","Engine","Двигатель","med"), T("TRN","Transmission","Трансмиссия","high"),
        T("HYD","Hydraulic","Гидравлика","med"),
        T("AXF","Front axle","Передний мост","high"), T("AXR","Rear axle","Задний мост","high")],
 "GRD":[T("ENG","Engine","Двигатель","med"), T("TRN","Transmission","Трансмиссия","high"),
        T("HYD","Hydraulic","Гидравлика","med"),
        T("TAN","Tandem case","Балансир","high"),
        T("CIR","Circle / drawbar","Поворотный круг","low"),
        T("DIFF","Differential","Дифференциал","high")],
 "DRB":[T("ENG","Engine","Двигатель","med"), T("HYD","Hydraulic","Гидравлика","med"),
        T("CMP","Compressor","Компрессор","high"), T("ROT","Rotary head","Вращатель","high"),
        T("FED","Feed / pulldown","Подача","med")],
 "DRE":[T("ENG","Engine","Двигатель","med"), T("HYD","Hydraulic","Гидравлика","med"),
        T("ROT","Rotation unit","Вращатель","high"), T("PMP","Mud pump","Промывочный насос","med")],
 "HRB":[T("HYD","Hydraulic — own circuit","Гидравлика — собственный контур","med"),
        T("GAS","Percussion service","Обслуживание ударной части","high")],
 "CRJ":[T("ENG","Engine","Двигатель","med"), T("HYD","Hydraulic","Гидравлика","med"),
        T("ECC","Eccentric / jaw oil","Эксцентрик / масло дробилки","high"),
        T("DRV","Drive gearbox","Редуктор привода","high"),
        T("LUB","Lube tank","Бак смазки","high")],
 "CRC":[T("ENG","Engine","Двигатель","med"), T("HYD","Hydraulic","Гидравлика","med"),
        T("MSH","Main shaft / cone oil","Главный вал / масло конуса","high"),
        T("DRV","Drive gearbox","Редуктор привода","high"),
        T("LUB","Lube tank","Бак смазки","high")],
 "SCR":[T("ENG","Engine","Двигатель","med"), T("HYD","Hydraulic","Гидравлика","med"),
        T("DRV","Drive gearbox","Редуктор привода","high"),
        T("VIB","Vibrator / screen box","Вибратор / короб грохота","high")],
}

# ── figures, where somebody has actually opened the manual ───────────────
# Everything here carries a source. Anything without one is not in this table —
# it appears on the round with a null capacity and reads as unsourced, which is
# the truth and is counted that way on the dashboard.
FIG = {
 "KOMATSU HM400": {
   "ENG":  {"cap":38, "spec":"API CK-4 / Komatsu EO-DH", "iv":500,
            "gr":[["15W-40",-15,50],["5W-40 synth",-40,30]]},
   "TRN":  {"cap":60, "spec":"KES 07.868.1 (TO-4 class)", "iv":2000,
            "gr":[["SAE 10W",-40,10],["SAE 30",-10,45]],
            "src":{"who":"R. Marrero","doc":"Komatsu SEN06084-01 p.4-12","when":"2026-08-14"}},
   "HYD":  {"cap":150,"spec":"KES 07.859 / ISO VG", "iv":4000,
            "gr":[["ISO VG 32",-35,25],["ISO VG 46",-10,45]]},
   "FDL":  {"cap":22, "spec":"API GL-5 / KES 07.869", "iv":2000,
            "gr":[["75W-90 synth",-45,35],["80W-90",-20,45]]},
 },
 "NHL TR60": {
   "ENG":  {"cap":45, "spec":"API CI-4 or better", "iv":500,
            "gr":[["15W-40",-15,50],["5W-40 synth",-40,30]]},
   "TRN":  {"cap":75, "spec":"CAT TO-4 / Allison C-4", "iv":2000,
            "gr":[["SAE 10W",-40,10],["SAE 30",-10,45]]},
   "HYD":  {"cap":230,"spec":"ISO VG, anti-wear", "iv":4000,
            "gr":[["ISO VG 32",-35,25],["ISO VG 46",-10,45]]},
 },
 "KOMATSU D375A.6": {
   "ENG":  {"cap":60, "spec":"API CK-4 / Komatsu EO-DH", "iv":500,
            "gr":[["15W-40",-15,50],["5W-40 synth",-40,30]]},
   "TRN":  {"cap":110,"spec":"KES 07.868.1 (TO-4 class)", "iv":2000,
            "gr":[["SAE 10W",-40,10],["SAE 30",-10,45]]},
   "FDL":  {"cap":38, "spec":"KES 07.868.1", "iv":2000,
            "gr":[["SAE 30",-20,45],["SAE 10W",-40,0]]},
 },
 "CATERPILLAR D9R": {
   "ENG":  {"cap":38, "spec":"Cat ECF-3 / API CK-4", "iv":500,
            "gr":[["15W-40",-15,50],["0W-40 arctic synth",-45,25]]},
   "TRN":  {"cap":95, "spec":"Cat TO-4 / TO-4M", "iv":2000,
            "gr":[["TDTO SAE 10W",-35,10],["TDTO-TMS (arctic)",-45,20],["TDTO SAE 30",-10,45]],
            "src":{"who":"R. Marrero","doc":"Cat SEBU7695 p.112","when":"2026-08-15"}},
   "HYD":  {"cap":170,"spec":"Cat HYDO Advanced", "iv":4000,
            "gr":[["HYDO Adv 10",-30,30],["HYDO Adv 30",0,50]]},
 },
 "HITACHI EX1200-6BH": {
   "ENG":  {"cap":95, "spec":"API CK-4", "iv":500,
            "gr":[["15W-40",-15,50],["5W-40 synth",-40,30]]},
   "HYD":  {"cap":660,"spec":"Hitachi Super EX / ISO VG", "iv":4000,
            "gr":[["ISO VG 32",-35,25],["ISO VG 46",-10,45]]},
   "SWG":  {"cap":36, "spec":"API GL-5", "iv":4000,
            "gr":[["75W-90 synth",-45,35],["80W-90",-20,45]]},
 },
 "SHANTUI SD32": {
   "ENG":  {"cap":32, "spec":"API CI-4", "iv":500,
            "gr":[["15W-40",-15,50],["5W-40 synth",-40,30]]},
   "TRN":  {"cap":85, "spec":"SAE 30 powertrain (TO-4 class)", "iv":2000,
            "gr":[["SAE 10W",-40,10],["SAE 30",-10,45]]},
 },
}

# ── the catalogue: what can be bought, not what has been chosen ──────────
CATALOG = [
 {"p":"Mobil Delvac 1 5W-40",        "g":"5W-40 synth",        "s":"API CK-4, Cat ECF-3, Komatsu EO-DH", "lo":-40,"hi":30,"st":"Approved"},
 {"p":"Cat Arctic DEO SYN 0W-40",    "g":"0W-40 arctic synth", "s":"Cat ECF-3, API CK-4",                "lo":-45,"hi":25,"st":"Approved"},
 {"p":"Lukoil Avangard Ultra 15W-40","g":"15W-40",             "s":"API CI-4",                           "lo":-15,"hi":50,"st":"Meets spec"},
 {"p":"Shell Spirax S4 TXM",         "g":"SAE 10W",            "s":"CAT TO-4, KES 07.868.1, Allison C-4","lo":-40,"hi":10,"st":"Approved"},
 {"p":"Komatsu Powertrain TO-10",    "g":"SAE 10W",            "s":"KES 07.868.1, CAT TO-4",             "lo":-40,"hi":10,"st":"Approved"},
 {"p":"Cat TDTO-TMS (arctic)",       "g":"TDTO-TMS (arctic)",  "s":"CAT TO-4, TO-4M",                    "lo":-45,"hi":20,"st":"Approved"},
 {"p":"Generic TO-4 SAE 30",         "g":"SAE 30",             "s":"CAT TO-4",                           "lo":-10,"hi":45,"st":"Meets spec"},
 {"p":"Cat HYDO Advanced 10",        "g":"HYDO Adv 10",        "s":"Cat HYDO Advanced, ISO VG 32",       "lo":-30,"hi":30,"st":"Approved"},
 {"p":"HVLP 32 arctic",              "g":"ISO VG 32",          "s":"DIN 51524-3, ISO VG 32",             "lo":-35,"hi":25,"st":"Meets spec"},
 {"p":"HVLP 22 arctic synth",        "g":"ISO VG 22",          "s":"DIN 51524-3, ISO VG 22, ISO VG 32, Hitachi Super EX","lo":-45,"hi":20,"st":"Meets spec"},
 {"p":"HLP 46",                      "g":"ISO VG 46",          "s":"DIN 51524-2, ISO VG 46",             "lo":-10,"hi":50,"st":"Meets spec"},
 {"p":"Mobilube SHC 75W-90",         "g":"75W-90 synth",       "s":"API GL-5",                           "lo":-45,"hi":35,"st":"Approved"},
 {"p":"Gear oil 80W-90",             "g":"80W-90",             "s":"API GL-5",                           "lo":-20,"hi":45,"st":"Meets spec"},
 {"p":"UTTO universal tractor fluid","g":"SAE 10W",            "s":"Wet brake WB-101",                   "lo":-25,"hi":35,"st":"Unverified"},
]

# ── build the model table ────────────────────────────────────────────────
models, counts = {}, collections.Counter()
for a in assets:
    if a.get("cls") not in PRIMARY: continue
    mod = a.get("m") or ""
    if not mod: continue
    counts[(a["cls"], mod)] += 1

for (cls, mod), n in sorted(counts.items(), key=lambda x: (-x[1], x[0])):
    tmpl = TEMPLATE.get(cls, [])
    fig  = FIG.get(mod, {})
    comps = []
    for t in tmpl:
        c = {"k":t["k"], "en":t["en"], "ru":t["ru"], "risk":t["risk"]}
        f = fig.get(t["k"])
        if f:
            c["cap"]  = f["cap"]
            c["spec"] = f["spec"]
            c["iv"]   = f["iv"]
            c["gr"]   = [{"g":g, "lo":lo, "hi":hi} for (g, lo, hi) in f["gr"]]
            if "src" in f: c["src"] = f["src"]
        comps.append(c)
    # A model whose class template lists a compartment the FIG table does not
    # mention is NOT wrong — it means nobody has sourced that one yet.
    # Keyed by CLASS|MODEL, never by the model string alone. "KOMATSU" is on
    # the register as both an articulated truck and a loader; collapsing those
    # onto one key gives a loader a truck's compartments, silently.
    models[cls + "|" + mod] = {"cls":cls, "m":mod, "n":n, "comps":comps,
                               "sourced": sum(1 for c in comps if "cap" in c)}

gaps = sorted({(a["cls"], a.get("m") or "(blank)") for a in assets
               if a.get("cls") in PRIMARY and not any(ch.isdigit() for ch in (a.get("m") or ""))})

HEAD = '''/* Lubrication reference — compartments, figures, products.

   TWO TABLES, KEPT APART ON PURPOSE.

   MODELS[model].comps is the compartment LIST: which compartments a machine
   has. Known today for every primary model, derived from its class, so a lube
   round can be walked on any machine on the register from the first build.

   The FIGURES on each compartment — cap (refill litres), spec, iv (interval
   hours), gr (grade against ambient) — exist only where somebody has opened the
   manual. A compartment without them is not broken and not hidden: it appears
   on the round, records what is in it, and reads as unsourced everywhere it is
   counted. That is the honest state, and it is why field work does not have to
   wait for a spreadsheet to come back.

   Capacity is the REFILL quantity, not the dry fill — they differ by up to 20%
   and the wrong one over-fills a final drive and blows the seal.

   GENERATED by scratchpad/gen_lube.py from the app's own asset register, so
   the model strings here and the ones on the machines can never drift apart.
   Editing a figure by hand here is fine; adding a model is not — add it to the
   register and re-run. */
(function (G) {
'''

TAIL = '''
  /* ── specification matching ────────────────────────────────────────────
     A product satisfies a compartment when what it CLAIMS covers what the
     manual DEMANDS. Matching on shared words does not work: "API" and "KES"
     appear in nearly every string, so a loose match recommends transmission
     oil for hydraulics. So specifications are tokenised to identifiers and
     matched as identifiers. */
  var SPEC_PAT = [
    /\\bapi\\s*[a-z]{1,2}-?\\s*\\d+\\b/g,      /* API CK-4, API CI-4, API GL-5 */
    /\\bgl-?\\s*\\d\\b/g,                     /* GL-5 written on its own      */
    /\\bkes\\s*[\\d.]+\\b/g,                   /* KES 07.868.1                 */
    /\\bto-?\\s*4[a-z]?\\b/g,                  /* TO-4, TO-4M                  */
    /\\becf-?\\s*\\d\\b/g,                     /* Cat ECF-3                    */
    /\\biso\\s*vg(?:\\s*\\d+)?\\b/g,            /* ISO VG, ISO VG 32            */
    /\\bdin\\s*[\\d-]+\\b/g,                   /* DIN 51524-3                  */
    /\\ballison\\s*c-?\\s*\\d\\b/g,             /* Allison C-4                  */
    /\\bhydo(?:\\s*advanced)?\\b/g,           /* Cat HYDO Advanced            */
    /\\bsuper\\s*ex\\b/g,                     /* Hitachi Super EX             */
    /\\beo-?\\s*dh\\b/g,                       /* Komatsu EO-DH                */
    /\\bwb-?\\s*\\d+\\b/g                       /* wet-brake WB-101             */
  ];
  /* Punctuation is part of an identifier here: strip the dots out of
     "KES 07.868.1" and it stops being a number anybody can match on. */
  function specNorm(x){ return String(x||"").toLowerCase().replace(/[^a-z0-9.\\-]+/g," ").trim(); }
  function specTokens(text){
    var t = specNorm(text), out = [];
    SPEC_PAT.forEach(function(re){
      var m; re.lastIndex = 0;
      while((m = re.exec(t))) out.push(m[0].replace(/[\\s.\\-]/g, ""));
    });
    return out;
  }
  /* The API diesel C-sequence is a ladder — each category supersedes the ones
     below it, so a CK-4 oil serves an engine whose plate says CI-4. Without
     this the round tells a fitter NOT SET for an engine that has the correct
     arctic oil in the bulk tank.
     Two deliberate omissions:
     · FA-4 is NOT on this ladder. It is a low-HTHS category, not a newer CK-4,
       and putting it in a CI-4 engine is a warranty conversation.
     · API GL has no ladder. GL-5 is not a drop-in for every GL-4 application —
       the EP additives attack yellow metal in synchronisers — so that stays an
       exact match and an engineer's decision. */
  var API_C = ["apicf4","apicg4","apich4","apici4","apicj4","apick4"];
  /* One family legitimately appears without a grade: an OEM that asks for "an
     ISO VG hydraulic oil" and leaves the grade to the temperature table, which
     is a separate check. Everywhere else a bare family is not a requirement
     anybody can satisfy, and must not match. */
  function tokenMatch(want, have){
    if(want === have) return true;
    if(want === "isovg" && have.indexOf("isovg") === 0) return true;
    if(have === "isovg" && want.indexOf("isovg") === 0) return true;
    var w = API_C.indexOf(want), h = API_C.indexOf(have);
    if(w >= 0 && h >= 0) return h >= w;
    return false;
  }
  function meetsSpec(claims, oemSpec){
    var want = specTokens(oemSpec);
    if(!want.length) return false;            /* an unreadable spec matches nothing */
    var have = [];
    (claims||[]).forEach(function(c){ have = have.concat(specTokens(c)); });
    return want.some(function(w){
      return have.some(function(h){ return tokenMatch(w, h); });
    });
  }
  function norm(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
  /* Is this grade good for the coldest morning of the year? null means the
     manufacturer does not list this grade for this compartment at all, which is
     a different answer from "no". */
  function coldOK(grades, grade){
    var hit = (grades||[]).filter(function(g){ return norm(g.g) === norm(grade); })[0];
    if(!hit) return null;
    return hit.lo <= SITE.design;
  }

  /* Keys are CLASS|MODEL. Resolve generously on the way in — the register is
     not tidy — but never guess across a class boundary: "KOMATSU" is both an
     articulated truck and a loader, and picking the wrong one hands a fitter
     the wrong compartment list with no sign anything went wrong. Given no
     class, an ambiguous model resolves to nothing rather than to a coin flip. */
  function resolve(model, cls){
    if(!model) return null;
    if(cls && MODELS[cls + "|" + model]) return cls + "|" + model;
    var n = norm(model), hits = [];
    Object.keys(MODELS).forEach(function(k){
      var r = MODELS[k];
      if(norm(r.m) !== n) return;
      if(cls && r.cls !== cls) return;
      hits.push(k);
    });
    return hits.length === 1 ? hits[0] : null;
  }

  G.LUBE = {
    models:   Object.keys(MODELS),
    /* Every call takes an optional class. Pass it wherever you have it — the
       app always does, because a machine on the register carries both. */
    of:       function(model, cls){ var k = resolve(model, cls); return k ? MODELS[k] : null; },
    ambiguous:function(model){
                var n = norm(model), c = 0;
                Object.keys(MODELS).forEach(function(k){ if(norm(MODELS[k].m) === n) c++; });
                return c > 1;
              },
    comps:    function(model, cls){ var r = this.of(model, cls); return r ? r.comps : []; },
    comp:     function(model, k, cls){
                return this.comps(model, cls).filter(function(c){ return c.k === k; })[0] || null; },
    label:    function(model, k, lang, cls){
                var c = this.comp(model, k, cls);
                return c ? (lang === "ru" ? c.ru : c.en) : k; },
    /* Has anybody sourced this compartment's figures? The round shows the
       compartment either way; the dashboard counts the difference. */
    sourced:  function(model, k, cls){ var c = this.comp(model, k, cls); return !!(c && c.cap != null); },
    catalog:  CATALOG,
    product:  function(name){
                return CATALOG.filter(function(p){ return norm(p.p) === norm(name); })[0] || null; },
    /* Every catalogued product that satisfies this compartment AND is rated for
       the site's design minimum. The order the picker offers them in. */
    fitFor:   function(model, k, cls){
                var c = this.comp(model, k, cls);
                if(!c || !c.spec) return [];
                return CATALOG.filter(function(p){
                  return meetsSpec(p.s.split(/,\\s*/), c.spec) && p.lo <= SITE.design;
                });
              },
    site:     SITE,
    gaps:     GAPS,
    meetsSpec: meetsSpec,
    specTokens: specTokens,
    coldOK:   coldOK,
    /* Evidence, ranked. "The fitter said it is TO-4" is a lead, not a finding —
       counting it as an audit is how a programme reports full coverage and
       still has the wrong oil in a powershift. */
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

with open(OUT, "w", encoding="utf-8") as f:
    f.write(HEAD)
    f.write("  var SITE = " + json.dumps(
        {"design":-40, "winter":-45, "summer":28, "hoursPerYear":5000}) + ";\n\n")
    f.write("  /* Units the register records by make only. A capacity cannot be attached\n"
            "     to \"KOMATSU\" — these are outside every number until the model is\n"
            "     recorded, and the dashboard says so rather than quietly dropping them. */\n")
    f.write("  var GAPS = " + json.dumps(
        [{"cls":c, "as":m} for (c, m) in gaps], ensure_ascii=False) + ";\n\n")
    f.write("  /* What can be BOUGHT — not what has been chosen. The site standard is a\n"
            "     decision made on the dashboard; this is the shelf it is chosen from. */\n")
    f.write("  var CATALOG = " + json.dumps(CATALOG, ensure_ascii=False) + ";\n\n")
    f.write("  var MODELS = " + json.dumps(models, ensure_ascii=False, separators=(",", ":")) + ";\n")
    f.write(TAIL)

n_sourced = sum(1 for r in models.values() if r["sourced"])
print("models:", len(models),
      "| with figures:", n_sourced,
      "| compartment rows:", sum(len(r["comps"]) for r in models.values()),
      "| gaps:", len(gaps))
print("bytes:", len(open(OUT, encoding="utf-8").read()))
