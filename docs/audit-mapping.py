#!/usr/bin/env python3
"""Check that the defect and cause a component offers actually belong to it.

The cascade decides what an inspector is shown. Too narrow and a real finding
has nowhere to go; too wide and the picker fills with modes that cannot happen
on the part in front of them — a fuel leak on an air-conditioning condenser.

Run:  python3 docs/audit-mapping.py [--json]

Exit code 1 if anything in FAIL appears, so it can gate a build.
"""
import json, re, subprocess, sys, os, collections

sys_path_added = os.path.dirname(os.path.abspath(__file__))
sys = __import__("sys"); sys.path.insert(0, sys_path_added)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(f, var):
    out = subprocess.run(
        ['node', '-e', f'global.window={{}};require("{ROOT}/mobile/{f}");'
                       f'console.log(JSON.stringify(window.{var}))'],
        capture_output=True, text=True)
    if out.returncode:
        sys.exit(f'could not load {f}: {out.stderr[:300]}')
    return json.loads(out.stdout)


from fluidfit import SYSTEM_FLUIDS, NAME_FLUIDS, LEK_FLUID, SPECIALIST, fluids_for


def audit():
    HME = load('hme.js', 'HME')
    CX = load('hme-cascade.js', 'HME_CX')
    comps = {c['code']: c for c in HME['components']}
    defs = {d['code']: d for d in HME['defectTypes']}

    reach = set()
    for cls in HME['equipmentClasses']:
        reach |= set(cls.get('components', []))
    for lst in (HME.get('models') or {}).values():
        reach |= set(lst)

    pairs = sum(len(v) for v in CX['c'].values())
    findings = collections.defaultdict(list)

    # ---- FAIL: an inspector can reach a component that offers nothing
    for c in sorted(reach):
        if not CX['c'].get(c):
            findings['empty picker'].append((c, comps.get(c, {}).get('en', '?'), ''))

    # ---- FAIL: a defect type nothing can ever show
    used = set()
    for by in CX['c'].values():
        used |= set(by)
    for d in sorted(set(defs) - used):
        findings['unreachable defect'].append((d, defs[d]['en'], ''))

    # ---- FAIL: a leak of a fluid the component does not contain
    for c, by in CX['c'].items():
        f = fluids_for(comps.get(c, {}))
        if f is None:
            continue
        for d in by:
            fl = LEK_FLUID.get(d)
            if fl and fl not in f:
                findings['leak of a fluid not present'].append(
                    (c, comps[c]['en'], f'{defs[d]["en"]}  [has: {", ".join(sorted(f)) or "none"}]'))

    # ---- WARN: a specialist mode on a component outside that specialism
    for c, by in CX['c'].items():
        nm = (comps.get(c, {}).get('en') or '').lower()
        for d in by:
            g = defs[d]['group']
            if g in SPECIALIST and not re.search(SPECIALIST[g], nm):
                findings['specialist mode, unrelated part'].append(
                    (c, comps[c]['en'], f'[{g}] {defs[d]["en"]}'))

    sizes = sorted(len(v) for v in CX['c'].values())
    stats = dict(components=len(CX['c']), reachable=len(reach), pairs=pairs,
                 median=sizes[len(sizes) // 2], widest=sizes[-1], narrowest=sizes[0])
    return findings, stats


FAIL = {'empty picker', 'unreachable defect', 'leak of a fluid not present'}

if __name__ == '__main__':
    findings, stats = audit()
    if '--json' in sys.argv:
        print(json.dumps({k: v for k, v in findings.items()} | {'stats': stats},
                         ensure_ascii=False, indent=1))
        sys.exit(0)
    print(f"{stats['components']} components, {stats['pairs']} component-defect pairs")
    print(f"defects offered per component: {stats['narrowest']} min, "
          f"{stats['median']} median, {stats['widest']} max\n")
    bad = 0
    for kind in ('empty picker', 'unreachable defect', 'leak of a fluid not present',
                 'specialist mode, unrelated part'):
        rows = findings.get(kind, [])
        tag = 'FAIL' if kind in FAIL else 'warn'
        print(f"[{tag}] {kind}: {len(rows)}")
        if kind in FAIL:
            bad += len(rows)
        for c, nm, extra in rows[:12]:
            print(f"    {c:12} {nm[:30]:32} {extra}")
        if len(rows) > 12:
            print(f"    … and {len(rows) - 12} more")
        print()
    sys.exit(1 if bad else 0)
