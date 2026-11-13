"""CM_NCR_V1: build_ncr_list() reads ncr_kit's phone.json into schedule_slim.json's ncrList.
Draft and Open NCRs only, the nine phone keys only (no PO, contractor or prices), newest first;
a missing or broken file gives an empty list, never an error."""
import json, os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ingest"))
import ingest_work_orders as w

fails = []
def ok(n, c, d=""):
    print(("  PASS  " if c else "  FAIL  ") + n + (("   " + str(d)) if d else ""))
    if not c: fails.append(n)

d = tempfile.mkdtemp()
p = os.path.join(d, "phone.json")
json.dump([
    {"n": "NCR-1", "r": "BMC-1", "u": "TK101", "p": "123", "s": "Open", "d": "2026-11-10", "po": "PO-SECRET", "price": 9},
    {"n": "NCR-2", "s": "Draft", "d": "2026-11-12"},
    {"n": "NCR-3", "s": "Closed", "d": "2026-11-13"},
    {"n": "", "s": "Open"},
    "junk",
], open(p, "w"))
out = w.build_ncr_list(p)
ok("Draft and Open only, nameless and junk rows dropped", [r["n"] for r in out] == ["NCR-2", "NCR-1"], [r["n"] for r in out])
ok("only the nine phone keys travel", all(set(r) == set("n r u m p x s d dd".split()) for r in out))
ok("no PO or price reaches the phone", "PO-SECRET" not in json.dumps(out))
json.dump({"ncrs": [{"n": "NCR-9", "s": "Open"}]}, open(p, "w"))
ok("an object with ncrs is read too", [r["n"] for r in w.build_ncr_list(p)] == ["NCR-9"])
open(p, "w").write("{broken")
ok("a broken file gives an empty list", w.build_ncr_list(p) == [])
ok("a missing file gives an empty list", w.build_ncr_list(os.path.join(d, "nope.json")) == [])
print("\nFAIL %d" % len(fails) if fails else "\nALL PASS")
sys.exit(1 if fails else 0)
