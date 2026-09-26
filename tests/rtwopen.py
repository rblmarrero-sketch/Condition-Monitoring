#!/usr/bin/env python3
"""build_rtw_open() (ingest/ingest_work_orders.py) -- the filter that decides
what Return to Work's Pick screen, and the phone's own "1C PM" list, are
allowed to show. Root cause of "no dropdown list of work orders / nothing to
pick": that screen read window.CM_WO_DATA, a global mobile/index.html never
sets (that file is dashboard-only). The filter itself was correct and moved
here unchanged; this proves the move kept its own three field rules intact,
importable with no openpyxl/network dependency (see the function's own
docstring).

Also proves the Status filter's own bucketing (`pmStatus`: open / inprogress
/ complete, read from 1C's own CMMS status text) and the recently-completed
window -- asked for by name, "In progress and Complete" -- with a fixed
`as_of` so this test's own pass/fail never depends on what day it is run,
the identical lesson tests/progchg.cjs's own history already states about a
suite pinned to live 1C data.

Run: python3 tests/rtwopen.py
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))
from ingest_work_orders import build_rtw_open  # noqa: E402

fails = []


def ok(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (("   " + detail) if detail else ""))
    if not cond:
        fails.append(name)


AS_OF = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)

WORK_ORDERS = [
    {"woNumber": "WO-016635", "equip": "TK112", "cls": "HT", "open": True,
     "cmLabel": "4000h service", "maintType": "4000 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-18", "hours": 4000,
     "cmmsStatus": "Released"},
    # Not open, and no status text saying otherwise -- must be excluded.
    {"woNumber": "WO-000001", "equip": "TK500", "cls": "HT", "open": False,
     "cmLabel": "1000h service", "maintType": "1000 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-10"},
    # No work order number at all -- must be excluded.
    {"woNumber": None, "equip": "TK777", "cls": "HT", "open": True,
     "cmLabel": "500h service", "maintType": "500 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-12"},
    # "In progress" already has an actual-start date (open:False under the
    # old is_open heuristic) -- 1C's own status text says otherwise, and
    # that is now what decides it.
    {"woNumber": "WO-000004", "equip": "TK800", "cls": "GEN", "open": False,
     "cmLabel": "250h service", "maintType": "250 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-17", "hours": 250,
     "cmmsStatus": "In progress"},
    # "Completed" six days before as_of -- inside the 30-day window.
    {"woNumber": "WO-000005", "equip": "TK801", "cls": "GEN", "open": False,
     "cmLabel": "1000h service", "maintType": "1000 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-09-15", "hours": 1000,
     "cmmsStatus": "Completed", "actualEnd": "2026-09-20"},
    # "Completed" nearly four months before as_of -- outside the window.
    {"woNumber": "WO-000006", "equip": "TK802", "cls": "GEN", "open": False,
     "cmLabel": "250h service", "maintType": "250 Hours service Planned",
     "priority": "P3 Planned (PM)", "planStart": "2026-05-28", "hours": 250,
     "cmmsStatus": "Completed", "actualEnd": "2026-06-01"},
]
CM_DEDUP = [
    {"woNumber": "WO-016620", "asset": "TK126", "system": "Frame / guards",
     "descr": "Abnormal wear", "defectType": "2.1", "priority": "P2 Severe",
     "status": "In Progress", "date": "2026-09-19",
     "requestNo": "DR-000412", "cause": "Fatigue cracking"},
    # Still Registered, no work order number yet -- must be excluded.
    {"woNumber": None, "asset": "TK900", "system": "Boom",
     "descr": "Crack reported", "defectType": "1.1", "priority": "P3",
     "status": "Registered", "date": "2026-09-20"},
    # Closed, no completion date on record -- excluded for lack of a date to
    # judge "recently" by, not because CLOSED is treated differently from
    # Completed (both fall into the same "complete" bucket).
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
    # A defect work order 1C completed four days before as_of -- inside the
    # window, and the one case that needs its own "closed" date (a defect
    # has no actualEnd of its own).
    {"woNumber": "WO-000007", "asset": "TK901", "system": "Hydraulics",
     "descr": "Hose replaced", "defectType": "3.2", "priority": "P3",
     "status": "Completed", "date": "2026-09-22", "closed": "2026-09-22",
     "requestNo": "DR-000499", "cause": "Wear"},
]

rows = build_rtw_open(WORK_ORDERS, CM_DEDUP, as_of=AS_OF)
by_wo = {r["wo"]: r for r in rows}

ok("exactly the five rows that are open, in progress or recently completed survive",
   len(rows) == 5, str(sorted(by_wo.keys())))
ok("a work order that is not open and carries no status text is excluded", "WO-000001" not in by_wo)
ok("a planned service with no work order number is excluded", "TK777" not in {r["equip"] for r in rows})
ok("a defect still Registered with no work order number is excluded", "TK900" not in {r["equip"] for r in rows})
ok("a CLOSED defect with no completion date on record is excluded", "WO-000002" not in by_wo)
ok("a Completed defect with no completion date on record is excluded", "WO-000003" not in by_wo)
ok("a Completed service outside the recently-completed window is excluded", "WO-000006" not in by_wo)

ok("a planned service keeps its own shape, now with its type/hours/schedule, "
   "the office's own CMMS status and its own status bucket -- but no defect fields, since it isn't one",
   by_wo.get("WO-016635") == {
       "wo": "WO-016635", "equip": "TK112", "cls": "HT", "comp": "",
       "desc": "4000h service", "priority": "P3 Planned (PM)", "raised": "2026-09-18",
       "type": "4000 Hours service Planned", "hours": 4000, "plan": "2026-09-18",
       "status": "Released", "request": "", "defType": "", "cause": "",
       "pmStatus": "open", "completed": "",
   }, str(by_wo.get("WO-016635")))
ok("a defect work order keeps its own shape -- no hour tier, since a defect isn't one -- "
   "and now carries its status, work REQUEST number, type, cause and status bucket",
   by_wo.get("WO-016620") == {
       "wo": "WO-016620", "equip": "TK126", "cls": "", "comp": "Frame / guards",
       "desc": "Abnormal wear", "priority": "P2 Severe", "raised": "2026-09-19",
       "type": "2.1", "hours": None, "plan": "",
       "status": "In Progress", "request": "DR-000412", "defType": "2.1", "cause": "Fatigue cracking",
       "pmStatus": "inprogress", "completed": "",
   }, str(by_wo.get("WO-016620")))
ok("a service 1C calls \"In progress\" is now included, bucketed inprogress, "
   "though it is not \"open\" by the actual-start heuristic",
   by_wo.get("WO-000004", {}).get("pmStatus") == "inprogress", str(by_wo.get("WO-000004")))
ok("a service 1C completed inside the window is included, bucketed complete, "
   "and carries its own completion date",
   by_wo.get("WO-000005", {}).get("pmStatus") == "complete"
   and by_wo.get("WO-000005", {}).get("completed") == "2026-09-20",
   str(by_wo.get("WO-000005")))
ok("a defect 1C completed inside the window is included from its own \"closed\" "
   "date -- a defect has no actualEnd of its own to read",
   by_wo.get("WO-000007", {}).get("pmStatus") == "complete"
   and by_wo.get("WO-000007", {}).get("completed") == "2026-09-22",
   str(by_wo.get("WO-000007")))

ok("a work order number seen once is never repeated by a later, colliding row",
   sum(1 for r in rows if r["wo"] == "WO-016635") == 1)
ok("newest raised date first",
   [r["wo"] for r in rows] == ["WO-000007", "WO-016620", "WO-016635", "WO-000004", "WO-000005"],
   str([r["wo"] for r in rows]))

if fails:
    print(f"\n{len(fails)} FAILED:\n- " + "\n- ".join(fails))
    sys.exit(1)
print("\nall passed")
