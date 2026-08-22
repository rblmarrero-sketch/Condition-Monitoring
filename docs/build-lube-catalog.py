#!/usr/bin/env python3
"""The 2027 shelf, and what the supplier says goes on it.

   The masterlist (build-lube-data.py) answers "what is in this compartment and
   how much".  It cannot answer "and what may we actually buy in 2027", because
   that lives in four documents that travelled by email between procurement,
   reliability and the supplier:

     Specification_02_rev_CO-05.xlsx   what is BOUGHT.  Material ID, volume,
                                       price, delivery week.  Signed.  This is
                                       the shelf and nothing else is.
     Lub_Matrix_fleet_2027_V3.1.xlsx   what the supplier RECOMMENDS per model
                                       and component, with a second option.
     Lube_audit_20082026.xlsx          the same, two weeks later, plus the
                                       machines whose lubricant is not on the
                                       specification at all ("Extra lubes
                                       required") and the volumes that implies.
     supplier_reply_for_GDK.xlsx       the engineer's own caveats, in prose.

   The two matrices are 95% identical and 5% contradictory, and the 5% is the
   whole argument: the newer one splits the NHL truck fleet into a SUMMER and a
   WINTER product where the older one names one.  Chukotka runs -45 C to +28 C.
   A single fill cannot be right at both ends, and a matrix that shows one
   product per compartment cannot say so.  That disagreement is carried through
   as data rather than resolved here, because resolving it is an engineering
   decision with a person's name on it.

   Writes mobile/lube2027.js and docs/lube-catalog-report.txt.
   Run from anywhere: python3 docs/build-lube-catalog.py
"""
import json, os, re, sys, collections

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is needed: pip install openpyxl")

CM_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC     = os.path.join(CM_ROOT, "docs", "source")
OUT_JS  = os.path.join(CM_ROOT, "mobile", "lube2027.js")
OUT_TXT = os.path.join(CM_ROOT, "docs", "lube-catalog-report.txt")

SPEC   = "Specification_02_rev_CO-05.xlsx"
MATRIX = "Lub_Matrix_fleet_2027_V3.1.xlsx"
AUDIT  = "Lube_audit_20082026.xlsx"
REPLY  = "supplier_reply_for_GDK.xlsx"


def cells(fn, sheet):
    wb = openpyxl.load_workbook(os.path.join(SRC, fn), data_only=True)
    ws = wb[sheet]
    return [[("" if c is None else str(c).strip()) for c in row]
            for row in ws.iter_rows(values_only=True)]


def tidy(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


# Same, but a line break survives. A recommendation cell often holds TWO
# products on two lines — a summer one and a winter one — and collapsing the
# break welds them into a single name that matches nothing on the shelf.
def soft(s):
    return "\n".join(tidy(x) for x in str(s or "").splitlines() if tidy(x))


# ── product identity ────────────────────────────────────────────────────────
# The same oil is written six ways across four documents and two alphabets:
# TEBOIL HYPOID 75W90 / 75W-90, ЛУКОЙЛ СИНТОФЛЕКС / LUKOIL SYNTHOFLEX, LEGUARD
# 40 0W40 / LEGUARD 0W-40.  Every one of those pairs is ONE product, and every
# one of them was being reported as an oil somebody recommended and procurement
# never bought — twenty-one false alarms on a list whose whole job is to be
# believed.  So identity is a token set, not a string.
CYR = {"ЛУКОЙЛ": "LUKOIL", "ПОЛИФЛЕКС": "POLYFLEX", "СИНТОФЛЕКС": "SYNTOFLEX",
       "КАРБОФЛЕКС": "CARBOFLEX", "АРКТИК": "ARCTIC", "ЕР": "EP",
       "МАСЛО": " ", "СМАЗКА": " ", "АНТИФРИЗ": " ", "ЖИДКОСТЬ": " ",
       "ТОРМОЗНАЯ": " ", "СТЕКЛООМЫВАТЕЛЯ": " ", "ТРАНСМИССИОННАЯ": " ",
       "ВСЕСЕЗОННО": " "}
# Spelling variants of the same brand name, seen across the four books.
SPELL = {"SYNTHOFLEX": "SYNTOFLEX", "POLIFLEX": "POLYFLEX",
         "KARBOFLEX": "CARBOFLEX", "SINTOFLEX": "SYNTOFLEX"}
# Words that carry no identity: they appear on one side of a pair and not the
# other, and nothing is ever told apart by them.
NOISE = {"OIL", "GREASE", "LUBRICANT", "FLUID", "ANTIFREEZE", "TRANSMISSION",
         "BRAKE", "WINDSHIELD", "WASHER", "ALL", "SEASON", "HD", "NEW",
         "EXTRA" if False else "", "THE", "AND"} - {""}


def tokens(name):
    n = str(name or "").upper()
    for a, b in CYR.items():
        n = n.replace(a, b)
    n = n.split("/")[0]                     # "EN / RU" duplicates
    # A viscosity grade is one token. Splitting 75W-90 into "75W" and "90"
    # made it a different product from 75W90, which is how the same oil ended
    # up on both "bought" and "recommended but not bought".
    n = re.sub(r"\b(\d+)W\s*-?\s*(\d+)\b", r"\1W\2", n)
    n = re.sub(r"[^A-Z0-9]+", " ", n)
    out = []
    for t in n.split():
        t = SPELL.get(t, t)
        if t and t not in NOISE:
            out.append(t)
    return set(out)


def pid(name):
    return " ".join(sorted(tokens(name)))


# Two names are the same product when neither says anything the other
# contradicts — one token set contains the other.  The floor of two shared
# tokens keeps "EP 1" from swallowing "EP 1-160 HD": a brand alone is not an
# identification.
def same(a, b):
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return False
    small, big = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return len(small) >= 2 and small <= big


# Find a name in a keyed collection, exact first and then by containment, so a
# looser rule can never override an exact hit.
def lookup(name, keyed):
    k = pid(name)
    if k in keyed:
        return k
    hits = [kk for kk in keyed if same(name, kk)]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:            # ambiguous: the most specific wins
        hits.sort(key=lambda x: -len(tokens(x)))
        if len(tokens(hits[0])) > len(tokens(hits[1])):
            return hits[0]
    return None


# The label a fitter reads.  Keep the brand and the grade, lose the paperwork.
RU_PREFIX = re.compile(r"^(МАСЛО|СМАЗКА|АНТИФРИЗ|ТОРМОЗНАЯ ЖИДКОСТЬ|"
                       r"ЖИДКОСТЬ СТЕКЛООМЫВАТЕЛЯ|ТРАНСМИССИОННАЯ ЖИДКОСТЬ)\s+",
                       re.I)


def label(name):
    n = tidy(name)
    parts = [p.strip() for p in n.split("/") if p.strip()]
    if len(parts) > 1:
        lat = [p for p in parts if re.search(r"[A-Za-z]", p)]
        n = lat[0] if lat else parts[0]
    n = RU_PREFIX.sub("", n)
    n = re.sub(r"\s*-?\s*всесезонно.*$", "", n, flags=re.I)
    return tidy(n)


# ── 1. the shelf: what procurement actually buys ────────────────────────────
def read_shelf():
    rows = cells(SPEC, "Specification 02 rev CO-05")
    # The sheet holds rev CO-04 on the left and rev CO-05 on the right, side by
    # side, so a naive read returns the SUPERSEDED revision.  CO-05 starts at
    # column L.  Reading the wrong half would put a product on the shelf that
    # procurement has already swapped out.
    shelf = {}
    for r in rows:
        if len(r) < 18:
            continue
        tag, mid, desc, qty, uom, price = r[11], r[12], r[13], r[14], r[15], r[16]
        if not re.match(r"^0\.\d+$", tag):
            continue                        # 5.01/5.02 are shipping containers
        k = pid(desc)
        if not k:
            continue
        try:
            q = float(qty)
        except ValueError:
            q = 0.0
        try:
            p = float(price)
        except ValueError:
            p = None
        if k in shelf:
            # Same product, second pack size.  One product, one row, volumes
            # summed — otherwise the shelf looks twice as long as it is and
            # "fewer products is the point" reads as a lie.
            shelf[k]["q"] += q
            shelf[k]["tags"].append(tag)
        else:
            shelf[k] = {"k": k, "p": label(desc), "ru": tidy(desc),
                        "mid": tidy(mid), "q": q,
                        "u": "kg" if "kg" in uom or "кг" in uom else "L",
                        "price": p, "tags": [tag]}
    return shelf


# Pack size, from the other sheet in the same book.  It matters in the field:
# a 180 kg drum and a 0.4 kg cartridge of the same grease are not the same
# thing to hand to a fitter.
def read_packs():
    packs = collections.defaultdict(set)
    for r in cells(SPEC, "Products for specification 2"):
        if len(r) < 20:
            continue
        k = pid(r[19] or r[2])
        try:
            n = float(r[17])
        except ValueError:
            continue
        if k and n:
            packs[k].add(round(n, 2))
    return packs


# ── 2. what goes where, per model and component ─────────────────────────────
# Column order is identical in both matrices.
C_FLEET, C_MODEL, C_COMP, C_OEM, C_RAS, C_REC, C_ATT, C_VOL, C_FREQ, \
    C_LYR, C_ALT, C_ALTSPEC, C_NOTE = range(13)


def read_plan(fn, sheet, src, fleet_col=True):
    out, fleet, model = [], "", ""
    for i, r in enumerate(cells(fn, sheet), 1):
        r = r + [""] * (13 - len(r))
        if i == 1 or not any(r[:13]):
            continue
        if fleet_col:
            fleet = tidy(r[C_FLEET]) or fleet
            model = tidy(r[C_MODEL]) or model
            comp  = tidy(r[C_COMP])
        else:
            # "Extra lubes required" has no fleet column: model, component, ...
            model = tidy(r[0]) or model
            comp  = tidy(r[1])
            r = [""] + r                    # realign onto the same indices
        if not comp or comp.lower().startswith("volume"):
            continue
        out.append({
            "src": src, "row": i, "fleet": fleet, "model": model, "comp": comp,
            "oem": tidy(r[C_OEM]), "ras": tidy(r[C_RAS]),
            "rec": soft(r[C_REC]), "att": tidy(r[C_ATT]),
            "vol": tidy(r[C_VOL]), "freq": tidy(r[C_FREQ]), "lyr": tidy(r[C_LYR]),
            "alt": soft(r[C_ALT]), "altspec": soft(r[C_ALTSPEC]),
            "note": tidy(r[C_NOTE]),
        })
    return out


# A recommendation cell is sometimes one product, sometimes two with a season
# each, and the season is written either in front ("winter: X") or behind
# ("X - winter"). The season is the finding, so it is parsed rather than
# flattened.
# A season is marked in front of the name ("winter: X", and often twice in one
# line — "Summer: A winter -60C-18C: B"), or behind it ("X - winter"). Both
# forms appear in the same column of the same book.
MARK  = re.compile(r"\b(summer|winter|зим\w*|лет\w*)[^:]{0,28}:\s*", re.I)
TRAIL = re.compile(r"[-–,(]\s*(summer|winter|зим\w*|лет\w*)\b[^)]*\)?\s*$", re.I)
WARM  = re.compile(r"^(s|лет)", re.I)


def split_season(text):
    """{'summer': name, 'winter': name} or {'all': name}."""
    t = soft(text)
    if not t or t.strip(" .-—?") == "":
        return {}
    out, plain = {}, []
    for frag in re.split(r"\n|\s*/\s*|;", t):
        frag = frag.strip(" .;,")
        if not frag or frag in ("-", "?", "—"):
            continue
        marks = list(MARK.finditer(frag))
        if marks:
            for i, m in enumerate(marks):
                end = marks[i + 1].start() if i + 1 < len(marks) else len(frag)
                key = "summer" if WARM.match(m.group(1)) else "winter"
                val = frag[m.end():end].strip(" .;,-")
                # Anything before the first marker is an unlabelled name.
                if i == 0 and frag[:m.start()].strip(" .;,-"):
                    plain.append(frag[:m.start()].strip(" .;,-"))
                if val:
                    out.setdefault(key, val)
            continue
        m = TRAIL.search(frag)
        if m:
            key = "summer" if WARM.match(m.group(1)) else "winter"
            val = frag[:m.start()].strip(" .;,-")
            if val:
                out.setdefault(key, val)
            continue
        plain.append(frag)
    if plain and not out:
        return {"all": plain[0]} if len(plain) == 1 else \
               {"all": plain[0], "also": plain[1]}
    if plain:
        out.setdefault("all", plain[0])
    return out


# Every product name in one cell, season labels stripped.
def names_in(text):
    return [v for v in split_season(text).values()]


def main():
    missing = [f for f in (SPEC, MATRIX, AUDIT, REPLY)
               if not os.path.exists(os.path.join(SRC, f))]
    if missing:
        sys.exit("missing in docs/source: " + ", ".join(missing))

    shelf, packs = read_shelf(), read_packs()
    for k, v in shelf.items():
        v["pack"] = sorted(packs.get(k, []))

    plan = (read_plan(MATRIX, "Лист1", "matrix2027") +
            read_plan(AUDIT, "Lube Audit", "audit"))
    extra = read_plan(AUDIT, "Extra lubes required", "extra", fleet_col=False)

    # ── reconcile: every product named anywhere, against the shelf ──────────
    named = collections.defaultdict(lambda: {"n": 0, "where": set(), "as": set()})
    for row in plan + extra:
        for field in ("rec", "alt"):
            for nm in names_in(row[field]):
                if len(nm) < 6 or not re.search(
                        r"LEMARC|TEBOIL|LUKOIL|ЛУКОЙЛ", nm, re.I):
                    continue
                e = named[lookup(nm, shelf) or pid(nm)]
                e["n"] += 1
                e["where"].add(row["src"])
                e["as"].add(nm)

    on_shelf   = {k: v for k, v in named.items() if k in shelf}
    off_shelf  = {k: v for k, v in named.items() if k not in shelf}
    unassigned = {k: v for k, v in shelf.items() if k not in named}

    # ── type, taken from the compartments a product is recommended FOR ──────
    # Not from its name.  A name is marketing; the compartment is physics, and
    # the colour on the wall has to follow the compartment.  Where one product
    # serves two different jobs that is not a tie to break, it is the question
    # to raise: LEGUARD AC 5W30 is recommended for a powertrain AND for a
    # hydraulic tank on the same dozer.
    COMP_TYPE = [
        (r"engine|двигат", "engine"),
        (r"coolant|cooling|антифриз", "coolant"),
        (r"compressor", "compressor"),
        (r"open gear|grease open", "opengear"),
        (r"grease|lubricant point|centraliz|смазк|wheel bearing|front wheel",
         "grease"),
        (r"hydraulic|suspention|suspension|ride cylinder|steering", "hydraulic"),
        (r"power train|powertrain|transmission|torque|damper|transfer case|"
         r"pivot shaft", "powertrain"),
        (r"final drive|axle|differential|idler|roller|bogie|reducer|reduction|"
         r"gearbox|gear case|hoist|slew|crowd|propel|wheel reductor|tandem",
         "gear"),
        (r"rock drill|drill|separator tank|mist", "rockdrill"),
        (r"brake|тормоз", "brake"),
    ]

    def comp_type(name):
        n = name.lower()
        for rx, t in COMP_TYPE:
            if re.search(rx, n):
                return t
        return ""

    serves = collections.defaultdict(collections.Counter)
    for row in plan + extra:
        t = comp_type(row["comp"])
        if not t:
            continue
        for field in ("rec", "alt"):
            for nm in names_in(row[field]):
                k = lookup(nm, shelf)
                if k:
                    serves[k][t] += 1
    for k, v in shelf.items():
        c = serves.get(k)
        v["t"] = c.most_common(1)[0][0] if c else ""
        v["serves"] = dict(c) if c else {}
        v["split"] = len(c) > 1 if c else False

    # ── seasonal contradictions between the two matrices ───────────────────
    by_key = collections.defaultdict(dict)
    for row in plan:
        by_key[(row["model"], row["comp"])][row["src"]] = row
    seasons, disputed = [], []
    for (model, comp), v in by_key.items():
        for src, row in v.items():
            s = split_season(row["rec"])
            # A season split is summer AND winter. Two names in one cell with no
            # season on either is an alternative, not a seasonal answer, and
            # counting it here would inflate the one number this list exists to
            # report.
            if "summer" in s and "winter" in s and not any(x["model"] == model and x["comp"] == comp
                                      for x in seasons):
                seasons.append({"model": model, "comp": comp, "by": s,
                                "oem": row["oem"], "src": src})
        if len(v) == 2:
            a, b = v.get("matrix2027"), v.get("audit")
            if a and b and pid(a["rec"]) != pid(b["rec"]):
                disputed.append({"model": model, "comp": comp,
                                 "matrix": a["rec"], "audit": b["rec"],
                                 "oem": a["oem"] or b["oem"]})

    # ── the supplier's prose, kept whole ───────────────────────────────────
    notes, machine = [], ""
    for r in cells(REPLY, "Лист1"):
        a = tidy(r[0]) if r else ""
        b = tidy(r[1]) if len(r) > 1 else ""
        if a and not b:
            machine = a
        elif a and b:
            notes.append({"m": machine, "comp": a, "text": b})

    # Nobody has attached a single specification sheet.  The column exists in
    # both matrices and is empty in every row of both, which is the finding.
    attached = sum(1 for r in plan + extra if r["att"])

    # ── emit ───────────────────────────────────────────────────────────────
    def j(o):
        return json.dumps(o, ensure_ascii=False, separators=(",", ":"))

    prods = sorted(shelf.values(), key=lambda x: -x["q"])
    for p in prods:
        p.pop("k", None)

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("""/* GENERATED by docs/build-lube-catalog.py — do not edit by hand.

   The 2027 shelf, off Specification 02 rev CO-05, and what the supplier says
   goes in each compartment.  Two things live here that the masterlist cannot
   answer: what may actually be bought, and where the site's own documents
   disagree with each other.

   SHELF     one row per product procurement buys, with the volume and price
             that were signed for, the pack sizes it arrives in, and the job it
             is recommended for.  `split` means it is recommended for more than
             one job, which is a question, not a fact.
   PLAN      model x component -> recommendation, second option, OEM string,
             capacity, interval.  Both matrices, kept separate and labelled.
   SEASONS   compartments the supplier answered with a summer AND a winter
             product.  One fill cannot be right from -45 to +28.
   DISPUTED  compartments the two matrices answer differently.
   NOTES     the supplier's own prose, unedited.
*/
(function(w){
  "use strict";
""")
        f.write("var SHELF = " + j(prods) + ";\n")
        f.write("var PLAN = " + j(plan) + ";\n")
        f.write("var EXTRA = " + j(extra) + ";\n")
        f.write("var SEASONS = " + j(seasons) + ";\n")
        f.write("var DISPUTED = " + j(disputed) + ";\n")
        f.write("var NOTES = " + j(notes) + ";\n")
        f.write("var OFFSHELF = " + j(sorted(
            [{"as": sorted(v["as"])[0], "n": v["n"], "where": sorted(v["where"])}
             for v in off_shelf.values()], key=lambda x: -x["n"])) + ";\n")
        f.write("var UNASSIGNED = " + j(sorted(
            [{"p": v["p"], "q": v["q"], "u": v["u"]} for v in unassigned.values()],
            key=lambda x: -x["q"])) + ";\n")
        f.write("""
  function norm(s){ return String(s||"").toUpperCase().replace(/[^A-Z0-9]+/g," ").trim(); }
  w.LUBE2027 = {
    shelf: SHELF,
    plan: PLAN,
    extra: EXTRA,
    seasons: SEASONS,
    disputed: DISPUTED,
    notes: NOTES,
    /* Named in a matrix, not on the specification. Somebody has recommended an
       oil the site has not bought — every one of these is either a purchase
       order nobody raised or a recommendation nobody withdrew. */
    offShelf: OFFSHELF,
    /* On the specification, recommended for nothing. Either a compartment is
       missing from the matrices or the site is buying something it does not
       use. Both are worth a phone call. */
    unassigned: UNASSIGNED,
    product: function(name){
      var n = norm(name);
      for(var i=0;i<SHELF.length;i++)
        if(norm(SHELF[i].p) === n || norm(SHELF[i].ru).indexOf(n) >= 0) return SHELF[i];
      return null;
    },
    /* Every recommendation for one machine, both matrices, newest last. */
    forModel: function(model){
      var n = norm(model);
      return PLAN.filter(function(r){ return norm(r.model) === n; });
    },
    /* Litres and kilograms are not the same thing and must never be added. */
    volume: function(unit){
      return SHELF.filter(function(p){ return p.u === unit; })
                  .reduce(function(a,p){ return a + p.q; }, 0);
    },
    spend: function(){
      return SHELF.reduce(function(a,p){
        return a + (p.price ? p.price * p.q : 0); }, 0);
    }
  };
})(typeof window !== "undefined" ? window : this);
""")

    with open(OUT_TXT, "w", encoding="utf-8") as f:
        w = f.write
        w("THE 2027 LUBRICANT CATALOGUE — what is bought, and what it is for\n")
        w("=" * 74 + "\n\n")
        w("Sources, all in docs/source:\n")
        for fn in (SPEC, MATRIX, AUDIT, REPLY):
            w("  %s\n" % fn)
        w("\nPRODUCTS ON SPECIFICATION 02 rev CO-05        %5d\n" % len(shelf))
        w("recommended for at least one compartment       %5d\n" % len(on_shelf))
        w("bought but recommended for nothing             %5d\n" % len(unassigned))
        w("recommended but NOT on the specification       %5d\n" % len(off_shelf))
        w("recommendation rows read                       %5d\n" % len(plan))
        w("machines whose lubricant is not bought at all  %5d\n" % len(extra))
        w("compartments answered summer AND winter        %5d\n" % len(seasons))
        w("compartments the two matrices disagree on      %5d\n" % len(disputed))
        w("SPECIFICATION SHEETS ATTACHED                  %5d  <- of %d rows\n"
          % (attached, len(plan) + len(extra)))
        w("\ntotal litres  %12s\n" % f"{sum(p['q'] for p in prods if p['u']=='L'):,.0f}")
        w("total kg      %12s\n" % f"{sum(p['q'] for p in prods if p['u']=='kg'):,.0f}")
        w("total spend   %12s RUB, ex VAT\n"
          % f"{sum((p['price'] or 0)*p['q'] for p in prods):,.0f}")

        w("\n\nTHE SHELF\n" + "-" * 74 + "\n")
        w("%-46s %11s %-3s %-11s\n" % ("product", "2027", "", "job"))
        for p in prods:
            w("%-46s %11s %-3s %-11s%s\n"
              % (p["p"][:46], f"{p['q']:,.0f}", p["u"], p["t"] or "?",
                 "  SPLIT " + ",".join(sorted(p["serves"])) if p["split"] else ""))

        w("\n\nRECOMMENDED BUT NOT BOUGHT (%d)\n" % len(off_shelf) + "-" * 74 + "\n")
        w("Each of these is an oil somebody has told a fitter to use and\n"
          "procurement has not ordered.\n\n")
        for v in sorted(off_shelf.values(), key=lambda x: -x["n"]):
            w("  %-52s x%-3d %s\n" % (sorted(v["as"])[0][:52], v["n"],
                                      ",".join(sorted(v["where"]))))

        w("\n\nBOUGHT BUT RECOMMENDED FOR NOTHING (%d)\n" % len(unassigned)
          + "-" * 74 + "\n")
        for v in sorted(unassigned.values(), key=lambda x: -x["q"]):
            w("  %-52s %11s %s\n" % (v["p"][:52], f"{v['q']:,.0f}", v["u"]))

        w("\n\nSUMMER AND WINTER ARE DIFFERENT PRODUCTS HERE (%d)\n" % len(seasons)
          + "-" * 74 + "\n")
        w("The site runs -45 C to +28 C. One fill cannot be right at both ends,\n"
          "and a matrix with one product per compartment cannot say so.\n\n")
        for s in seasons:
            w("  %s — %s\n" % (s["model"], s["comp"]))
            for k in ("summer", "winter", "all"):
                if k in s["by"]:
                    w("      %-7s %s\n" % (k, s["by"][k][:60]))

        w("\n\nTHE TWO MATRICES DISAGREE (%d)\n" % len(disputed) + "-" * 74 + "\n")
        for d in disputed:
            w("  %s — %s\n      V3.1   %s\n      audit  %s\n"
              % (d["model"], d["comp"], d["matrix"][:60], d["audit"][:60]))

        w("\n\nTHE SUPPLIER'S OWN CAVEATS (%d)\n" % len(notes) + "-" * 74 + "\n")
        for n in notes:
            w("  [%s] %s\n      %s\n" % (n["m"], n["comp"], n["text"][:300]))

    print("shelf products   %5d" % len(shelf))
    print("plan rows        %5d" % len(plan))
    print("off shelf        %5d" % len(off_shelf))
    print("unassigned       %5d" % len(unassigned))
    print("seasonal splits  %5d" % len(seasons))
    print("disputed         %5d" % len(disputed))
    print("specs attached   %5d" % attached)
    print("bytes         %8d" % os.path.getsize(OUT_JS))


if __name__ == "__main__":
    main()
