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
same data, for the Due tab's "Show 1C schedule" toggle and for Return to
Work's own Pick screen (rtwOpen). See the comment at its own write site for
what each key keeps and why this is not the same file the dashboard loads.

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
from datetime import datetime, timedelta, timezone
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


_MODELS = None


def model_of(equip, path=ASSETS_PATH):
    """equip -> the model text due.js matches a model rule against (the
    register's model and model-key, upper-cased), parsed from the same
    mobile/assets.js the class comes from. "" for a machine it does not know."""
    global _MODELS
    if _MODELS is None:
        _MODELS = {}
        if path.exists():
            m = re.search(r"window\.ASSETS\s*=\s*(\[.*\])\s*;", path.read_text(encoding="utf-8"), re.S)
            if m:
                for a in json.loads(m.group(1)):
                    if a.get("n"):
                        _MODELS[a["n"].upper()] = f"{a.get('m') or ''} {a.get('mk') or ''}".upper()
    return _MODELS.get(str(equip or "").upper(), "")


def round_interval(spec, cls, model, on=None):
    """The hour figure this round runs on for this machine: a MODEL's own
    (due.js byModel, generated into class_rounds.generated.json as `models`)
    beats the class's, exactly as DUE.spec resolves it, so the 1C mapping and
    the phone's due list cannot read two different intervals for one truck.

    A MODEL RULE STARTS ON ITS OWN DATE. The TR60 trucks went on the
    lubrication audit on 2026-10-04 (`since`), and the rule was applied to
    every work order in the file regardless — so TK156's 4,000 h service of
    13 September was made to owe an audit nobody had been asked to do, and
    Plan vs Actual could score it as a round missed. `on` is the work order's
    plan date: one planned before `since` takes the class's figure, as it
    did on the day it was planned. No date (an order 1C has not scheduled)
    is a future order and takes the rule; so does a rule with no `since`."""
    for r in spec.get("models") or []:
        if r.get("model") and str(r["model"]).upper() in (model or ""):
            since = r.get("since")
            if since and on and str(on)[:10] < str(since)[:10]:
                break
            return r.get("h")
    return spec["classes"].get((cls or "").upper())


def resolve_cm_types(hours, cls, class_rounds, equip="", on=None):
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
    does, and it cannot fall out of step with a figure changing there.

    `on` is the order's plan date, for a model rule that starts on a date
    (see round_interval)."""
    cls = (cls or "").upper()
    if hours is None:
        return "—", None
    model = model_of(equip)
    types = sorted(
        ty for ty, spec in class_rounds.items()
        if round_interval(spec, cls, model, on) is not None
        and hours > 0 and hours % round_interval(spec, cls, model, on) == 0
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
        model = model_of(group[0].get("equip"))
        on = group[0].get("planStart")
        interval = {ty: round_interval(spec, cls, model, on) for ty, spec in class_rounds.items()}
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
#
# THE DATE A DEFECT WAS RAISED IS NOT THE DATE SOMEBODY PLANS TO FIX IT.
# Until this was corrected the register read its date off "Start date plan" —
# the second candidate, and the one this workbook has. So a defect written up
# this morning and scheduled for the 28th was filed under the 28th, the panel
# sorted newest-first on a column of FUTURE dates, and the twelve rows dated
# tomorrow sat above everything raised today. From the office it looked exactly
# like a feed that had stopped: "already 24 hours since Defects raised updated"
# while the file behind it had refreshed six times. The workbook's own column
# for this is "Work request creation date" (column 58). It is now the only
# thing "date" is read from — a fallback to the planned start is not a
# degraded answer to this question, it is a different question, so the
# planned start is carried in its OWN field and the panel can show both.
CM_FIELDS = {
    "date":     ["Work request creation date", "Work request created", "Date created",
                 "Creation date", "Registration date"],
    "planStart": ["Start date plan"],
    "detected": ["Defect detected on"],
    "asset":    ["Asset", "Equip no", "Equipment"],
    # The defect number lives in "Work request number" — corrected by the
    # office after the first pass looked for "…reference".
    "request":  ["Work request number", "Work request reference", "Work request"],
    # "Equipmen type" IS the header, missing its t. 1C's own spelling, and
    # the normaliser cannot reach it from "Equipment type": stripping
    # punctuation still leaves equipmentype against equipmenttype. A list of
    # candidate spellings only helps if the real one is in it, which is why
    # the output records the header each field actually matched.
    "eqType":   ["Equipmen type", "Equipment type", "Equip type", "Asset type"],
    "sysComp":  ["System component", "System / component", "System and component", "Component"],
    "priority": ["Priority"],
    "defType":  ["Defect Type", "Defect type", "Type of defect"],
    # THE CAUSE IS WRITTEN IN THREE PLACES AND ARRIVES IN THEM AT THREE
    # DIFFERENT MOMENTS. "WODefect cause" is the WORK ORDER's field and the
    # office named it, correctly — but 1C only fills it once a work order has
    # actually been raised against the request. Measured on 2026-09-14: of 48
    # defects, every one of the 19 at status "Registered" had a blank cause
    # and every one of the 29 past it had a cause. Not 18 of 19. All of them.
    #
    # A defect at "Registered" is still a WORK REQUEST, and the cause the
    # inspector typed when they raised it is in the REQUEST's own field,
    # "WRDefect cause". Reading only the work order's copy therefore printed
    # an em-dash against a field the site treats as mandatory — the cause was
    # recorded, and the panel rendered it as nothing.
    #
    # So all three are read, in the order 1C settles them: the work order's
    # answer where there is one, else the request's, else the certification
    # pass's. Which one each row came from is written out (`causeFrom`) and
    # totalled (`cmCauseFrom`), so "the office has not typed one yet" can
    # never again be confused with "this file looked in the wrong column".
    "cause":    ["WODefect cause", "Cause of Defect", "Cause of defect", "Defect cause"],
    "causeWR":  ["WRDefect cause"],
    "causeCert": ["CERTTDefect cause", "CERTDefect cause"],
    "desc":     ["Defect description", "Description of defect", "Defect descr"],
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


# A "COMPLETE" ROW STAYS ON THE MECHANIC'S OWN LIST FOR A WHILE, NOT FOR
# EVER. 1C's own history holds 2,379 completed work orders against 279 open
# ones on the live fleet -- sending all of them to a phone that asked "what
# do I still have to do" would bury the open ones the list exists for. A
# mechanic asking "what did I just finish" wants the recent ones, not the
# whole archive, so a completed row is kept only while it is within this
# many days of its own completion date.
PM_COMPLETE_WINDOW_DAYS = 30


def _pm_status_bucket(status_text):
    """1C's own CMMS status text, read directly rather than guessed from a
    date. The office's own vocabulary has four shapes on the live fleet --
    Registered, Elimination scheduled, In progress, Completed -- and asking
    the text is simpler and more honest than the "no actual-start date yet"
    heuristic `is_open` uses elsewhere in this file for a different purpose
    (see the `open` field above): an "In progress" work order already has an
    actual-start date, which made it read as closed under that heuristic and
    kept it off the phone's list entirely, even though 1C itself still calls
    it in progress."""
    s = (status_text or "").strip().lower()
    if "complete" in s or "closed" in s:
        return "complete"
    if "progress" in s:
        return "inprogress"
    return "open"


def _completed_recently(date_iso, as_of, window_days):
    if not date_iso:
        return False
    try:
        d = datetime.fromisoformat(date_iso).date()
    except ValueError:
        return False
    age = (as_of.date() - d).days
    return 0 <= age <= window_days


# RETURN TO WORK'S OWN SLICE. mobile/index.html has no <script> tag for
# data/work_orders.js at all -- that file is dashboard-only (see this
# module's own docstring) and was never in the phone's precache on purpose,
# since it refreshes on 1C's clock, not the app's build clock. RTW's Pick
# screen read window.CM_WO_DATA anyway, a global the phone never sets -- so
# the entry card was hidden and the picker empty on every real handset,
# working only in a test that fabricated the global by hand (see
# tests/rtw.cjs). The filter and shape here are what rtwWorkOrders() (mobile/
# index.html) used to do itself, moved to the one place that already builds
# both source lists -- a planned service still open on the calendar, one 1C
# calls "in progress", or one it has completed inside the last
# PM_COMPLETE_WINDOW_DAYS days, or a defect work order in any of those three
# states. Deduped by work order number, newest first. A standalone function,
# not inlined into main(), so it can be unit-tested without the
# openpyxl/network dependencies the rest of this script needs (see
# tests/rtwopen.py).
def build_rtw_open(work_orders, cm_dedup, as_of=None):
    # `type`/`hours`/`plan` feed Return to Work's own header strip (the work
    # order, its maintenance type, its scheduled hour tier and 1C's own plan
    # date) -- asked for so a released round can be checked against what was
    # actually scheduled, not just which WO number it closed against. A
    # planned PM service (the `work_orders` half) genuinely has all three; a
    # defect work order (the `cm_dedup` half) is not hour-tiered, so `hours`
    # stays null there rather than guessed, and `type` falls back to the
    # defect's own system/description -- the same "say what is known, never
    # what is guessed" rule this file applies everywhere else.
    #
    # `status`/`request`/`defType`/`cause` were added for the phone's own
    # "1C PM" list (mobile/index.html) -- a mechanic tapping a row wants the
    # same office-side facts the dashboard's Defect work orders panel already
    # shows (CM_FIELDS, above): the CMMS status 1C itself tracks, the work
    # REQUEST number (not the work order number -- the request is raised
    # before a WO exists and is what an inspector actually wrote on the
    # defect), the defect's own type code, and its cause -- already resolved
    # upstream, in CM_FIELDS["cause"]'s own order (work order, then request,
    # then certification), so this does not re-decide that question, only
    # carries the answer through. A planned PM service is not a defect and
    # has none of these; they stay "" rather than borrowed from anywhere.
    #
    # `pmStatus` is the phone's OWN filter axis -- open / inprogress /
    # complete -- read from `status`'s own text, never a second copy of it;
    # `completed` carries the date a "complete" row actually finished on, for
    # the one case (a completed row) where a date other than `plan`/`raised`
    # matters to the reader.
    as_of = as_of or datetime.now(timezone.utc)
    seen, out = set(), []
    for w in work_orders:
        wo = w.get("woNumber")
        if not wo or wo in seen:
            continue
        bucket = _pm_status_bucket(w.get("cmmsStatus"))
        completed = ""
        if bucket == "complete":
            completed = w.get("actualEnd") or ""
            if not _completed_recently(completed, as_of, PM_COMPLETE_WINDOW_DAYS):
                continue
        elif bucket == "open" and not w.get("open"):
            # Neither "in progress" nor "complete" by its own status text,
            # and not open by the actual-start heuristic either -- some
            # other closed shape (e.g. cancelled) that was never meant to
            # reach this list.
            continue
        seen.add(wo)
        out.append({
            "wo": wo, "equip": (w.get("equip") or "").upper(), "cls": w.get("cls") or "",
            "comp": "", "desc": w.get("cmLabel") or w.get("maintType") or "",
            "priority": w.get("priority") or "", "raised": w.get("planStart") or "",
            "type": w.get("maintType") or w.get("cmLabel") or "",
            "hours": w.get("hours"), "plan": w.get("planStart") or "",
            "status": w.get("cmmsStatus") or "", "request": "", "defType": "", "cause": "",
            "pmStatus": bucket, "completed": completed,
        })
    for r in cm_dedup:
        wo = r.get("woNumber")
        if not wo or wo in seen:
            continue
        bucket = _pm_status_bucket(r.get("status"))
        completed = ""
        if bucket == "complete":
            completed = r.get("closed") or ""
            if not _completed_recently(completed, as_of, PM_COMPLETE_WINDOW_DAYS):
                continue
        seen.add(wo)
        out.append({
            "wo": wo, "equip": (r.get("asset") or "").upper(), "cls": "",
            "comp": r.get("system") or "", "desc": r.get("descr") or r.get("defectType") or "",
            "priority": r.get("priority") or "", "raised": r.get("date") or "",
            "type": r.get("defectType") or r.get("system") or "",
            "hours": None, "plan": r.get("planStart") or "",
            "status": r.get("status") or "", "request": r.get("requestNo") or "",
            "defType": r.get("defectType") or "", "cause": r.get("cause") or "",
            "pmStatus": bucket, "completed": completed,
        })
    out.sort(key=lambda r: r["raised"] or "", reverse=True)
    return out



# ---- RELIABILITY: THE CORRECTIVE WORK ORDERS ------------------------------
# MTBF, MTTR and availability (dashboard/reliability.js) are worked out from
# the work orders this script used to throw away: everything that is NOT a
# planned hour-tier service. 1C carries what the three numbers need on the
# same row -- the priority (P1 is a breakdown, and the workbook counts them:
# "Count of break down from p1"), the actual start and end, the actual
# duration and the downtime it booked. Nothing is decided here about what a
# failure IS; every corrective row inside the window is kept with those
# fields, and reliability.js applies one stated rule to them, so the rule can
# be read and changed in one place. What 1C actually wrote in each column is
# counted (`relProfile`) so a column that stops arriving, or arrives in a
# shape this file does not read, is a number on the office screen and not a
# silent zero.
REL_WINDOW_DAYS = 400      # a year of history plus a margin for the 365-day view
REL_COLUMNS = {
    "dur": "Duration actual hours",
    "down": "Down time by documents",
    "downReg": "Down time by accamulation register per period",
    "bd": "Count of break down from p1",
    "op": "Operation time during defect registration",
}
_HHMM_RE = re.compile(r"^\s*(\d+)\s*:\s*(\d{1,2})(?::\d{1,2})?\s*$")


def parse_hours(v):
    """An hours cell, whatever 1C put in it. Returns (hours or None, shape)
    where shape is one of num / hhmm / blank / other, for relProfile."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None, "blank"
    if isinstance(v, bool):
        return None, "other"
    if isinstance(v, (int, float)):
        return float(v), "num"
    if isinstance(v, timedelta):
        return v.total_seconds() / 3600.0, "num"
    s = str(v).strip().replace(" ", "").replace(" ", "")
    m = _HHMM_RE.match(s)
    if m:
        return int(m.group(1)) + int(m.group(2)) / 60.0, "hhmm"
    try:
        return float(s.replace(",", ".")), "num"
    except ValueError:
        return None, "other"


def rel_event(get, equip, since_iso):
    """One corrective work order as reliability.js reads it, or None when the
    row is a planned service, has not started, or started before the window.
    `get(name)` returns the raw cell for a workbook column (None if absent)."""
    mt = str(get("Maintenence type") or "").strip()
    if PLANNED_SERVICE_RE.match(mt):
        return None
    s_d, s_dt = parse_1c_date(get("Start date actual"))
    if not s_d or s_d < since_iso:
        return None
    e_d, e_dt = parse_1c_date(get("End date actual"))
    dur, dur_k = parse_hours(get(REL_COLUMNS["dur"]))
    down, down_k = parse_hours(get(REL_COLUMNS["down"]))
    reg, reg_k = parse_hours(get(REL_COLUMNS["downReg"]))
    bd, _ = parse_hours(get(REL_COLUMNS["bd"]))
    op, _ = parse_hours(get(REL_COLUMNS["op"]))
    wo = str(get("Work order number") or "").strip() or None
    wr = str(get("Work request number") or "").strip() or None
    return {
        "equip": equip.upper(),
        "wo": wo, "wr": wr,
        "mt": mt or None,
        "priority": str(get("Priority") or "").strip() or None,
        "start": s_d, "startDt": s_dt, "end": e_d, "endDt": e_dt,
        # "Down time by documents" only. The accumulation-register column is
        # NOT a figure for this work order: read off the first live pull
        # (2026-10-01) it holds at most two distinct values per machine across
        # thirteen months, the same 26.75 h on a P4 repair, a P1 breakdown and
        # a P2 job on BL001 alike: a running total for the machine and period,
        # repeated on every row. Used as each failure's downtime it put
        # 926,206 h against 10,073 h of actual duration on the same 999
        # breakdowns, and MTTR read 380 h where 1C's own durations say 20.
        # It is still counted in relProfile; it is never a downtime.
        "durH": dur, "downH": down,
        "downFrom": "docs" if down is not None else None,
        "bd": int(bd) if bd else 0,
        "opH": op,
        "_shape": {"dur": dur_k, "down": down_k, "downReg": reg_k},
    }


def merge_rel(events):
    """1C repeats a work order per line item (see the DEDUPE note): one
    event per work order (or request, or unit+start+type when it has
    neither), keeping the largest figure each repeat carried."""
    by = {}
    for e in events:
        k = e["wo"] or e["wr"] or (e["equip"], e["startDt"], e["mt"])
        cur = by.get(k)
        if cur is None:
            by[k] = dict(e)
            continue
        for f in ("durH", "downH", "opH"):
            if e[f] is not None and (cur[f] is None or e[f] > cur[f]):
                cur[f] = e[f]
                if f == "downH":
                    cur["downFrom"] = e["downFrom"]
        cur["bd"] = max(cur["bd"], e["bd"])
        if not cur["endDt"] and e["endDt"]:
            cur["end"], cur["endDt"] = e["end"], e["endDt"]
    out = sorted(by.values(), key=lambda e: (e["equip"], e["startDt"] or ""))
    return out


def rel_profile(events):
    """What 1C wrote, counted: the maintenance types and priorities the
    window holds, and the shape every hours cell arrived in."""
    prof = {"maintType": {}, "priority": {}, "shape": {}}
    for e in events:
        prof["maintType"][e["mt"] or ""] = prof["maintType"].get(e["mt"] or "", 0) + 1
        prof["priority"][e["priority"] or ""] = prof["priority"].get(e["priority"] or "", 0) + 1
        for f, k in e.get("_shape", {}).items():
            d = prof["shape"].setdefault(f, {})
            d[k] = d.get(k, 0) + 1
    return prof


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
    rel_since = (datetime.now(timezone.utc) - timedelta(days=REL_WINDOW_DAYS)).date().isoformat()
    rel_raw, rel_units = [], set()
    for row in ws.iter_rows(min_row=hdr_row + 1, values_only=True):
        equip = row[col["Equip no"]]
        if not equip:
            continue
        equip = str(equip).strip()
        seen_units.add(equip)
        if fleet and not any(equip.upper().startswith(p.upper()) for p in fleet):
            continue
        # Every machine 1C keeps work orders for is in the reliability
        # population, broken down or not -- a fleet's availability over its
        # broken machines alone is not the fleet's availability.
        rel_units.add(equip.upper())
        _ev = rel_event(lambda name: row[col[name]] if name in col else None, equip, rel_since)
        if _ev:
            rel_raw.append(_ev)
        # THE CM TEAM'S OWN ROWS, TAKEN BEFORE THE SERVICE FILTER. Every
        # defect work order is dropped two lines below; this is the only
        # point in the pass where it can still be seen.
        who = cm_person_match(row[cm_idx["person"]]) if cm_idx["person"] is not None else None
        if who:
            cm_get = lambda f: (row[cm_idx[f]] if cm_idx[f] is not None else None)
            raised_iso, _ = parse_1c_date(cm_get("date"))
            det_iso, _ = parse_1c_date(cm_get("detected"))
            plan_iso, _ = parse_1c_date(cm_get("planStart"))
            # A defect has no completion date of its own field in CM_FIELDS
            # -- "End date actual" is the same required main-sheet column
            # the planned-service side of this same row already reads a few
            # lines below, shared by every row on the sheet. Read here for
            # build_rtw_open()'s "recently completed" window, which a defect
            # otherwise has no date to judge by.
            closed_iso, _ = parse_1c_date(row[col["End date actual"]])
            # WHICH DATE THIS ROW IS FILED UNDER, AND SAID OUT LOUD. The
            # raised date is the answer to "what has the team written up";
            # the other two are stand-ins for a workbook that stops carrying
            # it, and a stand-in that is not named is how the register came
            # to be sorted on a column of future dates in the first place.
            d_iso = raised_iso or det_iso or plan_iso
            d_from = ("raised" if raised_iso else "detected" if det_iso
                      else "planStart" if plan_iso else None)
            # The cause, from whichever of 1C's three fields has settled by
            # now, and a note of which one that was. See CM_FIELDS["cause"].
            cause_v, cause_src = None, None
            for _f, _s in (("cause", "wo"), ("causeWR", "wr"), ("causeCert", "cert")):
                _v = str(cm_get(_f) or "").strip()
                if _v:
                    cause_v, cause_src = _v, _s
                    break
            if d_iso and d_iso >= CM_SINCE:
                ref = str(cm_get("request") or "").strip()
                m = DEFECT_RE.search(ref)
                cm_rows.append({
                    "date": d_iso,
                    "dateFrom": d_from,
                    "raised": raised_iso,
                    "detected": det_iso,
                    "planStart": plan_iso,
                    "closed": closed_iso,
                    "asset": str(cm_get("asset") or equip).strip(),
                    # The code when the cell carries one, and the cell itself
                    # when it does not — never a row dropped for the shape of
                    # one field, and never a sentence filed as a number.
                    "defect": m.group(1).upper() if m else None,
                    "requestNo": ref or None,
                    "eqType": str(cm_get("eqType") or "").strip() or None,
                    "system": str(cm_get("sysComp") or "").strip() or None,
                    "priority": str(cm_get("priority") or "").strip() or None,
                    "defectType": str(cm_get("defType") or "").strip() or None,
                    "cause": cause_v,
                    "causeFrom": cause_src,
                    "descr": str(cm_get("desc") or "").strip() or None,
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
        cm_label, cm_types = resolve_cm_types(hours, cls, class_rounds, equip, plan_start_d)
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

    # One "now" for this whole run -- build_rtw_open's own recently-completed
    # window is measured against it too, a few lines below, rather than a
    # second `datetime.now()` call landing a moment later.
    now = datetime.now(timezone.utc)
    out = {
        "generated": now.isoformat(timespec="seconds"),
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
        # How many rows are filed under each date, by where that date came
        # from. "raised" for all of them is the healthy answer; anything else
        # is a workbook that stopped carrying the creation date, and the
        # office is told rather than left to notice the sort looks odd.
        "cmDateFrom": {k: sum(1 for r in cm_dedup if r.get("dateFrom") == k)
                       for k in ("raised", "detected", "planStart")},
        # Which of 1C's three cause fields each defect's cause came from, and
        # how many carry none at all. The site treats the cause as mandatory,
        # so "none" is a number somebody should be able to see and chase —
        # not an em-dash in a cell that could equally mean this file looked in
        # the wrong column, which is exactly what it did mean until today.
        "cmCauseFrom": dict(
            {k: sum(1 for r in cm_dedup if not r.get("planned") and r.get("causeFrom") == k)
             for k in ("wo", "wr", "cert")},
            none=sum(1 for r in cm_dedup if not r.get("planned") and not r.get("causeFrom"))),
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
    rtw_open = build_rtw_open(work_orders, cm_dedup, as_of=now)

    slim_path = out_file.parent / "schedule_slim.json"
    slim_path.write_text(json.dumps({
        "generated": out["generated"],
        "byUnit": slim_by_unit,
        "rtwOpen": rtw_open,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    # THE RELIABILITY FILE. Its own file, not more of work_orders.js: that is
    # a <script> every office page loads at once, and this is read only when
    # somebody opens the reliability panel (dashboard/reliability.js). No
    # indent -- it is the largest thing in data/ and nobody diffs it by eye.
    # Cell shapes are counted per ROW (each repeat is a cell 1C wrote); the
    # maintenance types and priorities per WORK ORDER, after the repeats are
    # collapsed, so the counts are the ones the panel's failures are taken from.
    rel_events = merge_rel(rel_raw)
    rel_profile_v = rel_profile(rel_raw)
    _per_wo = rel_profile(rel_events)
    rel_profile_v["maintType"], rel_profile_v["priority"] = _per_wo["maintType"], _per_wo["priority"]
    for e in rel_events:
        e.pop("_shape", None)
    rel_path = out_file.parent / "reliability.json"
    rel_path.write_text(json.dumps({
        "generated": out["generated"],
        "relSince": rel_since,
        "relWindowDays": REL_WINDOW_DAYS,
        "relColumns": {k: (v if v in col else None) for k, v in REL_COLUMNS.items()},
        "relProfile": rel_profile_v,
        "relUnits": sorted(rel_units),
        "relEvents": rel_events,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {rel_path} -- {len(rel_events)} corrective work order(s) since {rel_since} "
          f"across {len(rel_units)} unit(s)")

    print(f"wrote {slim_path} -- {sum(len(v) for v in slim_by_unit.values())} open, "
          f"CM-matched work order(s) across {len(slim_by_unit)} unit(s), "
          f"{len(rtw_open)} open work order(s) for Return to Work")


if __name__ == "__main__":
    main()
