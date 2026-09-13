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

NO CLASS EVER GETS A ROUND THIS FLEET HAS NOT SHOWN IT DOES. Some rounds
(MP, UC, TB) are RESTRICTED to named classes in due.js; others (FC, GET,
INSP) are not restricted anywhere in due.js at all. An earlier pass of
gen_class_rounds.cjs read that silence as "applies to everyone" and gave
every class a figure regardless of whether this fleet had ever walked it --
which is how a generator (CD001) and a loader (LD003), neither of which
this fleet has ever run a single FC, GET or INSP round on, ended up
resolving to "Filter Cut / GET / General Inspection" and showing up in the
dashboard's forward-looking schedule. Fixed at the source: for EVERY round
type, restricted or not, class_rounds.generated.json now only carries a
class where roundsOnClass() says so -- either due.js names the class, or
this fleet's own real history shows the round has actually been walked on
that kind of machine. (This is also how the Dump Body Liner / haul-truck
pairing due.js's prose mentions but never states structurally now resolves
correctly -- real TB|HT history supplies what due.js's byClass leaves out --
so no separate carve-out is needed for that case either.) A class with no
evidence for a round gets "Nh service" and no cmTypes, same as any other
unmatched figure -- not a guess, and not silently assumed.

DEDUPE. 1C's own export is a known source of duplicate rows: it writes one
row per line item on a work order, so a WO closed against two defects, two
parts, or a meter read taken in both KM and Hours repeats the identical
"N Hours service Planned" row that many times -- and NOT always under the
same work order number: EX021 got seven distinct 1C-minted numbers on one
day, three apiece for its 250h, 500h and 1000h tiers. So the identity this
script dedupes on is not the work order number, it is a unit reaching one
maintenance tier on one day -- (equip, maintenance type, plan start, plan
end). Read raw, either shape showed up on the dashboard as the same job
walked twice (or three times) on the same unit and day. See the DEDUPE
comment at the row loop below; the collapsed count is written to the
output as duplicateRowsCollapsed so it stays visible, not just fixed
silently.

Usage:
    python3 ingest/ingest_work_orders.py [source] [--out data/work_orders.js] [--fleet TK]

    source   path or URL to WO.xlsx. Defaults to the AS_KPI pipeline's public
             copy: https://askpi.94-131-94-152.sslip.io/WO.xlsx
    --fleet  equipment-number prefix to keep (repeatable). Default: none --
             the whole workbook, scored against the same 1,128-unit register
             the dashboard's own coverage panel already uses. Pass
             --fleet TK to narrow to one prefix if you want a smaller test run.

Also writes data/schedule_slim.json alongside --out, in the SAME directory
(unconditionally, no flag for it) -- the phone's own trimmed slice of this
same data, for the Due tab's "Show 1C schedule" toggle. See the comment at
its own write site for what it keeps and why it is not the same file the
dashboard loads.

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
    fall due on this class at this hour figure. Ambiguous by design where
    1C's own vocabulary is ambiguous -- e.g. 500h lands on Filter Cut, GET
    and General Inspection all at once for most classes, because due.js
    states no restriction distinguishing them at that figure, and every
    candidate is listed rather than one asserted. Overstating the match
    would be worse than admitting it is not 1:1.

    A TIER INCLUDES THE ONES BELOW IT. This matched the hour figure EXACTLY,
    and that read a 4,000-hour service as "the round whose interval is
    4,000" rather than "the visit a machine at 4,000 hours is getting". A
    haul truck at 4,000 hours is at its 16th plug round, its 8th general
    inspection and its 4th filter cut as well as its 1st body liner -- and
    only the body liner was drawn. Reported from the field on TK156, whose
    4,000h order (WO-015691) showed one pill where four rounds were due.

    That mattered because of how 1C actually raises work: of the 2,439
    unit-and-day visits in the file, 2,433 carry ONE tier. It is not
    issuing a 250h order alongside the 4,000h one to cover the plug round;
    the 4,000h order IS the visit. Six visits do carry several tiers (EX021
    on 2026-08-01 has five), and those are deduped at the row loop below so
    a round is claimed once per visit, by the tier that reaches it.

    Divisibility, not a table: 4000 % 250 == 0 is the same arithmetic due.js
    does, and it cannot fall out of step with a figure changing there."""
    cls = (cls or "").upper()
    if hours is None:
        return "—", None
    types = sorted(
        ty for ty, spec in class_rounds.items()
        if spec["classes"].get(cls) is not None
        and hours > 0 and hours % spec["classes"][cls] == 0
    )
    if not types:
        return f"{hours}h service", None
    label = " / ".join(TYPE_LABEL.get(t, t) for t in types)
    return label, types


def dedupe_within_visit(work_orders, class_rounds):
    """ONE VISIT CLAIMS A ROUND ONCE, AND THE ORDER THAT NAMES IT KEEPS IT.

    A tier now includes the tiers below it (see resolve_cm_types), which is
    right for the 2,433 unit-and-day visits out of 2,439 where 1C raises a
    single order. On the six where it raises several, a 250h order and a
    4,000h order would both claim the plug round and the grid would print
    two MP pills for one visit.

    Highest-tier-wins was the obvious rule and it is WRONG, measured on the
    case that prompted all this: EX021 on 2026-08-01 has 250h, 500h, 1000h
    and 2000h orders, and giving the 2000h order everything left 1C's own
    500h order (the general inspection) and 1000h order (the filter cut)
    reading "no CM round" — each round torn off the work order that exists
    to name it. A planner looking for the filter cut would find it filed
    under a service that does not mention filters.

    So the rule is in two passes: a round goes to the order whose tier IS
    its interval when the day has one, and only what is left over goes to
    the largest order that covers it. Returns how many claims were moved,
    which the caller writes out rather than fixing silently.
    """
    visits = {}
    for w in work_orders:
        if not w.get("planStart") or not w.get("cmTypes"):
            continue
        visits.setdefault((str(w["equip"]).upper(), w["planStart"]), []).append(w)

    trimmed = 0
    for group in visits.values():
        if len(group) < 2:
            continue
        cls = (group[0].get("cls") or "").upper()
        interval = {ty: spec["classes"].get(cls) for ty, spec in class_rounds.items()}
        wanted = {id(w): [] for w in group}
        taken = set()
        # Pass one: the order whose own tier is this round's interval.
        for w in group:
            for ty in w["cmTypes"]:
                if ty not in taken and interval.get(ty) == w.get("hours"):
                    wanted[id(w)].append(ty)
                    taken.add(ty)
        # Pass two: whatever is left, to the largest order that covers it.
        for w in sorted(group, key=lambda x: (x.get("hours") or 0), reverse=True):
            for ty in w["cmTypes"]:
                if ty not in taken:
                    wanted[id(w)].append(ty)
                    taken.add(ty)
        for w in group:
            keep = sorted(wanted[id(w)])
            if keep != sorted(w["cmTypes"]):
                trimmed += len(w["cmTypes"]) - len(keep)
                w["cmTypes"] = keep or None
                w["cmLabel"] = (" / ".join(TYPE_LABEL.get(t, t) for t in keep)
                                if keep else f"{w.get('hours')}h service")
    return trimmed


# ═══════════ THE CONDITION MONITORING TEAM'S OWN WORK ORDERS ═══════════════
#
# Everything above this line is about PLANNED SERVICES — 1C's "N Hours
# service" rows, which is what the schedule needs. Those are matched by
# PLANNED_SERVICE_RE and every other row in the workbook is dropped, so the
# defect work orders the CM team RAISES have never been in this file at all.
#
# The office asked for them: what has the team written up since the kick-off
# on 1 July. That is a different question about the same workbook — one row
# per defect raised, not per service due — so it gets its own collection
# rather than being mixed into workOrders, where every reader expects a
# planned service and a cmTypes mapping that means nothing here.
CM_SINCE = "2026-07-01"          # the kick-off; rows before it are not this team's record
CM_PEOPLE = ["nurbol", "slam", "irek", "zhomart", "bekzhan"]
# 1C's own header spellings, as the office reads them off the sheet, with the
# variants this script has already met in second place. EVERY ONE IS
# RECORDED IN THE OUTPUT (see cmColumns) — matched or not.
#
# WHY THAT MATTERS MORE THAN THE FALLBACKS. A column name that is wrong here
# produces an empty cell in a panel, and an empty cell reads as "1C did not
# say" rather than "this file never looked". That is this project's signature
# defect exactly, and the whole reason the panel can be trusted is that the
# data file states, in writing, which header each field came from and which
# ones it could not find.
CM_FIELDS = {
    "date":     ["Date", "Start date plan", "Date created", "Creation date", "Registration date"],
    "asset":    ["Asset", "Equip no", "Equipment"],
    "request":  ["Work request reference", "Work request", "Request reference"],
    "eqType":   ["Equipment type", "Equip type", "Asset type"],
    "priority": ["Priority"],
    "defType":  ["Defect Type", "Defect type", "Type of defect"],
    "cause":    ["Cause of Defect", "Cause of defect", "Defect cause"],
    "status":   ["CMMSWork order status"],      # the office asked for the CMMS one by name
    "person":   ["Responsible person", "Responsible", "Responsible person name"],
    "wo":       ["Work order number"],
}
# "DD-000001" — two or more letters, a dash, digits. Taken out of the work
# request reference, which in this workbook carries the code inside a longer
# string often enough that reading the whole cell as the number would file
# half the register under a sentence.
DEFECT_RE = re.compile(r"\b([A-Za-z]{2,}-\d{3,})\b")


def _norm_header(s):
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def resolve_cm_columns(col):
    """Map each wanted field to the column index it was found at, and say so.

    Returns (index_by_field, report) where report names the header actually
    matched for each field, or None. Nothing here raises: a missing column
    must not stop the hourly refresh the field now depends on for its
    schedule — it must be VISIBLE instead, which is what report is for."""
    by_norm = {_norm_header(k): v for k, v in col.items()}
    raw_by_norm = {_norm_header(k): k for k in col}
    idx, report = {}, {}
    for field, names in CM_FIELDS.items():
        hit = None
        for want in names:
            n = _norm_header(want)
            if n in by_norm:
                hit = (by_norm[n], raw_by_norm[n])
                break
        idx[field] = hit[0] if hit else None
        report[field] = hit[1] if hit else None
    return idx, report


def cm_person_match(value):
    """One of the five, matched on any part of the cell. 1C's responsible
    column carries a full name, a login, or a name in Cyrillic depending on
    who typed it, so an exact match on 'Slam' would find almost none of
    them. Returns the canonical first name, or None."""
    v = str(value or "").lower()
    if not v.strip():
        return None
    for name in CM_PEOPLE:
        if name in v:
            return name.capitalize()
    return None


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

    cm_idx, cm_report = resolve_cm_columns(col)
    cm_rows = []
    hours_re = re.compile(r"(\d+)\s*Hours?", re.I)
    work_orders = []
    kept_units = set()
    seen_units = set()
    seen_keys = {}   # dedupe_key -> True, see dedupe_key() below
    dup_count = 0
    for row in ws.iter_rows(min_row=hdr_row + 1, values_only=True):
        equip = row[col["Equip no"]]
        if not equip:
            continue
        equip = str(equip).strip()
        seen_units.add(equip)
        if fleet and not any(equip.upper().startswith(p.upper()) for p in fleet):
            continue
        # THE CM TEAM'S OWN ROWS, TAKEN BEFORE THE SERVICE FILTER. Every
        # defect work order is dropped two lines below; this is the only
        # point in the pass where it can still be seen.
        who = cm_person_match(row[cm_idx["person"]]) if cm_idx["person"] is not None else None
        if who:
            cm_get = lambda f: (row[cm_idx[f]] if cm_idx[f] is not None else None)
            d_iso, _ = parse_1c_date(cm_get("date"))
            if d_iso and d_iso >= CM_SINCE:
                ref = str(cm_get("request") or "").strip()
                m = DEFECT_RE.search(ref)
                cm_rows.append({
                    "date": d_iso,
                    "asset": str(cm_get("asset") or equip).strip(),
                    # The code when the cell carries one, and the cell itself
                    # when it does not — never a row dropped for the shape of
                    # one field, and never a sentence filed as a number.
                    "defect": m.group(1).upper() if m else None,
                    "requestRef": ref or None,
                    "eqType": str(cm_get("eqType") or "").strip() or None,
                    "priority": str(cm_get("priority") or "").strip() or None,
                    "defectType": str(cm_get("defType") or "").strip() or None,
                    "cause": str(cm_get("cause") or "").strip() or None,
                    "status": str(cm_get("status") or "").strip() or None,
                    "by": who,
                    "woNumber": str(cm_get("wo") or "").strip() or None,
                    "maintType": str(row[col["Maintenence type"]] or "").strip() or None,
                    # THE TWO SIDES OF ONE STORY, AND THEY ARE NOT THE SAME
                    # COUNT. A planned service is the inspection being asked
                    # for; a defect is what the team WROTE UP after walking
                    # it. The office asked how many they created, so the
                    # panel counts defects — and this flag is how it knows,
                    # rather than re-reading the maintenance type in a second
                    # place and drifting from the rule used here.
                    "planned": bool(PLANNED_SERVICE_RE.match(
                        str(row[col["Maintenence type"]] or "").strip())),
                })

        maint_type = row[col["Maintenence type"]]
        if not maint_type or not PLANNED_SERVICE_RE.match(str(maint_type)):
            continue
        plan_start_d, plan_start_dt = parse_1c_date(row[col["Start date plan"]])
        plan_end_d, plan_end_dt = parse_1c_date(row[col["End date plan"]])
        act_start_d, act_start_dt = parse_1c_date(row[col["Start date actual"]])
        act_end_d, act_end_dt = parse_1c_date(row[col["End date actual"]])
        is_open = act_start_d is None

        hm = hours_re.search(str(maint_type))
        hours = int(hm.group(1)) if hm else None
        cls = cls_by_equip.get(equip.upper(), "")
        cm_label, cm_types = resolve_cm_types(hours, cls, class_rounds)
        wo_number = row[col["Work order number"]]

        # DEDUPE. 1C's export is one ROW per line item on a work order, not
        # one row per work order -- two defects, two parts, or a meter read
        # in both KM and Hours all repeat the same "N Hours service
        # Planned" row. Sometimes that repeat carries the SAME work order
        # number (two "FC" pills on TK040, both WO-016435) -- but not
        # always: EX021 got SEVEN work orders on one day (2026-08-01),
        # THREE different numbers each for its 250h, its 500h and its
        # 1000h tier, one number apiece only for 2000h -- seven numbers 1C
        # itself minted, for what is, from this fleet's side, one PM cycle
        # per tier reached that day. A work order number is not a safe
        # identity to key on, then: the real identity of "one maintenance
        # event" here is a unit reaching one interval tier on one day, so
        # the key is (equip, maintenance type, plan start, plan end)
        # regardless of how many numbers 1C gave it. The first occurrence
        # wins and keeps its own work order number; the rest are dropped.
        key = (equip.upper(), str(maint_type).strip(), plan_start_d, plan_end_d)
        if key in seen_keys:
            dup_count += 1
            continue
        seen_keys[key] = True

        kept_units.add(equip)
        work_orders.append({
            "equip": equip,
            "cls": cls or None,
            "woNumber": wo_number,
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
    overlap_trimmed = dedupe_within_visit(work_orders, class_rounds)

    # ONE DEFECT, ONE ROW. 1C repeats a work order per line item here exactly
    # as it does for services (see the DEDUPE note above), so a defect with
    # two parts booked against it arrives twice. Keyed on the defect code
    # where there is one and on the work order number otherwise, because the
    # code is what the office refers to.
    cm_seen, cm_dedup = set(), []
    for r in cm_rows:
        k = (r["defect"] or r["woNumber"] or "", r["asset"], r["date"])
        if k in cm_seen:
            continue
        cm_seen.add(k)
        cm_dedup.append(r)
    cm_dedup.sort(key=lambda r: (r["date"] or "", r["asset"] or "", r["defect"] or ""), reverse=True)

    work_orders.sort(key=lambda w: (w["equip"], w["planStart"] or ""))

    out = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": source,
        "filter": "Maintenence type matches /^\\d+ Hours service Planned$/, equip prefix in "
                  + json.dumps(fleet if fleet else ["<all>"]),
        "unitsInWorkbook": len(seen_units),
        "unitsKept": sorted(kept_units),
        # See the DEDUPE comment above -- 1C's export repeats a row per
        # defect/part/meter-reading line under the same work order number.
        # This is how many of THOSE repeat rows were collapsed away, not how
        # many real duplicate work orders 1C itself has.
        "duplicateRowsCollapsed": dup_count,
        # Rounds a smaller order on the same day gave up to the bigger one.
        # Written out rather than fixed silently, same rule as the line above.
        "roundsDedupedWithinVisit": overlap_trimmed,
        # ---- the CM team's own defect work orders ----
        # Every header in the workbook, and which one each field was read
        # from. A field that matched nothing is null HERE rather than blank
        # in a panel, so "1C did not say" and "this file never looked" can
        # never be confused for each other.
        "columns": sorted(col),
        "cmColumns": cm_report,
        "cmSince": CM_SINCE,
        "cmPeople": [n.capitalize() for n in CM_PEOPLE],
        "cmWorkOrders": cm_dedup,
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
          f"across {len(kept_units)} unit(s) (of {len(seen_units)} in the workbook), "
          f"{dup_count} duplicate row(s) collapsed.")

    # THE PHONE'S OWN SLICE. The dashboard already has the whole workbook via
    # a <script> tag; the phone gets a plain JSON file it fetches over the
    # network, not one it precaches -- see mobile/index.html's own SCHED_*
    # constants for why (this file refreshes hourly, and the phone's cache
    # key must not). Cut down to the ONLY rows the Due tab's "Show 1C
    # schedule" toggle can ever show: still open, AND resolved to a real CM
    # round -- the same "nothing to say" rule the dashboard's own Next 7
    # days grid applies (see paWeekData's own comment). That is 116 of 2,535
    # rows on the live fleet as this was written, not 1.4 MB repeated hourly
    # to every handset for rows the toggle would never draw anyway.
    slim_by_unit = {}
    for w in work_orders:
        if not w["open"] or not w["cmTypes"] or not w["planStart"]:
            continue
        slim_by_unit.setdefault(w["equip"], []).append({
            "wo": w["woNumber"], "hours": w["hours"], "types": w["cmTypes"],
            "plan": w["planStart"], "priority": w["priority"],
        })
    for rows in slim_by_unit.values():
        rows.sort(key=lambda r: r["plan"])
    slim_path = out_file.parent / "schedule_slim.json"
    slim_path.write_text(json.dumps({
        "generated": out["generated"],
        "byUnit": slim_by_unit,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {slim_path} -- {sum(len(v) for v in slim_by_unit.values())} open, "
          f"CM-matched work order(s) across {len(slim_by_unit)} unit(s)")


if __name__ == "__main__":
    main()
