#!/usr/bin/env node
/* One-time cleanup for the "N rounds were sent by two phones" conflicts that
 * are actually one inspector's repeated saves under a churning device id
 * (mobile/index.html's cm_dev persistence bug, fixed alongside this script —
 * see the DEVICE comment in mobile/index.html).
 *
 * For every OPEN conflict marker on the live backend:
 *   - list its own folder to get each rival file's real name and server mtime
 *   - if every rival's `by` field is the exact same trimmed string, this is
 *     one person's repeated saves: keep the newest one (by the record id's
 *     own embedded capture timestamp), resolve the marker via the real
 *     op:resolve endpoint (the same call the dashboard's "Decide" button
 *     makes), and log it.
 *   - if the `by` fields differ at all, this MIGHT be a genuine two-inspector
 *     clash. Never auto-resolve it. Log it for a human to open on the
 *     dashboard and decide by hand.
 *
 * Dry-run by default — prints exactly what it would do and touches nothing.
 * Pass --apply to actually POST the resolutions for the same-author groups.
 *
 * Usage:
 *   node cleanup-conflicts.js            # dry run, safe, no network writes
 *   node cleanup-conflicts.js --apply    # actually resolves same-author groups
 *
 * RUN 2026-09-30: 15 open conflicts found, all dated 2026-09-30. Only one
 * (TK146|INSP) had every rival under the exact same author string
 * ("R. Marrero") and was auto-resolved. The other 14 were NOT auto-resolved
 * because their author strings differ — but not the way a real two-inspector
 * clash looks. Most carry "R. Marrero N" (a literal trailing digit, 0-4,
 * repeating across different units) on device DGW79E or D8H0RT, and the 27
 * saves behind these 14 groups span barely 4.3 minutes wall-clock
 * (2026-09-30T01:53:28Z to 01:57:44Z) across 13 different machines — not
 * something a field inspector can do on foot. This reads as a seeding/test
 * script that hit the LIVE backend rather than a test instance, not as
 * genuine field activity. Left exactly as flagged, deliberately: this
 * script's job is to collapse UNAMBIGUOUS duplicate saves, never to guess at
 * a pattern, however likely. Whoever generated this data should confirm it
 * is disposable and either delete it outright or resolve/discard it by hand
 * from the dashboard's own conflict bar.
 */
const BASE = 'https://baimskaya-cm.duckdns.org';
const APPLY = process.argv.includes('--apply');

async function getJSON(url) {
  const r = await fetch(url);
  return r.json();
}
async function post(body) {
  const r = await fetch(BASE + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// unit|YYYY-MM-DD|type  ->  TYPE/unit/YYYY-MM-DD
function folderOf(key) {
  const [unit, date, type] = key.split('|');
  return `${type}/${unit}/${date}`;
}
// unit|YYYY-MM-DD|type  ->  unit_DD.MM.YYYY_type.json  (matches keyFile() in function.js)
function baseNameOf(key) {
  const [unit, date, type] = key.split('|');
  const [y, m, d] = date.split('-');
  return `${unit}_${d}.${m}.${y}_${type}.json`;
}

(async () => {
  console.log(APPLY ? '*** APPLY MODE — this WILL write to the live backend ***' : 'DRY RUN — no writes will be made (pass --apply to actually resolve)');
  console.log('');

  const data = await getJSON(`${BASE}/?action=records&after=0&max=2000&index=0`);
  if (!data.ok) { console.error('records fetch failed', data); process.exit(1); }
  const records = data.records || [];
  const byKey = {};
  records.forEach(r => {
    const k = `${r.equip}|${r.date}|${r.type}`;
    (byKey[k] = byKey[k] || []).push(r);
  });

  const open = (data.conflicts || []).filter(c => c && !c.resolved && c.key);
  console.log(`${data.conflicts.length} total conflict markers, ${open.length} open.\n`);

  const resolved = [], flagged = [], skippedNoRecords = [];

  for (const c of open) {
    const key = c.key;
    const recs = byKey[key] || [];
    if (!recs.length) { skippedNoRecords.push(key); continue; }

    // One entry per dev (the server keeps exactly one live file per dev per
    // key; defensive de-dup by highest rev in case that ever isn't true).
    const byDev = new Map();
    recs.forEach(r => {
      const d = String(r.dev || '');
      const cur = byDev.get(d);
      if (!cur || Number(r.rev || 0) >= Number(cur.rev || 0)) byDev.set(d, r);
    });
    const rivals = [...byDev.values()];

    const names = new Set(rivals.map(r => String(r.by || '').trim()));
    const tsOf = r => Number(String(r.id || '').split('__').pop()) || 0;

    // Real server file listing, for a human-readable trail (name + mtime) —
    // not used to decide anything, only to log what actually collapses.
    let listing = [];
    try {
      const l = await getJSON(`${BASE}/?action=list&folder=${encodeURIComponent(folderOf(key))}`);
      listing = (l.files || []).filter(f => /\.json$/i.test(f.name) && !/\.(edit|conflict|deleted)\.json$/i.test(f.name));
    } catch (e) { /* logging only; absence doesn't block the decision */ }

    if (names.size === 1) {
      const newest = rivals.slice().sort((a, b) => tsOf(b) - tsOf(a))[0];
      const losers = rivals.filter(r => r !== newest);
      console.log(`RESOLVE  ${key}`);
      console.log(`  author: "${[...names][0]}" on all ${rivals.length} copies`);
      console.log(`  keep:    ${newest.dev}  (id ${newest.id})`);
      losers.forEach(r => console.log(`  discard: ${r.dev}  (id ${r.id})`));
      listing.forEach(f => console.log(`  file:    ${f.name}  ${new Date(f.updated).toISOString()}`));

      if (APPLY) {
        try {
          const r = await post({ op: 'resolve', key, keep: newest.dev,
            by: 'Automated cleanup (mobile/index.html device-id-persist bug, build 486)' });
          console.log(`  -> ${r.ok ? 'OK' : 'FAILED'} ${JSON.stringify(r)}`);
        } catch (e) { console.log(`  -> POST FAILED: ${e && e.message || e}`); }
      }
      resolved.push({ key, keep: newest.dev, discarded: losers.map(r => r.dev), author: [...names][0] });
      console.log('');
    } else {
      console.log(`REVIEW   ${key}  — ${names.size} distinct author name(s), NOT auto-resolved`);
      rivals.forEach(r => console.log(`  ${r.dev}  by="${r.by || ''}"  rev=${r.rev}  id=${r.id}`));
      console.log('');
      flagged.push({ key, authors: [...names], devices: rivals.map(r => ({ dev: r.dev, by: r.by })) });
    }
  }

  console.log('='.repeat(70));
  console.log(`${resolved.length} group(s) ${APPLY ? 'resolved' : 'WOULD be resolved'} (single author, kept newest save):`);
  resolved.forEach(r => console.log(`  ${r.key}  kept ${r.keep}, discarded ${r.discarded.join(',')} — "${r.author}"`));
  console.log('');
  console.log(`${flagged.length} group(s) flagged for HUMAN REVIEW (mixed authors — possible genuine two-inspector clash):`);
  flagged.forEach(f => console.log(`  ${f.key}  authors: ${f.authors.map(a => `"${a}"`).join(', ')}`));
  if (skippedNoRecords.length) {
    console.log('');
    console.log(`${skippedNoRecords.length} open marker(s) with no matching records found (skipped): ${skippedNoRecords.join(', ')}`);
  }
  console.log('='.repeat(70));
})().catch(e => { console.error('THROWN', e && e.stack || e); process.exit(1); });
