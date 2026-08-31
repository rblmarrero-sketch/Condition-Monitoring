# Handset acceptance — the eight rounds, on a real phone

**Status: NOT PASSED. Requires physical-device verification.**

Nothing in this repository can complete this script. Every other check in the
suite runs Chromium on a desktop, and a desktop browser in a phone-sized window
is not a phone: it has no camera, no GPS, no radio to switch off, no battery to
die, no operating system that kills a backgrounded tab to reclaim memory, and no
gloves. The defects this script is written to catch are precisely the ones that
only appear when those things are real.

Until somebody walks it on a handset and fills in the record at the bottom, §7
stays **"requires handset verification"**. Do not mark it passed from a
simulator, an emulator, a responsive-design view, or this document being
complete.

---

## Before you start

| | |
|---|---|
| Phone | Any Android or iOS handset the site actually issues |
| App | `https://rblmarrero-sketch.github.io/Condition-Monitoring/mobile/` |
| Build | Must read **223** or later — check the banner on the System page |
| Machines | Use real units from the roster. Pick ones **not** due, so a test round does not disturb the programme |
| Inspector name | Put your own name in. It is written into every record |

**One round of each type**, eight in total:
`MP · FC · INSP · TEMP · UC · GET · TB · LUBE`

Some machines do not have every round — a haul truck has no bucket teeth. Pick a
machine that carries the round you are testing. If the app offers no points for
a machine and round type, that is itself a finding: write it down and move on.

**Photographs.** Take real ones, of anything — a tyre, the ground, your boot. The
test is about whether the app keeps them, not what is in them.

---

## The script, per round

Do all 23 steps for **each** of the eight round types. It takes roughly 20–30
minutes per round the first time.

### Online, before you start

1. **Begin online.** Wi-Fi or mobile data on. Open the app.
2. **Confirm readiness.** System page: note the build number. The queue should
   be empty, or you should know what is in it.

### Offline capture

3. **Turn off Wi-Fi and mobile data.** Both. Aeroplane mode is the surest way.
   Check the app notices — it should say it is offline, not pretend otherwise.
4. **Select a machine.**
5. **Enter readings** for at least three points. On a measurement round (UC, TB,
   GET) put real millimetres in. On LUBE choose a product.
6. **Set a grade** — A, B, C or X — wherever the round asks for one. Include at
   least one **X (Critical)** somewhere across the eight rounds, so the Critical
   path is exercised.
7. **Take an original photograph** on a point. Note roughly what it shows.
8. **Take a retake** — a *different* picture, replacing or added to the same
   point. This is the step that matters most: make the two pictures visibly
   different from each other.
9. **Move between points and reopen the round.** Go to another point, come back,
   leave the round and open it again from the queue.
10. **Confirm both photographs retain their original identities.**
    - The original is still the original.
    - The retake is still the retake.
    - Neither has replaced the other.
    - Neither has vanished.
    > *This is the check for the defect fixed in build 216: the autosave compared
    > a photograph COUNT, so swapping one picture for another of the same count
    > looked like no change at all and was never written. On a desktop it is now
    > proven fixed. On a phone, where the browser can be killed at any moment,
    > only this step proves it.*

### Surviving a kill

11. **Kill the browser or app.** Not "go to the home screen" — swipe it out of
    the task switcher entirely. On iOS, close the tab and the app.
12. **Reopen with no signal.** Still in aeroplane mode.
13. **Confirm the complete round remains editable.** Every reading, every grade,
    both photographs, the machine, the date, the hour meter. Nothing blank,
    nothing reverted, nothing duplicated.
14. **Finish the inspection offline.** Complete the remaining points and save.

### Coming back into signal

15. **Restore signal.** Wi-Fi or data back on.
16. **Do not press a manual synchronisation button.** This step is the test.
    Leave the phone alone with the app open.
17. **Confirm automatic upload** starts on its own. Watch the queue line change.
18. **Kill the app during one upload** — while a round is part-way through,
    swipe it out again. Then reopen it.
19. **Confirm upload resumes without duplication.**
    - The queue does not restart the round from the first photograph.
    - The dashboard does not end up with two copies.
    > *Build 216 moved upload progress out of the record so it survives exactly
    > this. Before that, seven of eight photographs could be in the folder with
    > the phone having no idea, and all eight would be sent again.*
20. **Confirm the dashboard receives one inspection.** One row, not two.

### Verification and reporting

21. **Confirm every attachment byte for byte.** On the phone's queue line, the
    round should read **"Verified byte for byte — the store read back all N
    files"**. Not "Sent", not "Confirmed on the server" — those are weaker and
    they mean different things:

    | Line | What it actually means |
    |---|---|
    | Saved on this phone only | Nothing has left the handset |
    | Sending now | In progress |
    | Sent — every file accepted | The endpoint took the request. Nothing more |
    | Confirmed on the server — N listed | The folder was asked later and the names were there |
    | **Verified byte for byte** | The store read its own object back and its size and SHA-256 match what this phone sent |

    If it stops at "Confirmed" and never reaches "Verified", write that down —
    that is a finding, not a pass.
22. **Generate mobile and dashboard reports** for the same round.
23. **Confirm photographs, grades, severity and recommendations agree** between
    the two documents. Also check the footer: a report with everything received
    and verified should NOT be stamped `PRELIMINARY`; one still waiting on
    evidence should be.

---

## Also worth doing once, across the eight

These are not per-round, but do each at least once somewhere in the eight:

- **Let the screen lock** mid-round for five minutes, then come back.
- **Fill the phone** — if you can get storage near full, a save should say so
  plainly rather than failing silently.
- **Switch language** to Russian mid-round and back. Nothing should be lost, and
  no untranslated key (`up_conf`, `st_prelim`) should appear on screen.
- **Walk out of signal mid-upload** rather than killing the app — a real pit
  drop-out, not a clean kill.

---

## Record of the run

Fill this in. A blank row is a step not done, not a step that passed.

```
Device            ......................................
OS and version    ......................................
Browser           ......................................
Build number      ......................................
Inspector         ......................................
Started           ....................  Finished  ......
```

| Round | Machine | Offline capture | Retake identity (step 10) | Survives kill (13) | Auto-upload (17) | Resume no dup (19) | Verified byte-for-byte (21) | Reports agree (23) |
|---|---|---|---|---|---|---|---|---|
| MP | | | | | | | | |
| FC | | | | | | | | |
| INSP | | | | | | | | |
| TEMP | | | | | | | | |
| UC | | | | | | | | |
| GET | | | | | | | | |
| TB | | | | | | | | |
| LUBE | | | | | | | | |

**Anything that did not pass** — one line each, with the machine, the round, the
step number and what actually happened:

```
....................................................................
....................................................................
....................................................................
```

**Evidence.** Screenshots of: the queue line reading "Verified byte for byte",
the dashboard row for one uploaded round, and both reports for the same round.

---

## What to do with the result

Send the completed table and the screenshots back. Until then this document is
the specification for a test that has not been run, and §7 is reported as
**"requires physical-device or infrastructure verification"** — never as passed.

A partially completed run is still worth having: it is better to know that six
round types were walked and two were not than to have one line saying "tested".
