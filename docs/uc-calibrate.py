#!/usr/bin/env python3
"""Draw the numbered walk onto each undercarriage photograph, so the boxes can
   be checked by looking rather than by hoping.

   uc-points.js says where the track frame sits inside each model's picture, as
   four percentages, and eleven pucks are placed as fractions of that box. When
   the box is wrong the pucks are wrong, and the failure is silent: the sheet
   still prints, the numbers still line up with the key, and the only way to
   know that "drive sprocket" is floating over the ripper is to look at it.
   That is what came back from the pit for the D275.

   This renders exactly what wear-map.js renders — the same arithmetic, the
   same clamp — as PNGs that can be opened.

       python3 docs/uc-calibrate.py             # every model
       python3 docs/uc-calibrate.py D275 SD32   # just the ones that match

   Output goes to docs/uc-calib/."""
import os, re, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'uc-calib')
PVB_W = 460          # the viewBox width wear-map.js draws into
PUCK_R = 13          # puck radius, in those units
CLAMP = 18


def tables():
    ph = open(os.path.join(ROOT, 'mobile', 'machine-photos.js'), encoding='utf-8').read()
    pt = open(os.path.join(ROOT, 'mobile', 'uc-points.js'), encoding='utf-8').read()
    files = dict(re.findall(r"'([^']+)':\s*'(uc/[^']+)'", ph))
    box = {k: [float(x) for x in v.split(',')]
           for k, v in re.findall(r"'([^']+)':\s*\[([^\]]+)\]", pt.split('var BOX = {')[1].split('};')[0])}
    lay = [[float(x) for x in m.split(',')]
           for m in re.findall(r'\[(\d+,\s*[\d.]+,\s*[\d.]+)\]', pt.split('var LAYOUT = [')[1].split('];')[0])]
    return files, box, lay


def spread(pts, w, h, r, margin):
    """The same pass wear-map.js runs — kept in step by hand, and ucbox.cjs
       measures the real one, so a drift shows up as a failing suite rather
       than as a calibration sheet that flatters the app."""
    MIN, CAP = r * 2 + 2 * (r / 13.0), r * 1.7

    def settle():
        for t in pts:
            ax, ay = t[1] - t[3], t[2] - t[4]
            ad = (ax * ax + ay * ay) ** 0.5
            if ad > CAP: t[1], t[2] = t[3] + ax / ad * CAP, t[4] + ay / ad * CAP
            t[1] = max(margin, min(w - margin, t[1]))
            t[2] = max(margin, min(h - margin, t[2]))

    settle()
    for _ in range(30):
        moved = False
        for i in range(len(pts)):
            for j in range(i + 1, len(pts)):
                p, q = pts[i], pts[j]
                dx, dy = q[1] - p[1], q[2] - p[2]
                d = (dx * dx + dy * dy) ** 0.5
                if d >= MIN: continue
                if d < 0.01: dx, dy, d = (1 if j % 2 else -1), 0.6, 1.166
                k = (MIN - d) / 2 / d
                p[1] -= dx * k; p[2] -= dy * k
                q[1] += dx * k; q[2] += dy * k
                moved = True
        if not moved: break
        settle()


def draw(model, rel, box, lay, scale=3):
    im = Image.open(os.path.join(ROOT, 'mobile', 'machine', rel)).convert('RGB')
    W, H = im.size
    im = im.resize((W * scale, H * scale), Image.LANCZOS)
    d = ImageDraw.Draw(im, 'RGBA')
    # the frame box, as the numbers understand it
    bx = [box[0] / 100 * W * scale, box[1] / 100 * H * scale,
          (box[0] + box[2]) / 100 * W * scale, (box[1] + box[3]) / 100 * H * scale]
    d.rectangle(bx, outline=(0, 120, 255, 220), width=2)
    # wear-map.js works in a 460-wide viewBox whose height is the picture's
    # aspect, so a puck's radius and clamp are fractions of the picture too
    pr = PUCK_R / PVB_W * W * scale
    cx = CLAMP / PVB_W * W * scale
    cy = CLAMP / PVB_W * W * scale          # same unit: the viewBox is square-scaled
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', int(pr * 1.2))
    except Exception: font = ImageFont.load_default()
    pts = []
    for n, fx, fy in lay:
        x = (box[0] + fx * box[2]) / 100 * W * scale
        y = (box[1] + fy * box[3]) / 100 * H * scale
        pts.append([int(n), x, y, x, y])
    spread(pts, W * scale, H * scale, pr, cx)
    for n, x, y, _, _ in pts:
        d.ellipse([x - pr, y - pr, x + pr, y + pr], fill=(255, 255, 255, 235), outline=(20, 30, 40, 255), width=2)
        t = str(int(n))
        tb = d.textbbox((0, 0), t, font=font)
        d.text((x - (tb[2] - tb[0]) / 2, y - (tb[3] - tb[1]) / 2 - tb[1]), t, fill=(20, 30, 40), font=font)
    return im


def main():
    want = [a.upper() for a in sys.argv[1:] if not a.startswith('-')]
    files, box, lay = tables()
    os.makedirs(OUT, exist_ok=True)
    for model, rel in sorted(files.items()):
        if want and not any(w in model.upper().replace('.', '').replace('-', '') or w in model.upper()
                            for w in want):
            continue
        b = box.get(model)
        if not b:
            print('  no box for', model); continue
        im = draw(model, rel, b, lay)
        name = re.sub(r'[^A-Za-z0-9]+', '-', model).strip('-') + '.png'
        im.save(os.path.join(OUT, name))
        print('  %-26s box [%s]  -> docs/uc-calib/%s' % (model, ','.join('%g' % x for x in b), name))


main()
