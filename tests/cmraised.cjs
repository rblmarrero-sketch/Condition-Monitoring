/* THE DATE A DEFECT WAS RAISED IS NOT THE DATE SOMEBODY PLANS TO FIX IT.

   Reported from the office on 2026-09-13: "already 24 hours since Defects
   raised updated from 1C WO, but it has been updated in FTP every hour." The
   feed was fine — six pulls that day, all of them committed. The register was
   reading its date off "Start date plan", the second candidate in CM_FIELDS
   and the one this workbook has. So a defect written up this morning and
   scheduled for the 28th was filed under the 28th; sorted newest-first, the
   twelve rows dated next week sat on top and this morning's work was below
   the fold. From a desk that is exactly what a stopped feed looks like.

   This project's signature defect in its purest form: a real value — a fresh
   pull, six times a day — rendered as nothing.

   The workbook has carried the right column all along: "Work request creation
   date", column 58 of 61. Since build 360 it is the ONLY thing the register's
   date is read from; the planned start and the detection date are carried in
   their own fields, and the row says which of the three it was filed under.
   A fallback to the planned start is not a degraded answer to "when was this
   raised" — it is the answer to a different question, so when it happens the
   panel says so rather than quietly sorting on it again.

   Everything here drives the real ingester over workbooks built from the real
   61 headers, so what is measured is the shipped script and not a copy of it.

   Run: node tests/cmraised.cjs            (needs python3 + openpyxl) */
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

/* The workbook's own headers, taken from the generated file rather than typed
   here — a test that keeps its own copy of something the app owns is how four
   suites came to fail on working code. */
const REAL = fs.readFileSync(path.join(ROOT, 'data/work_orders.js'), 'utf8');
const COLS = JSON.parse(REAL.slice(REAL.indexOf('{'), REAL.lastIndexOf('}') + 1)).columns;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmraised-'));
const py = path.join(tmp, 'mk.py');
const iso = d => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

/* One python file, told which headers to DROP, so the fallback cases are the
   same workbook minus a column rather than a second fixture to keep in step.
   argv[4] is extra rows a case needs and argv[5] ("only") drops the standard
   ones — a case about a column the standard rows do not exercise writes its
   own three lines rather than bending the fixture every other case reads. */
fs.writeFileSync(py, `
import sys, json, openpyxl
from datetime import datetime, timedelta, date
cols = json.loads(sys.argv[2])
drop = set(json.loads(sys.argv[3]))
extra = sys.argv[4] if len(sys.argv) > 4 else ''
only  = (len(sys.argv) > 5 and sys.argv[5] == 'only')
cols = [c for c in cols if c not in drop]
wb = openpyxl.Workbook(); ws = wb.active; ws.append(cols)
i = {c: n for n, c in enumerate(cols)}
today = date.today()
def dt(off): return datetime.combine(today + timedelta(days=off), datetime.min.time())
def row(**kw):
    r = [None] * len(cols)
    for k, v in kw.items():
        if k in i: r[i[k]] = v
    return r
for n, (raised_off, det_off, plan_off) in ([] if only else enumerate([(0, -1, 15), (-1, -2, 15), (-7, -8, -3)])):
    ws.append(row(**{
      'Asset description': 'x', 'Equip no': 'TK%03d' % (150 + n),
      'Work request creation date': dt(raised_off),
      'Defect detected on': dt(det_off),
      'Start date plan': dt(plan_off),
      'End date plan': None, 'Start date actual': None, 'End date actual': None,
      'Work order status': 'Open', 'CMMSWork order status': 'Elimination scheduled',
      'Priority': 'P2 Urgent', 'Maintenence type': 'P4 Planned Repair',
      'Work order number': 'WO-0170%02d' % n, 'Work request number': 'DD-000125%02d' % n,
      'Responsible person': 'Slam', 'Equipmen type': 'TRUCK, DUMP',
      'System component': 'x', 'Defect type': '1.01 Leakage',
      'WODefect cause': 'wear', 'Defect description': 'leak'}))
if not only:
    ws.append(row(**{'Asset description': 'x', 'Equip no': 'TK150',
      'Maintenence type': '1000 Hours service Planned', 'Start date plan': dt(2),
      'End date plan': None, 'Start date actual': None, 'End date actual': None,
      'Work order status': 'Open', 'CMMSWork order status': 'Open',
      'Priority': 'P4', 'Work order number': 'WO-018000'}))
if extra: exec(extra)
wb.save(sys.argv[1])
`);

function build(name, drop, extra, only) {
  const xl = path.join(tmp, name + '.xlsx');
  execFileSync('python3', [py, xl, JSON.stringify(COLS), JSON.stringify(drop || []),
                           extra || '', only ? 'only' : ''],
               { stdio: ['ignore', 'ignore', 'pipe'] });
  const out = path.join(tmp, name + '.js');
  execFileSync('python3', [path.join(ROOT, 'ingest/ingest_work_orders.py'), xl, '--out', out],
               { stdio: ['ignore', 'ignore', 'pipe'], cwd: tmp });
  const s = fs.readFileSync(out, 'utf8');
  return JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
}

try { execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' }); }
catch (e) { console.log('  FAIL  python3 with openpyxl is required to drive the real ingester'); process.exit(1); }

console.log('1. the register is filed under the day the defect was written up');
const D = build('full');
ok('the date column is the work request creation date',
   D.cmColumns.date === 'Work request creation date', String(D.cmColumns.date));
ok('  and the planned start is carried, in its own field',
   D.cmColumns.planStart === 'Start date plan', String(D.cmColumns.planStart));
ok('  as is the detection date',
   D.cmColumns.detected === 'Defect detected on', String(D.cmColumns.detected));
const rows = D.cmWorkOrders.filter(r => !r.planned);
ok('  three defects came through', rows.length === 3, rows.length + ' row(s)');
ok('  every one of them says where its date came from',
   rows.every(r => r.dateFrom === 'raised'), rows.map(r => r.dateFrom).join(','));
ok('  and every one is filed under its raised date, not its planned start',
   rows.every(r => r.date === r.raised && r.date !== r.planStart),
   rows.map(r => r.date + '/' + r.planStart).join(' '));

console.log('\n2. that is what makes today\'s work visible');
/* The defect raised today and scheduled a fortnight out is the exact row the
   office could not see: under the old rule it sorted to the 28th. */
ok('the newest row is the one raised today', rows[0].date === iso(0), rows[0].date);
ok('  and it is NOT the row with the nearest planned start',
   rows[0].planStart !== rows.map(r => r.planStart).sort()[0],
   rows[0].planStart + ' vs earliest ' + rows.map(r => r.planStart).sort()[0]);
ok('  nothing in the register is dated in the future',
   rows.every(r => r.date <= iso(0)), rows.map(r => r.date).join(','));
ok('  and the file says so in one number', (D.cmDateFrom || {}).raised === 3,
   JSON.stringify(D.cmDateFrom));

console.log('\n3. a workbook that stops carrying it does not empty the panel');
const N = build('nodate', ['Work request creation date']);
const nrows = N.cmWorkOrders.filter(r => !r.planned);
ok('the rows are still there', nrows.length === 3, nrows.length + ' row(s)');
ok('  filed under the detection date, which is the nearer question',
   nrows.every(r => r.dateFrom === 'detected' && r.date === r.detected),
   nrows.map(r => r.dateFrom).join(','));
ok('  the missing column is named', N.cmColumns.date === null, String(N.cmColumns.date));
ok('  and the count of substituted rows is stated, not implied',
   (N.cmDateFrom || {}).detected === 3 && (N.cmDateFrom || {}).raised === 0,
   JSON.stringify(N.cmDateFrom));

console.log('\n4. with neither, the planned start is used AND declared');
const P = build('planonly', ['Work request creation date', 'Defect detected on']);
const prows = P.cmWorkOrders.filter(r => !r.planned);
ok('the rows survive', prows.length === 3, prows.length + ' row(s)');
ok('  every one declares the planned start as its source',
   prows.every(r => r.dateFrom === 'planStart' && r.date === r.planStart),
   prows.map(r => r.dateFrom).join(','));
ok('  and the office is told how many', (P.cmDateFrom || {}).planStart === 3,
   JSON.stringify(P.cmDateFrom));

console.log('\n5. the dashboard has the words for it');
/* The panel must be able to SAY the fallback. A count with no sentence beside
   it is the false reassurance half of this project's signature defect. */
const dash = fs.readFileSync(path.join(ROOT, 'dashboard/index.html'), 'utf8');
['cw_notraised', 'cw_from_plan', 'cw_from_detected', 'cw_plan_on'].forEach(k => {
  const n = (dash.match(new RegExp('\\b' + k + '\\s*:', 'g')) || []).length;
  ok('  ' + k + ' is written in both languages', n === 2, n + ' definition(s)');
});
ok('  the column is headed by what it holds', /cw_c_date:"Raised"/.test(dash));
ok('  and the panel reads cmDateFrom', /cmDateFrom/.test(dash));

console.log('\n6. a cause 1C has settled in a different field is still a cause');
/* THE CAUSE IS WRITTEN IN THREE PLACES AND ARRIVES IN THEM AT THREE MOMENTS.
   Reported from the office on 2026-09-14: "some causes of defect are blank,
   this is mandatory so it should never be blank". Measured on the live file:
   of 48 defects, all 19 at status "Registered" had a blank cause and all 29
   past it had one. Not eighteen of nineteen — every single one. A defect at
   Registered is still a WORK REQUEST, and the cause the inspector typed sits
   in the request's own field; the work order's copy, which is all this
   ingester read, is only filled when a work order is actually raised. The
   cause was recorded and the panel rendered it as nothing. */
const C = build('cause', [], `
ws.append(row(**{'Asset description':'x','Equip no':'TK901',
  'Work request creation date': dt(0), 'Start date plan': dt(5),
  'CMMSWork order status':'Registered','Work order status':'Open','Priority':'P2',
  'Maintenence type':'P4 Planned Repair','Responsible person':'Slam',
  'Work request number':'DD-00099001','WRDefect cause':'Iznos uplotneniya'}))
ws.append(row(**{'Asset description':'x','Equip no':'TK902',
  'Work request creation date': dt(0), 'Start date plan': dt(5),
  'CMMSWork order status':'Elimination scheduled','Work order status':'Open','Priority':'P2',
  'Maintenence type':'P4 Planned Repair','Responsible person':'Slam',
  'Work request number':'DD-00099002','Work order number':'WO-099002',
  'WODefect cause':'Povrezhden shlang'}))
ws.append(row(**{'Asset description':'x','Equip no':'TK903',
  'Work request creation date': dt(0), 'Start date plan': dt(5),
  'CMMSWork order status':'Registered','Work order status':'Open','Priority':'P2',
  'Maintenence type':'P4 Planned Repair','Responsible person':'Slam',
  'Work request number':'DD-00099003'}))
`, true);
const by = {};
C.cmWorkOrders.filter(r => !r.planned).forEach(r => { by[r.asset] = r; });
ok('the work order\'s own cause is still the first answer',
   (by.TK902 || {}).cause === 'Povrezhden shlang' && (by.TK902 || {}).causeFrom === 'wo',
   JSON.stringify([(by.TK902 || {}).cause, (by.TK902 || {}).causeFrom]));
ok('  a Registered defect reads the cause off the work REQUEST',
   (by.TK901 || {}).cause === 'Iznos uplotneniya' && (by.TK901 || {}).causeFrom === 'wr',
   JSON.stringify([(by.TK901 || {}).cause, (by.TK901 || {}).causeFrom]));
ok('  and one with nothing anywhere is not invented',
   (by.TK903 || {}).cause == null && (by.TK903 || {}).causeFrom == null,
   JSON.stringify([(by.TK903 || {}).cause, (by.TK903 || {}).causeFrom]));
ok('  the file totals where every cause came from',
   JSON.stringify(C.cmCauseFrom) === JSON.stringify({ wo: 1, wr: 1, cert: 0, none: 1 }),
   JSON.stringify(C.cmCauseFrom));
ok('  all three columns are named, so a missing one is visible',
   C.cmColumns.cause === 'WODefect cause' && C.cmColumns.causeWR === 'WRDefect cause'
   && C.cmColumns.causeCert === 'CERTTDefect cause',
   [C.cmColumns.cause, C.cmColumns.causeWR, C.cmColumns.causeCert].join(' | '));
ok('  and the office has the words for a cause nobody has typed',
   (dash.match(/\bcw_nocause\s*:/g) || []).length === 2,
   (dash.match(/\bcw_nocause\s*:/g) || []).length + ' definition(s)');
ok('  which it reads off the file, not off the blank cells',
   /cmCauseFrom/.test(dash));

console.log('\n7. the planned service half of the file is untouched');
ok('planned services still come through', Array.isArray(D.workOrders) && D.workOrders.length === 1,
   (D.workOrders || []).length + ' service(s)');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails.length ? `\n${fails.length} FAILED: ` + fails.join(' | ') : '\nall passed');
process.exit(fails.length ? 1 : 0);
