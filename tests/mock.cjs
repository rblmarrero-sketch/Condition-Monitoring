/* Static file server for the repo + a stand-in Apps Script /exec.
   Modes: /exec (new, has action=records) and /old (pre-batch, list+file only).
   Counts every request so a test can prove "one call, not three hundred". */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..');
const PORT = Number(process.argv[2] || 8098);

const sidecar = (unit, date, type, grade) => ({
  type: 'cm-inspection-entries', version: 2,
  records: [{ equip: unit, date, type, cls: 'HT', by: 'R. Marrero', smu: '5120',
    /* The live folder's rounds carry a position, and the inspection head
       draws a map link for it. The fixture had none, so the link's size on a
       phone was never measured here and was found on the deployed page. */
    gps: { lat: 66.6009, lon: 164.4749, acc: 8 },
    items: [{ key: '4C', label: 'Left Rear Final Drive', grade,
              defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', cause: 'Gear wear',
              action: 'SCH', actionLabel: 'Schedule repair', wo: 'N-104' }] }] });

let FILES = [];
function seed(n) {
  FILES = [];
  for (let i = 1; i <= n; i++) {
    const u = 'TK' + String(100 + i), d = `2026-07-${String((i % 28) + 1).padStart(2, '0')}`;
    FILES.push({ name: `${u}_${d.split('-').reverse().join('.')}_MP.json`, id: 'j' + i,
      /* Grades are 1..5. Every seventh round still carries the old letter
         (A/C/X — the same three grades) so every reader's normalisation is
         exercised on every run without moving a single count. */
      updated: 1000000 + i * 1000, size: 400,
      json: sidecar(u, d, 'MP', (i % 7 === 0) ? ['A', 'C', 'X'][i % 3] : [1, 3, 5][i % 3]) });
    FILES.push({ name: `${u}_4C_${d.split('-').reverse().join('.')}_MP.jpg`, id: 'p' + i,
      updated: 1000000 + i * 1000, size: 90000 });
  }
}
seed(Number(process.env.CM_SEED || 40));

const stats = { records: 0, list: 0, file: 0, health: 0 };
const MEDIA = /\.(jpe?g|png|webp|mp4|mov)$/i;

function exec(q, legacy) {
  const action = q.get('action');
  if (!action) { stats.health++; return { ok: true, service: 'mock', folder: 'Condition Monitoring' }; }
  if (legacy && action === 'records') return { ok: false, error: 'Unknown action: records' };
  if (action === 'records') {
    stats.records++;
    const after = Number(q.get('after') || 0) || 0;
    const max = Number(q.get('max') || 0) || 600;
    const side = FILES.filter(f => /\.json$/i.test(f.name) && f.updated > after)
                      .sort((a, b) => a.updated - b.updated);
    const take = side.slice(0, max);
    /* A sidecar the backend opens and cannot parse. It is counted in `failed`,
       it sends no records, and the cursor still moves past it — which is what
       makes those inspections permanently invisible unless somebody says so. */
    const good = take.filter(f => !f.bad);
    const out = { ok: true, records: [], read: good.length, failed: take.length - good.length,
      pending: Math.max(0, side.length - take.length), truncated: side.length > take.length,
      cursor: take.length ? take[take.length - 1].updated : after,
      files: FILES.length, photos: FILES.filter(f => MEDIA.test(f.name)).length };
    good.forEach(f => f.json.records.forEach(r => out.records.push(Object.assign({ _file: f.name }, r))));
    if (q.get('index') !== '0') {
      out.index = FILES.filter(f => MEDIA.test(f.name)).map(f => ({ name: f.name, id: f.id, size: f.size }));
    }
    return out;
  }
  if (action === 'list') {
    stats.list++;
    return { ok: true, count: FILES.length, truncated: false,
      files: FILES.map(f => ({ name: f.name, path: f.name, id: f.id, size: f.size, updated: f.updated })) };
  }
  if (action === 'file') {
    stats.file++;
    const f = FILES.find(x => x.id === q.get('id'));
    if (!f) return { ok: false, error: 'Missing file id' };
    const body = f.json ? JSON.stringify(f.json) : 'FAKEJPEGBYTES';
    return { ok: true, name: f.name, mime: f.json ? 'application/json' : 'image/jpeg',
             data: Buffer.from(body).toString('base64') };
  }
  return { ok: false, error: 'Unknown action: ' + action };
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*' };
  /* A deployment released before doPost existed. Every GET is answered, so the
     dashboard connects, loads records and looks healthy — and the first POST
     comes back as Google's Docs 404 page. This is what a live site did. */
  if (u.pathname === '/stale') {
    if (req.method === 'POST') {
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/html' }, cors));
      return res.end('<!DOCTYPE html><html lang="en"><head><meta name="description" '
        + 'content="Web word processing, presentations and spreadsheets"><meta name="viewport" '
        + 'content="width=device-width"><title>Error 404 (Not Found)</title></head><body>'
        + '<p>Sorry, unable to open the file at this time.</p></body></html>');
    }
    const b = JSON.stringify(exec(u.searchParams, false));
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(b);
  }
  /* The same deployment behind a login wall — "Who has access" left on the
     wrong setting. Google answers with a sign-in page, not the script. */
  if (u.pathname === '/locked') {
    if (req.method === 'POST') {
      res.writeHead(403, Object.assign({ 'Content-Type': 'text/html' }, cors));
      return res.end('<!DOCTYPE html><html><head><title>Sign in</title></head><body>x</body></html>');
    }
    const b = JSON.stringify(exec(u.searchParams, false));
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(b);
  }
  if (u.pathname === '/exec' || u.pathname === '/old') {
    const body = JSON.stringify(exec(u.searchParams, u.pathname === '/old'));
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(body);
  }
  if (u.pathname === '/__stats') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify(stats));
  }
  if (u.pathname === '/__reset') {
    Object.keys(stats).forEach(k => stats[k] = 0);
    if (u.searchParams.get('n')) seed(Number(u.searchParams.get('n')));
    if (u.searchParams.get('bad')) {                      // sidecars the backend cannot parse
      const n = Number(u.searchParams.get('bad')) || 1;
      for (let i = 1; i <= n; i++) {
        const id = 800 + i;
        FILES.push({ name: `TK${id}_31.07.2026_MP.json`, id: 'b' + id,
                     updated: 8000000 + id, size: 400, bad: true, json: null });
      }
    }
    /* One round exactly as it sits in the folder: unit,date,type. The type is
       written through untouched, so a test can send the case the folder really
       carries rather than the case this repo happens to prefer. */
    const rec = u.searchParams.get('rec');
    if (rec) {
      const [unit, date, ty] = rec.split(',');
      const i = FILES.length;
      FILES.push({ name: `${unit}_${date.split('-').reverse().join('.')}_${ty}.json`,
                   id: 'r' + i, updated: 7000000 + i, size: 400,
                   json: sidecar(unit, date, ty, 3) });
    }
    /* A ROUND SHAPED LIKE TK115: photographs on a point with NO KEY.

       This is the case the correction panel exists for and the case its counts
       got wrong, so a fixture has to be able to make it. The files are named
       the way the folder really names them for a keyless point — unit, then a
       bare dot, then the date and type — because the whole defect was a
       resolver that could not find files under exactly that pattern.

       ?keyless=TK115,2026-08-05,TB,6,have   files present, nothing missing
       ?keyless=TK900,2026-08-05,TB,3,none   files absent, genuinely missing */
    const kl = u.searchParams.get('keyless');
    if (kl) {
      const [unit, date, ty, nRaw, mode] = kl.split(',');
      const n = Number(nRaw) || 1;
      const dd = date.split('-').reverse().join('.');
      const i = FILES.length;
      const side = { type: 'cm-inspection-entries', version: 2, records: [{
        equipment: unit, equip: unit, date: date, type: ty, cls: 'HT', by: 'R. Marrero',
        /* PHOTOGRAPHS ONLY, no grade — which is what TK115 and DZ007 actually
           carry, checked against the live folder. It matters: a keyless point
           with a GRADE is a reading nobody can approve until the component is
           named, and a keyless point with only photographs is evidence looking
           for a home. Two different problems, two different sentences, two
           different people. A fixture carrying a grade tests the other one. */
        smu: '5000', items: [{ key: '', label: '', photos: n, video: 0 }] }] };
      FILES.push({ name: `${unit}_${dd}_${ty}.json`, id: 'k' + i,
                   updated: 7500000 + i, size: 400, json: side });
      if (mode !== 'none') {
        for (let x = 1; x <= n; x++)
          FILES.push({ name: `${unit}._${dd}_${ty}_${x}.jpg`, id: 'kp' + i + '_' + x,
                       updated: 7500000 + i, size: 90000 });
      }
    }
    /* A FLEET-SIZED FOLDER, for asking whether the interface survives one.

       The site runs 1,128 machines and the history grows every shift; a layout
       that is comfortable at sixty-five inspections tells you nothing about the
       one somebody opens in a year. This builds a folder of that order — units
       across the real class prefixes, several rounds each, findings and
       photographs per round — so "it stays responsive" can be a measurement.

       ?scale=1000,1128   inspections, units */
    const sc = u.searchParams.get('scale');
    if (sc) {
      const [nInsp, nUnit] = sc.split(',').map(Number);
      const PRE = ['TK','EX','DZ','LD','GR','DR','CR','SC'];
      const TY  = ['MP','FC','INSP','UC','TB','GET','LUBE','TEMP'];
      const GR  = [1,1,2,2,3,3,5];
      const units = [];
      for (let i = 0; i < (nUnit || 1128); i++)
        units.push(PRE[i % PRE.length] + String(100 + Math.floor(i / PRE.length)).padStart(3, '0'));
      for (let i = 0; i < (nInsp || 1000); i++) {
        const unit = units[i % units.length];
        const ty = TY[i % TY.length];
        const day = String((i % 28) + 1).padStart(2, '0');
        const mon = String((i % 6) + 1).padStart(2, '0');
        const date = '2026-' + mon + '-' + day;
        const dd = day + '.' + mon + '.2026';
        /* Ten findings a round, a photograph on every third — which is roughly
           what the folder actually carries, and lands near the 10,000 findings
           and 5,000 attachments the scale target asks for. */
        const items = [];
        for (let k = 0; k < 10; k++) {
          const g = GR[(i + k) % GR.length];
          items.push({ key: 'P' + k, label: 'Component ' + k, grade: g,
                       photos: (k % 3 === 0) ? 1 : 0, video: 0,
                       action: g === 5 ? 'REPL' : (g === 3 ? 'MON' : ''),
                       comment: '' });
        }
        FILES.push({ name: unit + '_' + dd + '_' + ty + '.json', id: 's' + i,
          updated: 6000000 + i, size: 900,
          json: { type: 'cm-inspection-entries', version: 2, records: [{
            equipment: unit, equip: unit, date: date, type: ty, cls: 'HT',
            by: 'Inspector ' + (i % 12), smu: String(4000 + i), items: items }] } });
        for (let k = 0; k < 10; k += 3)
          FILES.push({ name: unit + '.P' + k + '_' + dd + '_' + ty + '_1.jpg',
                       id: 'sp' + i + '_' + k, updated: 6000000 + i, size: 90000 });
      }
    }
    if (u.searchParams.get('add')) {                      // a phone uploads one more
      const i = 900 + Number(u.searchParams.get('add'));
      FILES.push({ name: `TK${i}_31.07.2026_MP.json`, id: 'j' + i, updated: 9000000 + i, size: 400,
                   json: sidecar('TK' + i, '2026-07-31', 'MP', 5) });
    }
    res.writeHead(200, cors); return res.end('ok');
  }
  const p = path.join(ROOT, u.pathname);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404, cors); return res.end('nope');
  }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
}).listen(PORT, () => console.log('mock on ' + PORT));
