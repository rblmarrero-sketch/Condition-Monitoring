#!/bin/bash
# Five passes, because the failures worth finding are the ones that do not
# happen every time.
#
# A suite that passes once has told you it can pass. Timing, a helper server
# that binds slowly, a poll landing between a counter reset and the read that
# follows it — those show up on the third run, on a machine that was busier,
# and they are indistinguishable from a real bug until you know which suites
# are flaky and which are broken.
#
# So: run everything five times, and report per suite how many passes it won.
# 5/5 is green. 0/5 is broken. Anything between is flaky, and flaky is its own
# defect — a check nobody trusts is a check nobody reads.
cd "$(dirname "$0")"
N=${1:-5}
rm -f run5-*.log
for i in $(seq 1 "$N"); do
  echo "───── pass $i of $N ─────"
  bash runall.sh > "run5-$i.log" 2>&1
  echo "  $(grep -c ' ok ' "run5-$i.log") ok, $(grep -c 'FAIL' "run5-$i.log") failing"
done

echo
echo "───── across all $N passes ─────"
awk -v n="$N" '
  # The suite name, however long it is. runall.sh pads to 13 characters and
  # teamphoto.cjs is 13, so its name ran straight into the "ok" and $1 came
  # back as "teamphoto.cjsok" — a suite that passed every pass, reported as
  # broken 0/5. A tally nobody can trust is worse than no tally.
  /^[a-z0-9_.-]+\.cjs/ {
    suite=$1
    sub(/(ok|FAIL).*$/, "", suite)
    if ($0 ~ / ok /) good[suite]++
    seen[suite]=1
  }
  END {
    bad=0; flaky=0
    for (s in seen) {
      g = good[s] + 0
      if (g == n) continue
      if (g == 0) { printf "  BROKEN  %-16s 0/%d\n", s, n; bad++ }
      else        { printf "  FLAKY   %-16s %d/%d\n", s, g, n; flaky++ }
    }
    printf "\n  %d suite(s) green every pass", length(seen) - bad - flaky
    if (flaky) printf ", %d flaky", flaky
    if (bad)   printf ", %d broken", bad
    printf "\n"
    exit (bad + flaky) ? 1 : 0
  }
' run5-*.log
