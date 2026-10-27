/* GAS_SCAN_FIXES_V1 — what the deep scan of 2026-10-27 found in the Apps
   Script, proved against the REAL docs/google-upload.gs over gsindex.cjs's
   in-memory Drive (tests/gsfake.cjs).

     1. a deferral carries the office's `cleared`, on the index and records paths;
     2. a deferral moves the index clock, so an incremental pull delivers it;
     3. a second phone re-deferring a round is the same file, not "X.defer~DEV.json";
     4. a month index that cannot be read is not read past: truncated, cursor held;
     5. a correction whose write fails leaves the old marker standing, and the
        clock unmoved; the same for a conflict decision;
     6. deleting one device's rival copy takes that device's row out of the index.

   Run:  node tests/gsscan.cjs                      (the script in the repo)
         GS_SRC=/path/old.gs node tests/gsscan.cjs  (any other version) */
const fs = require('fs'), path = require('path');
const { mkWorld, load } = require('./gsfake.cjs');
const SRC = process.env.GS_SRC || path.join(__dirname, '..', 'docs', 'google-upload.gs');
const SOURCE = fs.readFileSync(SRC, 'utf8');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 220) : '')); if (!c) fails.push(n); };
const b64 = s => Buffer.from(typeof s === 'string' ? s : JSON.stringify(s)).toString('base64');
const world = () => { const W = mkWorld(); return { W, S: load(W, SOURCE, 'pw') }; };
const section = (name, fn) => { console.log('\n' + name); try { fn(); } catch (e) { ok(name + ' ran to the end', false, String(e && e.stack || e).split('\n').slice(0, 2).join(' | ')); } };
const defer = (S, body, dev) => S.post({ name: body.u + '_' + body.t + '.defer.json', folder: '_meta/deferrals', contentType: 'application/json',
  dev, file: b64(Object.assign({ type: 'cm-round-deferred', version: 1 }, body)) });
const sidecar = (u, d, ty, dev, by, g) => ({ type: 'cm-inspection-entries', version: 2,
  records: [{ equip: u, date: d, type: ty, by: by || 'B. Ivanov', dev, items: [{ key: '4C', grade: g || 2 }] }] });
const up = (S, dev, body, name, folder) => S.post({ name, folder, contentType: 'application/json', dev, file: b64(body) });
const built = W => { W.props.cm_built = String(W.now); };

section('1. THE OFFICE\'S CANCEL ARRIVES AS A CANCEL', () => {
  const { W, S } = world();
  const r = defer(S, { u: 'TK146', t: 'INSP', until: null, why: '', by: 'Planner', at: '2026-10-27T08:00:00Z', cleared: 1 });
  ok('the cancel is saved', r.ok === true, r);
  const ix = S.get({ action: 'index', since: '0' }), rc = S.get({ action: 'records', after: '0' });
  const di = (ix.deferrals || [])[0] || {}, dr = (rc.deferrals || [])[0] || {};
  ok('the index path hands on cleared:1', di.cleared === 1, di);
  ok('the records path hands on cleared:1', dr.cleared === 1, dr);
  defer(S, { u: 'TK147', t: 'INSP', until: null, why: 'Parked for the winter', by: 'Planner', at: '2026-10-27T08:00:00Z' });
  const real = (S.get({ action: 'index', since: '0' }).deferrals || []).find(d => d.u === 'TK147') || {};
  ok('a real deferral says cleared:0', real.cleared === 0, real);
});

section('2. A DEFERRAL IS NEWS FOR AN INCREMENTAL PULL', () => {
  const { W, S } = world();
  up(S, 'DA', sidecar('TK001', '2026-10-20', 'MP', 'DA'), 'TK001_20.10.2026_MP.json', 'MP/TK001/2026-10-20');
  built(W);
  const full = S.get({ action: 'index', since: '0', slim: '1' });
  W.now += 1000;
  defer(S, { u: 'TK146', t: 'INSP', until: '2026-11-10', why: 'Waiting for parts', by: 'Planner', at: '2026-10-27T09:00:00Z' }, 'DPHONE');
  const inc = S.get({ action: 'index', since: String(full.at), slim: '1' });
  ok('the pull after a deferral is not "up to date"', !inc.upToDate, { at0: full.at, at1: inc.at, upToDate: inc.upToDate });
  ok('and it carries the deferral', (inc.deferrals || []).some(d => d.u === 'TK146'), inc.deferrals);
});

section('3. A SECOND PHONE RE-DEFERRING A ROUND REPLACES THE ONE FILE', () => {
  const { W, S } = world();
  defer(S, { u: 'TK146', t: 'INSP', until: '2026-11-01', why: 'Waiting for parts', by: 'A', at: '2026-10-26T08:00:00Z' }, 'DPHONEA');
  W.now += 1000;
  const r = defer(S, { u: 'TK146', t: 'INSP', until: '2026-11-20', why: 'Machine in the workshop', by: 'B', at: '2026-10-27T08:00:00Z' }, 'DPHONEB');
  const names = W.livePrefix('_meta/deferrals/').map(f => f._name);
  ok('one live file, under the name every reader looks for', names.length === 1 && names[0] === 'TK146_INSP.defer.json', names);
  ok('the upload kept no "rival" copy', !r.kept && !/~/.test(r.name || ''), r);
  const d = (S.get({ action: 'index', since: '0' }).deferrals || []).find(x => x.u === 'TK146') || {};
  ok('every reader gets the later phone\'s statement', d.until === '2026-11-20' && d.by === 'B', d);
});

section('4. A MONTH INDEX THAT CANNOT BE READ IS NOT READ PAST', () => {
  const { W, S } = world();
  up(S, 'DA', sidecar('TK001', '2026-09-20', 'MP', 'DA'), 'TK001_20.09.2026_MP.json', 'MP/TK001/2026-09-20');
  W.now += 1000;
  up(S, 'DA', sidecar('TK002', '2026-10-20', 'MP', 'DA'), 'TK002_20.10.2026_MP.json', 'MP/TK002/2026-10-20');
  built(W);
  W.failRead = /^2026-09\.json$/;
  const r = S.get({ action: 'index', since: '0', slim: '1' });
  ok('the reply says it is NOT complete', r.truncated === true, { truncated: r.truncated, cursor: r.cursor, unreadable: r.unreadable });
  ok('the cursor stays before the month it could not read', Number(r.cursor || 0) === 0, r.cursor);
  ok('and names the month', r.unreadable === '2026-09.json', r.unreadable);
  W.failRead = null;
  const r2 = S.get({ action: 'index', since: String(r.cursor || 0), slim: '1' });
  ok('asked again once Drive answers, both months arrive', (r2.rows || []).length === 2 && !r2.truncated, (r2.rows || []).map(x => x.u));
});

section('5. A CORRECTION OR A DECISION WHOSE WRITE FAILS LEAVES THE OLD ONE STANDING', () => {
  const { W, S } = world();
  const key = 'TK146|2026-10-26|MP';
  const e1 = S.post({ op: 'edit', key, by: 'Desk A', void: true, reason: 'Duplicate round', note: 'see TK146 27.10' });
  ok('the first correction (a void) is saved', e1.ok === true, e1);
  const at0 = W.props.cm_at;
  W.now += 1000;
  W.failCreate = /\.edit\.json$/;
  const e2 = S.post({ op: 'edit', key, by: 'Desk B', fields: { smu: 12345 } });
  W.failCreate = null;
  ok('the failed write says so', e2.ok === false, e2);
  const live = W.livePrefix('_meta/').filter(f => /\.edit\.json$/.test(f._name));
  ok('the earlier marker is still live', live.length === 1, live.map(f => f._name));
  ok('with its void still in it', live.length === 1 && JSON.parse(live[0]._buf.toString()).void === true);
  ok('and the index clock did not move for a change that did not happen', W.props.cm_at === at0, { at0, at1: W.props.cm_at });
  // a conflict decision, the same way
  up(S, 'DREAL', sidecar('TK146', '2026-10-26', 'MP', 'DREAL'), 'TK146_26.10.2026_MP.json', 'MP/TK146/2026-10-26');
  W.now += 10;
  up(S, 'DTEST', sidecar('TK146', '2026-10-26', 'MP', 'DTEST', 'TEST RUN', 5), 'TK146_26.10.2026_MP.json', 'MP/TK146/2026-10-26');
  const before = W.livePrefix('_meta/').filter(f => /\.conflict\.json$/.test(f._name)).length;
  W.failCreate = /\.conflict\.json$/;
  const rr = S.post({ op: 'resolve', key, keep: 'DREAL', by: 'Desk A' });
  W.failCreate = null;
  const after = W.livePrefix('_meta/').filter(f => /\.conflict\.json$/.test(f._name));
  ok('a conflict marker existed', before === 1, before);
  ok('a failed decision leaves the conflict marker standing', rr.ok === false && after.length === 1 && JSON.parse(after[0]._buf.toString()).resolved === false, { rr, n: after.length });
});

section('6. DELETING ONE DEVICE\'S COPY TAKES ITS ROW OUT OF THE INDEX', () => {
  const { W, S } = world();
  up(S, 'DREAL', sidecar('EX003', '2026-09-30', 'INSP', 'DREAL', 'B. Ivanov', 3), 'EX003_30.09.2026_INSP.json', 'INSP/EX003/2026-09-30');
  W.now += 10;
  const rv = up(S, 'DTEST', sidecar('EX003', '2026-09-30', 'INSP', 'DTEST', 'TEST RUN', 5), 'EX003_30.09.2026_INSP.json', 'INSP/EX003/2026-09-30');
  ok('the rival is kept under its own name', /~DTEST/.test(rv.name || ''), rv.name);
  built(W);
  const rows0 = S.get({ action: 'index', since: '0', slim: '1' }).rows || [];
  ok('the index holds both copies before', rows0.filter(x => x.u === 'EX003').length === 2, rows0);
  const d = S.post({ op: 'delete', admin: 'pw', key: 'EX003|2026-09-30|INSP', dev: 'DTEST', by: 'Desk', why: 'test run' });
  ok('the rival is deleted', d.ok === true && d.deleted >= 1, d);
  const rows1 = (S.get({ action: 'index', since: '0', slim: '1' }).rows || []).filter(x => x.u === 'EX003');
  ok('only the real round is left in the index', rows1.length === 1 && rows1[0].by === 'B. Ivanov', rows1);
  ok('the real round\'s file is untouched', W.live('INSP/EX003/2026-09-30/EX003_30.09.2026_INSP.json').length === 1);
});

console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
