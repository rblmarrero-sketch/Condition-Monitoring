#!/bin/bash
# WHAT THE PUBLIC URLS SERVE, AGAINST THE BUILD THIS COMMIT DECLARES.
#
# Called by .github/workflows/build-freshness.yml's `deployed` job after a push
# to the published branch, and runnable by hand:
#
#   bash tests/livebuild.sh                     # wait up to 15 min for Pages
#   LIVE_TRIES=1 bash tests/livebuild.sh        # ask once, now
#
# History: the job this replaces read the expected build with
#   grep -o 'const BUILD = "[^"]*"' mobile/sw.js
# — spaces round the "=" — while sw.js has been written `const BUILD="492"`
# for a long time. grep matched nothing, exited 1, and under `set -euo
# pipefail` the step died on its FIRST LINE, before it had asked the live site
# anything. Every push to the published branch went red for a reason that had
# nothing to do with what was published, so the red meant nothing, and the one
# check that looks at what a phone actually downloads verified nothing at all.
# The pattern is now whitespace-tolerant, and a build that cannot be read is
# said in words instead of a bare exit code.
#
# Checks, each on the served bytes (no browser):
#   - mobile/sw.js         const BUILD
#   - mobile/index.html    const BUILD
#   - dashboard/index.html       report-core.js?v=   (every ?v= tag agrees)
#   - dashboard-next/index.html  report-core.js?v=   (every ?v= tag agrees)
#     dashboard-next is a permanent office surface (CLAUDE.md) and was never
#     checked here at all.
#   - both pages and the phone load normalize.js at this build, and the
#     service worker precaches it.
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="${LIVE_BASE:-https://rblmarrero-sketch.github.io/Condition-Monitoring}"
TRIES="${LIVE_TRIES:-45}"
GAP="${LIVE_GAP:-20}"
BUST="${GITHUB_SHA:-$(date +%s)}"

build_of () { grep -oE 'const BUILD *= *"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"/\1/'; }
tags_of () { grep -oE '\?v=[0-9A-Za-z._-]+' | sed 's/?v=//' | sort -u | tr '\n' ' ' | sed 's/ $//'; }
get () { curl -fsSL --max-time 30 "$BASE/$1?ci=$BUST" 2>/dev/null; }
fail () { echo "::error::$1"; exit 1; }

WANT=$(build_of < mobile/sw.js)
[ -n "$WANT" ] || fail "Could not read const BUILD out of mobile/sw.js in this checkout — the check cannot know what to expect."
echo "expected build: $WANT"

# Pages is not quick and not consistent (builds 242 and 243 took about seven
# minutes), so the service worker is polled; once it matches, the rest of the
# site is published from the same push and is checked once.
GOT=""
for i in $(seq 1 "$TRIES"); do
  GOT=$(get mobile/sw.js | build_of)
  [ "$GOT" = "$WANT" ] && { echo "sw.js matched on attempt $i"; break; }
  echo "attempt $i: sw.js serves '${GOT:-<nothing>}', want '$WANT'"
  [ "$i" -lt "$TRIES" ] && sleep "$GAP"
done
[ "$GOT" = "$WANT" ] || fail "The deployed service worker serves BUILD='${GOT:-<nothing>}' but this commit is '$WANT'. Phones will not update."

M=$(get mobile/index.html | build_of)
[ "$M" = "$WANT" ] || fail "Public mobile page serves BUILD='${M:-<nothing>}', expected '$WANT'."
echo "mobile/index.html: BUILD $M"

for page in dashboard dashboard-next; do
  HTML=$(get "$page/index.html")
  [ -n "$HTML" ] || fail "Public $page/index.html could not be fetched."
  T=$(tags_of <<< "$HTML")
  [ "$T" = "$WANT" ] || fail "Public $page/index.html carries ?v= tags '${T:-<none>}', expected only '$WANT'."
  grep -q "report-core\.js?v=$WANT" <<< "$HTML" || fail "Public $page/index.html does not load report-core.js at $WANT."
  echo "$page/index.html: every ?v= tag is $T"
done

# An independent audit found the dashboard loading normalize.js while the
# phone did not — a shared rule is not shared until every end has it.
for page in mobile dashboard dashboard-next; do
  SRC=$(get "$page/index.html" | grep -oE 'normalize\.js\?v=[0-9]+' | head -1 | sed 's/.*v=//')
  [ -n "$SRC" ] || fail "Public $page page does not load normalize.js at all."
  [ "$SRC" = "$WANT" ] || fail "Public $page loads normalize.js?v=$SRC, expected $WANT."
done
get mobile/normalize.js | grep -q "CMNorm" || fail "normalize.js is referenced but does not serve CMNorm."
# Read the file first, THEN search it: piped straight into grep -q, grep exits
# at the first match and curl reports a write failure under pipefail (builds
# 254–262 all went red that way while published correctly).
SW=$(get mobile/sw.js)
grep -q "normalize.js" <<< "$SW" || fail "The service worker does not precache normalize.js — an offline phone would run without it."
echo "normalize.js: loaded by all three pages at $WANT, serves CMNorm, precached"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Deployed build verified"
    echo ""
    echo "Service worker, phone page, dashboard and dashboard-next on the public URLs all serve build \`$WANT\`."
  } >> "$GITHUB_STEP_SUMMARY"
fi
echo "all three surfaces serve build $WANT"
