#!/usr/bin/env python3
# CM_FBOVERLAY_V1 - applied by cm_firebase.sh to the Firebase copy ONLY (GitHub is not touched):
#   phones move their main backend to Google (Apps Script on CM_backup_Pechanka), once each (swap google-back-2026-10)
#   uploads to script.google.com stay "simple" requests (Apps Script cannot answer a CORS preflight)
#   BUILD +1 on the Firebase copy so every phone picks the change up.
# python3 fb_overlay.py <site dir>     exit 0 = applied (or already in the source), 2 = unexpected source -> do not publish
import sys, os, re
S = sys.argv[1]
GAS = "https://script.google.com/macros/s/AKfycbwWJ1vb-OjP0VQPcrnoEB8PkuFyhk86mecIrkcomSVFqE5ddJynSwSheuskNGMcwLGf/exec"
def rd(p): return open(os.path.join(S, p), encoding='utf-8').read()
def wr(p, t): open(os.path.join(S, p), 'w', encoding='utf-8').write(t)
ud = rd('mobile/upload-defaults.js')
m = re.search(r'swap:\s*\{.*?\n\s*\},', ud, re.S)
if not m: print('overlay: no swap block - refusing'); sys.exit(2)
if 'google-back-2026-10' in m.group(0):
    print('overlay: swap already google-back in the source')
else:
    new = ('swap: {\n    id:   "google-back-2026-10",       // Firebase copy (CM_FBOVERLAY_V1): phones on Yandex move to Google, once each\n'
           '    from: "https://baimskaya-cm.duckdns.org",\n    to:   "' + GAS + '",\n    sec:  "",\n    folder: ""\n  },')
    ud = ud[:m.start()] + new + ud[m.end():]; wr('mobile/upload-defaults.js', ud); print('overlay: swap -> google-back-2026-10')
mi = rd('mobile/index.html')
A1 = '    if(x.upload){ try{ x.upload.onprogress=onUp; x.upload.onload=()=>{ sentAll=true; arm(reply||UP_CLOCKS.reply); }; }catch(_){ } }\n    x.onprogress=onUp;\n'
B1 = ('    /* CM_FBOVERLAY_V1: an Apps Script web app cannot answer a CORS preflight, and a listener on x.upload makes\n'
      '       this POST non-simple - so for script.google.com the upload listeners stay off (overall max still bounds it). */\n'
      '    const simpleOnly=/^https:\\/\\/script\\.google(usercontent)?\\.com\\//i.test(String(url||""));\n'
      '    if(x.upload && !simpleOnly){ try{ x.upload.onprogress=onUp; x.upload.onload=()=>{ sentAll=true; arm(reply||UP_CLOCKS.reply); }; }catch(_){ } }\n'
      '    x.onprogress=onUp;\n')
A2 = '    cap=setTimeout(()=>{ why="max"; try{ x.abort(); }catch(_){ } }, max||UP_CLOCKS.max);\n    onUp();\n'
B2 = '    cap=setTimeout(()=>{ why="max"; try{ x.abort(); }catch(_){ } }, max||UP_CLOCKS.max);\n    if(simpleOnly) arm(max||UP_CLOCKS.max); else onUp();\n'
if 'simpleOnly' in mi:
    print('overlay: Google simple POST already in the source')
elif mi.count(A1) == 1 and mi.count(A2) == 1:
    mi = mi.replace(A1, B1).replace(A2, B2); print('overlay: Google simple POST added')
else:
    print('overlay: postT anchors not found (%d/%d) - refusing' % (mi.count(A1), mi.count(A2))); sys.exit(2)
b = re.search(r'const BUILD="(\d+)";', mi)
if not b: print('overlay: no BUILD - refusing'); sys.exit(2)
n = int(b.group(1)); n2 = n + 1
mi = mi.replace('const BUILD="%d";' % n, 'const BUILD="%d";' % n2).replace('?v=%d"' % n, '?v=%d"' % n2); wr('mobile/index.html', mi)
sw = rd('mobile/sw.js')
if sw.count('const BUILD="%d";' % n) != 1: print('overlay: sw.js BUILD mismatch - refusing'); sys.exit(2)
wr('mobile/sw.js', sw.replace('const BUILD="%d";' % n, 'const BUILD="%d";' % n2))
for p in ('dashboard/index.html', 'dashboard-next/index.html'):
    t = rd(p); c = t.count('?v=%d"' % n)
    if c == 0: print('overlay: %s has no ?v=%d - refusing' % (p, n)); sys.exit(2)
    wr(p, t.replace('?v=%d"' % n, '?v=%d"' % n2))
open(os.path.join(S, 'mobile', '.overlay'), 'w').write('CM_FBOVERLAY_V1 google-main BUILD %d (GitHub %d)\n' % (n2, n))
print('overlay: BUILD %d -> %d (Firebase copy only)' % (n, n2))
