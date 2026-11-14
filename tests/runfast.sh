#!/bin/bash
# The full sweep in about 25 minutes instead of 90:  bash tests/runfast.sh [lanes, default 6]
# The suites of tests/runall.sh (the one list) are dealt out to several lanes that run side by side. Each lane
# runs in a network of its own (unshare -n), so each has its own helper servers on the usual ports and no suite
# can touch another's. Whatever fails is run again one at a time in the ordinary network, and only that second
# answer counts: inside a private network a browser says it is offline, and a loaded machine makes timing and
# 1 px measurements fail on working code (14.11.2026: 10 of 440 failed in the lanes, all 10 passed alone).
# Needs root for unshare and python3 to bring the loopback up; without either it runs the ordinary sweep.
cd "$(dirname "$0")"
N=${1:-6}
LO='import socket,fcntl,struct
s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
f=struct.unpack("16sH",fcntl.ioctl(s,0x8913,struct.pack("16sH",b"lo",0)+b"\0"*14)[:18])[1]
fcntl.ioctl(s,0x8914,struct.pack("16sH",b"lo",f|1)+b"\0"*14)'
if ! command -v python3 >/dev/null || ! unshare -n python3 -c "$LO" 2>/dev/null; then
  echo "runfast: no private network on this machine (needs root, unshare and python3); running the ordinary sweep"
  exec bash runall.sh
fi
T=$(mktemp -d); export LO
RUNALL_LIST=1 bash runall.sh | awk '!seen[$0]++' > "$T/all"
awk -v n="$N" -v d="$T" '{ print > (d "/lane" ((NR-1)%n)) }' "$T/all"
echo "runfast: $(wc -l < "$T/all") suites in $N lanes"
S0=$(date +%s)
for i in $(seq 0 $((N-1))); do
  [ -f "$T/lane$i" ] || continue
  RUNALL_ONLY="$T/lane$i" RUNALL_LANE=1 unshare -n bash -c 'python3 -c "$LO"; exec bash runall.sh' > "$T/out$i" 2>&1 &
done
wait
cat "$T"/out*
grep -hE '\.cjs *FAIL$' "$T"/out* | sed -E 's/\.cjs *FAIL$/.cjs/' > "$T/again"
BAD=0; grep -qh '^MISSING' "$T"/out* && BAD=1
echo; echo "runfast: lanes done in $(( ($(date +%s)-S0)/60 )) min, $(grep -hcE 'ok +[0-9]+ pass' "$T"/out* | paste -sd+ | bc) passed, $(wc -l < "$T/again") to run again alone"
if [ -s "$T/again" ]; then
  echo "--- again, one at a time, in the ordinary network (this answer is the one that counts) ---"
  RUNALL_ONLY="$T/again" bash runall.sh || BAD=1
fi
rm -rf "$T"; rm -f srv*.log
[ $BAD = 0 ] && echo "runfast: all passed" || echo "runfast: FAILED"
exit $BAD
