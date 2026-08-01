"""Which fluids a component can plausibly leak.

Shared by the build (which uses it to demote implausible modes in the picker)
and by the audit (which uses it to count them). One copy, so the two can never
drift apart and quietly disagree about what an A/C condenser contains.

Nothing here deletes a defect. A leak of a fluid the part does not contain moves
behind "show all" — an inspector who genuinely finds one can still record it.
"""
import re

# Which fluids a component can plausibly leak. Keyed on the system it belongs to,
# then overridden by name where the system is too coarse. A component that leaks
# nothing still gets the non-fluid modes — this only governs the LEK group.
SYSTEM_FLUIDS = {
    'HS':   {'oil', 'air', 'grease'},   # cylinder pins
    'LS':   {'oil', 'grease'},
    'BS':   {'oil', 'air', 'grease'},   # slack adjusters, S-cams
    'PS':   {'air'},
    'DRS':  {'oil', 'coolant', 'fuel', 'exhaust', 'air', 'grease'},  # axles and driveline carry grease
    'SS':   {'oil', 'grease'},   # steering linkage is greased
    'WE':   {'oil', 'grease'},
    'CH':   {'oil', 'grease', 'air', 'coolant', 'fuel', 'exhaust'},
    'CRS':  {'oil', 'grease'},
    'SCN':  {'oil', 'grease'},
    'CONV': {'oil', 'grease'},
    'FEED': {'oil', 'grease'},
    'DUS':  {'air'},
    'ELS':  set(),
    'AU':   set(),
    'OC':   set(),
}
# name-level overrides, most specific first
NAME_FLUIDS = [
    (r'a/c|air cond|condenser|evaporator|expansion valve|refrigerant', {'oil'}),
    (r'heater|heating',                                                {'coolant', 'fuel'}),
    (r'batter',                                                        {'oil'}),   # electrolyte
    (r'fuel',                                                          {'fuel'}),
    (r'coolant|radiator|cooling',                                      {'coolant'}),
    (r'exhaust|muffler|dpf|scr\b',                                     {'exhaust'}),
    (r'compressor|air tank|air drier|air line',                        {'air', 'oil'}),
]
LEK_FLUID = {
    'FM-LEK-01': 'oil', 'FM-LEK-02': 'coolant', 'FM-LEK-03': 'fuel',
    'FM-LEK-04': 'grease', 'FM-LEK-05': 'air', 'FM-LEK-06': 'exhaust',
    'FM-LEK-07': None,     # internal bypass — any fluid, judged by the component
    'FM-LEK-08': None,     # rupture — same
}
# Specialist groups and the words that say a component belongs to that specialism.
SPECIALIST = {
    'TYR': r'tyre|tire|wheel|rim',
    'UC':  r'undercarriage|crawler|track|idler|sprocket|roller|shoe|chain|chassis',
    'GET': r'bucket|tooth|teeth|\bget\b|lip|cutting edge|ripper|blade|shank|bit|fork',
    'CRU': r'crusher|jaw|cone|mantle|concave|bowl|chamber|breaker|hammer|roll|shaft',
    'SCR': r'screen|deck|mesh|grizzly|sieve|panel|exciter|vibrat',
    'DRL': r'drill|rod|bit|mast|rotary|rotation|feed|string|pipe|compressor',
    'CNV': r'conveyor|belt|chute|liner|feeder|hopper|apron|skirt|pulley|idler|box|body|bed',
}


def fluids_for(comp):
    nm = (comp.get('en') or '').lower()
    for pat, f in NAME_FLUIDS:
        if re.search(pat, nm):
            return f
    return SYSTEM_FLUIDS.get(comp.get('system'), None)


