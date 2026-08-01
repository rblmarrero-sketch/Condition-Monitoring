#!/usr/bin/env python3
"""Turn the client's HME defect & cause matrix into the app's reference data.

Run this again whenever a new matrix lands:

    python3 docs/build-hme-data.py <hme_defect_cause_matrix_1C_vN.json>

It writes mobile/hme.js and mobile/hme-cascade.js and rewrites the unit list in
mobile/assets.js. Nothing else in the app is touched.

Two things are worth knowing before editing this file.

The cascade is the reason the app can offer a component's real failure modes
instead of guessing from its name. Sent as-is it is 1.9 MB, which is not a size
to hand a phone on pit signal. Two lossless compressions bring it to ~290 KB:
cause codes become indexes into the cause list, and the rank-3 "general" tail —
53,047 of the 71,858 rows, and only 54 distinct sets across the whole matrix —
is stored once and referenced.

The legacy map exists so that history keeps its meaning. No stored inspection is
ever rewritten: an old code is resolved to its v4 meaning when a record is read,
the same way corrections and voids are merged rather than written back.
"""
import json, re, sys, subprocess, collections

SRC  = sys.argv[1] if len(sys.argv) > 1 else \
    '/root/.claude/uploads/1f3ebdba-c3da-5675-b557-e45dfee4b57e/5250be34-hme_defect_cause_matrix_1C_v4.json'
REPO = '/home/user/Condition-Monitoring'
MAP  = REPO + '/docs/v4-migration-map.json'

V = json.load(open(SRC))
M = json.load(open(MAP))

# ── components the client's register does not yet carry ───────────────────────
# CH.VD is the vibratory drum of a roller compactor: the working element of the
# machine and its primary wear item. v4's COMPACTOR, ROLLER DRUM class lists 74
# components and the drum is not among them, so ten units would have no way to
# record the finding that matters most on them. Kept here, with its failure modes
# borrowed from the nearest thing v4 does define — a ground-contacting rotating
# element on bearings and seals. The client should add it to 1C; until then this
# is visible, honest and documented rather than silently dropped.
LOCAL = [
    dict(code='CH.VD', parent='CH', system='CH', item='VD', en='Vibrator', ru='Вибратор',
         deployedInRegister=True, instancesInRegister=0, local=True, cascadeFrom='CH.ROL'),
]

# ── build ─────────────────────────────────────────────────────────────────────
comps = {c['code']: c for c in V['components']}
for l in LOCAL:
    assert l['code'] not in comps, l['code'] + ' is in v4 now — drop it from LOCAL'
    assert l['cascadeFrom'] in V['cascade'], l['cascadeFrom']

causes = V['directCauses']
cIdx = {c['code']: i for i, c in enumerate(causes)}

def slim(rows, keys):
    return [{k: r[k] for k in keys if r.get(k) not in (None, '', [], {})} for r in rows]

# The rank-3 tail: identical across thousands of pairs, so store the distinct
# sets once. Ranks 1 and 2 stay inline — they are what the inspector reads first.
sets, setIdx, cx = [], {}, {}
for comp, byFm in V['cascade'].items():
    out = {}
    for fmc, rows in byFm.items():
        r1 = [cIdx[x['c']] for x in rows if x['r'] == 1]
        r2 = [cIdx[x['c']] for x in rows if x['r'] == 2]
        gen = tuple(cIdx[x['c']] for x in rows if x['r'] == 3)
        if gen not in setIdx:
            setIdx[gen] = len(sets); sets.append(list(gen))
        out[fmc] = [r1, r2, setIdx[gen]]
    cx[comp] = out
for l in LOCAL:
    cx[l['code']] = cx[l['cascadeFrom']]

# ── the read-time legacy map ──────────────────────────────────────────────────
legacy = {'components': {}, 'defects': {}, 'causes': {}, 'actions': {}, 'labels': {}}
for sec, key in (('components', 'components'), ('defectTypes', 'defects'), ('directCauses', 'causes')):
    for r in M[sec]['rows']:
        if not r['old']:
            continue
        if r['new'] and r['new'] != r['old'] and r['how'] != 'keep':
            legacy[key][r['old']] = r['new']
        elif r['how'] == 'unmatched':
            # Retired, not re-pointed. The label is kept so a record that carries
            # this code still reads correctly; nothing is rewritten.
            legacy['labels'][r['old']] = r.get('oldLabel') or r.get('label') or r['old']
for a in M['actions']:
    legacy['actions'][a['old']] = a['new']

# ── units with no class recorded ──────────────────────────────────────────────
# 348 units in the register carry no equipment category, so nothing resolves them
# to a component list and an inspector standing at one would be offered nothing.
# The unit-number prefix is the only thing that says what the machine is, and v4
# has a class for each of these. Written to `fb`, not to `cat`: `cat` is what the
# register says, and a guess must not be able to pass for a record.
PREFIX_FALLBACK = {
    'HX': 'HEATING UNIT, EQUIPMENT',   # 20 diesel heaters
    'LS': 'LIGHTING PLANT, DIESEL',    # 24 lighting towers
    'TK': 'TRUCK, GENERIC',            # 301 support trucks of unstated type
}
# Three rows in the register are system codes, not machines.
NOT_MACHINES = {'CH', 'DRS', 'ELS'}

# ── units: merge, never replace ───────────────────────────────────────────────
ASSETS = json.loads(subprocess.run(
    ['node', '-e', 'global.window={};require("./mobile/assets.js");console.log(JSON.stringify(window.ASSETS))'],
    capture_output=True, text=True, cwd=REPO).stdout)
CLS = json.loads(subprocess.run(
    ['node', '-e', '''const fs=require("fs");const h=fs.readFileSync("mobile/index.html","utf8");
const m=h.match(/const CLASSES = \\{[\\s\\S]*?\\n\\};/)[0];
const o={};for(const x of m.matchAll(/^  ([A-Z]+):\\{ en:"[^"]*", ru:"[^"]*", asset:"([^"]*)"/gm)) o[x[2]]=x[1];
console.log(JSON.stringify(o));'''], capture_output=True, text=True, cwd=REPO).stdout)

byUnit = {u: m for m in V['models'] for u in m['units']}
have = {a['n'] for a in ASSETS}
added, rejected = [], []
for u in sorted(byUnit):
    if u in have:
        continue
    if not re.fullmatch(r'[A-Z]{2,3}\d+', u):
        rejected.append(u); continue
    m = byUnit[u]
    cat = m['equipmentClass']
    added.append(dict(n=u, cls=CLS.get(cat, 'GEN'), cat=cat,
                      m=' '.join(x for x in (m.get('manufacturer'), m.get('model')) if x) or None))
ecNames = {e['name'] for e in V['equipmentClasses']}
units, dropped, fell = [], [], 0
for a in sorted(ASSETS + added, key=lambda a: a['n']):
    if a['n'] in NOT_MACHINES:
        dropped.append(a['n']); continue
    a.pop('fb', None); a.pop('mk', None)      # recomputed below, never inherited
    m = byUnit.get(a['n'])
    # the model key lets the component picker narrow below equipment-class level
    if m and m.get('manufacturer') and m.get('model'):
        a['mk'] = m['manufacturer'] + '|' + m['model']
    if not (a.get('cat') and a['cat'] in ecNames):
        fb = PREFIX_FALLBACK.get(re.sub(r'\d.*$', '', a['n']))
        if fb:
            assert fb in ecNames, fb
            a['fb'] = fb; fell += 1
    units.append(a)

# ── emit ──────────────────────────────────────────────────────────────────────
def js(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))

HEAD = f'''/* GENERATED — do not edit by hand.
   Source: {V['schema']} {V['version']} ({V['standard']})
   Rebuild: python3 docs/build-hme-data.py <matrix.json>
*/
'''

hme = dict(
    version=V['version'], standard=V['standard'],
    systems=slim(V['systems'], ['code', 'en', 'ru']),
    components=slim(V['components'], ['code', 'parent', 'system', 'en', 'ru', 'deployedInRegister'])
               + [{k: l[k] for k in ('code', 'parent', 'system', 'en', 'ru', 'local')} for l in LOCAL],
    defectTypes=slim(V['defectTypes'], ['code', 'group', 'en', 'ru', 'iso14224', 'defaultSeverity']),
    directCauses=slim(causes, ['code', 'group', 'en', 'ru', 'generic']),
    defectTypeGroups=slim(V['defectTypeGroups'], ['code', 'en', 'ru']),
    directCauseGroups=slim(V['directCauseGroups'], ['code', 'en', 'ru']),
    equipmentClasses=[dict(name=e['name'], components=e['components']) for e in V['equipmentClasses']],
    models={m['manufacturer'] + '|' + m['model']: m['components']
            for m in V['models'] if m.get('manufacturer') and m.get('model')},
    severity=V['severity'], grade=V['grade'], action=V['action'], detection=V['detection'],
    isoFailureModeCodes=V['isoFailureModeCodes'],
    unitPrefixToEquipmentType=V['unitPrefixToEquipmentType'],
    legacy=legacy,
)
# A local component has to reach the machines that carry it — both through the
# equipment class and through every model of that class, or a unit whose model IS
# recorded gets the narrowed list and the component vanishes again.
LOCAL_ON = {'CH.VD': 'COMPACTOR, ROLLER DRUM'}
for l in LOCAL:
    cls = LOCAL_ON.get(l['code'])
    if not cls:
        continue
    for e in hme['equipmentClasses']:
        if e['name'] == cls and l['code'] not in e['components']:
            e['components'] = sorted(e['components'] + [l['code']])
    for m in V['models']:
        if m['equipmentClass'] != cls or not (m.get('manufacturer') and m.get('model')):
            continue
        k = m['manufacturer'] + '|' + m['model']
        if k in hme['models'] and l['code'] not in hme['models'][k]:
            hme['models'][k] = sorted(hme['models'][k] + [l['code']])

open(REPO + '/mobile/hme.js', 'w').write(HEAD + 'window.HME=' + js(hme) + ';\n')
open(REPO + '/mobile/hme-cascade.js', 'w').write(
    HEAD + '/* g = the shared rank-3 tails; c[component][defect] = [rank1, rank2, tailIndex],\n'
    '   every number an index into HME.directCauses. */\n'
    'window.HME_CX=' + js(dict(g=sets, c=cx)) + ';\n')

AHEAD = ('/* GENERATED — do not edit by hand. Rebuild: python3 docs/build-hme-data.py\n'
         '   The unit list is a MERGE of what the app already held and what the register\n'
         "   names. Replacing it would remove machines that are on site but have no\n"
         '   manufacturer or model recorded in 1C. */\n')
open(REPO + '/mobile/assets.js', 'w').write(AHEAD + 'window.ASSETS=' + js(units) + ';\n')

import os
print(f"components   {len(hme['components']):5}  ({len(LOCAL)} local)")
print(f"defectTypes  {len(hme['defectTypes']):5}")
print(f"directCauses {len(hme['directCauses']):5}")
print(f"classes      {len(hme['equipmentClasses']):5}   models {len(hme['models'])}")
print(f"cascade      {len(cx):5} components, {sum(len(v) for v in cx.values())} pairs, "
      f"{len(sets)} shared tails")
print(f"legacy       {sum(len(v) for v in legacy.values()):5} entries")
print(f"units        {len(units):5}  (+{len(added)} added, {len(rejected)} malformed: {rejected}, "
      f"{len(dropped)} not machines: {dropped})")
print(f"  no class in the register, resolved from the unit prefix: {fell}")
for f in ('hme.js', 'hme-cascade.js', 'assets.js'):
    print(f"  mobile/{f:18} {os.path.getsize(REPO+'/mobile/'+f):>9,} bytes")
