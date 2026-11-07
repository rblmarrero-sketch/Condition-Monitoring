/* Thin wrapper so runall.sh's node-only harness can run otherdef.py's real
   assertions -- the otherDefects rule lives once, in
   ingest/ingest_work_orders.py, and this just relays its stdout and exit code. */
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync('python3', [path.join(__dirname, 'otherdef.py')], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
