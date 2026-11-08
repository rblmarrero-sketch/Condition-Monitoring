#!/usr/bin/env python3
"""CM_EXISTDEF_V1 (Rickie 08.11.2026): the ingester keeps other people's defects
(otherDefects) so the day summary can name an "Existing defect". Builds a WO.xlsx
with the live export's own columns and runs the real ingester on it."""
import json, subprocess, sys, tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
fails = 0
def ok(name, cond, info=""):
    global fails
    print(("  PASS  " if cond else "  FAIL  ") + name + (("   " + str(info)) if info else ""))
    if not cond: fails += 1
try:
    import openpyxl
except ImportError:
    print("SKIP  openpyxl not installed"); sys.exit(0)
src = (ROOT / "data/work_orders.js").read_text(encoding="utf-8")
COLS = json.loads(src[src.index("{"): src.rindex("}") + 1])["columns"]
need = ["Work request creation date", "Work request number", "Responsible person", "CMMSWork order status", "System component"]
for n in need: ok(f"the live export carries '{n}'", n in COLS)
now = datetime.now(timezone.utc).replace(tzinfo=None)
d = lambda days: (now - timedelta(days=days)).strftime("%d.%m.%Y %H:%M:%S")
def row(**kw):
    r = {c: None for c in COLS}
    r.update({"Asset description": "x", "Work order status": "REL", "Maintenence type": "Repair unplanned",
              "Priority": "P2 Urgent", "Start date plan": d(1), "End date plan": d(1)})
    r.update(kw); return [r.get(c) for c in COLS]
rows = [
    row(**{"Equip no": "EX016", "Work order number": "WO-1", "Work request number": "DD-00015100",
           "Work request creation date": d(5), "Responsible person": "Kim D.", "Contact person initiator WR": "Petrov A. (mechanic)", "CMMSWork order status": "Elimination scheduled",
           "System component": "EX016.DRS.ENG (Engine)"}),
    row(**{"Equip no": "EX016", "Work order number": "WO-2", "Work request number": "DD-00014000",
           "Work request creation date": d(90), "Responsible person": "Lee S.", "CMMSWork order status": "Completed",
           "System component": "EX016.HS.MP"}),
    row(**{"Equip no": "EX016", "Work order number": "WO-3", "Work request number": "DD-00014900",
           "Work request creation date": d(20), "Responsible person": "Lee S.", "CMMSWork order status": "Completed",
           "System component": "EX016.HS.MP"}),
    row(**{"Equip no": "DZ011", "Work order number": "WO-4", "Work request number": "DD-00015200",
           "Work request creation date": d(3), "Responsible person": "Slam", "CMMSWork order status": "Registered",
           "System component": "DZ011.ENG"}),
]
with tempfile.TemporaryDirectory() as tmp:
    xl = Path(tmp) / "WO.xlsx"; wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Sheet_1"
    ws.append(COLS); [ws.append(r) for r in rows]; wb.save(xl)
    out = Path(tmp) / "work_orders.js"
    p = subprocess.run([sys.executable, str(ROOT / "ingest/ingest_work_orders.py"), str(xl), "--out", str(out)], capture_output=True, text=True)
    ok("the ingester runs", p.returncode == 0, (p.stdout + p.stderr)[-400:])
    t = out.read_text(encoding="utf-8"); data = json.loads(t[t.index("{"): t.rindex("}") + 1])
    od = {r["defect"]: r for r in data.get("otherDefects", [])}
    ok("an open defect raised by another supervisor is kept", "DD-00015100" in od and od["DD-00015100"]["by"] == "Kim D.", list(od))
    ok("its status, system and date travel with it", od.get("DD-00015100", {}).get("status") == "Elimination scheduled" and "DRS.ENG" in (od.get("DD-00015100", {}).get("system") or "") and od.get("DD-00015100", {}).get("raised"))
    ok("who registered it (Contact person initiator WR) travels as regBy", od.get("DD-00015100", {}).get("regBy") == "Petrov A. (mechanic)", od.get("DD-00015100", {}).get("regBy"))
    ok("a completed one older than 60 days is left out", "DD-00014000" not in od)
    ok("a completed one from the last 60 days is kept (a comment may cite it)", "DD-00014900" in od)
    ok("the CM team's own defect is not repeated here", "DD-00015200" not in od and any(r.get("defect") == "DD-00015200" for r in data["cmWorkOrders"]))
print("\nall passed" if not fails else f"\n{fails} FAILED"); sys.exit(1 if fails else 0)
