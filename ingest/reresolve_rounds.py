"""Re-resolve cmTypes/cmLabel on an EXISTING data/work_orders.js, in place.

WHY THIS EXISTS. The hourly job (.github/workflows/refresh-work-orders.yml)
pulls a fresh WO.xlsx and rebuilds the file from scratch, and that is the
normal path. But when the MAPPING changes rather than the data — as it did
when a tier stopped meaning "the round whose interval is exactly this" and
started meaning "the visit a machine at this many hours is getting" — the
fleet should not have to wait an hour to see a schedule that was wrong. And
1C's workbook is not reachable from every machine this repo is worked on.

Every input resolve_cm_types needs is already in the file: equip, hours and
the class. So this reads the file, runs THE INGESTER'S OWN function over the
rows it already holds, applies the same within-visit dedupe, and writes it
back. It is the same function on the same rows, not a second implementation
— which is the only reason it is allowed to exist at all.

It regenerates the phone's slice (data/schedule_slim.json) too, by the same
rule the ingester uses, or the two surfaces would disagree until the next
hourly run.

    python3 ingest/reresolve_rounds.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iwo", ROOT / "ingest" / "ingest_work_orders.py")
iwo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(iwo)

WO_JS = ROOT / "data" / "work_orders.js"
SLIM = ROOT / "data" / "schedule_slim.json"


def main():
    text = WO_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.CM_WO_DATA\s*=\s*(\{.*\});\s*$", text, re.S)
    if not m:
        raise SystemExit(f"could not find window.CM_WO_DATA in {WO_JS}")
    head = text[: m.start()]
    data = json.loads(m.group(1))
    rows = data.get("workOrders", [])
    class_rounds = iwo.load_class_rounds()

    changed = 0
    for w in rows:
        before = tuple(w.get("cmTypes") or ())
        label, types = iwo.resolve_cm_types(w.get("hours"), w.get("cls") or "", class_rounds)
        w["cmLabel"], w["cmTypes"] = label, types
        if tuple(types or ()) != before:
            changed += 1

    # THE INGESTER'S OWN dedupe, imported rather than repeated — two
    # implementations of one rule is how the office and the field come to
    # disagree about which order a round belongs to.
    trimmed = iwo.dedupe_within_visit(rows, class_rounds)
    data["roundsDedupedWithinVisit"] = trimmed

    WO_JS.write_text(head + "window.CM_WO_DATA = "
                     + json.dumps(data, indent=2, ensure_ascii=False) + ";\n",
                     encoding="utf-8")

    # The phone's slice, by the ingester's own rule: still open, has a plan
    # date, and resolved to a real CM round.
    by_unit = {}
    for w in rows:
        if not w.get("open") or not w.get("cmTypes") or not w.get("planStart"):
            continue
        by_unit.setdefault(w["equip"], []).append({
            "wo": w.get("woNumber"), "hours": w.get("hours"), "types": w["cmTypes"],
            "plan": w["planStart"], "priority": w.get("priority"),
        })
    slim = {"generated": data.get("generated"), "source": data.get("source"), "byUnit": by_unit}
    SLIM.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + "\n",
                    encoding="utf-8")

    print(f"re-resolved {len(rows)} work order(s); {changed} changed round(s); "
          f"{trimmed} round(s) deduped within a visit; "
          f"phone slice: {len(by_unit)} unit(s)")


if __name__ == "__main__":
    main()
