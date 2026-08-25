#!/usr/bin/env python3
"""Propose the track-frame box for every model, from the photograph itself.

   Two of the four numbers are measurable and one is nearly so:

     the ground line   the lowest row carrying a wide run of ink — the shoes on
                       the floor, which is the one edge no photograph is coy
                       about;
     the loop's ends   the widest ink segment in the band just above the floor,
                       taken as the median across that band so a row where the
                       blade merges into the frame cannot drag the answer out
                       to the edge of the paper;
     the loop's height ground minus a fixed share of the loop's LENGTH. An
                       undercarriage is not free-form: a dozer's loop is about
                       a third as tall as it is long and an excavator's about a
                       quarter, because that is what the machine is.

   The height is the one worth doubting, so uc-calibrate.py draws the answer
   back onto the picture and every model gets looked at.

       python3 docs/uc-boxes.py             # print the table
       python3 docs/uc-boxes.py --write     # write it into uc-points.js"""
import os, re, sys
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UC = os.path.join(ROOT, 'mobile', 'machine', 'uc')
POINTS = os.path.join(ROOT, 'mobile', 'uc-points.js')

# How tall a track loop stands against its own length — the starting guess only.
# The height is then chosen by asking the picture: see pick_top().
RATIO = {'dz': 0.315, 'ex': 0.245, 'dr': 0.30, 'cr': 0.27}
FAMILY = [
    ('caterpillar-d9r', 'dz'), ('komatsu-d1', 'dz'), ('komatsu-d2', 'dz'),
    ('komatsu-d3', 'dz'), ('shantui-', 'dz'),
    ('komatsu-p-h-', 'dr'), ('sunward-', 'dr'),
    ('mccloskey-', 'cr'), ('nms-', 'cr'),
]
PVB_W, PUCK_R = 460, 13


def fam(f):
    for pre, k in FAMILY:
        if f.startswith(pre): return k
    return 'ex'


def ink_mask(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    return (a.max(axis=2) < 246) | (a.max(axis=2) - a.min(axis=2) > 12)


def measure(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    a = np.asarray(im).astype(int)
    ink = (a.max(axis=2) < 246) | (a.max(axis=2) - a.min(axis=2) > 12)

    def widest(r, minlen=4):
        row, out, s = ink[r], [], None
        for i, v in enumerate(row):
            if v and s is None: s = i
            elif not v and s is not None:
                if i - s >= minlen: out.append((s, i - 1))
                s = None
        if s is not None: out.append((s, w - 1))
        return max(out, key=lambda t: t[1] - t[0]) if out else None

    gy = None
    for r in range(h - 1, int(h * 0.4), -1):
        seg = widest(r)
        if seg and seg[1] - seg[0] >= 0.22 * w: gy = r; break
    if gy is None: return None
    lo, hi = [], []
    for r in range(max(0, gy - int(h * 0.10)), gy - 1):
        seg = widest(r)
        if seg and seg[1] - seg[0] >= 0.22 * w:
            lo.append(seg[0]); hi.append(seg[1])
    if not lo: return None
    lo.sort(); hi.sort()
    return w, h, gy, lo[len(lo) // 2], hi[len(hi) // 2]



def layout():
    src = open(POINTS, encoding='utf-8').read()
    blk = src.split('var LAYOUT = [')[1].split('];')[0]
    return [[float(x) for x in m.split(',')]
            for m in re.findall(r'\[(\d+,\s*[\d.]+,\s*[\d.]+)\]', blk)]


def spread(pts, w, h):
    """wear-map.js's collision pass, so the top is chosen against the numbers
       that will actually be printed rather than against where they started."""
    MIN, CAP = PUCK_R * 2 + 2, PUCK_R * 1.7

    def settle():
        for t in pts:
            ax, ay = t[0] - t[2], t[1] - t[3]
            ad = (ax * ax + ay * ay) ** 0.5
            if ad > CAP: t[0], t[1] = t[2] + ax / ad * CAP, t[3] + ay / ad * CAP
            t[0] = max(18, min(w - 18, t[0]))
            t[1] = max(18, min(h - 18, t[1]))

    settle()
    for _ in range(30):
        moved = False
        for i in range(len(pts)):
            for j in range(i + 1, len(pts)):
                p, q = pts[i], pts[j]
                dx, dy = q[0] - p[0], q[1] - p[1]
                d = (dx * dx + dy * dy) ** 0.5
                if d >= MIN: continue
                if d < 0.01: dx, dy, d = (1 if j % 2 else -1), 0.6, 1.166
                f = (MIN - d) / 2 / d
                p[0] -= dx * f; p[1] -= dy * f
                q[0] += dx * f; q[1] += dy * f
                moved = True
        if not moved: break
        settle()


def pick_top(ink, w, h, gy, x0, x1, lay, start):
    """Choose the loop's height by asking whether the numbers land on metal.

       The other three edges are measured — the floor and the two ends of the
       track are in the photograph and cannot be argued with. The top is not:
       the machine's own body sits above the loop and no amount of looking at
       ink separates the top run of the chain from the fuel tank above it.

       So it is chosen rather than measured, against the only thing that
       matters about it: every one of the eleven numbers has to come down on
       the machine. Each candidate height is scored by the WORST-placed number,
       and the best score wins — a box that puts ten numbers beautifully and
       parks 'track sag' on white paper is not a better box."""
    length = x1 - x0
    best, best_top = None, start

    def score(top):
        bh = gy - top
        if bh < 12: return -1
        # the drawing's own coordinate space: 460 wide, aspect-true
        pvb_h = max(120, min(360, round(PVB_W / (w / h))))
        sx, sy = PVB_W / w, pvb_h / h
        pts = []
        for n, fx, fy in lay:
            px = (x0 + fx * length) * sx
            py = (top + fy * bh) * sy
            pts.append([px, py, px, py])
        spread(pts, PVB_W, pvb_h)
        worst = 1.0
        for px, py, _, _ in pts:
            ix, iy = px / sx, py / sy
            hit = seen = 0
            for dy in (-5, 0, 5):
                for dx in (-5, 0, 5):
                    jx, jy = int(round(ix + dx / sx)), int(round(iy + dy / sy))
                    if 0 <= jx < w and 0 <= jy < h:
                        seen += 1
                        hit += 1 if ink[jy, jx] else 0
            worst = min(worst, hit / seen if seen else 0)
        return worst

    # Bounded by the prior, and ties broken towards it. Left to roam, the
    # search happily hands the box the whole machine: the numbers all land on
    # metal then, because the cab is metal — and 'carrier roller' ends up on
    # the exhaust stack. A track loop is a quarter to a third as tall as it is
    # long; the picture is being asked to settle that within a quarter either
    # way, not to invent it.
    prior = start
    lo, hi = gy - (gy - prior) * 1.25, gy - (gy - prior) * 0.75
    lo, hi = max(0, int(lo)), max(1, int(hi))
    for top in range(lo, hi + 1):
        sc = score(top)
        if best is None or sc > best + 1e-9 or (
                abs(sc - best) < 1e-9 and abs(top - prior) < abs(best_top - prior)):
            best, best_top = sc, top
    return best_top, best


def main():
    ph = open(os.path.join(ROOT, 'mobile', 'machine-photos.js'), encoding='utf-8').read()
    files = dict(re.findall(r"'([^']+)':\s*'(uc/[^']+)'", ph))
    out = {}
    lay = layout()
    for model, rel in sorted(files.items()):
        f = rel.replace('uc/', '')
        m = measure(os.path.join(UC, f))
        if not m:
            print('  UNREADABLE', f); continue

        w, h, gy, x0, x1 = m
        length = x1 - x0
        left, right = float(x0), float(x1)
        ink = ink_mask(os.path.join(UC, f))
        top, sc = pick_top(ink, w, h, gy, x0, x1, lay, gy - RATIO[fam(f)] * length)
        out[model] = [round(left / w * 100, 1), round(top / h * 100, 1),
                      round((right - left) / w * 100, 1), round((gy - top) / h * 100, 1)]
        print('  %-26s %-3s [%-22s] worst puck %.0f%% on metal'
              % (model, fam(f), ','.join('%g' % v for v in out[model]), sc * 100))

    if '--write' not in sys.argv:
        print('\nRe-run with --write to put these into uc-points.js.')
        return
    src = open(POINTS, encoding='utf-8').read()
    for model, b in out.items():
        pat = re.compile(r"('" + re.escape(model) + r"':\s*)\[[^\]]*\]")
        if not pat.search(src):
            print('  no line for', model); continue
        src = pat.sub(lambda m: m.group(1) + '[' + ','.join('%g' % v for v in b) + ']', src)
    open(POINTS, 'w', encoding='utf-8').write(src)
    print('\nwritten.')


main()
