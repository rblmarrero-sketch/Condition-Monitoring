"""Generate mobile/lube.js from the site's own Lubrication Masterlist.

   docs/source/Lube_Matrix_Oil_Analysis_Sampling.xlsm  ->  mobile/lube.js
                                                        docs/lube-import-report.txt

THE CODES AND THE FIGURES ARE THE CLIENT'S, NOT OURS.
The component codes (1, 2, 3, 3A, 4A, 4AL … 16) are already on the printed
forms in the ute, on the per-machine sampling sheets, and in the fitters'
heads. An invented scheme would have bought nothing and cost all three. Same
for the capacities and the change intervals: they came out of OEM manuals, and
anything this script "improves" is a number somebody will later have to defend.

WHAT THIS SCRIPT DOES NOT DO is decide anything. Where the workbook disagrees
with itself — the matrix says one oil, the sampling form another, "Using table
New" a third and the sample log a fourth — every answer is carried through
with where it came from, and the compartment goes on the "needs decision"
list. The office decides on the dashboard (the lube master), once, and the
decision is recorded there. A generator that quietly resolves the client's
data is a generator that hides the one thing they need to see.

THE LAYOUT (October 2026 workbook, 319 columns). The matrix is read by its
own headers, never by column letter: row 1 names a component over its
CAPACITY column and the role of every column after it ("Frequency of
replacements", "Actual oil", "Oem"); row 2 carries the component code. The
products are M..AE (plus wire rope KY and open gear KZ): row 1 is
"primary / alternative", row 2 the grade code, and the row-2 fill is the
colour the site paints that grade in. The Lube Legend's column letters are
three revisions stale and are not used for anything but the curated English
component names.

Run: python3 docs/build-lube-data.py
"""
import json, os, re, sys, warnings, collections, colorsys, datetime
warnings.filterwarnings("ignore")
from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string as CI

ROOT = os.environ.get("CM_ROOT", "/home/user/Condition-Monitoring")
SRC  = os.path.join(ROOT, "docs/source/Lube_Matrix_Oil_Analysis_Sampling.xlsm")
ASSETS = os.path.join(ROOT, "mobile/assets.js")
OUT  = os.path.join(ROOT, "mobile/lube.js")
REPORT = os.path.join(ROOT, "docs/lube-import-report.txt")
SHEET = "Lube Frequency BMSK"

# ── colours ──────────────────────────────────────────────────────────────
# Theme colours of this workbook (xl/theme/theme1.xml), with Excel's tint rule,
# so a grade filled "theme 3, +0.8" reads as the light blue the sheet shows.
THEME = ["FFFFFF", "000000", "EEECE1", "1F497D", "4F81BD",
         "C0504D", "9BBB59", "8064A2", "4BACC6", "F79646"]
def _tint(hexc, t):
    r, g, b = [int(hexc[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = l * (1 + t) if t < 0 else l * (1 - t) + t
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return "%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))
def fill_hex(cell):
    try:
        f = cell.fill
        if f is None or f.fill_type is None: return None
        fg = f.fgColor
    except AttributeError:
        return None
    if fg.type == "rgb" and isinstance(fg.rgb, str): return fg.rgb[-6:].upper()
    if fg.type == "theme" and fg.theme is not None and fg.theme < len(THEME):
        return _tint(THEME[fg.theme], fg.tint or 0)
    return None

# ── the grades ───────────────────────────────────────────────────────────
# A GRADE is the row-2 code over a product column: 0W40, 5W30, VG32 … It is the
# unit the consolidation is decided in — one approved product and one
# alternative per grade — and it is what the workbook already writes in every
# "Actual oil" cell, so a compartment's grade is a fact read off the sheet, not
# inferred. TYPE is the coarser family the verdict judges by: engine oil in a
# final drive is the failure that destroys a machine, whichever brand it was.
GRADE_INFO = {
    "0W40":         ("engine",     "Engine oil 0W-40",               "Моторное масло 0W-40"),
    "5W30":         ("powertrain", "Powertrain TO-4 5W-30",          "Трансмиссионное TO-4 5W-30"),
    "VG32":         ("hydraulic",  "Hydraulic HVLP 32",              "Гидравлическое HVLP 32"),
    "ZF VG32":      ("hydraulic",  "Hydraulic HVLP 32 (ZF-approved)", "Гидравлическое HVLP 32 (допуск ZF)"),
    "75W90":        ("gear",       "Gear oil 75W-90",                "Трансмиссионное 75W-90"),
    "75W140":       ("gear",       "Gear oil 75W-140",               "Трансмиссионное 75W-140"),
    "ATF":          ("atf",        "Automatic transmission fluid",   "Жидкость для АКПП (ATF)"),
    "PVG32":        ("rockdrill",  "Rock-drill / pneumatic oil 32",  "Масло для пневмоинструмента 32"),
    "PVG100":       ("rockdrill",  "Rock-drill / pneumatic oil 100", "Масло для пневмоинструмента 100"),
    "ISO 150":      ("gear",       "Industrial gear oil ISO 150",    "Редукторное ISO 150"),
    "ISO 220":      ("gear",       "Industrial gear oil ISO 220",    "Редукторное ISO 220"),
    "MOLY EP 1":    ("grease",     "Grease Moly EP 1",               "Смазка Moly EP 1"),
    "MOLY EP 00/0": ("grease",     "Grease Moly EP 00/0",            "Смазка Moly EP 00/0"),
    "EP 0/00 150":  ("grease",     "Grease EP 0/00 (150)",           "Смазка EP 0/00 (150)"),
    "EP 1.5 460":   ("grease",     "Grease EP 1.5 (460)",            "Смазка EP 1.5 (460)"),
    "OG":           ("opengear",   "Open gear lubricant",            "Смазка открытых передач"),
    "Coolant":      ("coolant",    "Coolant G12+ 40/60",             "Антифриз G12+ 40/60"),
    "AC Compressor":("acoil",      "A/C compressor oil",             "Масло компрессора кондиционера"),
    "Compressor":   ("compressor", "Air compressor oil 46",          "Компрессорное масло 46"),
    "Wire Rope":    ("wirerope",   "Wire rope lubricant",            "Смазка канатов"),
    "Open Gear":    ("opengear",   "Open gear grease",               "Смазка открытых передач"),
}
# Spellings of a grade code the workbook uses in an "Actual oil" cell.
GRADE_SPELL = {"EP 0/00": "EP 0/00 150"}
SELF_GRADE = {"15": "Wire Rope", "16": "Open Gear"}
PRODUCT_COLS = list(range(CI("M"), CI("AE") + 1)) + [CI("KY"), CI("KZ")]

TYPE_INFO = {
    # Hues are the site's own convention (Template indicator / Indicator tabs):
    # blue engine, green powertrain, red hydraulic, purple gear, cyan coolant,
    # yellow compressor. The rest were never filled on their sheet and come off
    # the rendered matrix.
    "engine":     ("Engine oil",          "Моторное",            "#0070C0"),
    "powertrain": ("Powertrain / TO-4",   "Трансмиссионное TO-4", "#00B050"),
    "hydraulic":  ("Hydraulic",           "Гидравлическое",      "#FF0000"),
    "gear":       ("Gear oil",            "Трансмиссионное",     "#7030A0"),
    "atf":        ("ATF",                 "ATF",                 "#4BACC6"),
    "rockdrill":  ("Rock-drill oil",      "Буровое",             "#948A54"),
    "grease":     ("Grease",              "Смазка",              "#C4BD97"),
    "opengear":   ("Open gear grease",    "Смазка открытых передач", "#8C5A2B"),
    "wirerope":   ("Wire rope lube",      "Смазка канатов",      "#5B686F"),
    "coolant":    ("Coolant",             "Антифриз",            "#00B0F0"),
    "compressor": ("Compressor oil",      "Компрессорное",       "#FFFF00"),
    "acoil":      ("A/C compressor oil",  "Масло кондиционера",  "#FFFFCC"),
}

# Brand is a SECOND dimension, and on their sheet it is the cell border rather
# than the fill. Consequence follows FUNCTION, so function gets the fill; brand
# changes when a tender is won, so it gets the edge.
BRAND_HUE = {
    "Exsoil": "#FFC000", "Lemarc": "#D24E51", "Shell": "#4BACC6",
    "Nexxol": "#000000", "Katana": "#808080", "Teboil": "#2E75B6",
}
def brand_of(name):
    u = str(name or "").upper().replace("XSOIL", "EXSOIL").replace("EEXSOIL", "EXSOIL")
    for b in BRAND_HUE:
        if b.upper() in u: return b
    return None

# ── free text -> grade ────────────────────────────────────────────────────
# The sample log writes "H32", the forms "5W30", Using table New the product
# name in full. One rule turns any of them into a grade code, so the four
# sources can be compared at all. Ordered: the specific before the general.
OIL_RULES = [
    (r"\bZF\b",                                  "ZF VG32"),
    (r"P-?MATIC|PNEUMOGUARD\s*32|\bPVG\s*32",    "PVG32"),
    (r"PNEUMOGUARD\s*100|\bPVG\s*100",           "PVG100"),
    (r"ND-?OIL|\bAC\s*COMPRESSOR",               "AC Compressor"),
    (r"\bVDL\b|^\s*46\s*$|COMPRESSOR",           "Compressor"),
    (r"\b0\s*W\s*-?\s*40\b",                     "0W40"),
    (r"\b5\s*W\s*-?\s*30\b|\bTO-?\s?4\b",        "5W30"),
    (r"\b75\s*W\s*-?\s*140\b",                   "75W140"),
    (r"\b75\s*W\s*-?\s*90\b",                    "75W90"),
    (r"\bATF\b|DEXRON",                          "ATF"),
    (r"\bH\s?32\b|HVLP\s*-?\s*32|\bVG\s*32\b|TELLUS|NEXXOL", "VG32"),
    (r"\b(ISO|CLP|OMALA|CARTERRA)\b.*\b150\b|\b150\b.*\b(CLP|OMALA)\b", "ISO 150"),
    (r"\b(ISO|CLP|OMALA|CARTERRA)\b.*\b220\b",   "ISO 220"),
    (r"\bAF\b|ANTIFREEZE|ANTI-?FREEZE|COOLANT|G12|FROSTGUARD", "Coolant"),
]
def oil_code(text):
    """A grade code for any way the workbook writes an oil, or the text itself
       (upper-cased) when it is not a site grade — 10W40 is a real finding, not
       a parse failure, and must come out as 10W40."""
    if text is None: return None
    s = re.sub(r"\s+", " ", str(text)).strip()
    if not s: return None
    if s in GRADE_INFO: return s
    if s in GRADE_SPELL: return GRADE_SPELL[s]
    u = s.upper().replace("РАО", "PAO")
    for rx, g in OIL_RULES:
        if re.search(rx, u): return g
    m = re.search(r"\b(\d{1,2})\s*W\s*-?\s*(\d{2,3})\b", u)
    return ("%sW%s" % m.groups()) if m else u

# ── which product serves which component, where the sheet names no grade ────
LEGEND_TYPE = {
    # 3A Steering: confirmed by R. Marrero that steering is hydraulic.
    "1":"engine", "1AL":"engine", "1AR":"engine",
    "2":"gear", "3":"hydraulic", "3A":"hydraulic",
    "3BL":"hydraulic","3BR":"hydraulic","3CL":"hydraulic","3CR":"hydraulic",
    "4":"gear","4A":"gear","4B":"gear","4C":"gear","4E":"gear","4F":"gear",
    "4AL":"gear","4AR":"gear","4BL":"gear","4BR":"gear","4CL":"gear","4CR":"gear",
    "4I":"gear","4J":"gear","4K":"gear","4L":"gear","4M":"gear","4N":"gear",
    "4O":"gear","4P":"grease","4MDE":"grease","4MNDE":"grease",
    "5":"gear","5A":"gear","5B":"gear",
    "6":"gear","6A":"gear","6B":"gear","6C":"gear","6D":"gear","6E":"grease",
    "7":"gear","7B":"gear",
    "8":"compressor", "9":"coolant", "10":None,
    "11A":"gear","11B":"gear","11C":"gear","11D":"rockdrill","11E":"grease",
    "12A":"gear","12B":"gear","12C":"gear","12D":"gear","12E":"gear",
    "12F":"gear","12G":"gear","12H":"gear","12CL":"gear","12CR":"gear",
    "13":"grease",
    "14A":"gear","14B":"gear","14C":"gear","14E":"gear",
    "15":"wirerope", "16":"opengear",
}
# A transmission with no grade on the sheet is still a question: wet-clutch
# TO-4 and GL-5 gear oil are different chemistry for different reasons.
QUESTION_TYPES = {"2"}
# The type the sheet's grade says, against what the OEM code reads. GL-5 in a
# wet brake glazes the discs; that disagreement is an engineer's, not ours.
CONTRADICTS = {
    "gear": re.compile(r"\bTO-?\s?4\b|\bTO\s?10\b|\bTO\s?30\b|\bTOS|"
                       r"\bHO-|\bHVLP\b|\bHYDRAUL", re.I),
}

# ── sample-point codes ─────────────────────────────────────────────────────
# The sample log and the per-machine forms write some compartments under a
# code the matrix does not use on that model: a D9R's final drives are "4E/4F"
# on the form and 4BL/4BR in the matrix; a swing gearbox is "6C" in the log and
# 6B in the matrix; a multi-engine machine writes "1A", "1.1", "1.2". The
# matrix codes are the official ones (decided 2026-10-04). An alias resolves
# ONLY onto a code the model actually carries, in the order listed, so "4E"
# stays 4E on a machine whose matrix row has a real 4E.
CODE_ALIAS = {
    "4E": ["4BL", "4AL"], "4F": ["4BR", "4AR"],
    "6C": ["6B"], "6B": ["6C"],
    "1A": ["1"], "1.1": ["1"], "1.2": ["1"],
}

# The rotary head: code 7 on a drill whose row has the drivetrain codes and no
# column of its own. Carried with no figures, flagged to confirm.
DRILL_CODES = {"11A", "11B", "11C", "11D", "7B"}
ROTARY_HEAD = {"k": "7", "en": "Rotary Head", "ru": "Вращатель",
               "t": "gear", "verify": 1}

# ── model names ──────────────────────────────────────────────────────────
CANON = {
    "KOMATSU":            {"AT": "Komatsu HM400-3MO"},
    "KOMATSU HM400":      {"AT": "Komatsu HM400-3MO"},
}
SPELL = {"LUIGONG": "LiuGong", "LIUGONG": "LiuGong"}
def spell(label):
    return re.sub(r"[A-Za-z]+",
                  lambda m: SPELL.get(m.group(0).upper(), m.group(0)), label)
# Register spelling -> masterlist spelling. EVERY LINE HERE IS A JUDGEMENT, and
# every one is printed in docs/lube-import-report.txt so it can be argued with.
ALIAS = {
    "KOMATSU D275.5D":          "Komatsu D275A-5",
    "Boart Longyear LF-90D":    "Boart Longyear LF90D Drill",
    "HITACHI ZX330-5G RB":      "Hitachi ZX 330-5G",
    "HITACHI ZX470LC-5G":       "Hitachi ZX 470",
    "HITACHI ZX470LCR-5G":      "Hitachi ZX 470",
    "KOMATSU PC2000-8 BH":      "KOMATSU PC2000-8",
    "KOMATSU PC800-8E0 (SE)":   "Komatsu PC800-8EO",
    "LiuGong CLG990FHD":        "LiuGong 990FHD",
    "TLP-4M":                   "TLP-4M-030 (ТЛП-4М-030)",
    "CHSDM DZ-98V.00100-111":   "CHSDM DZ-98V",
    "CLGF330":                             "LiuGong CLGF330",
    "ELCOS GE.CU.030/027.SS+011":          "Elcos Genset GE.CU.030/027.SS+011",
    "TEREX AC220-5":                       "TEREX DEMAG AC220-5 CRANE, MOBILE",
    "TEREX AC350-6":                       "TEREX DEMAG AC350-6 CRANE, MOBILE",
    "ZRT400":                              "ZOOMLION ZRT400",
    "IVECO 473916":                        "IVECO AMT 473916 EMERGENCY EQUIPMENT FIRE-TRUCK",
    "MTGE3":                               "IVECO-AMT MTGE3 Tractor Truck",
    "JCB VM200D":                          "JCB VM200D COMPACTOR, ROLLER DRUM",
    "SX-105XC":                            "TEREX GENIE SX-105XC Manlift",
    "SX-125XC":                            "TEREX GENIE SX-125XC Manlift",
    "ZRS4531":                             "ZOOMLION ZRS4531 KONTAINER LOADER",
    "ZOOMLION ZCC2600":                    "ZOOMLION ZCC2600 260 TON",
    "Sinomach TTC025G2-V":                 "SINOMACH TTC025G2 Truck Crane",
    # NOT aliased on purpose:
    #   CATERPILLAR 336-07  vs  CAT 336D — a 336-07 is not a 336D.
    #   HITROCK HMB4500 / HB3500 / HB4500+ — no breaker in the masterlist yet.
}
UNDECIDED = {
    "TOYOTA HILUX": {
        "why": "The register files 70 of them under one name and does not say "
               "which are automatic; the masterlist splits AT from MT. Aliasing "
               "either way puts the wrong transmission oil in some of them.",
        "need": "the transmission recorded per unit in the register",
        "by": "R. Marrero", "at": "2026-08-26",
    },
}
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
    b = _base(s)
    out = {b}
    for d in DESCRIPTORS:
        if b.endswith(d) and len(b) > len(d) + 2: out.add(b[:-len(d)])
        if b.startswith(d) and len(b) > len(d) + 2: out.add(b[len(d):])
    out |= {k.replace("O", "0") for k in out}
    return {k for k in out if len(k) >= 4}

CYR = re.compile(r"[А-Яа-яЁё]")
def split_bilingual(s):
    s = re.sub(r"\s+", " ", s).strip()
    m = CYR.search(s)
    if not m: return s, s
    en = s[:m.start()].strip(" /–-—")
    ru = s[m.start():].strip()
    return (en or s), (ru or s)
def clean(v):
    if isinstance(v, str):
        v = re.sub(r"\s+", " ", v).strip()
        return v or None
    return v
def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

def read_legend(wb):
    if "Lube Legend" not in wb.sheetnames: return {}
    ws, out = wb["Lube Legend"], {}
    for r in range(1, ws.max_row + 1):
        code = str(ws.cell(r, 1).value or "").strip()
        name = str(ws.cell(r, 2).value or "").strip()
        if not code or not name: continue
        if not re.match(r"^\d{1,2}[A-Z]{0,4}$", code): continue
        name = re.sub(r"\s*\*+\s*$", "", name)
        name = re.sub(r"\s*\([^)]*[А-Яа-яЁё][^)]*\)", "", name)
        name = re.sub(r"\s*\(unified[^)]*\)", "", name, flags=re.I)
        name = re.sub(r"\s+", " ", name).strip()
        if name and code not in out: out[code] = name
    return out

def read_grades(wv, wf):
    """Every product column: its grade code, primary and alternative product
       and the colour the site paints it in."""
    out = collections.OrderedDict()
    for c in PRODUCT_COLS:
        name = clean(wv.cell(1, c).value)
        code = clean(wv.cell(2, c).value)
        if not name or not code: continue
        code = str(code)
        info = GRADE_INFO.get(code)
        if not info:
            print("  ! unknown grade code in row 2:", code); continue
        verify = 1 if re.search(r"\bVERIFY\b", name, re.I) else 0
        nm = re.sub(r"\s*\(\s*VERIFY[^)]*\)", "", name, flags=re.I).strip()
        parts = [p.strip() for p in re.split(r"\s+/\s+", nm) if p.strip()]
        g = {"code": code, "t": info[0], "en": info[1], "ru": info[2],
             "hex": "#" + (fill_hex(wf.cell(2, c)) or "D9D9D9"),
             "primary": parts[0] if parts else "",
             "alt": parts[1] if len(parts) > 1 else ""}
        if verify: g["verify"] = 1
        out[code] = g
    return out

def read_groups(wv):
    """Component groups by their own headers. The capacity column carries the
       name (row 1) and the code (row 2); the role of each following column is
       its row-1 word. Fuel (code 10) is not a lubricant and is not read."""
    ROLE = {"frequency of replacements": "iv", "actual oil": "g", "actual grease": "g",
            "actual grease/oil": "g", "oem": "oem"}
    first, last = CI("AG"), CI("KY") - 1
    starts = [c for c in range(first, last + 1)
              if clean(wv.cell(1, c).value)
              and str(clean(wv.cell(1, c).value)).lower() not in ROLE]
    groups = []
    for i, s in enumerate(starts):
        e = (starts[i + 1] if i + 1 < len(starts) else last + 1) - 1
        cols = {"cap": s}
        for c in range(s + 1, e + 1):
            r = ROLE.get(str(clean(wv.cell(1, c).value) or "").lower())
            if r and r not in cols: cols[r] = c
        code = wv.cell(2, s).value
        name = clean(str(wv.cell(1, s).value))
        if code is None: continue
        if str(name).lower().startswith("none"): continue
        en, ru = split_bilingual(name)
        groups.append({"k": str(code).strip(), "en": en, "ru": ru, "cols": cols})
    return groups

# ── the per-machine sampling forms, and "Using table New" ──────────────────
# Both carry a refill litre figure where the matrix carries the full system:
# what goes back in at a change, against what the system holds. Both are
# real numbers for different questions, so both are kept, each with its source.
FORM_SHEETS = ["All Equipment", "HM400-3MO", "NHL TR60", "PC800-8EO", "PC2000-8",
               "D9R", "EX1200", "K D275", "KGD825-2"]
FORM_MODEL = {
    "HM400-3MO": ["Komatsu HM400-3MO"], "NHL TR60": ["NHL TR60"],
    "PC800-8EO": ["Komatsu PC800-8EO"], "PC2000-8": ["KOMATSU PC2000-8"],
    "D9R": ["CAT D9R"], "EX1200": ["Hitachi EX 1200-6BH", "Hitachi EX 1200-7BH"],
    "K D275": ["Komatsu D275A-5"], "KGD825-2": ["Komatsu GD825A-2"],
}
UT_MODEL = {
    "Komatsu HM400-3M0": "Komatsu HM400-3MO", "Komatsu D-155A": "Komatsu D155A-5",
    "Komatsu D-275A": "Komatsu D275A-5", "Komatsu D-375A": "Komatsu D375A-6",
    "Komatsu GD-825A": "Komatsu GD825A-2", "Komatsu PC-800": "Komatsu PC800-8EO",
    "Komatsu PC-2000": "KOMATSU PC2000-8", "CAT 160K": "Cat 160K",
    "Hyundai HL770-9S": "Hyundai HL770-9S", "LiuGong CLG970E": "LiuGong CLG970E",
    "LiuGong 990FHD": "LiuGong 990FHD", "LiuGong 4260": "LiuGong CLG4260D",
    "NHL TR60": "NHL TR60", "Shantui SD32": "Shantui SD32",
    "Shantui SD34-B3": "Shantui SD34-B3", "Shantui SD60-C5": "Shantui SD60-C5",
    "Shantui SD90-C5": "Shantui SD90-C5",
}
UT_SYSTEMS = {"B": "1", "C": "3", "D": "2", "H": "9"}   # engine, hydraulic, transmission, cooling

def read_forms(wv):
    out = {}                                   # form name -> [(code, oil, litres)]
    for name in FORM_SHEETS:
        if name not in wv.sheetnames: continue
        ws = wv[name]; hdr = None
        for r in range(1, 25):
            for c in range(1, ws.max_column + 1):
                v = ws.cell(r, c).value
                if isinstance(v, str) and v.startswith("Sample Point"): hdr = r
        if not hdr: continue
        vol_col = None
        for c in range(1, ws.max_column + 1):
            if re.search(r"Liters|Объём", str(ws.cell(hdr, c).value or "")):
                vol_col = c
        rows = []
        for r in range(hdr + 2, ws.max_row + 1):
            a, pt = ws.cell(r, 1).value, clean(ws.cell(r, 3).value)
            if str(clean(a) or "").startswith("Remarks") or str(pt or "").startswith("Remarks"): break
            if a in (None, ""): continue
            oil = clean(ws.cell(r, 4).value)
            vol = num(ws.cell(r, vol_col).value) if vol_col else None
            rows.append((str(a).strip(), oil, vol))
        out[name] = rows
    return out

def read_using_table(wv, sheet="Using table New"):
    out = {}                                   # matrix label -> {code: (oil text, litres)}
    if sheet not in wv.sheetnames: return out
    ws = wv[sheet]
    for r in range(4, ws.max_row + 1):
        m = clean(ws.cell(r, 1).value)
        if not m: continue
        mm = re.match(r"(.*?)\s*\((\w+)\)\s*$", m)
        label = UT_MODEL.get(mm.group(1) if mm else m)
        if not label: continue
        sys_ = {}
        for col, code in UT_SYSTEMS.items():
            v = ws[col + str(r)].value
            if v is None: continue
            s = str(v)
            lit = [float(x.replace(",", "."))
                   for x in re.findall(r"(\d+(?:[.,]\d+)?)\s*(?:l|л)\b", s, re.I)]
            if not lit and num(v): lit = [float(v)]
            if not lit:
                lit = [float(x.replace(",", ".")) for x in re.findall(r"\(\s*(\d+(?:[.,]\d+)?)\s*\)", s)]
            prod = re.split(r"\(", s)[0].strip() if isinstance(v, str) else None
            sys_[code] = (prod, lit[0] if len(lit) == 1 else None)
        out[label] = sys_
    return out

def read_samples(wv):
    """The sample log: unit, code, oil. Only what the sample says went in."""
    out = []
    if "Data" not in wv.sheetnames: return out
    ws = wv["Data"]
    for r in range(2, ws.max_row + 1):
        unit = clean(ws.cell(r, 3).value)
        pt = clean(ws.cell(r, 5).value)
        oil = clean(ws.cell(r, 9).value)
        if not unit or not pt: continue
        code = str(pt).split(" ")[0]
        out.append((str(unit).upper(), code, str(oil) if oil is not None else None))
    return out

def main():
    if not os.path.exists(SRC):
        sys.exit("masterlist not found: " + SRC)
    wbv = load_workbook(SRC, data_only=True)
    wbf = load_workbook(SRC)
    wv, wf = wbv[SHEET], wbf[SHEET]
    HOURS = num(wv["L1"].value) or 7000
    SAMPLE_H = num(wv["K2"].value) or 500

    grades = read_grades(wv, wf)
    groups = read_groups(wv)
    legend = read_legend(wbv)
    renamed, differ, rotary, dups = [], [], [], []
    for cp in groups:
        want = legend.get(cp["k"])
        if not want: continue
        if CYR.search(cp["en"] or "") or not (cp["en"] or "").strip():
            renamed.append((cp["k"], cp["en"], want)); cp["en"] = want
        elif cp["en"].strip().lower() != want.strip().lower():
            differ.append((cp["k"], cp["en"], want))

    raw = open(ASSETS, encoding="utf-8").read()
    assets = json.loads(re.search(r"window\.ASSETS\s*=\s*(\[.*?\]);", raw, re.S).group(1))
    reg = collections.defaultdict(set)
    counts = collections.Counter()
    unit_of = {}
    for a in assets:
        m, cls = a.get("m") or "", a.get("cls") or ""
        if a.get("n"): unit_of[str(a["n"]).upper()] = (cls, m)
        if not m: continue
        canon = CANON.get(m.upper(), {}).get(cls) or ALIAS.get(m)
        for k in keys(canon or m): reg[k].add((cls, m))
        counts[(cls, m)] += 1

    PURPLE, TEAL = "CC99FF", "00B0B0"
    models, unmatched, matched, unknown_grade = {}, [], [], collections.Counter()
    by_label = {}                     # label -> merged row (duplicates folded)
    order = []
    for r in range(3, wv.max_row + 1):
        label = wv.cell(r, 2).value
        if not label or str(label).strip() in ("Fleet", "TOTAL"): continue
        label = spell(re.sub(r"\s+", " ", str(label)).strip())
        got = []
        for cp in groups:
            cols = cp["cols"]
            cap = wv.cell(r, cols["cap"]).value
            freq = wv.cell(r, cols["iv"]).value if "iv" in cols else None
            oem = wv.cell(r, cols["oem"]).value if "oem" in cols else None
            gr = wv.cell(r, cols["g"]).value if "g" in cols else None
            if cap in (None, 0, "") and not oem and not gr: continue
            c = {"k": cp["k"], "en": cp["en"], "ru": cp["ru"]}
            if num(cap): c["cap"] = round(float(cap), 2)
            if num(freq): c["iv"] = int(freq)
            if oem: c["oem"] = re.sub(r"\s+", " ", str(oem)).strip()
            g = clean(str(gr)) if gr is not None else None
            if cp["k"] == "9" and not g: g = "Coolant"     # no Actual column; one coolant
            # Wire rope (15) and open gear (16) have no Actual column either; the
            # sheet's own KY/KZ columns are those two, both "(VERIFY product)".
            if not g and cp["k"] in SELF_GRADE: g = SELF_GRADE[cp["k"]]
            if g:
                g = GRADE_SPELL.get(g, g)
                if g in grades: c["g"] = g
                else: unknown_grade[g] += 1; c["gx"] = g
            ty = grades[c["g"]]["t"] if c.get("g") else LEGEND_TYPE.get(cp["k"])
            if ty: c["t"] = ty
            fills = [fill_hex(wf.cell(r, cc)) for cc in cols.values()]
            cm = wf.cell(r, cols["cap"]).comment
            if PURPLE in fills or (cm and "VERIFY" in str(cm.text).upper()): c["verify"] = 1
            if TEAL in fills or ("cap" in c and "iv" not in c): c["noiv"] = 1
            if str(c.get("oem", "")).upper() == "VERIFY": c["verify"] = 1
            if cp["k"] in QUESTION_TYPES and c.get("oem") and not c.get("g"): c["ask"] = 1
            rx = CONTRADICTS.get(c.get("t"))
            if rx and c.get("oem") and rx.search(c["oem"]): c["ask"] = 1
            got.append(c)
        if not got: continue
        units = [int(num(wv.cell(r, cc).value) or 0) for cc in (3, 4, 5)]
        fleet = fill_hex(wf.cell(r, 2)) == "92D050"
        if label in by_label:
            row = by_label[label]
            have = {c["k"] for c in row["comps"]}
            row["comps"] += [c for c in got if c["k"] not in have]
            row["u"] = [a + b for a, b in zip(row["u"], units)]
            row["fleet"] = row["fleet"] or fleet
            dups.append((label, r))
            continue
        by_label[label] = {"comps": got, "u": units, "fleet": fleet,
                           "cat": clean(wv.cell(r, 1).value) or ""}
        order.append(label)

    for label in order:
        row = by_label[label]
        got = row["comps"]
        if any(c["k"] in DRILL_CODES for c in got) and not any(c["k"] == "7" for c in got):
            got.append(dict(ROTARY_HEAD)); rotary.append(label)
        extra = {"u": row["u"]}
        if row["fleet"]: extra["fleet"] = 1
        if row["cat"]: extra["cat"] = row["cat"]
        hits = set()
        for k in keys(label): hits |= reg.get(k, set())
        seen = sorted(hits)
        if seen: matched.append((label, sorted({x for _, x in seen})))
        if not seen:
            unmatched.append(label)
            models["?|" + label] = dict({"cls": "?", "m": label, "n": 0, "regs": [], "comps": got,
                                         "sourced": sum(1 for c in got if "cap" in c)}, **extra)
            continue
        by_cls = collections.defaultdict(list)
        for (cls, regname) in seen: by_cls[cls].append(regname)
        for cls, regnames in by_cls.items():
            n = sum(counts[(cls, rn)] for rn in regnames)
            models[cls + "|" + label] = dict({"cls": cls, "m": label, "regs": sorted(regnames),
                                              "n": n, "comps": got,
                                              "sourced": sum(1 for c in got if "cap" in c)}, **extra)

    # ── the other three sources, for refill figures and for disagreements ──
    label_comps = {label: {c["k"]: c for c in by_label[label]["comps"]} for label in order}
    def resolve_code(label, code):
        have = label_comps.get(label, {})
        if code in have: return code
        for alt in CODE_ALIAS.get(code, []):
            if alt in have: return alt
        return None
    seen_src = collections.defaultdict(lambda: collections.defaultdict(list))   # (label,k) -> grade -> [src]
    forms = read_forms(wbv)
    for fname, rows in forms.items():
        for label in FORM_MODEL.get(fname, []):
            if label not in label_comps: continue
            for code, oil, vol in rows:
                k = resolve_code(label, code)
                if not k: continue
                c = label_comps[label][k]
                if vol and "rf" not in c:
                    c["rf"] = round(float(vol), 2); c["rfs"] = "form " + fname
                g = oil_code(oil)
                if g: seen_src[(label, k)][g].append("form " + fname)
    ut = read_using_table(wbv)
    for label, sysmap in ut.items():
        if label not in label_comps: continue
        for code, (prod, lit) in sysmap.items():
            k = resolve_code(label, code)
            if not k: continue
            c = label_comps[label][k]
            if lit and "rf" not in c:
                c["rf"] = round(float(lit), 2); c["rfs"] = "Using table New"
            g = "Coolant" if code == "9" else oil_code(prod)
            if g: seen_src[(label, k)][g].append("Using table New")
    reg_label = {}
    for key, M in models.items():
        for rn in M["regs"]: reg_label[(M["cls"], rn)] = M["m"]
    samples = read_samples(wbv)
    sample_hits = collections.defaultdict(collections.Counter)
    unaliased = collections.Counter()
    for unit, code, oil in samples:
        cm = unit_of.get(unit)
        label = reg_label.get(cm) if cm else None
        if not label: continue
        k = resolve_code(label, code)
        if not k: unaliased[code] += 1; continue
        g = oil_code(oil)
        if g: sample_hits[(label, k)][g] += 1
    for (label, k), cnt in sample_hits.items():
        for g, n in cnt.items():
            seen_src[(label, k)][g].append("sample log ×%d" % n)

    decide = []
    for label in order:
        units = by_label[label]["u"][0]
        for k, c in label_comps[label].items():
            src = seen_src.get((label, k))
            cur = c.get("g") or c.get("gx")
            if not src: continue
            others = {g for g in src if g != cur}
            if not others: continue
            opts = []
            if cur: opts.append({"g": cur, "src": ["matrix"] + src.get(cur, [])})
            for g in sorted(others):
                opts.append({"g": g, "src": src[g]})
            decide.append({"id": label + "|" + k, "m": label, "k": k, "en": c["en"],
                           "cur": cur or "", "units": units, "opts": opts})
    decide.sort(key=lambda d: (-d["units"], d["m"], d["k"]))

    # ── demand, from the sheet's own units and hours ──────────────────────
    demand = collections.Counter()
    for label in order:
        u26 = by_label[label]["u"][0]
        if not u26: continue
        for c in by_label[label]["comps"]:
            if c.get("g") and c.get("cap") and c.get("iv"):
                demand[c["g"]] += c["cap"] / c["iv"] * HOURS * u26
    for g in grades:
        grades[g]["lyr"] = int(round(demand.get(g, 0)))
        grades[g]["comps"] = sum(1 for L in order for c in by_label[L]["comps"] if c.get("g") == g)

    # ── report ─────────────────────────────────────────────────────────────
    oems = collections.Counter()
    verify = noiv = ask = 0
    for M in models.values():
        for c in M["comps"]:
            if c.get("oem"): oems[c["oem"]] += 1
            verify += c.get("verify", 0); noiv += c.get("noiv", 0); ask += c.get("ask", 0)
    used_codes = {c["k"] for m in models.values() for c in m["comps"]}
    unused_codes = sorted(k for k in legend if k not in used_codes)
    with open(REPORT, "w", encoding="utf-8") as f:
        w = f.write
        w("LUBRICATION MASTERLIST — IMPORT REPORT\n" + "=" * 62 + "\n\n")
        w("Generated by docs/build-lube-data.py. Everything here is a question\n"
          "for the lubrication engineer, not a fault in the import.\n\n")
        w("models imported            %5d\n" % len(models))
        w("compartment entries        %5d\n" % sum(len(m["comps"]) for m in models.values()))
        w("grades (product columns)   %5d\n" % len(grades))
        w("distinct OEM spec strings  %5d   <- the standardisation problem\n" % len(oems))
        w("flagged VERIFY             %5d\n" % verify)
        w("missing change interval    %5d\n" % noiv)
        w("OEM contradicts the type   %5d\n" % ask)
        w("needs a decision           %5d   (sources disagree on the oil)\n" % len(decide))
        w("operating hours / year     %5d   (sheet L1)\n" % HOURS)
        w("sample interval, hours     %5d   (sheet K2)\n\n" % SAMPLE_H)

        w("GRADES, PRIMARY AND ALTERNATIVE (%d)\n" % len(grades) + "-" * 62 + "\n")
        for g in grades.values():
            w("  %-13s %-10s %s%s\n" % (g["code"], g["t"], g["primary"],
              (" / " + g["alt"]) if g["alt"] else ""))
            w("  %-13s %-10s %s compartments, %s L/yr (2026 units)\n"
              % ("", g["hex"], g["comps"], "{:,}".format(g["lyr"])))
        hexes = collections.defaultdict(list)
        for g in grades.values(): hexes[g["hex"]].append(g["code"])
        same = [v for v in hexes.values() if len(v) > 1]
        if same:
            w("\n  Grades the workbook paints in the SAME colour — the code is printed\n"
              "  on every swatch so colour is never the only way to tell them apart:\n")
            for v in same: w("    " + ", ".join(v) + "\n")
        if unknown_grade:
            w("\n  'Actual oil' values that are no grade on the sheet:\n")
            for g, n in unknown_grade.most_common(): w("    %-20s %d\n" % (g, n))

        w("\nNEEDS A DECISION (%d)\n" % len(decide) + "-" * 62 + "\n")
        w("The sources below name a different oil for the same compartment. The\n"
          "matrix value is what the app shows until the engineer decides on the\n"
          "dashboard (Lubrication > Master > Needs decision).\n\n")
        for d in decide:
            w("  %-36s %-5s %s\n" % (d["m"][:36], d["k"], d["en"]))
            for o in d["opts"]:
                w("        %-12s %s\n" % (o["g"], ", ".join(o["src"])))

        w("\nSAMPLE CODES THAT RESOLVE TO NOTHING ON THEIR MACHINE (%d)\n" % len(unaliased)
          + "-" * 62 + "\n")
        for k, n in unaliased.most_common(): w("  %-12s %d samples\n" % (k, n))

        w("\nDUPLICATE MODEL ROWS, FOLDED INTO ONE (%d)\n" % len(dups) + "-" * 62 + "\n")
        for label, r in dups: w("  row %-4d %s\n" % (r, label))

        w("\nCOMPONENT NAMES REPAIRED FROM THE LEGEND (%d)\n" % len(renamed) + "-" * 62 + "\n")
        for k, was, now in renamed: w("  %-5s %-42s -> %s\n" % (k, (was or "")[:42], now))
        w("\nNAMES THE SHEET AND THE LEGEND DISAGREE ON (%d)\n" % len(differ) + "-" * 62 + "\n")
        for k, sheet_name, leg in differ: w("  %-5s sheet: %-36s legend: %s\n" % (k, sheet_name[:36], leg))
        w("\nROTARY HEAD ADDED, FIGURES STILL MISSING (%d)\n" % len(rotary) + "-" * 62 + "\n")
        for m in rotary: w("  %s\n" % m)
        w("\nCODES THE LEGEND DEFINES THAT NO MACHINE USES (%d)\n" % len(unused_codes) + "-" * 62 + "\n")
        for k in unused_codes: w("  %-5s %s\n" % (k, legend.get(k, "")))
        w("\nMODELS IN THE MASTERLIST WITH NO MACHINE ON THE REGISTER (%d)\n" % len(unmatched))
        for u in sorted(unmatched): w("   " + u + "\n")
        w("\nEXPLICIT ALIASES — every one a judgement, check them (%d)\n" % len(ALIAS))
        for k, v in sorted(ALIAS.items()): w("   register %-28s = masterlist %s\n" % (k, v))
        w("\nNAMES MATCHED ACROSS THE TWO DOCUMENTS (%d)\n" % len(matched))
        for lab, regs in sorted(matched):
            if [lab] != regs: w("   %-42s = %s\n" % (lab, ", ".join(regs)))
        w("\nOEM SPEC STRINGS, MOST USED FIRST\n")
        for k, v in oems.most_common(): w("  %4d  %s\n" % (v, k))

    # ── the catalogue: every primary and alternative, one row each ─────────
    catalog, seen_p = [], set()
    for g in grades.values():
        for role, p in (("primary", g["primary"]), ("alt", g["alt"])):
            if not p or g.get("verify"): continue
            key = re.sub(r"[^A-Z0-9]", "", p.upper())
            if key in seen_p: continue
            seen_p.add(key)
            ti = TYPE_INFO[g["t"]]
            br = brand_of(p)
            catalog.append({"p": p, "code": g["code"], "role": role, "t": g["t"],
                            "en": ti[0], "ru": ti[1], "hue": ti[2],
                            "brand": br, "bhue": BRAND_HUE.get(br) if br else None})
    types = {t: {"en": v[0], "ru": v[1], "hue": v[2]} for t, v in TYPE_INFO.items()}
    comp_type = {k: v for k, v in LEGEND_TYPE.items() if v}
    brands = {b: {"hue": h} for b, h in BRAND_HUE.items()}

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(HEAD)
        f.write("  var SITE = " + json.dumps(
            {"design": -40, "winter": -45, "summer": 28, "hoursPerYear": HOURS,
             "sampleEvery": SAMPLE_H, "units": len(assets)}) + ";\n\n")
        f.write("  /* Every product the masterlist names, primary and alternative. */\n")
        f.write("  var CATALOG = " + json.dumps(catalog, ensure_ascii=False) + ";\n\n")
        f.write("  /* The grades: the unit the site's oil is decided in. */\n")
        f.write("  var GRADES = " + json.dumps(grades, ensure_ascii=False) + ";\n\n")
        f.write("  var TYPES = " + json.dumps(types, ensure_ascii=False) + ";\n\n")
        f.write("  var BRANDS = " + json.dumps(brands, ensure_ascii=False) + ";\n\n")
        f.write("  var COMP_TYPE = " + json.dumps(comp_type, ensure_ascii=False) + ";\n\n")
        f.write("  var CODE_ALIAS = " + json.dumps(CODE_ALIAS, ensure_ascii=False) + ";\n\n")
        f.write("  var OIL_RULES = " + json.dumps(OIL_RULES, ensure_ascii=False) + ";\n\n")
        f.write("  var UNDECIDED = " + json.dumps(UNDECIDED, ensure_ascii=False) + ";\n\n")
        f.write("  /* Where the workbook's sources disagree on a compartment's oil. */\n")
        f.write("  var DECIDE = " + json.dumps(decide, ensure_ascii=False,
                                                separators=(",", ":")) + ";\n\n")
        f.write("  var MODELS = " + json.dumps(models, ensure_ascii=False,
                                               separators=(",", ":")) + ";\n")
        f.write(TAIL)

    print("models          %5d" % len(models))
    print("entries         %5d" % sum(len(m["comps"]) for m in models.values()))
    print("grades          %5d" % len(grades))
    print("catalog         %5d" % len(catalog))
    print("needs decision  %5d" % len(decide))
    print("VERIFY flags    %5d" % verify)
    print("missing interval%5d" % noiv)
    print("unmatched models%5d  (see docs/lube-import-report.txt)" % len(unmatched))
    print("bytes           %5d" % len(open(OUT, encoding="utf-8").read()))

HEAD = '''/* Lubrication reference — GENERATED from the site's own masterlist.

   Source: docs/source/Lube_Matrix_Oil_Analysis_Sampling.xlsm, sheet
   "Lube Frequency BMSK" (plus the per-machine sampling forms, "Using table
   New" and the sample log, read only for refill figures and disagreements).
   Rebuild with docs/build-lube-data.py. Import questions:
   docs/lube-import-report.txt

   THIS FILE IS THE BASELINE, NOT THE LAST WORD. The office's lube master —
   decisions, corrections, the consolidation — lives on the server
   (_meta/lube/master.json) and is applied on top of this by
   LUBE.applyMaster(). The workbook is imported once; after that the dashboard
   is where the lubrication programme is kept.

   A compartment: k code · en/ru name · t lubricant type · g grade (the
   workbook's "Actual oil") · cap system capacity L · rf refill/tank litres
   and rfs where that came from · iv change interval h · oem the OEM
   specification text, as the manual writes it.

   FLAGS, which were cell colours in Excel and are data here:
     verify  the figure is a placeholder to confirm against the manual (purple)
     noiv    a capacity with no change interval, so it totals nothing (teal)
     ask     the grade's type and the OEM code disagree (TO-4 in a gear-oil
             compartment); wet-clutch friction chemistry is an engineer's call

   THE FIELD NEVER SEES `oem`. It is ninety-odd different strings and asking a
   fitter in gloves to read it is how the wrong oil goes in. It is kept because
   it is what the standard is DECIDED against, on the dashboard, once. */
(function (G) {
'''

TAIL = r'''
  function norm(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
  function typeOf(k){ return (COMP_TYPE[k] || null); }
  /* The office's lube master, applied on top of the generated baseline.
     Kept as a pristine copy so removing an edit really removes it. */
  var BASE = JSON.parse(JSON.stringify({ MODELS: MODELS, GRADES: GRADES }));
  var MASTER = null;
  var REG = null;
  function resolve(model, cls){
    if(!model) return null;
    if(cls && MODELS[cls + "|" + model]) return cls + "|" + model;
    var n = norm(model), hits = [];
    Object.keys(MODELS).forEach(function(k){
      var r = MODELS[k];
      var names = [r.m].concat(r.regs || []);
      if(!names.some(function(x){ return norm(x) === n; })) return;
      if(cls && r.cls !== cls) return;
      hits.push(k);
    });
    return hits.length === 1 ? hits[0] : null;
  }
  function gradeProduct(g){
    var G0 = GRADES[g]; if(!G0 || G0.verify) return null;
    var p = G0.primary || G0.alt; if(!p) return null;
    var hit = CATALOG.filter(function(x){ return norm(x.p) === norm(p); })[0];
    return hit || { p: p, code: g, t: G0.t, role: "primary",
                    en: (TYPES[G0.t]||{}).en, ru: (TYPES[G0.t]||{}).ru,
                    hue: (TYPES[G0.t]||{}).hue };
  }
  function productFor(k){
    var t = typeOf(k); if(!t) return null;
    return CATALOG.filter(function(p){ return p.t === t; })[0] || null;
  }
  function addCatalog(p, g, role){
    if(!p) return;
    if(CATALOG.some(function(x){ return norm(x.p) === norm(p); })) return;
    var G0 = GRADES[g] || {}, T0 = TYPES[G0.t] || {};
    CATALOG.push({ p: p, code: g, role: role, t: G0.t, en: T0.en, ru: T0.ru,
                   hue: T0.hue, brand: null, bhue: null, office: 1 });
  }

  G.LUBE = {
    get models(){ return Object.keys(MODELS); },
    of:       function(model, cls){ var k = resolve(model, cls); return k ? MODELS[k] : null; },
    key:      function(model, cls){ return resolve(model, cls); },
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
    sourced:  function(model, k, cls){
                var c = this.comp(model, k, cls);
                return !!(c && c.cap != null && !c.verify); },
    catalog:  CATALOG,
    grades:   GRADES,
    grade:    function(g){ return GRADES[g] || null; },
    /* The colour a grade is painted in, and the code printed on it: two grades
       share a fill on the site's own sheet, so the code always travels. */
    gradeHex: function(g){ return (GRADES[g] && GRADES[g].hex) || "#d9d9d9"; },
    gradeProduct: gradeProduct,
    decide:   DECIDE,
    codeAlias:CODE_ALIAS,
    undecided: UNDECIDED,
    undecidedFor: function(regModel){
      var n = norm(regModel), hit = null;
      Object.keys(UNDECIDED).forEach(function(k){ if(norm(k) === n) hit = UNDECIDED[k]; });
      return hit;
    },
    product:  function(name){
                return CATALOG.filter(function(p){ return norm(p.p) === norm(name); })[0] || null; },
    /* What belongs in this compartment: the approved product of its GRADE when
       the sheet names one, otherwise the first product of its type. The fitter
       is never offered a choice of thirty. */
    forComp:  function(model, k, cls){
                var c = this.comp(model, k, cls);
                if(!c) return null;
                /* A grade the site has not chosen a product for yet (wire rope,
                   open gear: "VERIFY product" on their own sheet) has no answer,
                   and inventing one by type would be the importer deciding. */
                if(c.g) return gradeProduct(c.g);
                return productFor(c.k) || (c.t ? CATALOG.filter(function(p){ return p.t === c.t; })[0] || null : null);
              },
    typeOf:   typeOf,
    types:    TYPES,
    hue:      function(t){ return (TYPES[t] && TYPES[t].hue) || "#8b969c"; },
    brands:   BRANDS,
    brandHue: function(b){ return (BRANDS[b] && BRANDS[b].hue) || null; },
    brandsFor: function(type){
      var out = {};
      CATALOG.forEach(function(p){ if(p.t === type && p.brand) out[p.brand] = 1; });
      return Object.keys(out);
    },
    brandMatters: function(type){ return this.brandsFor(type).length > 1; },
    site:     SITE,
    /* Any way the workbook writes an oil, as a grade code: "H32" is VG32,
       "AF 40/60" is Coolant. Not a site grade comes back as itself. */
    oilCode:  function(text){
      if(text == null) return null;
      var s = String(text).replace(/\s+/g, " ").trim(); if(!s) return null;
      if(GRADES[s]) return s;
      var u = s.toUpperCase().replace(/РАО/g, "PAO");
      for(var i = 0; i < OIL_RULES.length; i++){
        if(new RegExp(OIL_RULES[i][0].replace(/\(\?i\)/g, "")).test(u)) return OIL_RULES[i][1];
      }
      var m = u.match(/\b(\d{1,2})\s*W\s*-?\s*(\d{2,3})\b/);
      return m ? m[1] + "W" + m[2] : u;
    },
    /* The official (matrix) code for a sample point on this machine. An alias
       resolves only onto a code the model actually carries. */
    sampleCode: function(model, cls, code){
      var cs = this.comps(model, cls), have = {};
      cs.forEach(function(c){ have[c.k] = 1; });
      code = String(code == null ? "" : code).trim();
      if(have[code]) return code;
      var al = (MASTER && MASTER.alias && MASTER.alias[code]) || CODE_ALIAS[code] || [];
      for(var i = 0; i < al.length; i++) if(have[al[i]]) return al[i];
      return null;
    },
    /* The site's sample number, the formula on their Data sheet:
       DDMMYYYY-UNIT-CODE. */
    sampleNo: function(date, unit, code){
      var d = String(date || "").slice(0, 10).split("-");
      if(d.length !== 3) return "";
      return d[2] + d[1] + d[0] + "-" + String(unit || "").toUpperCase() + "-" + String(code || "");
    },
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
    },
    register: function(){
      if (REG) return REG;
      var out = [], at = {};
      var add = function(p, t, src){
        if (!p) return;
        var k = norm(p);
        if (at[k]) { if (at[k].src !== src) at[k].src = "both"; return; }
        at[k] = { p: p, t: t || "", src: src };
        out.push(at[k]);
      };
      CATALOG.forEach(function(x){ add(x.p, x.t, "field"); });
      ((G.LUBE2027 && G.LUBE2027.shelf) || []).forEach(function(x){ add(x.p, x.t, "2027"); });
      return (REG = out);
    },
    registered: function(name){
      var n = norm(name);
      return this.register().filter(function(x){ return norm(x.p) === n; })[0] || null;
    },
    verdict: function(model, cls, key, name){
      var nm = String(name == null ? "" : name).trim();
      if (!nm) return { b:"none", k:"lube_v_none", want:"", product:"" };
      var want = this.forComp(model, key, cls);
      if (!want) return { b:"none", k:"lube_v_nostd", want:"", product:nm };
      var c = this.comp(model, key, cls), ty = (c && c.t) || want.t || "";
      var prod = this.registered(nm);
      var r = { want: want.p || "", product: nm };
      /* The product's GRADE: its own catalogue code, or what its name says. */
      var cat = this.product(nm);
      var pg = (cat && cat.code) || (prod ? this.oilCode(prod.p) : null);
      var pt = (pg && GRADES[pg] && GRADES[pg].t) || (prod && prod.t) || "";
      var M = this.of(model, cls);
      var open = c && c.g && !c.decided && M ? this.openDecision(M.m, key) : null;
      if (!prod)                     { r.b = "watch"; r.k = "lube_v_unknown"; }
      /* Primary or alternative of the compartment's own grade: what the site
         has decided goes in here. */
      else if (c && c.g && pg === c.g) { r.b = "ok"; r.k = "lube_v_ok"; }
      /* The workbook's own sources disagree about this compartment and nobody
         has decided yet: one of the answers on the table is not a finding. */
      else if (open && open.opts.some(function(o){ return o.g === pg; }))
                                     { r.b = "watch"; r.k = "lube_v_pending"; }
      else if (ty && pt && pt !== ty) { r.b = "act"; r.k = "lube_v_wrong"; }
      else if (!ty || !pt)           { r.b = "watch"; r.k = "lube_v_unknown"; }
      /* Same family, different grade: a 75W-140 where 75W-90 is the standard.
         Not the wrong kind of oil, and not the site's oil either. */
      else if (c && c.g && pg && GRADES[pg] && pg !== c.g)
                                     { r.b = "watch"; r.k = "lube_v_grade"; }
      else                           { r.b = "ok";    r.k = "lube_v_ok"; }
      r.off = r.b !== "ok";
      return r;
    },
    /* An open "needs decision" entry for this compartment, or null when there
       is none or the office has decided it. */
    openDecision: function(m, k){
      var id = m + "|" + k;
      if (MASTER && MASTER.decide && MASTER.decide[id] && MASTER.decide[id].g) return null;
      return DECIDE.filter(function(d){ return d.id === id; })[0] || null;
    },

    /* ---- the office's lube master -------------------------------------------
       One document on the server, written by the dashboard:
         { rev, at, by,
           comps:  { "<CLS|Model>": { "<code>": { field: value } } },
           grades: { "<grade>": { primary, alt, state, by, at, note } },
           decide: { "<Model|code>": { g, by, at, note } },
           alias:  { "<sample code>": [official codes] } }
       Applied on top of the pristine baseline, every time from scratch, so an
       edit that is taken back really goes. An empty string clears a field on
       purpose ("this figure was wrong and I do not have the right one");
       undefined leaves it alone. */
    master:   function(){ return MASTER; },
    base:     function(){ return BASE; },
    applyMaster: function(doc){
      MASTER = doc || null;
      var B = JSON.parse(JSON.stringify(BASE));
      Object.keys(MODELS).forEach(function(k){ delete MODELS[k]; });
      Object.keys(B.MODELS).forEach(function(k){ MODELS[k] = B.MODELS[k]; });
      Object.keys(GRADES).forEach(function(k){ delete GRADES[k]; });
      Object.keys(B.GRADES).forEach(function(k){ GRADES[k] = B.GRADES[k]; });
      REG = null;
      if(!MASTER) return 0;
      var n = 0;
      var gm = MASTER.grades || {};
      Object.keys(gm).forEach(function(g){
        var e = gm[g] || {};
        var G0 = GRADES[g];
        if(!G0){
          if(!e.t) return;                         /* a new grade must say what it is */
          G0 = GRADES[g] = { code: g, t: e.t, en: e.en || g, ru: e.ru || e.en || g,
                             hex: e.hex || "#d9d9d9", primary: "", alt: "", office: 1 };
        }
        ["primary","alt","hex","en","ru","state","note","by","at"].forEach(function(f){
          if(e[f] !== undefined) G0[f] = e[f];
        });
        addCatalog(G0.primary, g, "primary"); addCatalog(G0.alt, g, "alt");
        n++;
      });
      var dm = MASTER.decide || {};
      var cm = MASTER.comps || {};
      Object.keys(MODELS).forEach(function(mk){
        var M = MODELS[mk];
        M.comps.forEach(function(c){
          var d = dm[M.m + "|" + c.k];
          if(d && d.g){
            c.g = d.g; c.decided = 1;
            if(GRADES[d.g]) c.t = GRADES[d.g].t;
            delete c.ask;
          }
        });
        var o = cm[mk] || cm["?|" + M.m]; if(!o) return;
        Object.keys(o).forEach(function(k){
          var e = o[k] || {};
          var c = M.comps.filter(function(x){ return x.k === k; })[0];
          if(!c){
            if(!e.add) return;                   /* a compartment the office added */
            c = { k: k, en: e.en || k, ru: e.ru || e.en || k };
            M.comps.push(c);
          }
          if(e.drop){ M.comps = M.comps.filter(function(x){ return x.k !== k; }); n++; return; }
          ["cap","rf","iv","ivo"].forEach(function(f){
            if(e[f] === undefined) return;
            if(e[f] === "" || e[f] === null) delete c[f];
            else { c[f] = Number(e[f]); if(f === "cap") delete c.verify; if(f === "iv") delete c.noiv; }
          });
          ["oem","en","ru","note"].forEach(function(f){
            if(e[f] === undefined) return;
            if(e[f] === "") delete c[f]; else c[f] = e[f];
          });
          if(e.g !== undefined){
            if(e.g === "") delete c.g;
            else { c.g = e.g; if(GRADES[e.g]) c.t = GRADES[e.g].t; delete c.ask; }
          }
          if(e.src) c.src = e.src;
          c.edited = 1; n++;
        });
      });
      return n;
    }
  };
})(window);
'''

main()
