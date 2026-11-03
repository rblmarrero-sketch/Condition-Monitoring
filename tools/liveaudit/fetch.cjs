/* Pull what the audit reads, into OUT:
     ping.json            the script's health answer (version, canDelete)
     index.json           action=index&slim=1, every round
     rounds/<T_U_D>.json  each round since SINCE: its folder listing and sidecars
     diag/<name>.json     each phone's sync trace since SINCE (decoded)
   Usage: node tools/liveaudit/fetch.cjs OUT SINCE(YYYY-MM-DD) */
const fs = require('fs'), path = require('path');
const { get, body } = require('./live.cjs');
const OUT = process.argv[2], SINCE = process.argv[3];
if (!OUT || !/^\d{4}-\d{2}-\d{2}$/.test(SINCE || '')) { console.error('usage: fetch.cjs OUT YYYY-MM-DD'); process.exit(2); }
(async () => {
  for (const d of ['rounds', 'diag']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const ping = await get({}); fs.writeFileSync(path.join(OUT, 'ping.json'), JSON.stringify(ping, null, 1));
  const ix = await get({ action: 'index', slim: '1' }); fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(ix));
  const rows = (ix.rows || []).filter(r => r.d >= SINCE);
  for (const r of rows) {
    const folder = `${r.t}/${r.u}/${r.d}`, fn = path.join(OUT, 'rounds', folder.replace(/\//g, '_') + '.json');
    const L = await get({ action: 'list', folder, max: '500' }); const files = (L && L.files) || [];
    const recs = [];
    for (const s of files.filter(f => /\.json$/.test(f.name) && !/\.(edit|conflict|deleted|defer)/.test(f.name))) {
      const t = body(await get({ action: 'file', id: s.id }));
      ((t && t.records) || []).forEach(x => { x._file = s.name; recs.push(x); });
    }
    fs.writeFileSync(fn, JSON.stringify({ folder, row: r, listing: files.map(f => ({ name: f.name, size: f.size, updated: f.updated })), recs }));
  }
  const D = await get({ action: 'list', folder: '_meta/diag', max: '1000' });
  const since = Date.parse(SINCE + 'T00:00:00Z');
  for (const f of ((D && D.files) || []).filter(x => +x.updated >= since)) {
    const fn = path.join(OUT, 'diag', f.name); if (fs.existsSync(fn)) continue;
    const t = body(await get({ action: 'file', id: f.id })); if (t) fs.writeFileSync(fn, JSON.stringify(t));
  }
  console.log(`fetched: ${rows.length} rounds since ${SINCE}, script ${ping.version}`);
})().catch(e => { console.error(e); process.exit(1); });
