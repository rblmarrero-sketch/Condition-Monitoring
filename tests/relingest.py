#!/usr/bin/env python3
"""The reliability half of ingest/ingest_work_orders.py, end to end.

MTBF, MTTR and availability (dashboard/reliability.js) are worked out from the
corrective work orders this ingester used to drop. This builds a real WO.xlsx
with openpyxl -- every column the live export carries, as read off the
committed data/work_orders.js -- runs the ingester's main() against it, and
reads back data/reliability.json:

  - planned hour-tier services are NOT reliability events;
  - a corrective work order that has not started, or started before the
    window, is not one either;
  - 1C's repeat rows for one work order collapse to one event, keeping the
    largest figure;
  - every hours cell is read whatever shape 1C wrote it in (a number, "3:30",
    "2,5") and the shapes are COUNTED in relProfile, so a column that stops
    arriving, or arrives unreadable, is a number and not a silent zero;
  - every unit 1C carries a work order for is in the population, broken down
    or not.

Run: python3 tests/relingest.py   (needs openpyxl)
"""
import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
fails = []


def ok(name, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (("   " + str(detail)) if detail else ""))
    if not cond:
        fails.append(name)


try:
    import openpyxl
except ImportError:
    print("SKIP  openpyxl not installed")
    sys.exit(0)

src = (ROOT / "data/work_orders.js").read_text(encoding="utf-8")
data = json.loads(src[src.index("{"): src.rindex("}") + 1])
COLS = data["columns"]
for need in ("Maintenence type", "Priority", "Start date actual", "End date actual",
             "Duration actual hours", "Down time by documents", "Count of break down from p1"):
    ok(f"the live export carries '{need}'", need in COLS)

now = datetime.now(timezone.utc).replace(tzinfo=None)
d = lambda days, h=8: (now - timedelta(days=days)).replace(hour=h, minute=0, second=0, microsecond=0).strftime("%d.%m.%Y %H:%M:%S")


def row(**kw):
    r = {c: None for c in COLS}
    r.update({"Asset description": "x", "Work order status": "CLSD", "CMMSWork order status": "Completed"})
    for k, v in kw.items():
        r[k] = v
    return [r[c] for c in COLS]


rows = [
    # a planned service -- not a reliability event
    row(**{"Equip no": "TK101", "Maintenence type": "250 Hours service Planned", "Work order number": "WO-1",
           "Priority": "P3 Planned (PM)", "Start date plan": d(5), "End date plan": d(5),
           "Start date actual": d(5), "End date actual": d(5, 12), "Down time by documents": 4}),
    # a P1 breakdown, downtime as a number; 1C repeats it on a second row with a bigger figure
    row(**{"Equip no": "TK101", "Maintenence type": "Repair unplanned", "Work order number": "WO-2",
           "Priority": "P1 Breakdown", "Start date plan": d(10), "End date plan": d(10),
           "Start date actual": d(10), "End date actual": d(10, 20), "Down time by documents": 10,
           "Duration actual hours": 9, "Count of break down from p1": 1}),
    row(**{"Equip no": "TK101", "Maintenence type": "Repair unplanned", "Work order number": "WO-2",
           "Priority": "P1 Breakdown", "Start date plan": d(10), "End date plan": d(10),
           "Start date actual": d(10), "End date actual": d(10, 20), "Down time by documents": 12,
           "Count of break down from p1": 1}),
    # downtime written as H:MM
    row(**{"Equip no": "EX005", "Maintenence type": "Repair unplanned", "Work order number": "WO-3",
           "Priority": "P1 Breakdown", "Start date plan": d(20), "End date plan": d(20),
           "Start date actual": d(20), "End date actual": d(20, 12), "Down time by documents": "3:30"}),
    # comma decimal in duration, no downtime
    row(**{"Equip no": "EX005", "Maintenence type": "Repair planned", "Work order number": "WO-4",
           "Priority": "P4 Planned (Repair)", "Start date plan": d(30), "End date plan": d(30),
           "Start date actual": d(30), "End date actual": d(30, 10), "Duration actual hours": "2,5"}),
    # an unreadable downtime cell
    row(**{"Equip no": "DZ001", "Maintenence type": "Repair unplanned", "Work order number": "WO-5",
           "Priority": "P1 Breakdown", "Start date plan": d(40), "End date plan": d(40),
           "Start date actual": d(40), "End date actual": None, "Down time by documents": "n/a"}),
    # not started -- no event
    row(**{"Equip no": "DZ001", "Maintenence type": "Repair unplanned", "Work order number": "WO-6",
           "Priority": "P1 Breakdown", "Start date plan": d(1), "End date plan": d(1)}),
    # started before the window -- no event
    row(**{"Equip no": "DZ001", "Maintenence type": "Repair unplanned", "Work order number": "WO-7",
           "Priority": "P1 Breakdown", "Start date plan": d(500), "End date plan": d(500),
           "Start date actual": d(500), "End date actual": d(500, 12), "Down time by documents": 5}),
    # the field shape read off the first live pull (2026-10-01): "Down time by
    # documents" blank, the accumulation-register column carrying the machine's
    # running total for the period. The register figure is NOT this job's
    # downtime and must never become it.
    row(**{"Equip no": "BL001", "Maintenence type": "Mining Unplanned", "Work order number": "WO-9",
           "Priority": "P1 Breakdown", "Start date plan": d(15), "End date plan": d(15),
           "Start date actual": d(15), "End date actual": d(15, 11), "Duration actual hours": 3,
           "Down time by accamulation register per period": 926, "Count of break down from p1": 1}),
    # a unit with nothing but planned work -- still in the population
    row(**{"Equip no": "GR003", "Maintenence type": "500 Hours service Planned", "Work order number": "WO-8",
           "Priority": "P3 Planned (PM)", "Start date plan": d(3), "End date plan": d(3)}),
]

with tempfile.TemporaryDirectory() as tmp:
    xl = Path(tmp) / "WO.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet_1"
    ws.append(COLS)
    for r in rows:
        ws.append(r)
    wb.save(xl)
    out = Path(tmp) / "work_orders.js"
    p = subprocess.run([sys.executable, str(ROOT / "ingest/ingest_work_orders.py"), str(xl), "--out", str(out)],
                       capture_output=True, text=True)
    ok("the ingester runs", p.returncode == 0, (p.stdout + p.stderr)[-600:])
    rel_path = Path(tmp) / "reliability.json"
    ok("it writes data/reliability.json beside work_orders.js", rel_path.exists())
    if not rel_path.exists():
        print("\nFAILED " + str(len(fails)))
        sys.exit(1)
    rel = json.loads(rel_path.read_text(encoding="utf-8"))
    wo_js = out.read_text(encoding="utf-8")
    ok("work_orders.js does not carry the reliability events (the page loads it whole)",
       "relEvents" not in wo_js)
    ev = {e["wo"]: e for e in rel["relEvents"]}
    ok("the planned services are not events", "WO-1" not in ev and "WO-8" not in ev, sorted(ev))
    ok("a corrective work order not yet started is not an event", "WO-6" not in ev)
    ok("one started before the window is not an event", "WO-7" not in ev)
    ok("1C's two rows for WO-2 are one event", sum(1 for e in rel["relEvents"] if e["wo"] == "WO-2") == 1)
    ok("keeping the larger downtime of the two", ev.get("WO-2", {}).get("downH") == 12, ev.get("WO-2"))
    ok("and the breakdown count", ev.get("WO-2", {}).get("bd") == 1)
    ok("'3:30' is three and a half hours", abs((ev.get("WO-3", {}).get("downH") or 0) - 3.5) < 1e-9, ev.get("WO-3"))
    ok("'2,5' is two and a half hours", abs((ev.get("WO-4", {}).get("durH") or 0) - 2.5) < 1e-9, ev.get("WO-4"))
    ok("an unreadable cell is null, not zero", ev.get("WO-5", {}).get("downH") is None, ev.get("WO-5"))
    ok("an event carries its start and end", ev.get("WO-2", {}).get("startDt") and ev.get("WO-2", {}).get("endDt"))
    shapes = rel["relProfile"]["shape"].get("down", {})
    ok("the unreadable cell is COUNTED as 'other'", shapes.get("other") == 1, shapes)
    ok("and the H:MM one as 'hhmm'", shapes.get("hhmm") == 1, shapes)
    ok("the maintenance types in the window are counted", rel["relProfile"]["maintType"].get("Repair unplanned", 0) >= 3,
       rel["relProfile"]["maintType"])
    ok("the population is every unit with a work order, broken down or not",
       all(u in rel["relUnits"] for u in ("TK101", "EX005", "DZ001", "GR003")), rel["relUnits"])
    ok("which columns were found is said", rel["relColumns"].get("down") == "Down time by documents", rel["relColumns"])
    if "Down time by accamulation register per period" in COLS:
        ok("the register's running total is never a job's downtime", ev.get("WO-9", {}).get("downH") is None, ev.get("WO-9"))
        ok("and the job keeps its own actual duration", ev.get("WO-9", {}).get("durH") == 3, ev.get("WO-9"))
        ok("nothing is filed as coming from the register", all(e.get("downFrom") != "register" for e in rel["relEvents"]))
        ok("the register column is still counted in the profile",
           rel["relProfile"]["shape"].get("downReg", {}).get("num", 0) >= 1, rel["relProfile"]["shape"].get("downReg"))
    else:
        ok("the live export still carries the register column this test reproduces", False)
    ok("no internal field leaks into the file", all("_shape" not in e for e in rel["relEvents"]))

print("\nFAILED " + str(len(fails)) + ": " + " | ".join(fails) if fails else "\nall passed")
sys.exit(1 if fails else 0)
