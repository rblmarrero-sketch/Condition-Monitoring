# Machine artwork

Two separate things live here.

## `uc/` — undercarriage crops (shipped, always on)

A side-on photograph of each model's own track frame, used as the background of the
measurement map. **These are committed and in use** — 29 files, WebP, about 21 KB each and
640 KB for the fleet.

They are the map, not decoration: the frame is what an inspector matches against the machine
they are standing at to work out which roller is roller one, and a drawing of a track frame
in general cannot tell them where the sprocket is on a D9R.

To replace or add one: put the file in `uc/`, then name it in `BY_MODEL_UC` in
[`../machine-photos.js`](../machine-photos.js). Keys are the model exactly as the 1C register
writes it; matching ignores case and punctuation, and aliases resolve both ways.

## The rest of this folder — whole-machine figures (optional, off)

A side view of the entire machine, used as the small figure at the top of a **GET** round.
None are committed. Until `ON: true` is set in `machine-photos.js` nothing here is fetched,
and every machine shows its drawn figure instead.

| | |
|---|---|
| **Format** | WebP or PNG (transparent) or JPG (white) |
| **View** | side elevation, **facing left** |
| **Width** | ~1000 px is ample — the figure is never rendered taller than 132 px |
| **Weight** | keep each under ~40 KB; they are cached on every phone |

Facing left matters. The drawn figures face left and so do the track frames, so the idler is
forward and the sprocket at the rear. A machine facing the other way puts roller 1 at the
wrong end of the screen.

### File names

One per model. A machine with no file keeps its drawing, so a partial set is fine.

| Register model | File |
|---|---|
| `CATERPILLAR 336-07` | `caterpillar-336-07.png` |
| `HITACHI EX1200-6BH` | `hitachi-ex1200-6bh.png` |
| `HITACHI EX1200-7BH` | `hitachi-ex1200-7bh.png` |
| `HITACHI ZX280-5G` | `hitachi-zx280-5g.png` |
| `HITACHI ZX330-5G RB` | `hitachi-zx330-5g-rb.png` |
| `HITACHI ZX470LC-5G` | `hitachi-zx470lc-5g.png` |
| `HITACHI ZX470LCR-5G` | `hitachi-zx470lcr-5g.png` |
| `KOMATSU PC800-8E0 (SE)` | `komatsu-pc800-8e0-se.png` |
| `KOMATSU PC2000-8 BH` | `komatsu-pc2000-8-bh.png` |
| `LiuGong CLG970E` | `liugong-clg970e.png` |
| `LiuGong CLG990FHD` | `liugong-clg990fhd.png` |
| `CATERPILLAR D9R` | `caterpillar-d9r.png` |
| `KOMATSU D155A.5` | `komatsu-d155a-5.png` |
| `KOMATSU D275.5D` | `komatsu-d275a-5d.png` |
| `KOMATSU D375A.6` | `komatsu-d375a-6.png` |
| `SHANTUI SD32` | `shantui-sd32.png` |
| `SHANTUI SD34-B3` | `shantui-sd34-b3.png` |
| `SHANTUI SD60-C5` | `shantui-sd60-c5.png` |
| `SHANTUI SD90-C5` | `shantui-sd90-c5.png` |
| `KOMATSU P&H 44XT` | `komatsu-p-h-44xt.png` |
| `SUNWARD SWDE165A` | `sunward-swde165a.png` |
| `MCCLOSKEY C38` | `mccloskey-c38.png` |
| `MCCLOSKEY C44` | `mccloskey-c44.png` |
| `MCCLOSKEY J45` | `mccloskey-j45.png` |
| `MCCLOSKEY J50V2` | `mccloskey-j50v2.png` |
| `MCCLOSKEY S190-3DT` | `mccloskey-s190-3dt.png` |
| `NMS MT1150JC` | `nms-mt1150jc.png` |
| `NMS MT300MC` | `nms-mt300mc.png` |
| `NMS MT1860SR` | `nms-mt1860sr.png` |

## Two things worth knowing

**`KOMATSU D275.5D` is the register's spelling.** The artwork for that machine is usually
labelled *Komatsu D275A-5D*, which is how Komatsu writes it. Both resolve to the same file —
see `ALIAS` in `machine-photos.js`. Matching ignores case and punctuation everywhere else
too, so `KOMATSU D155A.5` and `Komatsu D155A-5` find the same file without anyone keeping
two spellings in step.

**These machines have no file and are not expected to.** They keep their drawings: the
wheeled `HITACHI ZX210W-5A`, every grader, every front loader, the standalone rock breakers,
and the exploration drills.
