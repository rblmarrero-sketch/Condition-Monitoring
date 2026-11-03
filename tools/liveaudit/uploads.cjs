/* Uploads and phone activity, from what fetch.cjs pulled into OUT.

   1. Every round: does the folder hold every file its own manifest claims,
      at no smaller a size than the phone recorded? (missing / empty / short)
   2. Every phone trace: build, what failed, which photographs a phone could
      not read (NotFoundError and friends), and whether each round's last word
      in the trace was success or failure.
   Writes OUT/uploads.json and prints a summary. */
const fs = require('fs'), path = require('path');
const OUT = process.argv[2];
const rounds = fs.readdirSync(path.join(OUT, 'rounds')).map(f => JSON.parse(fs.readFileSync(path.join(OUT, 'rounds', f))));
const land = rounds.map(d => {
  const by = {}; d.listing.forEach(f => { by[f.name] = f; });
  const want = new Map(); const devs = new Set(); let side = 0;
  d.recs.forEach(r => { side++; devs.add(r.dev); (r.items || []).forEach(it => (it.att || []).forEach(a => {
    const n = a.storedName || a.fileName || a.name; if (n) want.set(n, a.byteSize || null); })); });
  const miss = [], empty = [], short = [];
  want.forEach((sz, n) => { const f = by[n];
    if (!f) miss.push(n); else if (!f.size) empty.push(n); else if (sz && f.size < sz) short.push(n + ' (' + f.size + ' < ' + sz + ')'); });
  return { round: `${d.row.u} ${d.row.t} ${d.row.d}`, by: d.row.by, devs: [...devs].filter(Boolean), sidecars: side,
    files: d.listing.length, claimed: want.size, miss, empty, short };
});
const traces = fs.readdirSync(path.join(OUT, 'diag')).sort().map(n => {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, 'diag', n)));
  const L = d.lines || [], ev = {};
  L.forEach(l => { ev[l.ev] = (ev[l.ev] || 0) + 1; });
  const unread = [];
  L.forEach(l => { if (l.ev === 'batch-unreadable' || l.ev === 'file-unread') String(l.names || l.name || '').split(',').filter(Boolean).forEach(x => unread.push(x + (l.err ? ' (' + l.err + ')' : ''))); });
  const last = {}; L.forEach(l => { if (l.ev === 'record-ok') last[l.u] = 'ok'; if (l.ev === 'record-fail') last[l.u] = 'fail: ' + String(l.err || '').slice(0, 120); });
  return { name: n, dev: d.dev, build: d.build, why: d.why, at: d.at, pending: d.pending, bookFail: d.bookFail,
    platform: d.platform && d.platform.platform, storagePct: d.storage && d.storage.pct, err: String(d.err || '').slice(0, 240),
    ev, unread: [...new Set(unread)], last };
});
const devs = {};
traces.forEach(t => { const x = devs[t.dev] = devs[t.dev] || { dev: t.dev, traces: 0, builds: new Set(), lastAt: '', platform: t.platform, failRuns: 0, unread: new Set() };
  x.traces++; x.builds.add(t.build); if (t.at > x.lastAt) { x.lastAt = t.at; x.lastBuild = t.build; x.lastPending = t.pending; x.lastWhy = t.why; }
  if (t.why === 'run-error') x.failRuns++; t.unread.forEach(u => x.unread.add(u)); });
const devList = Object.values(devs).map(x => Object.assign({}, x, { builds: [...x.builds], unread: [...x.unread] }));
const bad = land.filter(r => r.miss.length || r.empty.length || r.short.length || !r.sidecars);
fs.writeFileSync(path.join(OUT, 'uploads.json'), JSON.stringify({ land, traces, devices: devList }, null, 1));
console.log(`rounds: ${land.length}, complete on the server: ${land.length - bad.length}`);
bad.forEach(r => console.log('  !! ' + r.round + ' (' + r.devs.join(',') + ')' + (r.miss.length ? ' missing ' + r.miss.length + ': ' + r.miss.slice(0, 5).join(', ') : '')
  + (r.empty.length ? ' empty: ' + r.empty.join(', ') : '') + (r.short.length ? ' short: ' + r.short.join(', ') : '') + (!r.sidecars ? ' NO SIDECAR' : '')));
console.log(`phones: ${devList.length}`);
devList.forEach(x => console.log(`  ${x.dev} ${x.platform || ''} last trace ${x.lastAt} build ${x.lastBuild} pending ${x.lastPending}; ${x.traces} traces, ${x.failRuns} ended in an error; photographs it could not read: ${x.unread.length}`));
