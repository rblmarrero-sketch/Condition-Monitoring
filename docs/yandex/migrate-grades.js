#!/usr/bin/env node
/* THE GRADE MIGRATION — A/B/C/X TO 1..5, IN THE FOLDER, WITH A WAY BACK.

   What it does
     Every JSON document the backend holds that carries a grade — the
     inspection sidecars (records[].items[].grade and the top-level `grades`
     map of an entries file) and the office's correction markers
     (_meta/*.edit.json, items[key].grade) — is read, and every letter grade
     in it is rewritten as its number: A→1, B→2, C→3, D→4, X→5. Nothing else
     in the document moves: ids, dates, inspectors, comments, measurements,
     manifests, work-order links, sync and audit fields are byte-for-byte as
     they were. Photographs are never touched.

   How it is safe
     - It reads everything first and writes a local backup of every document
       it will change (--backup DIR, required with --apply), and the backend
       copies the original bytes to _meta/backup/<stamp>/ before each
       overwrite (op:rewrite). Two copies, two places.
     - Each rewrite names the hash it read (ifSha); a document that changed
       underneath it is refused, not clobbered.
     - It is idempotent: a document with no letters is not written, and a
       second run reports 0 changes.
     - It reconciles: counts before and after — documents, records, items,
       photographs claimed, and the grade distribution with the letters mapped
       — have to agree, or it says so and exits non-zero.
     - Nothing is deleted and nothing unexpected is discarded: a document that
       will not parse is listed and left exactly as it is.

   How to run it (from any machine that can reach the endpoint)
     export CM_URL=https://baimskaya-cm.duckdns.org      # the live backend
     export CM_SECRET=...        # the phones' secret, only if the backend sets one
     export ADMIN_SECRET=...     # from /opt/cm/cm.env on the VM — never stored here
     node docs/yandex/migrate-grades.js --scan                         # read-only survey
     node docs/yandex/migrate-grades.js --apply --backup ./grade-backup # migrate, keep originals
     node docs/yandex/migrate-grades.js --verify ./grade-backup         # prove it reconciles

   The backend must be running a function.js that offers op:rewrite (see
   docs/yandex/VM-SETUP.md §12 for how a backend change is deployed). Against
   an older backend --apply stops before writing anything and says why. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const LEGACY = { A: 1, B: 2, C: 3, D: 4, X: 5 };
const isLegacy = v => v != null && v !== '' && LEGACY[String(v).trim().toUpperCase()] != null;
const num = v => { if (v == null || v === '') return null; const s = String(v).trim().toUpperCase();
  if (/^[1-5]$/.test(s)) return Number(s); return LEGACY[s] || null; };
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

const args = process.argv.slice(2);
const has = f => args.includes(f);
const after = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : ''; };
const URL_ = (process.env.CM_URL || 'https://baimskaya-cm.duckdns.org').replace(/\/+$/, '');
const SECRET = process.env.CM_SECRET || '';
const ADMIN = process.env.ADMIN_SECRET || '';
const BY = process.env.CM_BY || 'grade migration';
const WHY = 'grade scale A/B/C/X -> 1..5';

async function get(q) {
  const u = URL_ + '?' + new URLSearchParams(Object.assign({}, q, SECRET ? { secret: SECRET } : {})).toString();
  const r = await fetch(u); if (!r.ok) throw new Error('GET ' + q.action + ' -> HTTP ' + r.status);
  return r.json();
}
async function post(body) {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({}, body, SECRET ? { secret: SECRET } : {})) });
  if (!r.ok) throw new Error('POST ' + body.op + ' -> HTTP ' + r.status);
  return r.json();
}

/* Every JSON document, wherever it sits: the sidecars in the folder and the
   markers under _meta. Listed once, fetched one by one. */
async function listJson() {
  const l = await get({ action: 'list', folder: '', ext: '.json' });
  if (!l.ok) throw new Error('list failed: ' + l.error);
  return l.files.filter(f => /\.json$/i.test(f.name) && !/^_meta\/backup\//.test(f.path || f.id || ''));
}
async function fetchDoc(f) {
  const r = await get({ action: 'file', id: f.id || f.path });
  if (!r.ok) return { f, error: r.error };
  const buf = Buffer.from(r.data, 'base64');
  let doc = null, parseError = '';
  try { doc = JSON.parse(buf.toString('utf8')); } catch (e) { parseError = String(e.message || e); }
  return { f, buf, sha: sha256(buf), doc, parseError };
}

/* The rewrite, as a pure function of the document. Returns the new document
   and what changed, or null when nothing would. */
function migrateDoc(doc) {
  let changed = 0;
  const fixItem = it => { if (it && typeof it === 'object' && isLegacy(it.grade)) { it.grade = num(it.grade); changed++; } };
  /* The Apps Script's index shard keeps a slim row per round with the worst
     grade in `g`; it is derived, but it is what that backend answers
     action=records from, so it is brought over too. */
  const fixRow = r => { if (r && typeof r === 'object' && isLegacy(r.g)) { r.g = num(r.g); changed++; } };
  const copy = JSON.parse(JSON.stringify(doc));
  if (copy && Array.isArray(copy.records)) copy.records.forEach(r => { fixRow(r); (r && Array.isArray(r.items) ? r.items : []).forEach(fixItem); });
  if (copy && Array.isArray(copy.rows)) copy.rows.forEach(fixRow);
  if (copy && copy.grades && typeof copy.grades === 'object')
    Object.keys(copy.grades).forEach(k => { if (isLegacy(copy.grades[k])) { copy.grades[k] = num(copy.grades[k]); changed++; } });
  if (copy && copy.type === 'cm-record-edit' && copy.items && typeof copy.items === 'object')
    Object.keys(copy.items).forEach(k => fixItem(copy.items[k]));
  if (copy && Array.isArray(copy.items) && !copy.records) copy.items.forEach(fixItem);   // a bare record
  if (copy && copy.type === 'cm-inspection-entries' && changed) { copy.version = 3; copy.gradeScale = '1-5'; }
  return changed ? { doc: copy, changed } : null;
}

/* What a folder adds up to, for the reconciliation. Grades are counted with
   the letters mapped, so the same folder before and after has to give the
   same numbers. */
function tally(docs) {
  const t = { documents: 0, unparsed: 0, sidecars: 0, markers: 0, records: 0, items: 0,
              photosClaimed: 0, graded: 0, legacy: 0, byGrade: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  docs.forEach(d => {
    t.documents++;
    if (!d.doc) { t.unparsed++; return; }
    const doc = d.doc;
    const items = [];
    if (Array.isArray(doc.records)) { t.sidecars++; doc.records.forEach(r => { t.records++; (r.items || []).forEach(i => items.push(i)); }); }
    else if (doc.type === 'cm-record-edit') { t.markers++; Object.keys(doc.items || {}).forEach(k => items.push(doc.items[k])); }
    else if (Array.isArray(doc.items)) { t.sidecars++; t.records++; doc.items.forEach(i => items.push(i)); }
    items.forEach(i => { if (!i || typeof i !== 'object') return; t.items++;
      t.photosClaimed += Number(i.photos) || 0;
      const g = num(i.grade); if (g) { t.graded++; t.byGrade[g]++; }
      if (isLegacy(i.grade)) t.legacy++; });
    if (doc.grades && typeof doc.grades === 'object') Object.values(doc.grades).forEach(v => { if (isLegacy(v)) t.legacy++; });
  });
  return t;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function scan(label) {
  const files = await listJson();
  const docs = [];
  for (const f of files) docs.push(await fetchDoc(f));
  const t = tally(docs);
  console.log(`[${label}] ${t.documents} documents (${t.sidecars} sidecars, ${t.markers} markers, ${t.unparsed} unparsed) · ${t.records} records · ${t.items} items · ${t.photosClaimed} photographs claimed`);
  console.log(`[${label}] graded ${t.graded}: ` + [1, 2, 3, 4, 5].map(g => g + '=' + t.byGrade[g]).join(' ') + ` · still in letters: ${t.legacy}`);
  if (t.unparsed) console.log(`[${label}] left untouched, will not parse: ` + docs.filter(d => !d.doc).map(d => d.f.name).join(', '));
  return { docs, t };
}

(async () => {
  const mode = has('--apply') ? 'apply' : has('--verify') ? 'verify' : 'scan';
  const backupDir = after('--backup') || (mode === 'verify' ? (args[args.indexOf('--verify') + 1] || '') : '');
  console.log(`grade migration · ${mode} · ${URL_}`);
  const before = await scan('before');
  if (mode === 'scan') {
    const todo = before.docs.filter(d => d.doc && migrateDoc(d.doc));
    console.log(`would rewrite ${todo.length} document(s): ` + todo.slice(0, 20).map(d => d.f.name).join(', ') + (todo.length > 20 ? ' …' : ''));
    process.exit(0);
  }
  if (mode === 'verify') {
    const ref = backupDir && fs.existsSync(path.join(backupDir, 'tally.json'))
      ? JSON.parse(fs.readFileSync(path.join(backupDir, 'tally.json'), 'utf8')) : null;
    let ok = before.t.legacy === 0;
    if (!ok) console.log('FAIL: letters remain in the folder');
    if (ref) {
      const cmp = ['documents', 'sidecars', 'markers', 'records', 'items', 'photosClaimed', 'graded'];
      cmp.forEach(k => { if (ref[k] !== before.t[k]) { ok = false; console.log(`FAIL: ${k} before=${ref[k]} after=${before.t[k]}`); } });
      if (!same(ref.byGrade, before.t.byGrade)) { ok = false; console.log('FAIL: grade distribution moved', ref.byGrade, before.t.byGrade); }
      if (ok) console.log('reconciled against the pre-migration tally: every count agrees and no letters remain');
    } else console.log(ok ? 'no letters remain (no pre-migration tally to compare against)' : '');
    process.exit(ok ? 0 : 2);
  }
  /* ---- apply ---- */
  if (!ADMIN) { console.log('ADMIN_SECRET is not set — nothing written'); process.exit(2); }
  if (!backupDir) { console.log('--backup DIR is required with --apply — nothing written'); process.exit(2); }
  const ping = await post({ op: 'ping' });
  if (!ping.ok) { console.log('backend refused ping: ' + ping.error); process.exit(2); }
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'tally.json'), JSON.stringify(before.t, null, 2));
  const todo = before.docs.filter(d => d.doc && migrateDoc(d.doc));
  console.log(`rewriting ${todo.length} document(s), originals kept in ${backupDir} and on the server under _meta/backup/`);
  let done = 0, unchanged = 0, failed = 0;
  for (const d of todo) {
    const m = migrateDoc(d.doc);
    const out = Buffer.from(JSON.stringify(m.doc, null, 2), 'utf8');
    const local = path.join(backupDir, (d.f.path || d.f.name).replace(/[\\/]/g, '__'));
    fs.writeFileSync(local, d.buf);
    let r;
    try {
      r = await post({ op: 'rewrite', id: d.f.id || d.f.path, file: out.toString('base64'), ifSha: d.sha,
                       why: WHY, by: BY, admin: ADMIN });
    } catch (e) { r = { ok: false, error: String(e.message || e) }; }
    if (r.ok && r.unchanged) unchanged++;
    else if (r.ok) { done++; console.log(`  ok  ${d.f.name}  (${m.changed} grade(s))  backup ${r.backup}`); }
    else { failed++; console.log(`  FAIL ${d.f.name}: ${r.error}`);
      if (/Unknown|unknown op|not supported/i.test(String(r.error))) { console.log('the backend does not offer op:rewrite — deploy function.js first (VM-SETUP.md §12)'); break; } }
  }
  console.log(`rewritten ${done}, already current ${unchanged}, failed ${failed}`);
  const afterScan = await scan('after');
  const t0 = before.t, t1 = afterScan.t;
  let ok = failed === 0 && t1.legacy === 0;
  ['documents', 'sidecars', 'markers', 'records', 'items', 'photosClaimed', 'graded'].forEach(k => {
    if (t0[k] !== t1[k]) { ok = false; console.log(`FAIL: ${k} before=${t0[k]} after=${t1[k]}`); } });
  if (!same(t0.byGrade, t1.byGrade)) { ok = false; console.log('FAIL: grade distribution moved', t0.byGrade, t1.byGrade); }
  console.log(ok ? 'RECONCILED: same documents, records, items and photographs; same grades, now all numbers'
                 : 'NOT RECONCILED — see above; originals are in ' + backupDir + ' and under _meta/backup/');
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
