#!/usr/bin/env python3
"""ingest_work_orders.py -- pull 1C's WO.xlsx (via the AS_KPI pipeline) and
extract the fleet's PLANNED preventive-maintenance service work orders (the
"N Hours service Planned" maintenance types 1C already schedules on a
calendar date) into data/work_orders.js.

This is the "plan" half of the Plan vs Actual tab. The "actual" half is
whatever Condition Monitoring already has in RECS (every round any inspector
has walked, bundled or synced) -- the dashboard joins the two client-side,
per unit, by nearest date. This script's own job stops at 1C's plan/actual
columns PLUS one thing the dashboard cannot work out for itself: which CM
round type(s) a given "N Hours service" plausibly corresponds to, which
needs the unit's equipment CLASS (mobile/assets.js), not just its hours.

WHY CLASS, NOT JUST HOURS. due.js does not give every round one interval:
Magnetic Plug is 250h but only fitted on HT/AT; Undercarriage is 1000h on
dozers and 4000h on excavators. Reading only the hour figure in 1C's
"Maintenence type" column, the way the first pass of this script did, means
a dozer's 1000h service and a haul truck's 1000h service resolve to the same
guess even though due.js fits them on different rounds -- and a "TK" prefix
filter hid that gap entirely, because every TK unit is one class (HT).
Covering the fleet's other classes (dozers, excavators, articulated trucks,
loaders, graders, ...) means resolving by (hours, class), not hours alone.

PREREQUISITE: run ingest/gen_class_rounds.cjs first (see its own header) to
produce ingest/class_rounds.generated.json -- this script reads that file
rather than hand-typing due.js's numbers into a second table, which is how
an earlier pass of this script put articulated trucks on Undercarriage at
1000h, a pairing due.js never states.

KNOWN GAP, NOT PAPERED OVER: due.js's own comment above the Dump Body Liner
entry (TB) says haul trucks are "also" on it at the round's default 1000h --
but roundsOnClass() (mobile/index.html), which this pipeline trusts for
class membership, only reads the byClass override it names for articulated
trucks (4000h) and never adds haul trucks from the prose alone. So a haul
truck's 1000h service currently resolves to no CM round match ("1000h
service") rather than Dump Body Liner, until that gap is fixed at the
source (roundsOnClass() itself, or an explicit onClass on TB in due.js) --
not something this script should paper over with a guess of its own.

Usage:
    python3 ingest/ingest_work_orders.py [source] [--out data/work_orders.js] [--fleet TK]

    source   path or URL to WO.xlsx. Defaults to the AS_KPI pipeline's public
             copy: https://askpi.94-131-94-152.sslip.io/WO.xlsx
    --fleet  equipment-number prefix to keep (repeatable). Default: none --
             the whole workbook, scored against the same 1,128-unit register
             the dashboard's own coverage panel already uses. Pass
             --fleet TK to narrow to one prefix if you want a smaller test run.

Re-run this whenever you want a fresher plan-vs-actual comparison -- it is
not wired into a schedule yet. See the ship note for a GitHub Actions
version that runs this automatically and commits the refreshed file.
"""
import io
import json
import re
import sys
import urllib.request
import ssl
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SOURCE = "https://askpi.94-131-94-152.sslip.io/WO.xlsx"
DEFAULT_OUT = "data/work_orders.js"
ASSETS_PATH = Path(__file__).resolve().parent.parent / "mobile" / "assets.js"

# 1C's "Maintenence type" column (their spelling, not ours) for a calendar
# planned PM service. Matches "250 Hours service Planned", "1000 Hours
# service Planned", etc.
PLANNED_SERVICE_RE = re.compile(r"^\s*\d+\s*Hours?\s+service\s+Planned\s*$", re.I)

# 1C dates come as "DD.MM.YYYY HH:MM:SS" strings (dayfirst) -- same trap as
# AS_KPI.xlsx, see the AS_KPI project's validator notes.
DATE_FMT = "%d.%m.%Y %H:%M:%S"

# ---------------------------------------------------------------------------
# THE CLASS-AWARE ROUND MAP -- NOT hand-typed here. An earlier pass of this
# script hand-copied due.js's numbers into a Python table, and that table had
# a real error in it (it put articulated trucks on Undercarriage at 1000h,
# which due.js never states -- UC's own byClass entry names only DOZ and
# EXC): exactly the "one rule, two places" drift this project keeps getting
# burned by. ingest/gen_class_rounds.cjs asks due.js itself, in a real page,
# and writes class_rounds.generated.json; this script only reads that file.
#
# Re-run gen_class_rounds.cjs (see its own header) whenever due.js's D.EVERY
# table changes, before re-running this script.
CLASS_ROUNDS_PATH = Path(__file__).resolve().parent / "class_rounds.generated.json"
TYPE_LABEL = {
    "MP": "Magnetic Plug", "FC": "Filter Cut", "UC": "Undercarriage",
    "GET": "GET", "TB": "Dump Body Liner", "INSP": "General Inspection",
    "TEMP": "Thermal Survey", "LUBE": "Lubrication",
}


def load_class_rounds(path=CLASS_ROUNDS_PATH):
    if not path.exists():
        raise SystemExit(
            f"{path} not found. Run ingest/gen_class_rounds.cjs first (see its own "
            f"header for how) -- this script does not guess at due.js's numbers itself.")
    return json.loads(path.read_text(encoding="utf-8"))["map"]


def resolve_cm_types(hours, cls, class_rounds):
    """Return (label, types_or_None) for an (hours, class) pair, by asking
    class_rounds (due.js's own numbers, evaluated live) which round type(s)
    land on exactly this class at exactly this hour figure. Ambiguous by
    design where 1C's own vocabulary is ambiguous -- e.g. 500h lands on
    Filter Cut, GET and General Inspection all at once for most classes,
    because due.js states no restriction distinguishing them at that figure,
    and every candidate is listed rather than one asserted. Overstating the
    match would be worse than admitting it is not 1:1."""
    cls = (cls or "").upper()
    if hours is None:
        return "—", None
    types = sorted(
        ty for ty, spec in class_rounds.items()
        if spec["classes"].get(cls) == hours
    )
    if not types:
        return f"{hours}h service", None
    label = " / ".join(TYPE_LABEL.get(t, t) for t in types)
    return label, types


def load_asset_classes(path=ASSETS_PATH):
    """equip -> cls, parsed straight out of mobile/assets.js -- the same file
    the phone and the dashboard's own coverage panel read, so a class figure
    here can never drift from what either surface already uses."""
    if not path.exists():
        print(f"warning: {path} not found -- every work order will resolve with no known class", file=sys.stderr)
        return {}
    text = path.read_text(encoding="utf-8")
    m = re.search(r"window\.ASSETS\s*=\s*(\[.*\])\s*;", text, re.S)
    if not m:
        raise SystemExit(f"Could not find 'window.ASSETS=[...]' in {path}")
    assets = json.loads(m.group(1))
    return {a["n"].upper(): a.get("cls") or "" for a in assets if a.get("n")}


def parse_1c_date(v):
    """Return (iso_date, iso_datetime) or (None, None)."""
    if v is None or v == "":
        return None, None
    if isinstance(v, datetime):
        return v.date().isoformat(), v.isoformat()
    s = str(v).strip()
    try:
        d = datetime.strptime(s, DATE_FMT)
        return d.date().isoformat(), d.isoformat()
    except ValueError:
        # some 1C exports drop the time portion
        try:
            d = datetime.strptime(s, "%d.%m.%Y")
            return d.date().isoformat(), d.isoformat()
        except ValueError:
            return None, None


def load_workbook_bytes(source):
    if source.startswith("http://") or source.startswith("https://"):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(source, context=ctx, timeout=120) as r:
            return r.read()
    return Path(source).read_bytes()


def find_header_row(ws, must_have=("Asset description", "Equip no")):
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=20, values_only=True), start=1):
        vals = set(str(v).strip() for v in row if v is not None)
        if all(m in vals for m in must_have):
            return i
    raise SystemExit("Could not find the header row (looked for 'Asset description' + 'Equip no' "
                      "in the first 20 rows) -- the workbook's layout may have changed.")


def main():
    args = sys.argv[1:]
    out_path = DEFAULT_OUT
    fleet = None
    positional = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--out":
            i += 1
            out_path = args[i]
        elif a == "--fleet":
            i += 1
            fleet = fleet or []
            if args[i]:
                fleet.append(args[i])
        else:
            positional.append(a)
        i += 1
    source = positional[0] if positional else DEFAULT_SOURCE
    # Default: no filter -- the whole workbook, scored against the same
    # 1,128-unit register everything else on this dashboard already covers.
    # --fleet remains available for anyone who wants a narrower test run.

    try:
        import openpyxl
    except ImportError:
        raise SystemExit("pip install openpyxl --break-system-packages")

    cls_by_equip = load_asset_classes()
    class_rounds = load_class_rounds()

    print(f"reading {source} ...")
    data = load_workbook_bytes(source)
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb["Sheet_1"] if "Sheet_1" in wb.sheetnames else wb.worksheets[0]

    hdr_row = find_header_row(ws)
    header = list(next(ws.iter_rows(min_row=hdr_row, max_row=hdr_row, values_only=True)))
    col = {}
    for idx, name in enumerate(header):
        if name and str(name).strip() and str(name).strip() not in col:
            col[str(name).strip()] = idx

    required = ["Equip no", "Maintenence type", "Work order number", "Start date plan",
                "End date plan", "Start date actual", "End date actual",
                "Work order status", "CMMSWork order status", "Priority"]
    missing = [c for c in required if c not in col]
    if missing:
        raise SystemExit(f"Expected columns missing from WO.xlsx: {missing}. "
                          f"Columns seen: {sorted(col)}")

    hours_re = re.compile(r"(\d+)\s*Hours?", re.I)
    work_orders = []
    kept_units = set()
    seen_units = set()
    for row in ws.iter_rows(min_row=hdr_row + 1, values_only=True):
        equip = row[col["Equip no"]]
        if not equip:
            continue
        equip = str(equip).strip()
        seen_units.add(equip)
        if fleet and not any(equip.upper().startswith(p.upper()) for p in fleet):
            continue
        maint_type = row[col["Maintenence type"]]
        if not maint_type or not PLANNED_SERVICE_RE.match(str(maint_type)):
            continue
        kept_units.add(equip)
        plan_start_d, plan_start_dt = parse_1c_date(row[col["Start date plan"]])
        plan_end_d, plan_end_dt = parse_1c_date(row[col["End date plan"]])
        act_start_d, act_start_dt = parse_1c_date(row[col["Start date actual"]])
        act_end_d, act_end_dt = parse_1c_date(row[col["End date actual"]])
        is_open = act_start_d is None

        hm = hours_re.search(str(maint_type))
        hours = int(hm.group(1)) if hm else None
        cls = cls_by_equip.get(equip.upper(), "")
        cm_label, cm_types = resolve_cm_types(hours, cls, class_rounds)

        work_orders.append({
            "equip": equip,
            "cls": cls or None,
            "woNumber": row[col["Work order number"]],
            "maintType": str(maint_type).strip(),
            "hours": hours,
            "cmLabel": cm_label,
            "cmTypes": cm_types,
            "priority": row[col["Priority"]],
            "woStatus": row[col["Work order status"]],
            "cmmsStatus": row[col["CMMSWork order status"]],
            "open": is_open,
            "planStart": plan_start_d,
            "planStartDt": plan_start_dt,
            "planEnd": plan_end_d,
            "actualStart": act_start_d,
            "actualStartDt": act_start_dt,
            "actualEnd": act_end_d,
        })

    # oldest-first, stable per unit -- easiest to eyeball and to diff.
    work_orders.sort(key=lambda w: (w["equip"], w["planStart"] or ""))

    out = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "filter": "Maintenence type matches /^\\d+ Hours service Planned$/, equip prefix in "
                  + json.dumps(fleet if fleet else ["<all>"]),
        "unitsInWorkbook": len(seen_units),
        "unitsKept": sorted(kept_units),
        "workOrders": work_orders,
    }

    out_file = Path(out_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    js = ("// AUTO-GENERATED by ingest/ingest_work_orders.py -- do not edit by hand.\n"
          "// Re-run the ingester (against a fresh WO.xlsx) to refresh.\n"
          "// Loaded by dashboard/index.html for the Plan vs Actual tab.\n"
          "window.CM_WO_DATA = " + json.dumps(out, indent=2, ensure_ascii=False) + ";\n")
    out_file.write_text(js, encoding="utf-8")
    print(f"wrote {out_file} -- {len(work_orders)} planned service work order(s) "
          f"across {len(kept_units)} unit(s) (of {len(seen_units)} in the workbook).")


if __name__ == "__main__":
    main()
