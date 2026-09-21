/* Thin wrapper so runall.sh's node-only harness can run rtwopen.py's real
   assertions (build_rtw_open() has no JS port to duplicate it in — the
   filter lives once, in ingest/ingest_work_orders.py, and this just relays
   its stdout/exit code the way every other suite here already reports). */
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync('python3', [path.join(__dirname, 'rtwopen.py')], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
