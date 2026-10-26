/* THE CLASS-HISTORY PULL READS GOOGLE AND SAYS WHEN IT IS STALE (audit 26.10
   C7, check 27.10 N6).

   ingest/fetch_cm_history.cjs read the deleted Yandex VM; the workflow let the
   step fail, so ingest/cm_history.generated.json stayed at 18.10 and nothing
   said so. This runs the real script against a local stand-in for the Apps
   Script (which, like the real one, answers through a redirect) and checks:
     1. it reads the index in pages, following `truncated` / `cursor`, and
        writes every (type, unit) pair with its latest date;
     2. a duckdns address is ignored with a warning;
     3. a pull far smaller than the file already on disk is refused;
     4. --check-age passes a fresh file and fails, with a GitHub ::error, a
        file older than the limit, or a missing one.

   Run: node tests/histpull.cjs   (own server on 8164; writes only to a temp dir) */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const PORT = 8164, BASE = `http://127.0.0.1:${PORT}/macros/s/X/exec`;
const SCRIPT = path.join(__dirname, '..', 'ingest', 'fetch_cm_history.cjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'histpull-'));
const OUT = path.join(TMP, 'cm_history.generated.json');
const fails = [];
const ok = (n, c, d) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (d !== undefined ? '   ' + d : '')); if (!c) fails.push(n); };

const PAGES = {
  0: { ok: true, v: 1, at: 900, truncated: true, cursor: 300,
       rows: [{ u: 'tk146', d: '2026-10-01', t: 'mp' }, { u: 'DZ001', d: '2026-09-20', t: 'UC' }] },
  300: { ok: true, v: 1, at: 900,
       rows: [{ u: 'TK146', d: '2026-10-25', t: 'MP' }, { u: 'CN002', d: '2026-10-24', t: 'INSP' }] },
};
/* The stand-in backend, in its own process: spawnSync blocks this one. */
const SERVER = `
const http = require('http');
const PAGES = ${JSON.stringify(PAGES)};
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1:${PORT}');
  if (u.pathname.endsWith('/exec')) { res.writeHead(302, { Location: '/echo' + u.search }); return res.end(); }
  if (u.pathname === '/echo') {
    const since = Number(u.searchParams.get('since') || 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(u.searchParams.get('action') === 'index' ? (PAGES[since] || { ok: false, error: 'bad since' }) : { ok: false }));
  }
  res.writeHead(404); res.end();
}).listen(${PORT}, '127.0.0.1', () => console.log('up'));
`;
const run = (args, env) => spawnSync(process.execPath, [SCRIPT, ...args],
  { encoding: 'utf8', timeout: 30000, env: Object.assign({}, process.env, { CM_HISTORY_OUT: OUT }, env || {}) });
const child = require('child_process').spawn(process.execPath, ['-e', SERVER], { stdio: ['ignore', 'pipe', 'inherit'] });
child.stdout.once('data', () => main(child));

function main(child) {
  console.log('\n1. READS THE INDEX IN PAGES, THROUGH THE REDIRECT');
  const r1 = run([BASE]);
  const h = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  ok('the pull succeeds', r1.status === 0, (r1.stdout + r1.stderr).trim().split('\n').pop());
  ok('both pages were read (the cursor was followed)', /2 page/.test(r1.stdout), r1.stdout.trim().split('\n').pop());
  ok('every pair is there, upper-cased, with its latest date', h && h.hist['MP|TK146'] && h.hist['MP|TK146'].d === '2026-10-25'
     && h.hist['UC|DZ001'] && h.hist['INSP|CN002'] && Object.keys(h.hist).length === 3, JSON.stringify(h && h.hist));
  ok('the source says index', h && /action=index&slim=1/.test(h.source), h && h.source);

  console.log('\n2. A DUCKDNS ADDRESS IS IGNORED');
  const r2 = run(['https://baimskaya-cm.duckdns.org'], { CM_HISTORY_DEFAULT: BASE });
  ok('it warns that the address is the deleted VM', /::warning title=Old CM_BACKEND::/.test(r2.stdout), r2.stdout.split('\n')[0]);
  ok('and reads the default backend instead', r2.status === 0 && /2 page/.test(r2.stdout), (r2.stdout + r2.stderr).trim().split('\n').pop());

  console.log('\n3. A PULL FAR SMALLER THAN THE FILE IS REFUSED');
  const big = { generated: new Date().toISOString(), source: 'x', hist: {} };
  for (let i = 0; i < 20; i++) big.hist['MP|TK' + (100 + i)] = { d: '2026-10-01' };
  fs.writeFileSync(OUT, JSON.stringify(big));
  const r3 = run([BASE]);
  const after = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  ok('the pull fails, loudly', r3.status === 1 && /::error title=CM history pull failed::.*refusing to shrink/.test(r3.stdout), r3.stdout.trim());
  ok('and the file on disk is left as it was', Object.keys(after.hist).length === 20);

  console.log('\n4. --check-age');
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date(Date.now() - 3600e3).toISOString(), source: 'g', hist: {} }));
  ok('a file an hour old passes', run(['--check-age', '48']).status === 0);
  fs.writeFileSync(OUT, JSON.stringify({ generated: '2026-10-18T09:10:00Z', source: 'https://baimskaya-cm.duckdns.org?action=records', hist: {} }));
  const r4 = run(['--check-age', '48']);
  ok('the 18.10 file fails, with a GitHub ::error naming its age', r4.status === 1 && /::error title=CM history is stale::.* h old/.test(r4.stdout), r4.stdout.trim());
  fs.unlinkSync(OUT);
  const r5 = run(['--check-age', '48']);
  ok('a missing file fails too', r5.status === 1 && /missing or unreadable/.test(r5.stdout), r5.stdout.trim());

  child.kill();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
}
