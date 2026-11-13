/* Thin wrapper so runall.sh's node-only harness runs ncrlist.py (CM_NCR_V1: build_ncr_list() lives once, in
   ingest/ingest_work_orders.py). */
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync('python3', [path.join(__dirname, 'ncrlist.py')], { encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status == null ? 1 : r.status);
