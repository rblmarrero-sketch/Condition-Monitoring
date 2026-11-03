#!/usr/bin/env bash
# The monitoring audit, read-only against the live backend.
#   bash tools/liveaudit/run.sh [SINCE] [OUT]
# SINCE defaults to 7 days ago; OUT to a fresh directory under /tmp.
set -u
cd "$(dirname "$0")/../.."
SINCE=${1:-$(date -u -d '7 days ago' +%F)}
OUT=${2:-$(mktemp -d /tmp/liveaudit.XXXX)}
PORT=${LIVEAUDIT_PORT:-8299}
echo "liveaudit: since $SINCE -> $OUT"
node tools/liveaudit/fetch.cjs "$OUT" "$SINCE" || exit 1
node tools/liveaudit/uploads.cjs "$OUT" | tee "$OUT/uploads.txt"
node tests/mock.cjs "$PORT" >"$OUT/mock.log" 2>&1 & MP=$!
sleep 1.5
node tools/liveaudit/reports.cjs "$PORT" "$OUT/rounds" "$OUT" > "$OUT/reports.txt" 2>&1
kill $MP 2>/dev/null
node -e 'const j=require(process.argv[1]);const b=j.sum.filter(s=>s.issues.length);console.log(`reports: ${j.sum.length} sheets rendered, ${b.length} with a layout problem, page errors ${j.errs.length}`);b.forEach(s=>console.log("  !! "+s.name+"\n     "+s.issues.join("\n     ")))' "$OUT/reports.json" | tee -a "$OUT/uploads.txt"
echo "texts to read: $OUT/text/"
