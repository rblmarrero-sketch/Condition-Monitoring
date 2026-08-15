/* A /exec that measures instead of storing. Every upload is held for a fixed
   delay — a stand-in for the pit's round-trip — and the server records the
   order files arrived in, how many were in flight at once, and how many bytes
   each carried. That is what the speed work has to be judged on. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = require('path').join(__dirname, '..');
const PORT = Number(process.argv[2] || 8085);
const LATENCY = Number(process.argv[3] || 120);   // ms per request, each way lumped

let log = [], inFlight = 0, maxInFlight = 0;
const reset = () => { log = []; inFlight = 0; maxInFlight = 0; };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), cors = { 'Access-Control-Allow-Origin': '*' };
  const send = o => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
                      res.end(JSON.stringify(o)); };
  if (u.pathname === '/__reset') { reset(); res.writeHead(200, cors); return res.end('ok'); }
  if (u.pathname === '/__log') return send({ log, maxInFlight });
  if (u.pathname === '/exec') {
    if (req.method !== 'POST') return send({ ok: true, files: [] });
    let b = ''; req.on('data', c => b += c);
    return req.on('end', () => {
      let j = null; try { j = JSON.parse(b); } catch (e) {}
      const started = log.length;
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      log.push({ name: (j && j.name) || '?', folder: (j && j.folder) || '',
                 bytes: j && j.file ? Buffer.from(j.file, 'base64').length : 0,
                 order: started, alone: inFlight === 1 });
      setTimeout(() => { inFlight--; send({ ok: true, id: 'f' + started }); }, LATENCY);
    });
  }
  const p = path.join(ROOT, u.pathname);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404, cors); return res.end('x');
  }
  res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }, cors));
  res.end(fs.readFileSync(p));
}).listen(PORT, () => console.log('upload timing server on ' + PORT + ' (latency ' + LATENCY + 'ms)'));
