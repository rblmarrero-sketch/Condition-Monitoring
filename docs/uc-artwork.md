# Undercarriage artwork

The 29 side-on crops in `mobile/machine/uc/` are the background of the numbered
walk — the picture an inspector matches against the machine in front of them,
and the picture that goes on the printed sheet.

They are trimmed to the machine: `python3 docs/uc-crop.py --write` takes the
blank paper off and rewrites `ASPECT` in `machine-photos.js` and `BOX` in
`uc-points.js` to match, because both are percentages OF THE PICTURE and a crop
that moves the picture without moving them walks every number off its part.
`python3 docs/uc-boxes.py --write` then re-derives the frame boxes from the
photographs, and `python3 docs/uc-calibrate.py` draws the answer back onto each
one so it can be checked by looking. `tests/ucbox.cjs` is the guard: every
number on the machine, no two of them touching, and the printed sheet drawing
each model at its own proportions.

## Crops that are cut at the frame

The list below is the machine running off the edge of its own picture — a
silhouette that stops because the crop stops, not because the machine does. The
pixels are not there to recover, so these can only be fixed by re-cropping from
the original artwork, one file at a time, into `mobile/machine/uc/` under the
same name. Nothing else has to change: `uc-crop.py` and `uc-boxes.py` re-derive
the numbers from whatever file they find.

The percentage is how much of that edge the machine occupies — 11% right on the
D275 is the ripper arm walking off the paper, which is what the pit reported.

| Model | File | Cut at |
|---|---|---|
| CATERPILLAR 336-07 | `caterpillar-336-07.webp` | bottom 6% |
| CATERPILLAR D9R | `caterpillar-d9r.webp` | bottom 7% |
| HITACHI EX1200-6BH | `hitachi-ex1200-6bh.webp` | right 6% |
| HITACHI EX1200-7BH | `hitachi-ex1200-7bh.webp` | right 22% |
| HITACHI ZX280-5G | `hitachi-zx280-5g.webp` | left 7%, right 11% |
| HITACHI ZX330-5G RB | `hitachi-zx330-5g-rb.webp` | right 10% |
| HITACHI ZX470LC-5G | `hitachi-zx470lc-5g.webp` | right 9% |
| KOMATSU D155A.5 | `komatsu-d155a-5.webp` | right 9% |
| KOMATSU D275.5D | `komatsu-d275-5d.webp` | right 11% |
| KOMATSU PC2000-8 BH | `komatsu-pc2000-8-bh.webp` | bottom 36% |
| KOMATSU PC800-8E0 (SE) | `komatsu-pc800-8e0-se.webp` | left 6% |
| LiuGong CLG970E | `liugong-clg970e.webp` | left 6% |
| LiuGong CLG990FHD | `liugong-clg990fhd.webp` | bottom 6% |
| MCCLOSKEY C38 | `mccloskey-c38.webp` | top 28% |
| MCCLOSKEY J45 | `mccloskey-j45.webp` | bottom 35%, right 5% |
| NMS MT1150JC | `nms-mt1150jc.webp` | right 5%, top 16% |
| NMS MT1860SR | `nms-mt1860sr.webp` | bottom 6% |
| NMS MT300MC | `nms-mt300mc.webp` | bottom 46%, right 6% |
| SHANTUI SD34-B3 | `shantui-sd34-b3.webp` | right 9% |
| SHANTUI SD60-C5 | `shantui-sd60-c5.webp` | bottom 19%, right 8% |

Everything not listed here ends inside its own frame.

## Adding a model

Put the file in `mobile/machine/uc/`, name it in `BY_MODEL_UC`
(`machine-photos.js`) under the model exactly as the 1C register writes it, then
run `uc-crop.py --write`, `uc-boxes.py --write` and `uc-calibrate.py`, and look
at `docs/uc-calib/`. Side elevation, machine facing LEFT — the same way the
drawn frames face, so roller 1 is the one nearest the idler at the front.
