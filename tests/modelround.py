#!/usr/bin/env python3
"""resolve_cm_types / dedupe_within_visit (ingest/ingest_work_orders.py) with a
MODEL rule in the round map.

The site put the Terex TR60 haul trucks on the Lubrication Audit every 500 h
(due.js byModel). The 1C mapping is class-keyed, and a model is not a class:
the 16 TR60 share HT with 30 KAMAZ and 5 IVECO. gen_class_rounds.cjs writes the
model's figure into class_rounds.generated.json as `models`, and the ingester
has to apply it to the machines whose model text matches -- and ONLY those.
Everything here asks the ingester's own functions; nothing is re-implemented.

Also: the 24 cranes are class CRN and the general inspection names the class,
so a crane's 1,000 h order resolves to it, where as GEN it resolved to nothing.

Run: python3 tests/modelround.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "ingest"))
import ingest_work_orders as iwo  # noqa: E402

fails = []


def ok(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (("   " + detail) if detail else ""))
    if not cond:
        fails.append(name)


# The real register, read the way the ingester reads it.
cls_by = iwo.load_asset_classes()
assets = json.loads(__import__("re").search(
    r"window\.ASSETS\s*=\s*(\[.*\])\s*;", (ROOT / "mobile" / "assets.js").read_text(encoding="utf-8"), __import__("re").S).group(1))
tr60 = [a["n"] for a in assets if "TR60" in ((a.get("m") or "") + (a.get("mk") or "")).upper()]
iveco = [a["n"] for a in assets if a.get("cls") == "HT" and "IVECO" in (a.get("m") or "").upper()]
cranes = [a["n"] for a in assets if a.get("cat") == "CRANE, MOBILE"]

# A round map shaped exactly as gen_class_rounds.cjs writes it.
RR = {
    "MP":   {"restricted": True,  "classes": {"HT": 250, "AT": 250}, "models": []},
    "LUBE": {"restricted": False, "classes": {"HT": None}, "models": [{"model": "TR60", "h": 500}]},
    "INSP": {"restricted": True,  "classes": {"HT": 1000, "CRN": 1000}, "models": []},
}

ok("the register has TR60 trucks, IVECO trucks and cranes to ask about", bool(tr60 and iveco and cranes),
   f"{len(tr60)} / {len(iveco)} / {len(cranes)}")
ok("a model is found by its register text, not guessed", iwo.model_of(tr60[0]).find("TR60") >= 0, iwo.model_of(tr60[0]))
ok("an unknown machine has no model, so no model rule", iwo.model_of("ZZ999") == "")

for hrs, want in ((500, ["LUBE", "MP"]), (1000, ["INSP", "LUBE", "MP"]), (250, ["MP"]), (600, [])):
    label, types = iwo.resolve_cm_types(hrs, "HT", RR, tr60[0])
    ok(f"a TR60's {hrs} h order resolves to {want or 'nothing'}", (types or []) == want, str(types))

label, types = iwo.resolve_cm_types(500, "HT", RR, iveco[0])
ok("an IVECO of the same class gets NO lubrication on its 500 h order", "LUBE" not in (types or []), str(types))
label, types = iwo.resolve_cm_types(500, "HT", RR)
ok("called as before, with no machine, the answer is the class's own", "LUBE" not in (types or []) and types == ["MP"], str(types))
label, types = iwo.resolve_cm_types(500, "HT", {"LUBE": {"classes": {}}, "MP": RR["MP"]}, tr60[0])
ok("a round map from before this change (no `models` key at all) still resolves", types == ["MP"], str(types))

label, types = iwo.resolve_cm_types(1000, "CRN", RR, cranes[0])
ok("a crane's 1,000 h order resolves to the general inspection", types == ["INSP"], str(types))
label, types = iwo.resolve_cm_types(1000, "GEN", RR, cranes[0])
ok("and as GEN it did not -- which is what the new class changes", types is None, str(types))
ok("the register puts every crane in CRN", all(cls_by.get(c) == "CRN" for c in cranes))

# One visit, two orders: the within-visit dedupe reads the model's interval too.
visit = [
    {"equip": tr60[0], "planStart": "2026-11-01", "cls": "HT", "hours": 500,
     "cmTypes": ["LUBE", "MP"], "cmLabel": "x"},
    {"equip": tr60[0], "planStart": "2026-11-01", "cls": "HT", "hours": 1000,
     "cmTypes": ["INSP", "LUBE", "MP"], "cmLabel": "x"},
]
iwo.dedupe_within_visit(visit, RR)
ok("the 500 h order keeps the audit it names (its tier IS the model's interval)", "LUBE" in (visit[0]["cmTypes"] or []),
   str(visit[0]["cmTypes"]))
ok("and the 1,000 h order does not claim it a second time", "LUBE" not in (visit[1]["cmTypes"] or []),
   str(visit[1]["cmTypes"]))

# A MODEL RULE STARTS ON ITS OWN DATE. due.js states when the site put the
# TR60 on the audit (`since`); a work order planned before that did not owe it.
# The day is read off due.js through the generated map, never typed here.
since = None
for r in (iwo.load_class_rounds().get("LUBE", {}).get("models") or []):
    if r.get("model") == "TR60":
        since = r.get("since")
RS = dict(RR, LUBE={"restricted": False, "classes": {"HT": None},
                    "models": [{"model": "TR60", "h": 500, "since": "2026-10-04"}]})
label, types = iwo.resolve_cm_types(4000, "HT", RS, tr60[0], "2026-09-13")
ok("a TR60's 4,000 h order planned before the rule's date does not owe the audit (TK156, 13 Sep)",
   "LUBE" not in (types or []) and "MP" in (types or []), str(types))
label, types = iwo.resolve_cm_types(4000, "HT", RS, tr60[0], "2026-10-04")
ok("  one planned ON the date does", "LUBE" in (types or []), str(types))
label, types = iwo.resolve_cm_types(500, "HT", RS, tr60[0], "2026-11-20")
ok("  and so does one planned after it", "LUBE" in (types or []), str(types))
label, types = iwo.resolve_cm_types(500, "HT", RS, tr60[0])
ok("  an order with no plan date is a future order and takes the rule", "LUBE" in (types or []), str(types))
label, types = iwo.resolve_cm_types(500, "HT", RR, tr60[0], "2026-01-01")
ok("  a rule with no date of its own applies whatever the order's date", "LUBE" in (types or []), str(types))
visit_old = [
    {"equip": tr60[0], "planStart": "2026-09-13", "cls": "HT", "hours": 500, "cmTypes": ["MP"], "cmLabel": "x"},
    {"equip": tr60[0], "planStart": "2026-09-13", "cls": "HT", "hours": 1000, "cmTypes": ["INSP", "MP"], "cmLabel": "x"},
]
iwo.dedupe_within_visit(visit_old, RS)
ok("  the within-visit dedupe reads the same date (no audit appears on a September visit)",
   all("LUBE" not in (w["cmTypes"] or []) for w in visit_old), str([w["cmTypes"] for w in visit_old]))
ok("the generated round map carries the date due.js states, or predates this change",
   since in (None, "2026-10-04"), str(since))

print("\nFAILED: " + ", ".join(fails) if fails else "\nall good")
sys.exit(1 if fails else 0)
