#!/usr/bin/env python3
"""build_rtw_open() (ingest/ingest_work_orders.py) -- the filter that decides
what Return to Work's Pick screen on the phone is allowed to show. Root
cause of "no dropdown list of work orders / nothing to pick": that screen
read window.CM_WO_DATA, a global mobile/index.html never sets (that file is
dashboard-only). The filter itself was correct and moved here unchanged; this
proves the move kept its own three field rules intact, importable with no
openpyxl/network dependency (see the function's own docstring).

Run: python3 tests/rtwopen.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))
from ingest_work_orders import build_rtw_open  # noqa: E402

fails = []


def ok(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (("   " + detail) if detail else ""))
    if not cond:
        fails.append(name)


WORK_ORDERS = [
    {"woNumber": "WO-016635", "equip": "TK112", "cls": "HT", "open": True,
     "cmLabel": "4000h service", "maintType": "4000 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-18", "hours": 4000},
    # Not open -- must be excluded.
    {"woNumber": "WO-000001", "equip": "TK500", "cls": "HT", "open": False,
     "cmLabel": "1000h service", "maintType": "1000 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-10"},
    # No work order number at all -- must be excluded.
    {"woNumber": None, "equip": "TK777", "cls": "HT", "open": True,
     "cmLabel": "500h service", "maintType": "500 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-12"},
]
CM_DEDUP = [
    {"woNumber": "WO-016620", "asset": "TK126", "system": "Frame / guards",
     "descr": "Abnormal wear", "defectType": "2.1", "priority": "P2 Severe",
     "status": "In Progress", "date": "2026-09-19"},
    # Still Registered, no work order number yet -- must be excluded.
    {"woNumber": None, "asset": "TK900", "system": "Boom",
     "descr": "Crack reported", "defectType": "1.1", "priority": "P3",
     "status": "Registered", "date": "2026-09-20"},
    # Closed -- must be excluded, case-insensitively.
    {"woNumber": "WO-000002", "asset": "TK501", "system": "Engine",
     "descr": "Old defect", "defectType": "5.1", "priority": "P4",
     "status": "CLOSED", "date": "2026-09-10"},
    {"woNumber": "WO-000003", "asset": "TK502", "system": "Engine",
     "descr": "Old defect", "defectType": "5.1", "priority": "P4",
     "status": "Completed", "date": "2026-09-11"},
    # Same work order number as a planned service above -- the planned
    # service was seen first and must win; this row must be dropped, not
    # merged or duplicated.
    {"woNumber": "WO-016635", "asset": "TK112", "system": "should not appear",
     "descr": "should not appear", "defectType": "", "priority": "",
     "status": "In Progress", "date": "2026-09-21"},
]

rows = build_rtw_open(WORK_ORDERS, CM_DEDUP)
by_wo = {r["wo"]: r for r in rows}

ok("exactly the two genuinely open, numbered work orders survive",
   len(rows) == 2, str(sorted(by_wo.keys())))
ok("a work order that is not open is excluded", "WO-000001" not in by_wo)
ok("a planned service with no work order number is excluded", "TK777" not in {r["equip"] for r in rows})
ok("a defect still Registered with no work order number is excluded", "TK900" not in {r["equip"] for r in rows})
ok("a CLOSED defect is excluded, case-insensitively", "WO-000002" not in by_wo)
ok("a Completed defect is excluded", "WO-000003" not in by_wo)
ok("a planned service keeps its own shape, now with its type/hours/schedule",
   by_wo.get("WO-016635") == {
       "wo": "WO-016635", "equip": "TK112", "cls": "HT", "comp": "",
       "desc": "4000h service", "priority": "P3 Planned (PM)", "raised": "2026-09-18",
       "type": "4000 Hours service Planned", "hours": 4000, "plan": "2026-09-18",
   }, str(by_wo.get("WO-016635")))
ok("a defect work order keeps its own shape -- no hour tier, since a defect isn't one",
   by_wo.get("WO-016620") == {
       "wo": "WO-016620", "equip": "TK126", "cls": "", "comp": "Frame / guards",
       "desc": "Abnormal wear", "priority": "P2 Severe", "raised": "2026-09-19",
       "type": "2.1", "hours": None, "plan": "",
   }, str(by_wo.get("WO-016620")))
ok("a work order number seen once is never repeated by a later, colliding row",
   sum(1 for r in rows if r["wo"] == "WO-016635") == 1)
ok("newest raised date first",
   [r["wo"] for r in rows] == ["WO-016620", "WO-016635"], str([r["wo"] for r in rows]))

if fails:
    print(f"\n{len(fails)} FAILED:\n- " + "\n- ".join(fails))
    sys.exit(1)
print("\nall passed")
