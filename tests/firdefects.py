#!/usr/bin/env python3
"""build_fir_defects() (ingest/ingest_work_orders.py, CM_FIR_V1): the 1C defects a FIR can be started from on the
phone. Fixed as_of, made-up rows. Run: python3 tests/firdefects.py"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ingest"))
from ingest_work_orders import build_fir_defects  # noqa: E402

fails = []


def ok(name, cond):
    print(("  ok   " if cond else "  FAIL ") + name)
    if not cond:
        fails.append(name)


NOW = datetime(2026, 11, 11, 0, 0, tzinfo=timezone.utc)
cm = [
    {"defect": "DD-0000001", "asset": "tk900", "system": "TK900.HS.MP", "priority": "P3 Planned (PM)", "raised": "2026-11-09", "descr": "x" * 200},
    {"defect": "DD-0000002", "asset": "EX900", "system": "EX900.CH.BUC", "priority": "P1 Critical", "raised": "2026-11-01", "descr": "bucket"},
    {"defect": None, "asset": "EX901", "priority": "P1", "raised": "2026-11-10"},
    {"defect": "DD-0000003", "asset": "DZ900", "priority": "P2 Urgent", "raised": "2026-08-01"},
]
other = [
    {"defect": "DD-0000002", "asset": "EX900", "priority": "P1", "raised": "2026-11-01"},
    {"defect": "DD-0000004", "asset": "LD900", "system": None, "priority": "P2 Urgent", "raised": "2026-11-05", "descr": "leak"},
    {"defect": "DD-0000005", "asset": "GR900", "priority": "", "raised": "2026-11-10"},
]
f = build_fir_defects(cm, other, as_of=NOW)
ds = [r["d"] for r in f]
ok("one row per defect, none without a number, none older than FIR_DAYS", ds == ["DD-0000004", "DD-0000002", "DD-0000005", "DD-0000001"])
ok("P1 and P2 first, newest first within each", [r["p"] for r in f] == ["P2", "P1", None, "P3"])
ok("unit upper-cased", f[3]["u"] == "TK900")
ok("description cut to 80 characters", len(f[3]["x"]) == 80)
ok("system code kept", f[1]["s"] == "EX900.CH.BUC")
ok("slim keys only", set(f[0]) == {"d", "u", "s", "p", "r", "x"})
print("PASS" if not fails else "FAIL %d" % len(fails))
sys.exit(1 if fails else 0)
