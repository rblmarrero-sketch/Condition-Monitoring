/* Thin wrapper so runall.sh's node-only harness runs relingest.py's real
   assertions against ingest/ingest_work_orders.py, the way rtwopen.cjs relays
   rtwopen.py. Needs python3 + openpyxl; without openpyxl it SKIPs and the
   sweep lists it under "asserted nothing", which is the honest answer. */
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync('python3', [path.join(__dirname, 'relingest.py')], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
