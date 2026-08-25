#!/usr/bin/env python3
"""Trim the dead white out of the undercarriage crops, and move the frame
   boxes with them.

   Every one of the 29 crops was delivered on a canvas bigger than the machine
   standing on it — between 17% and 43% of each picture was blank paper. That
   costs twice on the printed sheet, because the drawing is sized by HEIGHT
   there: the report gives the frames a fixed vertical band, so white above and
   below the machine is white the machine could have been. Trimming a 560x280
   picture to its own ink turns a 600px-wide machine into a 754px one on the
   same page, with nothing rearranged.

   The boxes have to move with it. uc-points.js gives the track frame's place
   as a percentage of the PICTURE, so cropping the picture without rewriting
   those percentages walks every numbered puck off the part it names. Both
   files are rewritten here, together, from the same measurement.

       python3 docs/uc-crop.py            # report what it would do
       python3 docs/uc-crop.py --write    # do it

   Re-running on already-trimmed files is a no-op: there is nothing left to
   take off, so nothing is written."""
import os, re, sys
from PIL import Image
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UCDIR = os.path.join(ROOT, 'mobile', 'machine', 'uc')
PHOTOS = os.path.join(ROOT, 'mobile', 'machine-photos.js')
POINTS = os.path.join(ROOT, 'mobile', 'uc-points.js')
WRITE = '--write' in sys.argv

# A hair of paper around the machine, so a trimmed edge does not read as a
# clipped one. Kept small: it is the thing being reclaimed.
PAD = 0.006


def ink_box(im):
    """The machine's own bounding box. White is anything near-white AND grey —
       a pale yellow panel is machine, not paper."""
    a = np.asarray(im.convert('RGB')).astype(int)
    ink = (a.max(axis=2) < 246) | (a.max(axis=2) - a.min(axis=2) > 12)
    cols, rows = ink.any(axis=0), ink.any(axis=1)
    if not cols.any():
        return None
    w, h = im.size
    x0, x1 = int(np.argmax(cols)), w - 1 - int(np.argmax(cols[::-1]))
    y0, y1 = int(np.argmax(rows)), h - 1 - int(np.argmax(rows[::-1]))
    px, py = int(round(w * PAD)), int(round(h * PAD))
    return (max(0, x0 - px), max(0, y0 - py), min(w, x1 + 1 + px), min(h, y1 + 1 + py))


def read_table(src, name):
    """The literal block of a `NAME: {...}` or `var NAME = {...}` table."""
    m = re.search(r'(?:var\s+)?' + name + r'\s*[:=]\s*\{', src)
    if not m:
        raise SystemExit('no ' + name + ' table')
    i = m.end()
    depth, start = 1, i
    while depth:
        if src[i] == '{': depth += 1
        elif src[i] == '}': depth -= 1
        i += 1
    return start, i - 1, src[start:i - 1]


def main():
    photos = open(PHOTOS, encoding='utf-8').read()
    points = open(POINTS, encoding='utf-8').read()
    _, _, uctab = read_table(photos, 'BY_MODEL_UC')
    file_of = dict(re.findall(r"'([^']+)':\s*'(uc/[^']+)'", uctab))

    asp_s, asp_e, asp = read_table(photos, 'ASPECT')
    box_s, box_e, box = read_table(points, 'BOX')
    old_box = {k: [float(x) for x in v.split(',')]
               for k, v in re.findall(r"'([^']+)':\s*\[([^\]]+)\]", box)}

    new_asp, new_box, moved = {}, {}, []
    for model, rel in sorted(file_of.items()):
        path = os.path.join(ROOT, 'mobile', 'machine', rel)
        if not os.path.exists(path):
            print('  MISSING', rel); continue
        im = Image.open(path)
        w, h = im.size
        bb = ink_box(im)
        if not bb:
            print('  BLANK  ', rel); continue
        x0, y0, x1, y1 = bb
        cw, ch = x1 - x0, y1 - y0
        gain = (w * h) / (cw * ch)
        new_asp[rel] = round(cw / ch, 3)
        b = old_box.get(model)
        if b:
            # the frame box is a percentage of the picture, and the picture
            # just moved under it
            nl = (b[0] / 100 * w - x0) / cw * 100
            nt = (b[1] / 100 * h - y0) / ch * 100
            nw = b[2] / 100 * w / cw * 100
            nh = b[3] / 100 * h / ch * 100
            new_box[model] = [round(v, 1) for v in (nl, nt, nw, nh)]
        if cw < w or ch < h:
            moved.append((rel, (w, h), (cw, ch), gain))
            if WRITE:
                im.convert('RGB').crop((x0, y0, x1, y1)).save(path, 'WEBP', quality=88, method=6)
        print('  %-34s %4dx%-4d -> %4dx%-4d  %+5.0f%% area  aspect %.3f'
              % (rel.replace('uc/', ''), w, h, cw, ch, (gain - 1) * 100, new_asp[rel]))

    if not moved:
        print('\nnothing to trim.')
        return

    if not WRITE:
        print('\n%d files would be trimmed. Re-run with --write.' % len(moved))
        return

    # ASPECT, rewritten from the files themselves rather than edited by hand —
    # a declared aspect that disagrees with the picture stretches the machine
    # and takes every numbered puck with it.
    keys = sorted(new_asp)
    wid = max(len(k) for k in keys) + 3
    body = '\n' + '\n'.join("      '%s':%s%.3f," % (k, ' ' * (wid - len(k) - 2), new_asp[k])
                            for k in keys) + '\n    '
    photos2 = photos[:asp_s] + body + photos[asp_e:]
    open(PHOTOS, 'w', encoding='utf-8').write(photos2)

    kb = [k for k in old_box if k in new_box]
    wid = max(len(k) for k in kb) + 3
    lines = []
    for k in sorted(old_box):
        v = new_box.get(k, old_box[k])
        lines.append("    '%s':%s[%s]," % (k, ' ' * (wid - len(k) - 2),
                                           ','.join(('%g' % x) for x in v)))
    # keep whatever prose sat inside the table
    keep = [l for l in box.split('\n') if '/*' in l or '*/' in l or (l.strip().startswith('*'))]
    body = '\n' + '\n'.join(lines) + '\n  '
    points2 = points[:box_s] + body + points[box_e:]
    open(POINTS, 'w', encoding='utf-8').write(points2)
    print('\ntrimmed %d files; ASPECT and BOX rewritten.' % len(moved))
    if keep:
        print('NOTE: %d comment line(s) inside BOX were dropped — put them back:' % len(keep))
        for l in keep: print('   ', l.strip())


main()
