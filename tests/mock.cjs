/* Static file server for the repo + a stand-in Apps Script /exec.
   Modes: /exec (new, has action=records) and /old (pre-batch, list+file only).
   Counts every request so a test can prove "one call, not three hundred". */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..');
const PORT = Number(process.argv[2] || 8098);

const sidecar = (unit, date, type, grade) => ({
  type: 'cm-inspection-entries', version: 2,
  records: [{ equip: unit, date, type, cls: 'HT', by: 'R. Marrero', smu: '5120',
    items: [{ key: '4C', label: 'Left Rear Final Drive', grade,
              defect: 'Ferrous debris — heavy', defectCode: 'DT14-03', cause: 'Gear wear',
              action: 'SCH', actionLabel: 'Schedule repair', wo: 'N-104' }] }] });

let FILES = [];
function seed(n) {
  FILES = [];
  for (let i = 1; i <= n; i++) {
    const u = 'TK' + (100 + i), d = `2026-07-${String((i % 28) + 1).padStart(2, '0')}`;
    FILES.push({ name: `${u}_${d.split('-').reverse().join('.')}_MP.json`, id: 'j' + i,
      updated: 1000000 + i * 1000, size: 400, json: sidecar(u, d, 'MP', ['A', 'C', 'X'][i % 3]) });
    FILES.push({ name: `${u}_4C_${d.split('-').reverse().join('.')}_MP.jpg`, id: 'p' + i,
      updated: 1000000 + i * 1000, size: 90000 });
  }
}
seed(40);

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
    const out = { ok: true, records: [], read: take.length, failed: 0,
      pending: Math.max(0, side.length - take.length), truncated: side.length > take.length,
      cursor: take.length ? take[take.length - 1].updated : after,
      files: FILES.length, photos: FILES.filter(f => MEDIA.test(f.name)).length };
    take.forEach(f => f.json.records.forEach(r => out.records.push(Object.assign({ _file: f.name }, r))));
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
    if (u.searchParams.get('add')) {                      // a phone uploads one more
      const i = 900 + Number(u.searchParams.get('add'));
      FILES.push({ name: `TK${i}_31.07.2026_MP.json`, id: 'j' + i, updated: 9000000 + i, size: 400,
                   json: sidecar('TK' + i, '2026-07-31', 'MP', 'X') });
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
