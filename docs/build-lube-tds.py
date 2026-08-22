#!/usr/bin/env python3
"""The data sheets, read rather than remembered.

   Every product on Specification 02 rev CO-05 currently carries a null cold
   rating, because the "Attached the specs (yes/no)" column in both fleet
   matrices is empty in all 249 rows. This reads whatever data sheets are put
   in docs/source/tds/ and turns them into figures the app can show.

   TWO THINGS IT WILL NOT DO.

   It will not guess. A property the sheet does not state comes out null and
   stays null; a parser that fills a gap with a plausible number is worse than
   no parser, because the number then travels into a standard with nothing
   holding it up.

   And it will not call a pour point an operating limit. ASTM D97 pour point is
   the temperature at which the oil stops pouring under gravity in a test jar.
   It is not the coldest morning the machine may be started on: for an engine
   oil that is decided by cold-crank and pumpability (CCS / MRV), for a splash
   gearbox by whether the oil throws, for a hydraulic system by whether the
   pump can draw. The usual rule of thumb of pour point plus ten degrees is a
   rule of thumb. So the pour point is published as the FACT it is, and the app
   flags anything whose pour point is at or above the site's design minimum —
   which is a certainty of trouble, not a judgement.

   Reads:  docs/source/tds/*.pdf   (plus optional tds-overrides.json)
   Writes: mobile/lube-tds.js, docs/lube-tds-report.txt

   Run from anywhere: python3 docs/build-lube-tds.py
   Self-test:         python3 docs/build-lube-tds.py --selftest
"""
import json, os, re, sys

CM_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TDS_DIR = os.path.join(CM_ROOT, "docs", "source", "tds")
OVERRID = os.path.join(CM_ROOT, "docs", "source", "tds-overrides.json")
OUT_JS  = os.path.join(CM_ROOT, "mobile", "lube-tds.js")
OUT_TXT = os.path.join(CM_ROOT, "docs", "lube-tds-report.txt")

DESIGN_MIN = -40          # what the site designs to; it sees -45


# ── numbers ────────────────────────────────────────────────────────────────
# A data sheet writes minus as "-", "−" or "–", and a decimal as "." or ",".
# Reading "-45,5" as 45 would report an oil as forty degrees warmer than it is.
NUM = r"[-−–]?\d+(?:[.,]\d+)?"


def num(s):
    if s is None:
        return None
    s = str(s).strip().replace("−", "-").replace("–", "-").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# ── properties ─────────────────────────────────────────────────────────────
# Each is (key, label regex, unit hint). The label comes first and the number
# follows it on the same line or the next one, which is how every TDS in this
# pile is laid out — a two-column table flattened by the text extractor.
PROPS = [
    ("kv40",  r"(?:kinematic\s+)?viscosit\w*[^\n]{0,50}?\b40\s*°?\s*C"
              r"|вязкост\w*[^\n]{0,50}?при\s*40"),
    ("kv100", r"(?:kinematic\s+)?viscosit\w*[^\n]{0,50}?\b100\s*°?\s*C"
              r"|вязкост\w*[^\n]{0,50}?при\s*100"),
    ("vi",    r"viscosity\s+index|индекс\s+вязкости"),
    ("pour",  r"pour\s*point|температура\s+застывания"),
    ("flash", r"flash\s*point|температура\s+вспышки"),
    ("drop",  r"drop(?:ping)?\s*point|температура\s+каплепадения"),
    ("dens",  r"densit\w*|плотност\w*"),
    ("nlgi",  r"NLGI(?:\s*(?:grade|class|консистенц\w*))?"),
]

# An approval is a line naming a standard body. These are what a compartment's
# OEM string is actually asking for, so they are worth carrying whole.
APPROVAL = re.compile(
    r"\b(API|ISO|DIN|SAE|ACEA|JASO|AGMA|NLGI|MIL|ZF|MB|MAN|Volvo|Scania|"
    r"Allison|Caterpillar|CAT|Komatsu|Cummins|Dexron|Mercon|Voith|Denison|"
    r"Vickers|Eaton|Parker|Bosch|Rexroth|GL-[0-9]|TO-[0-9]|KES)\b", re.I)


def find_prop(text, rx):
    """The number that belongs to a label, or None. Never a number from
       somewhere else on the page: the search window ends at the next label."""
    for m in re.finditer(rx, text, re.I):
        tail = text[m.end():m.end() + 160]
        # Stop at the next property label so a missing value cannot silently
        # borrow the following row's number.
        cut = len(tail)
        for _, other in PROPS:
            o = re.search(other, tail, re.I)
            if o and o.start() < cut:
                cut = o.start()
        window = tail[:cut]
        # A reference temperature belongs to the LABEL, not the value:
        # "Density at 15 °C ... 852" reads as fifteen unless it is removed, and
        # a density of 15 is not a number anybody would question on sight.
        window = re.sub(r"\b(?:at|при)\s*[-−–]?\d+\s*°?\s*[CС]\b", " ",
                        window, flags=re.I)
        # Skip the units and method that sit between label and value.
        window = re.sub(r"\b(ASTM|EN|ISO|GOST|ГОСТ|D\s?\d{2,4}|"
                        r"mm2/s|mm²/s|сСт|cSt|kg/m3|кг/м3|g/cm3|°?\s?C|°C)\b",
                        " ", window, flags=re.I)
        v = re.search(NUM, window)
        if v:
            return num(v.group(0))
    return None


def parse(text):
    out = {}
    for key, rx in PROPS:
        out[key] = find_prop(text, rx)
    specs, seen = [], set()
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip(" •·-\t")
        if len(line) < 3 or len(line) > 90 or not APPROVAL.search(line):
            continue
        # A sentence is prose, not an approval line.
        if len(line.split()) > 12 or line.endswith("."):
            continue
        k = line.upper()
        if k not in seen:
            seen.add(k)
            specs.append(line)
    out["specs"] = specs[:24]
    return out


# ── product identity, the same rule the catalogue uses ─────────────────────
CYR = {"ЛУКОЙЛ": "LUKOIL", "ПОЛИФЛЕКС": "POLYFLEX", "СИНТОФЛЕКС": "SYNTOFLEX",
       "КАРБОФЛЕКС": "CARBOFLEX", "АРКТИК": "ARCTIC", "ЕР": "EP"}
SPELL = {"SYNTHOFLEX": "SYNTOFLEX", "POLIFLEX": "POLYFLEX",
         "KARBOFLEX": "CARBOFLEX", "SINTOFLEX": "SYNTOFLEX"}
NOISE = {"OIL", "GREASE", "LUBRICANT", "FLUID", "TDS", "EN", "RU", "ENG",
         "TZK", "DATA", "SHEET", "TECHNICAL", "PRODUCT", "HD", "NEW"}


def tokens(name):
    n = str(name or "").upper()
    for a, b in CYR.items():
        n = n.replace(a, b)
    n = re.sub(r"\b(\d+)W\s*-?\s*(\d+)\b", r"\1W\2", n)
    n = re.sub(r"[^A-Z0-9]+", " ", n)
    return {SPELL.get(t, t) for t in n.split()
            if t and SPELL.get(t, t) not in NOISE}


def pid(name):
    return " ".join(sorted(tokens(name)))


# The name on the sheet beats the name on the file: a file gets renamed by
# whoever forwards the email, and the heading does not.
def product_name(text, filename):
    head = "\n".join(text.splitlines()[:14])
    best = None
    for line in head.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if 6 <= len(line) <= 60 and re.search(
                r"TEBOIL|LEMARC|LUKOIL|ЛУКОЙЛ", line, re.I):
            if best is None or len(line) > len(best):
                best = line
    if best:
        return re.sub(r"^(TDS|Technical Data Sheet)\s*[-:]?\s*", "", best, flags=re.I)
    stem = os.path.splitext(os.path.basename(filename))[0]
    stem = re.sub(r"^[0-9a-f]{6,}[-_]", "", stem)      # upload hash prefix
    return re.sub(r"[_]+", " ", stem).strip()


def read_pdf(path):
    import pypdf
    r = pypdf.PdfReader(path)
    return "\n".join((p.extract_text() or "") for p in r.pages)


# ── self-test ──────────────────────────────────────────────────────────────
# The parser is the kind of code that looks right and reads the wrong column.
# These two cases are the ones that would put a wrong number in front of an
# engineer: a minus sign that is not a hyphen, and a property whose value is
# missing so the next row's number is sitting where it would be read.
SAMPLE = """TEBOIL COMPRESSOR OIL SHV 46
Technical Data Sheet
Typical properties
Density at 15 °C, kg/m3 ASTM D4052 852
Kinematic viscosity at 40 °C, mm2/s ASTM D445 46.0
Kinematic viscosity at 100 °C, mm2/s ASTM D445 7,8
Viscosity index ASTM D2270 135
Flash point COC, °C ASTM D92 240
Pour point, °C ASTM D97 −45
Specifications
ISO 6743-3 L-DAJ
DIN 51506 VDL
"""
GAPPY = """LUKOIL POLYFLEX EP 2-160
NLGI grade 2
Dropping point, °C
Kinematic viscosity of base oil at 40 °C, mm2/s 160
"""


def selftest():
    bad = []

    def eq(got, want, what):
        if got != want:
            bad.append(f"{what}: got {got!r}, wanted {want!r}")

    a = parse(SAMPLE)
    eq(a["kv40"], 46.0, "viscosity at 40")
    eq(a["kv100"], 7.8, "a comma decimal is a decimal")
    eq(a["vi"], 135.0, "viscosity index")
    eq(a["flash"], 240.0, "flash point")
    eq(a["pour"], -45.0, "a unicode minus is a minus, not a missing sign")
    eq(a["dens"], 852.0, "density")
    ok = [s for s in a["specs"] if "L-DAJ" in s]
    eq(len(ok), 1, "the approval lines survive")

    b = parse(GAPPY)
    eq(b["nlgi"], 2.0, "NLGI grade")
    # The dropping point row has no value. The 160 belongs to the row below it,
    # and a window that runs past the next label would hand it over.
    eq(b["drop"], None, "a stated-but-empty property stays empty")
    eq(b["kv40"], 160.0, "and the number below it still reads correctly")

    eq(pid("TEBOIL HYPOID 75W-90"), pid("Teboil Hypoid 75W90"),
       "identity ignores the hyphen in a grade")
    eq(pid("ЛУКОЙЛ СИНТОФЛЕКС АРКТИК 1-100"), pid("LUKOIL SYNTHOFLEX ARCTIC 1-100"),
       "identity crosses the alphabet")
    eq(product_name(SAMPLE, "x.pdf"), "TEBOIL COMPRESSOR OIL SHV 46",
       "the name comes off the sheet, not the filename")

    for line in bad:
        print("  FAIL  " + line)
    print("\n%s" % ("the parser reads what is there and nothing else"
                    if not bad else "%d FAILED" % len(bad)))
    return 1 if bad else 0


def main():
    if "--selftest" in sys.argv:
        sys.exit(selftest())

    if not os.path.isdir(TDS_DIR):
        os.makedirs(TDS_DIR, exist_ok=True)
    pdfs = sorted(f for f in os.listdir(TDS_DIR) if f.lower().endswith(".pdf"))

    over = {}
    if os.path.exists(OVERRID):
        with open(OVERRID, encoding="utf-8") as f:
            for k, v in json.load(f).items():
                over[pid(k)] = v

    out, problems = [], []
    for fn in pdfs:
        try:
            text = read_pdf(os.path.join(TDS_DIR, fn))
        except Exception as e:                       # a corrupt or scanned PDF
            problems.append("%s could not be read: %s" % (fn, e))
            continue
        if len(text.strip()) < 40:
            problems.append("%s has no text layer — it is a scan, and the "
                            "figures must be typed into tds-overrides.json" % fn)
            continue
        name = product_name(text, fn)
        rec = {"p": name, "file": fn}
        rec.update(parse(text))
        rec.update(over.get(pid(name), {}))
        out.append(rec)

    # Anything hand-entered for a product with no sheet still counts.
    have = {pid(r["p"]) for r in out}
    for k, v in over.items():
        if k not in have:
            rec = {"p": v.get("p", k), "file": "tds-overrides.json"}
            rec.update({key: None for key, _ in PROPS})
            rec["specs"] = []
            rec.update(v)
            out.append(rec)

    out.sort(key=lambda r: r["p"])

    def j(o):
        return json.dumps(o, ensure_ascii=False, separators=(",", ":"))

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write('''/* GENERATED by docs/build-lube-tds.py — do not edit by hand.

   Published figures off the suppliers' data sheets. A property the sheet does
   not state is null and stays null.

   `pour` is the ASTM D97 pour point and NOTHING ELSE. It is not the coldest
   morning the machine may be started on — that is cold-crank and pumpability
   for an engine oil, whether the oil throws for a splash gearbox, whether the
   pump can draw for a hydraulic system. Treating it as an operating limit is
   the mistake this file exists to make harder, so the API below will tell you
   a product is DISQUALIFIED when its pour point is at or above the design
   minimum, and will never tell you one is approved.
*/
(function(w){
  "use strict";
''')
        f.write("var TDS = " + j(out) + ";\n")
        f.write("var DESIGN_MIN = %d;\n" % DESIGN_MIN)
        f.write('''
  var CYR = {"ЛУКОЙЛ":"LUKOIL","ПОЛИФЛЕКС":"POLYFLEX","СИНТОФЛЕКС":"SYNTOFLEX",
             "КАРБОФЛЕКС":"CARBOFLEX","АРКТИК":"ARCTIC","ЕР":"EP"};
  var SPELL = {SYNTHOFLEX:"SYNTOFLEX",POLIFLEX:"POLYFLEX",
               KARBOFLEX:"CARBOFLEX",SINTOFLEX:"SYNTOFLEX"};
  var NOISE = {OIL:1,GREASE:1,LUBRICANT:1,FLUID:1,TDS:1,EN:1,RU:1,ENG:1,
               TZK:1,DATA:1,SHEET:1,TECHNICAL:1,PRODUCT:1,HD:1,NEW:1};
  function toks(name){
    var n = String(name||"").toUpperCase(), k;
    for(k in CYR) n = n.split(k).join(CYR[k]);
    n = n.replace(/\\b(\\d+)W\\s*-?\\s*(\\d+)\\b/g, "$1W$2")
         .replace(/[^A-Z0-9]+/g, " ");
    var out = {};
    n.split(" ").forEach(function(t){
      t = SPELL[t] || t;
      if(t && !NOISE[t]) out[t] = 1;
    });
    return out;
  }
  function subset(a,b){
    for(var k in a) if(!b[k]) return false;
    return true;
  }
  w.LUBETDS = {
    all: TDS,
    designMin: DESIGN_MIN,
    /* The sheet for a product, matched the way the catalogue matches: one
       token set containing the other, with a floor of two shared tokens so a
       brand name alone is never an identification. */
    of: function(name){
      var t = toks(name), n = 0, k;
      for(k in t) n++;
      if(n < 2) return null;
      var hits = TDS.filter(function(r){
        var s = toks(r.p), m = 0, kk;
        for(kk in s) m++;
        if(m < 2) return false;
        return m <= n ? subset(s, t) : subset(t, s);
      });
      if(!hits.length) return null;
      hits.sort(function(a,b){ return b.p.length - a.p.length; });
      return hits[0];
    },
    /* Never "approved". Either the sheet disqualifies the product outright, or
       nobody has established that it is fit — which is a question for the
       engineer, not a green tick from a parser. */
    coldVerdict: function(name){
      var r = this.of(name);
      if(!r) return { k:"nosheet" };
      if(r.pour == null) return { k:"nopour", r:r };
      if(r.pour >= DESIGN_MIN) return { k:"toowarm", pour:r.pour, r:r };
      return { k:"pourbelow", pour:r.pour, r:r };
    },
    count: function(){ return TDS.length; }
  };
})(typeof window !== "undefined" ? window : this);
''')

    with open(OUT_TXT, "w", encoding="utf-8") as f:
        w = f.write
        w("DATA SHEETS ON FILE\n" + "=" * 74 + "\n\n")
        w("read from docs/source/tds/   %d sheet(s)\n" % len(pdfs))
        w("products with figures       %d\n" % len(out))
        w("site design minimum         %d C\n\n" % DESIGN_MIN)
        if problems:
            w("COULD NOT BE READ\n" + "-" * 74 + "\n")
            for p in problems:
                w("  " + p + "\n")
            w("\n")
        w("%-42s %7s %7s %5s %7s %6s\n"
          % ("product", "KV40", "KV100", "VI", "pour C", "NLGI"))
        w("-" * 74 + "\n")
        for r in out:
            w("%-42s %7s %7s %5s %7s %6s%s\n" % (
                r["p"][:42],
                "" if r["kv40"] is None else r["kv40"],
                "" if r["kv100"] is None else r["kv100"],
                "" if r["vi"] is None else int(r["vi"]),
                "" if r["pour"] is None else r["pour"],
                "" if r["nlgi"] is None else r["nlgi"],
                "   POUR POINT AT OR ABOVE DESIGN MINIMUM"
                if r["pour"] is not None and r["pour"] >= DESIGN_MIN else ""))
        w("\nA pour point is not an operating limit. It says where the oil stops\n"
          "pouring in a test jar, not the coldest morning the machine may be\n"
          "started on. It disqualifies a product; it never approves one.\n")

    print("sheets read    %5d" % len(pdfs))
    print("products       %5d" % len(out))
    print("with pour pt   %5d" % sum(1 for r in out if r["pour"] is not None))
    print("disqualified   %5d" % sum(1 for r in out if r["pour"] is not None
                                     and r["pour"] >= DESIGN_MIN))
    for p in problems:
        print("  ! " + p)


if __name__ == "__main__":
    main()
