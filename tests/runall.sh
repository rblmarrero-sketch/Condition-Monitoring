#!/bin/bash
# Every suite, in the order the servers they need come up.
# The sweep is long enough now that a helper server can die halfway through and
# take the rest of the run with it. Check the ports before each suite and put
# back whatever is missing, so a dead server costs one suite, not twenty.
cd "$(dirname "$0")"
up(){ (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null; }
start(){ case "$1" in
  8092) node ed-srv.cjs 8092 NONE    >srv92.log 2>&1 & ;;
  8093) node ed-srv.cjs 8093 letmein >srv93.log 2>&1 & ;;
  8094) node ed-srv.cjs 8094 letmein >srv94.log 2>&1 & ;;
  8101) node ed-srv.cjs 8101 NONE    >srv101.log 2>&1 & ;;
  8102) CM_OLD=1 node ed-srv.cjs 8102 NONE >srv102.log 2>&1 & ;;
  8098) node mock.cjs 8098 >srvmock.log 2>&1 & ;;
  8099) node mock.cjs 8099 >srvmock99.log 2>&1 & ;;
  8096) node stab-srv.cjs >srvstab.log 2>&1 & ;;
  8097) node hang.cjs >srvhang.log 2>&1 & ;;
  8085) node up-srv.cjs 8085 120 >srvup.log 2>&1 & ;;
esac; }
# Wait until each port ANSWERS, not a fixed two seconds. A helper that took
# longer than that to bind made the suite behind it fail on a connection
# refused — which reads as a broken app and is a slow machine. Across five
# passes that noise buries the real failures it exists to find.
ensure(){ local miss=0
  for p in 8085 8092 8093 8094 8096 8097 8098 8099 8101 8102; do up $p || { start $p; miss=1; }; done
  [ $miss = 1 ] || return 0
  for p in 8085 8092 8093 8094 8096 8097 8098 8099 8101 8102; do
    for _ in $(seq 1 60); do up $p && break; sleep 0.25; done
  done
  return 0; }
pkill -f 'ed-srv.cjs|mock.cjs|stab-srv.cjs|hang.cjs|up-srv.cjs' 2>/dev/null
sleep 0.5
ensure; sleep 1
BAD=0
run(){ ensure; printf "%-13s" "$1"; if out=$(node "$1" 2>&1); then
    echo "ok   $(echo "$out" | grep -c PASS) pass";
  else echo "FAIL"; echo "$out" | grep -E 'FAIL|Error|error:' | head -8; BAD=1; fi; }
for t in lint.cjs rate.cjs rptphoto.cjs teamphoto.cjs lube.cjs lubecap.cjs lubesync.cjs lubetab.cjs luberef.cjs lubestd.cjs lubrpt.cjs pdfprint.cjs teamheal.cjs live.cjs index.cjs teamopen.cjs hdrfit.cjs rptbi.cjs cssvar.cjs skin2.cjs tabs.cjs cover.cjs setup.cjs follow.cjs media.cjs reach.cjs gauge.cjs draft.cjs recent.cjs fit.cjs hdr.cjs iso.cjs cam.cjs fcast.cjs base.cjs skin.cjs bodychk.cjs tray.cjs getart.cjs fe.cjs static.cjs alldev.cjs figtext.cjs batch.cjs batchup.cjs audit3.cjs resume.cjs speed.cjs figfall.cjs mapsel.cjs guide.cjs pickgal.cjs getfig.cjs upfast.cjs folder3.cjs voidcnt.cjs theme.cjs autoupd.cjs swfail.cjs seam.cjs ident.cjs pwa.cjs autosync.cjs deloff.cjs stale404.cjs flow.cjs orphan.cjs prio.cjs photos4.cjs rt5.cjs edit5.cjs rpt2.cjs e2e.cjs dashrpt.cjs sizes.cjs perfuc.cjs cold2.cjs \
         cards.cjs v4.cjs wear.cjs uc.cjs ucmap.cjs sheet.cjs map2.cjs stale.cjs ver.cjs \
         cf.cjs cfd.cjs cfp.cjs f4.cjs s3.cjs s1.cjs edit.cjs ed2.cjs gs.cjs drv.cjs \
         dash.cjs fold2.cjs stab.cjs team.cjs wedge.cjs audit.cjs offline.cjs \
         pick.cjs lang.cjs opt.cjs; do
  [ -f "$t" ] && run "$t"
done
pkill -f 'ed-srv.cjs|mock.cjs|stab-srv.cjs|hang.cjs|up-srv.cjs' 2>/dev/null
exit $BAD
