#!/usr/bin/env python3
"""Build the v4 migration map. Reports only — writes no app data.

Every row carries HOW it was matched, so a human can review the judgement calls
separately from the mechanical ones:

  exact     the code is identical in v4
  system    component matched as <SYSTEM>.<v4 code>  (DRS.COO.RAD -> COO.RAD)
  legacy1   matched via v4's legacyCode1
  legacy2   matched via v4's legacyCode2
  name      identical or near-identical English label; v4's legacy fields missed it
  proposed  ENGINEERING JUDGEMENT — needs review
  keep      deliberately unchanged this round (magnetic plug / filter cut)
  unmatched no target found
"""
import json, re, subprocess, sys
from collections import Counter

V4J = '/root/.claude/uploads/1f3ebdba-c3da-5675-b557-e45dfee4b57e/5250be34-hme_defect_cause_matrix_1C_v4.json'
REPO = '/home/user/Condition-Monitoring'
V = json.load(open(V4J))

def node(expr):
    return json.loads(subprocess.run(['node', '-e', expr], capture_output=True, text=True, cwd=REPO).stdout)

TAX = node('global.window={};require("./mobile/taxonomy2.js");console.log(JSON.stringify(window.TAX2))')
ASSETS = node('global.window={};require("./mobile/assets.js");console.log(JSON.stringify(window.ASSETS))')
TREE = node('''global.window={};require("./mobile/components.js");
const c=new Set();window.COMP_TREE.forEach(t=>(function w(n){for(const x of n){if(String(x.k).includes("."))c.add(x.k);if(x.ch)w(x.ch)}})(t));
console.log(JSON.stringify([...c]))''')

def legacy(rows, field):
    out = {}
    for r in rows:
        for v in str(r.get(field, '') or '').split(';'):
            v = v.strip()
            if v: out.setdefault(v, r['code'])
    return out

# ── components ────────────────────────────────────────────────────────────────
comps = {c['code']: c for c in V['components']}
sysdot = {c['system'] + '.' + c['code']: c['code'] for c in V['components']}

# The six the automatic rules cannot place. Each is an app-side error, not a v4 gap.
COMP_FIX = {
    'BS.BPc':      ('BS.BPC',  'proposed', 'lowercase typo in components.js for BS.BPC Brake Packs'),
    'DRS. ELE':    ('DRS.ELE', 'proposed', 'stray space in components.js; v4 code is DRS.ELE High Voltage Electrical Control'),
    'CH.AIR.ATK':  ('AIR.ATK', 'proposed', 'v4 files the air system under system HS, not CH'),
    'CH.AIR.AVP':  ('AIR.AVP', 'proposed', 'v4 files the air system under system HS, not CH'),
    'CH.AIR.CMP':  ('AIR.CMP', 'proposed', 'v4 files the air system under system HS, not CH'),
    'CH.VD':       (None,      'unmatched','no v4 component; check what CH.VD is meant to be'),
}

def map_components():
    rows = []
    for k in sorted(TREE):
        if k in comps:
            rows.append(dict(old=k, new=k, how='exact', label=comps[k]['en'], note=''))
        elif k in sysdot:
            rows.append(dict(old=k, new=sysdot[k], how='system', label=comps[sysdot[k]]['en'],
                             note=f"v4 code is {sysdot[k]}, system {comps[sysdot[k]]['system']}"))
        elif k in COMP_FIX:
            new, how, note = COMP_FIX[k]
            rows.append(dict(old=k, new=new, how=how,
                             label=comps[new]['en'] if new in comps else '', note=note))
        else:
            rows.append(dict(old=k, new=None, how='unmatched', label='', note=''))
    seen = {r['new'] for r in rows if r['new']}
    added = [dict(old=None, new=c['code'], how='new', label=c['en'],
                  note=f"system {c['system']}" + ('' if c['deployedInRegister'] else ' · not yet deployed in 1C'))
             for c in V['components'] if c['code'] not in seen]
    return rows, added

# ── defect types ──────────────────────────────────────────────────────────────
fm = {f['code']: f for f in V['defectTypes']}
fl1, fl2 = legacy(V['defectTypes'], 'legacyCode1'), legacy(V['defectTypes'], 'legacyCode2')

# Magnetic plug and filter cut are out of scope this round — their defect lists stay.
KEEP_PREFIX = ('DT14-', 'DT15-')

# Old codes that baked the component into the failure mode. v4 separates the two,
# so the target is the mode alone; the component now carries the rest of the meaning.
DEF_PROPOSED = {
    'DT0-00':  ('FM-DQ-02',  'v4 has an explicit data-quality group'),
    'DT10-01': ('FM-PER-10', 'transmission slipping = loss of drive, on the transmission'),
    'DT10-02': ('FM-PER-10', 'travel / propulsion fault = loss of drive, on the travel drive'),
    'DT10-03': ('FM-PER-06', 'component (final drive / axle) now carries what the old code named'),
    'DT10-04': ('FM-PER-11', 'brake performance low = fails to stop / will not hold, on the brakes'),
    'DT10-05': ('FM-TMP-01', 'brake overheating = overheating, on the brakes'),
    'DT10-06': ('FM-PER-06', 'steering fault = fails to operate, on the steering'),
    'DT10-07': ('FM-MEC-03', 'bearing damage = abnormal / accelerated wear'),
    'DT13-02': ('FM-PER-08', 'cylinder drift = cannot hold load / creeps / drifts'),
    'DT13-03': ('FM-PER-06', 'pump / motor fault = fails to operate, on the pump'),
    'DT13-05': ('FM-MEC-05', 'hose chafing = broken / damaged component, on the hose'),
    'DT3-08':  ('FM-CTL-03', 'signal noise / interference = communication fault'),
    'DT4-09':  ('FM-ELE-06', 'relay / contactor failure = protection trip / breaker / fuse'),
    'DT4-16':  ('FM-ELE-09', 'starter motor fault = battery / starting circuit fault'),
    'DT4-17':  ('FM-ELE-04', 'phase loss / imbalance = abnormal voltage / current'),
    'DT4-18':  ('FM-ELE-04', 'voltage surge = abnormal voltage / current; EX-19 records the lightning'),
    'DT6-06':  ('FM-MEC-07', 'anchor bolt issue = loose / missing fastener'),
    'DT8-05':  ('FM-CNV-08', 'conveyor belt wear; check against FM-MEC-03 on the belt'),
}

def near(label, rows, key='en'):
    a = set(re.sub(r'[^a-z0-9 ]', ' ', label.lower()).split())
    best, sim = None, 0.0
    for r in rows:
        b = set(re.sub(r'[^a-z0-9 ]', ' ', r[key].lower()).split())
        s = len(a & b) / max(1, len(a | b))
        if s > sim: best, sim = r, s
    return best, sim

def map_defects():
    rows = []
    for d in sorted(TAX['defects'], key=lambda x: x['c']):
        c = d['c']
        if c in fm:      rows.append(dict(old=c, oldLabel=d['en'], new=c, how='exact', newLabel=fm[c]['en'], note=''))
        elif c in fl1:   rows.append(dict(old=c, oldLabel=d['en'], new=fl1[c], how='legacy1', newLabel=fm[fl1[c]]['en'], note=''))
        elif c in fl2:   rows.append(dict(old=c, oldLabel=d['en'], new=fl2[c], how='legacy2', newLabel=fm[fl2[c]]['en'], note=''))
        elif c.startswith(KEEP_PREFIX):
            rows.append(dict(old=c, oldLabel=d['en'], new=c, how='keep', newLabel=d['en'],
                             note='magnetic plug / filter cut — unchanged this round'))
        else:
            best, sim = near(d['en'], V['defectTypes'])
            if sim >= 0.45:
                rows.append(dict(old=c, oldLabel=d['en'], new=best['code'], how='name', newLabel=best['en'],
                                 note=f"same concept, v4 legacy fields missed it (similarity {sim:.2f})"))
            elif c in DEF_PROPOSED:
                new, note = DEF_PROPOSED[c]
                rows.append(dict(old=c, oldLabel=d['en'], new=new, how='proposed', newLabel=fm[new]['en'], note=note))
            else:
                rows.append(dict(old=c, oldLabel=d['en'], new=None, how='unmatched', newLabel='', note=''))
    seen = {r['new'] for r in rows if r['new']}
    added = [dict(old=None, oldLabel='', new=f['code'], how='new', newLabel=f['en'],
                  note=f"group {f['group']} · ISO {f['iso14224']} · default {f['defaultSeverity']}")
             for f in V['defectTypes'] if f['code'] not in seen]
    return rows, added

# ── direct causes ─────────────────────────────────────────────────────────────
dc = {c['code']: c for c in V['directCauses']}
cl1, cl2 = legacy(V['directCauses'], 'legacyCode1'), legacy(V['directCauses'], 'legacyCode2')

# The DT5-* block is the app's "external / operating condition" set, appended to
# every cause list today. v4 splits it: the generic DC-GEN-* causes are already in
# the rank-3 tail of every cascade, and EX-* records the contributing condition.
CAUSE_PROPOSED = {
    'DT5-03':      ('DC-GEN-031', 'impact / collision; EX-08 / EX-09 record the condition'),
    'DT5-04':      ('DC-GEN-042', 'harsh environment; EX-01 / EX-02 record the condition'),
    'DT5-05':      ('DC-ENG-014', 'foreign object in equipment'),
    'DT5-06':      ('DC-GEN-041', 'water ingress from washdown / rain; EX-12 / EX-16 record the condition'),
    'DT5-07':      ('DC-GEN-042', 'dust / dirt ingress from environment'),
    'DT5-08':      ('DC-GEN-031', 'third-party damage; EX-10 records the condition'),
    'DT5-10':      ('DC-GEN-021', 'improper operation; overload / single overstress event'),
    'DT5-11':      ('DC-GEN-021', 'overload / overspeed; EX-13 / EX-14 record the condition'),
    'DT5-12':      ('DC-GEN-032', 'poor maintenance; damaged during maintenance / handling'),
    'DT5-13':      ('DC-GEN-082', 'assembly / installation error'),
    'DT5-14':      ('DC-GEN-023', 'extreme temperature; EX-03 / EX-04 record the condition'),
    'DT5-15':      ('DC-GEN-023', 'corrosive atmosphere; EX-05 records the condition'),
    'DC-CPC-018':  ('DC-GEN-065', 'excessive vibration transmitted from adjacent equipment'),
    'DC-CSC-001':  ('DC-COO-101', 'radiator core externally plugged (dust, seeds, mud)'),
    'DC-CSC-003':  ('DC-COO-103', 'radiator core seam split or tube leaking'),
    'DC-CSC-004':  ('DC-COO-006', 'v4 calls it the coolant pump, not the water pump'),
    'DC-CSC-005':  ('DC-COO-111', 'stuck CLOSED; v4 splits the two directions — DC-COO-112 is stuck open'),
    'DC-DBASC-016':(None,         'RETIRE — "hoist not lifting" is a failure mode (FM-PER-06 on the hoist), not a cause. '
                                  'Historical records carrying it should re-point to the mode, not to a cause.'),
    'DC-UC-011':   (None,         'RETIRE — "track derailed" is a failure mode (FM-UC-02), not a cause. '
                                  'Historical records carrying it should re-point to the mode, not to a cause.'),
}

def map_causes():
    rows = []
    for c0 in sorted(TAX['causes'], key=lambda x: x['c']):
        c = c0['c']
        if c in dc:    rows.append(dict(old=c, oldLabel=c0['en'], new=c, how='exact', newLabel=dc[c]['en'], note=''))
        elif c in cl1: rows.append(dict(old=c, oldLabel=c0['en'], new=cl1[c], how='legacy1', newLabel=dc[cl1[c]]['en'], note=''))
        elif c in cl2: rows.append(dict(old=c, oldLabel=c0['en'], new=cl2[c], how='legacy2', newLabel=dc[cl2[c]]['en'], note=''))
        else:
            best, sim = near(c0['en'], V['directCauses'])
            if sim >= 0.45:
                rows.append(dict(old=c, oldLabel=c0['en'], new=best['code'], how='name', newLabel=best['en'],
                                 note=f"same concept, v4 legacy fields missed it (similarity {sim:.2f})"))
            elif c in CAUSE_PROPOSED:
                new, note = CAUSE_PROPOSED[c]
                rows.append(dict(old=c, oldLabel=c0['en'], new=new,
                                 how='proposed' if new else 'unmatched',
                                 newLabel=dc[new]['en'] if new in dc else '', note=note))
            else:
                rows.append(dict(old=c, oldLabel=c0['en'], new=None, how='unmatched', newLabel='', note=''))
    seen = {r['new'] for r in rows if r['new']}
    added = [dict(old=None, oldLabel='', new=c['code'], how='new', newLabel=c['en'],
                  note=f"group {c['group']}" + (' · generic fallback' if c.get('generic') else ''))
             for c in V['directCauses'] if c['code'] not in seen]
    return rows, added

# ── units ─────────────────────────────────────────────────────────────────────
def map_units():
    app = {a['n'] for a in ASSETS}
    v4 = {u for m in V['models'] for u in m['units']}
    byu = {u: m for m in V['models'] for u in m['units']}
    bad = [u for u in v4 - app if not re.fullmatch(r'[A-Z]{2,3}\d+', u)]
    add = sorted((v4 - app) - set(bad))
    return dict(
        appOnly=sorted(app - v4), bothCount=len(app & v4),
        addFromV4=[dict(unit=u, equipmentClass=byu[u]['equipmentClass'],
                        manufacturer=byu[u].get('manufacturer', ''), model=byu[u].get('model', ''))
                   for u in add],
        rejected=[dict(unit=u, why='malformed register code — reported, not imported') for u in sorted(bad)])

# ── actions and severity ──────────────────────────────────────────────────────
ACTIONS = [
    ('MON',  'RA-02', 'Monitor / re-inspect next PM'),
    ('REI',  'RA-02', 'Monitor / re-inspect next PM'),
    ('SAM',  'RA-09', 'Send sample / further diagnosis'),
    ('TOP',  'RA-03', 'Top up / adjust / clean on site'),
    ('PM',   'RA-05', 'Repair at next scheduled service'),
    ('SCH',  'RA-04', 'Create 1C notification - plan repair'),
    ('NOW',  'RA-06', 'Repair immediately'),
    ('STOP', 'RA-07', 'Stop machine - do not operate'),
    ('NOTI', 'RA-04', 'Create 1C notification - plan repair'),
]
SEVERITY = [('NOF', 'SEV-0'), ('INC', 'SEV-1'), ('DEG', 'SEV-2'), ('CRI', 'SEV-3')]

crows, cadd = map_components()
drows, dadd = map_defects()
krows, kadd = map_causes()

out = dict(
    generatedFor=f"{V['schema']} {V['version']}",
    components=dict(rows=crows, newInV4=cadd),
    defectTypes=dict(rows=drows, newInV4=dadd),
    directCauses=dict(rows=krows, newInV4=kadd),
    units=map_units(),
    actions=[dict(old=o, new=n, newLabel=l,
                  note='collides with another old code — old records keep their own code'
                  if sum(1 for a in ACTIONS if a[1] == n) > 1 else '') for o, n, l in ACTIONS],
    actionsNewInV4=[dict(new=a['code'], newLabel=a['en'], severity=a['severity'])
                    for a in V['action'] if a['code'] not in {n for _, n, _ in ACTIONS}],
    severity=[dict(old=o, new=n, note='internal code unchanged; emitted as the v4 code on export')
              for o, n in SEVERITY],
)
json.dump(out, open(sys.argv[1], 'w'), indent=1, ensure_ascii=False)

for name, rows, add in (('components', crows, cadd), ('defect types', drows, dadd), ('direct causes', krows, kadd)):
    c = Counter(r['how'] for r in rows)
    print(f"{name:14} {len(rows):4} old  →  " + '  '.join(f"{k} {v}" for k, v in sorted(c.items())) + f"   |  new in v4: {len(add)}")
u = out['units']
print(f"{'units':14} {len(ASSETS):4} in app, {u['bothCount']} also in v4, {len(u['appOnly'])} app-only kept, "
      f"{len(u['addFromV4'])} added from v4, {len(u['rejected'])} rejected")
