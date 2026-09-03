# Condition Monitoring — NHL TR60 Dump Trucks

An interactive condition-monitoring dashboard for the mine's haul-truck fleet.
Select an equipment unit and see the **full history** of its inspections, with
grade, hours, comments, and the actual inspection **photos**.

Six inspection types are live; Oil Analysis will be added the same way:

| Component | Status |
|-----------|--------|
| **Magnetic Plug** | ✅ Live |
| **Filter Cut** | ✅ Live |
| **Inspection** (walk-around) | ✅ Live |
| **Temperature** | ✅ Live |
| **Undercarriage** (measured wear) | ✅ Live |
| **Ground Engaging Tools** | ✅ Live |
| Oil Analysis | 🔜 Planned |

---

## Quick start

1. Open **`dashboard/index.html`** in any modern browser (double-click it — no
   web server needed).
2. Pick an **Equipment** unit from the dropdown → its magnetic-plug history
   appears below, newest first, with a photo for each of the four plug
   positions (`4C / 4D / 4E / 4F`).
3. The **Fleet overview** heatmap shows every unit's latest inspection at a
   glance — click any cell to jump to that unit. Click a photo to enlarge it.

The dashboard is self-contained and reads its data from
`data/magnetic_plug.js`, so it works offline and can be shared as a folder.

---

## Adding inspections — just drop photos in a folder (no Excel)

This is the simplest workflow. **Organise photos as `Truck / Date / Position`:**

```
Photos/
  TK146/
    2026-07-29/        ← one inspection (date = YYYY-MM-DD)
      4C.jpg           ← one photo per plug position: 4C 4D 4E 4F
      4D.jpg  4E.jpg  4F.jpg
    2026-10-15/        ← add a NEW date folder = a new inspection
      4C.jpg ...
  TK147/
    2026-07-29/ ...
```

Then, in **Chrome or Edge**:

1. Open `dashboard/index.html` (double-click the file).
2. Click **“📂 Open photo folder”** and choose your `Photos` folder — this can
   live on the **N: drive**.
3. Pick a truck → its full photo history appears. Click a photo to enlarge.

To add an inspection later, just add another **date folder** with photos and
click *Open photo folder* again. There's a ready-made example in `Photos/` you
can point at right now.

**Grades are 1 to 5.** One scale on every round — 1 Normal · 2 Incipient ·
3 Degraded · 4 Severe · 5 Critical — from `mobile/grade.js`, with what each
number means stated per round type (a plug's 3 is fine metal filings; a
lubrication point's 3 is dirty oil or a small leak). The old `A/B/C/X` letters
are read wherever they still exist (A→1, B→2, C→3, X→5) and never written
again. A grade in a file name (`4C_C.jpg`) is read the same way.

### Recording readings, grades & comments (no Excel)

Each photo card has type-in fields, filled in straight on the dashboard:

- **Grade** (`1`–`5`, 5 worst) — the condition found, with the meaning for that round under each number.
- **Particle count**, **Component hrs**, **Oil hrs**, **Comment** — per plug position.
- **SMU / machine hrs** — once per inspection (the machine's hour meter).

Everything you type **saves automatically in that browser** as you go. Because
it's stored per-browser, use the header buttons to keep it safe and shared:

- **💾 Save entries** — download all your grades/hours/comments to a file
  (`magnetic_plug_entries.json`) as a backup, or to copy to another PC / the N: drive.
- **📥 Import** — load a saved entries file (it merges into what's there).

> Entries live in the browser's local storage, not in the photo files. Clearing
> the browser's site data would erase unsaved entries — click **Save entries**
> periodically, and keep that file on the N: drive so the record is shared.

> The “Open photo folder” button uses the browser’s folder-picker, available in
> Chrome and Edge. In other browsers, use the command-line scanner below to
> generate `data/magnetic_plug.js` instead.

### The defect and cause matrix

What the app offers an inspector — components, failure modes, direct causes — comes from
the client's **HME Defect & Direct Cause Matrix**, built against the 1C register and
aligned to ISO 14224:2016. It is pre-computed: `cascade[component][defect] → causes`, so
there is no matching logic in the app and no combination that cannot happen can be picked.

```bash
python3 docs/build-hme-data.py path/to/hme_defect_cause_matrix_1C_vN.json
```

writes `mobile/hme.js`, `mobile/hme-cascade.js` and merges any new units into
`mobile/assets.js`. Never edit those three by hand.

| | |
|---|---|
| 263 components | 53 equipment classes, 150 manufacturer+model groups |
| 114 failure modes | ISO 14224 Table B.6 |
| 495 direct causes | ranked 1–3 against every component and mode |
| 9,794 pairs | zero dead ends — every lookup returns something |

**What it replaced.** The app used to guess which failure modes suited a component by
matching keywords against its *name* — "brake" in the label meant offer the brake modes.
It offered a frame "bucket tooth worn". Worse, the cause list never received the component
at all, so asking why a frame had cracked returned 53 answers led by *"oil contaminated
with dirt"*, and the whole app could only ever produce **113 distinct cause lists**. The
matrix produces **1,373**. A frame crack now offers three: *Frame crack*, *Mounting bracket
cracked/loose*, *Weld failure*.

**Ranks matter.** 74% of the 71,858 rows are rank 3 — general causes that apply to
anything. Shown in one flat list they drown the two or three that are specific, every
dropdown looks the same, and inspectors stop reading them. So rank 1 and 2 come first and
rank 3 sits behind **More causes / Другие причины**. Where a pair has no specific cause at
all — 31% of them — the general list opens by itself, because an empty box above a "more"
button reads as broken.

**History is never rewritten.** Records already in Drive carry the codes the app used
before the matrix. `HME.legacy` resolves them when a record is *read*, the same way a
correction or a void is merged over a record rather than written into it. 393 old codes
map forward; two that turned out to be failure modes mis-filed as causes (*"Hoist system
not lifting"*, *"Track derailed"*) are retired from the picker but keep their wording
wherever they were already recorded. `docs/v4-migration-map.json` is the full audit —
every code, its target, and how it matched.

**Two things the client should fix in 1C**, flagged rather than papered over:
`CH.VD` the vibratory drum is missing from the *COMPACTOR, ROLLER DRUM* class, so the app
carries it locally (marked `local: true`) with its failure modes borrowed from `CH.ROL`
Track Rollers; and `ELS.BAT` Batteries is offered external oil, coolant, fuel and grease
leaks, which a battery does not have.

**Magnetic plug and filter cut are deliberately outside the matrix** for now. They address
plug positions — *"4C Left Rear Final Drive"* — not register component codes, so the
cascade has nothing to key on. Their 14 debris and filter findings live in
`mobile/mp-fc.js`, carried forward unchanged. Mapping each position to a real component is
the next piece of work; when that lands these lists retire into the cascade.

### Command-line folder scanner (optional)

Regenerate the bundled/shareable data file from a photo folder — handy for
other browsers or for refreshing a copy you send to someone:

```bash
python ingest/scan_photos.py "N:/Condition Monitoring/Magnetic Plug/Photos"
python ingest/scan_photos.py ./Photos --copy    # also copy photos into assets/photos/
```

---

## Alternative: importing from the Excel workbook

The source of truth is the Excel inspection workbook
(`Magnetic Plug Inspection.xlsm`). A Python ingester parses it into the data +
photos the dashboard uses.

```
Magnetic_Plug_Inspection.xlsm ──▶ ingest/ingest_magnetic_plug.py ──▶ data/magnetic_plug.js
                                                                  └─▶ assets/photos/*.jpg
```

### Run the ingester

```bash
pip install openpyxl          # one-time

# Ingest one inspection round (default: extract embedded photos into the repo)
python ingest/ingest_magnetic_plug.py "source_files/magnetic_plug/Magnetic_Plug_Inspection_2026-07-29.xlsm"

# Ingest several rounds at once — history accumulates per unit
python ingest/ingest_magnetic_plug.py source_files/magnetic_plug/*.xlsm
```

The ingester is **idempotent and merge-friendly**: each record is keyed by
`equipment + date`, so re-running or adding new rounds updates history without
creating duplicates. Use `--fresh` to rebuild from scratch.

### Building history over time

This dashboard is designed to grow. Each PM inspection round is one workbook.
As new rounds are completed, drop the workbook into
`source_files/magnetic_plug/` (name it with its date) and re-run the ingester —
every unit's timeline extends automatically.

---

## Photos: embedded vs. the N: drive

The uploaded workbook had the plug photos **embedded**, so the default
(`--photo-mode extract`) copies them into `assets/photos/` and names them
`<UNIT>_<POSITION>_<DATE>.jpg` (e.g. `TK146_4C_2026-07-29.jpg`).

If your photos instead live on the **N: drive**, point the dashboard at them
without copying:

```bash
python ingest/ingest_magnetic_plug.py file.xlsm \
    --photo-mode reference \
    --photo-root "N:/Condition Monitoring/Magnetic Plug/Photos"
```

This writes `N:/.../<UNIT>_<POSITION>_<DATE>.jpg` paths into the data instead of
copying files. (For a browser to open `file://` / UNC paths directly, the photos
must be reachable from the machine viewing the dashboard.)

---

## Grade / severity scale

The workbook records a letter **Grade** (`Степень`) per plug position. The scale is
**A / B / C / X**, with **X the worst** — there is no `D`:

| Grade | Meaning | Colour | Suggested ISO 14224 severity |
|-------|---------|--------|------------------------------|
| A | Good | green | No failure |
| B | Watch | yellow | Incipient |
| C | Serious | orange | Degraded |
| X | Critical | red | Critical |

The grade only **suggests** the ISO severity when you tap it — the inspector can set a
different severity, and that choice always wins. On the dashboard, an item's own severity
takes priority over anything derived from the grade.

The mapping lives in one clearly-commented `GRADE_SEV` constant in both
`mobile/index.html` and `dashboard/index.html`. The raw grade letter is always shown, so
colour is never the only signal.

Both `C` and `X` count as findings, so the action register lists every `C` and `X` as
outstanding work. The historical magnetic-plug workbook is **56 × `C` and 8 × `X`**, so
expect the register to open with 64 rows from that round alone.

---

## Repository layout

```
Condition-Monitoring/
├── dashboard/
│   ├── index.html              # the dashboard (open this)
│   └── report.js               # bilingual PDF report builder
├── mobile/
│   ├── index.html              # offline Field Capture app (PWA)
│   ├── temp-limits.js          # temperature warn/alarm limits (shared with the report)
│   ├── hme.js  hme-cascade.js  # GENERATED — the 1C defect & cause matrix, ISO 14224
│   ├── mp-fc.js                # magnetic plug + filter cut findings (outside the matrix)
│   ├── assets.js               # GENERATED — the unit list, merged from the register
│   └── sw.js  manifest.webmanifest
├── data/
│   └── magnetic_plug.js        # generated data (window.CM_DATA)
├── assets/
│   └── photos/                 # extracted inspection photos
├── ingest/
│   └── ingest_magnetic_plug.py # xlsm → data + photos
└── source_files/
    └── magnetic_plug/          # original inspection workbooks
```

---

## Data model (`window.CM_DATA`)

```jsonc
{
  "component": "Magnetic Plug",
  "assetClass": "NHL TR60 Dump Trucks",
  "equipmentList": ["TK146", "TK147", ...],
  "inspections": [
    {
      "equipment": "TK146",
      "date": "2026-07-29",
      "motorHours": 6018,
      "source": "Magnetic_Plug_Inspection_2026-07-29.xlsm",
      "positions": [
        {
          "key": "4C",
          "label": "4C LEFT REAR FINAL DRIVE",
          "grade": "C",
          "particleCount": null,
          "componentHours": null,
          "oilHours": null,
          "comment": null,
          "photo": "assets/photos/TK146_4C_2026-07-29.jpg"
        }
        // ... 4D, 4E, 4F
      ]
    }
  ]
}
```

Adding **Filter Cut / Oil Analysis / Temperature** later follows the same
pattern: an ingester per component writing a parallel `data/<component>.js`, and
a tab in the dashboard that renders it. The tabs are already stubbed in
`dashboard/index.html`.

---

## Field Capture app — what it records

### Three screens, one job each

The app used to be one long scroll — capture, then the queue, then what the team
had done, then the due list — so reaching the due list meant scrolling past
everything and the capture screen never ended. Each is its own screen now, from a
bar at the bottom of the thumb's reach:

| | |
|---|---|
| **Capture** | The round: unit, positions, photos, grades. **Save** is pinned above the tab bar, so it is never scrolled away from. |
| **Queue** | What is on the phone and what is waiting to go out, with Share, Export ZIP and the PDF report. |
| **System** | What the whole team has uploaded, and what is due. |

Switching screens is a view change and nothing else: a half-finished round is
exactly where you left it when you come back. The Queue tab carries a count of what
is waiting to upload and the System tab a count of what is overdue — the two
reasons to leave the capture screen. Tapping a unit in either list takes you to
Capture with that unit already picked.

**On a tablet all three are on screen at once and the tab bar goes away** — an
iPad has the room, and the phone layout stretched to 834 px was 150-character
lines and form fields the width of the screen. A phone turned sideways keeps the
tab bar (390 px of height is not a tablet) but puts the unit on the left and the
capture panel on the right, with a compact header and a half-width Save.

### The unit's recent condition, before you write the round

**Last done** answers whether to walk away. Standing at the unit, the question is
usually the other one: *is this getting worse?* Under it, a small bar per round —
the last eight, oldest on the left, coloured by grade — and a word for the
direction: **getting worse**, steady, or improving. Worsening is called out in red.

It is built from what the team has uploaded plus whatever this phone is still
holding, so a round saved five minutes ago is in the picture before it has been
sent. A unit with only one recorded round shows nothing rather than a meaningless
single bar.

### What it records

Pick the **inspection type** at the top of the app; everything else adapts.

| Type | Suffix | What it captures |
|---|---|---|
| Magnetic Plug | `MP` | Plug position, grade, particle count, component/oil hours |
| Filter Cut | `FC` | Filter, grade, findings |
| Inspection | `INSP` | Any real component from the asset register (L7 → L8 → L9 cards) |
| **Temperature** | `TEMP` | Reading °C, ambient °C, method (IR gun / thermal camera / contact probe / telemetry) |

### The unit list, and a machine that arrives before the paperwork

1,128 units. The list is a **merge** of what the app already held and what the 1C register
names — replacing it would drop machines that are on site but have no manufacturer or model
recorded, which is most of the support fleet.

Two things are worth knowing about it.

**A dated unit number is not a unit number.** Eight rows arrived from 1C with a date welded
on — `DZ015_10112024` for the SHANTUI SD32 that sits between DZ014 and DZ016. The number
painted on the machine is DZ015, and that is the only name anyone will ever look for: the
inspector picking from the list, the QR label, the photo file name, the dashboard matching
a round to a unit. Left alone, seven machines were uninspectable and one was a duplicate.
The build strips the date now, and drops the row if the bare number already exists.

**A machine can arrive before the list catches up.** DR011 is not in the register — the
drills stop at DR010. Rather than offer a generic component list, the app takes the class
the register itself already uses for that unit-number prefix and *says out loud* that it is
a fallback. The inspector gets a drill's components; nothing pretends the register knows
about DR011. Send the new rows whenever 1C has them and re-run `docs/build-hme-data.py`.

345 units carry no equipment category from 1C — 301 `TK` support trucks, 24 `LS` lighting
plants, 20 `HX` heaters. Each gets a category inferred from its prefix, written to `fb`
rather than `cat`, so a guess can never pass for a record.

### Photographs and video — four per component

The limit is **four photographs and one video (≤60 s) per component**, not per machine.
Every position in the walk has its own strip: a magnetic-plug round can carry sixteen
photographs across its four plugs, an undercarriage round up to a hundred and forty-four.
Filling one position's strip does not touch any other — the shutter greys out on that
component only, and deleting a photo frees a slot there and nowhere else.

Each one gets its own file name (`TK151_4C_29.07.2026_MP_1.jpg` … `_4.jpg`), so nothing
overwrites anything on the way to Drive. The report prints all four: the first at full
width, the rest in a strip beneath it, which fits four in about the height of two.

### Temperature module

The measurement point is a real register component, the same L7→L8→L9 cards the
walk-around inspection uses. Each component has **warn / alarm limits** matched on its
name (bearings 70/85 °C, hubs 80/95, final drives 85/100, transmissions 95/110,
exhaust 450/550, brakes 150/200, electrical panels 60/75, …), and the reading
**auto-suggests the ISO 14224 severity** — tapping a severity yourself always overrides it.
The limit table is one clearly-commented array, `TEMP_LIMITS`, near the top of
`mobile/index.html`; edit it to match your OEM limits.

> ⚠️ The shipped limits are sound general mobile-equipment values, **not** your OEM's.
> Confirm them against the machine manuals before using them to stop equipment.

### GPS stamp & supervisor sign-off

* Every record carries the **GPS position** where it was taken (captured quietly as soon
  as a unit is picked, so Save never waits; the record still saves if location is denied).
  The dashboard shows it as a Google Maps link.
* A **supervisor** name and an on-screen **signature** can be added before saving. The
  signature uploads as `<UNIT>_<DD.MM.YYYY>_<TYPE>_SIGN.png` and is printed on the PDF report.

### Inspection due-list

The app keeps a small "last done" index per unit and type, and shows what is **overdue**
or **due soon** against an interval you set per type (defaults: MP/FC 90 days, INSP/TEMP
30 days). Tap a unit to load it into the form. It is fed by this phone's saves **and by
everything the team has uploaded** (below), so a unit someone else covered no longer reads
as overdue. **Load history file** still works for seeding from an `entries.json`.

### What the whole team has uploaded

With Google Drive configured, the **System** screen lists every inspection the team
has uploaded — unit, grade, date, who did it — not just this phone's. Picking a unit shows
*"Last done 2026-07-28 (3 d ago) by B. Ivanov · C"* right on the capture screen, so nobody
walks a round that was done yesterday.

It reads the same one-request endpoint the dashboard uses (records only, no photos),
refreshes itself after each upload, and keeps the result on the phone — so it still shows
with no signal. A refresh in the pit says *"Offline — showing what was last pulled"*
rather than failing. Automatic pulls are rate-limited to one a minute; the button is not.

> This is a **shared** view by design — every inspector sees every inspector's work. It
> needs the read actions in `docs/google-upload.gs`; if the deployed script predates them
> the card says exactly what to redeploy.

### When two phones send the same round

Every file an inspection produces is named from the unit, the date and the type, so two
people who cover the same unit on the same day produce the same file names — a hand-over,
a big machine split between them, or a re-inspection. The upload used to overwrite, and the
first inspector's round and photos went with it, silently.

Now a file is only ever overwritten by the phone that wrote it. Anyone else's copy is kept
alongside as `<name>~<DEVICE>.<ext>`, and the clash is recorded in
`_meta/<UNIT>_<DDMMYYYY>_<TYPE>.conflict.json`. Both phones see *"sent twice"* against that
round on the **System** screen; the dashboard flags it **CONFLICT** and its Data sources card
counts how many are waiting.

The office picks which version stands — **✎ Edit → Two phones sent this inspection** lists
each one with who took it and how many positions it covers. Nothing is deleted either way,
so the choice is as reversible as a void, and a third phone sending its own version re-opens
the decision. A retry from a phone already listed does not.

> The device tag is written on the Drive file itself, not in the name or the bytes. Files
> uploaded before this was deployed carry no tag: a sidecar still names its device inside,
> so **records** are protected regardless, but one first clash on an old **photo** can still
> overwrite. Everything uploaded from build 49 on is tagged.

### Not losing what was captured

Deleting a queued inspection asks first, and says which case it is: an un-uploaded record names
the unit and states that its photos, signature and readings exist nowhere else, with a
destructive-styled confirm; an already-uploaded one says plainly that the Drive copy is not
touched. Escape and the backdrop both mean *keep it*. The delete control is 44 px and set apart
from Edit — the two used to be ~34 px and adjacent.

The app also asks the browser to treat its storage as **persistent** at the first save. Without
that grant, iOS evicts a non-installed web app's storage after about a week of disuse and Android
evicts under pressure — either would take a queued round, photos included. ⚙ reports the real
answer rather than assuming it, along with storage used, room remaining in photos, and a warning
at 80% while there is still time to upload and clear.

### Light, dark, and what the header pill means

⚙ → **Appearance**: Auto, Light or Dark. Auto follows the phone and keeps following
it while the app is open; the other two override it and stick. Both palettes are
designed rather than one inverted from the other — the neutrals carry a slight
cool-steel bias, and every text tone clears WCAG AA against the surface it actually
sits on, checked in the test suite rather than by eye. The severity colours are the
same in both: a grade 3 must not look like a different grade because of the time of day.

The pill in the header used to read `navigator.onLine` and say **online**. That
property means the phone has a network interface attached, not that anything can be
reached — in the pit it reads true while every upload times out, so a confident
green light sat over failing uploads. It now reports the only thing worth a permanent
place in the header, *is the work safe*, and only claims to be connected when Drive
has actually answered:

| | |
|---|---|
| **Synced** (green) | everything captured is in Drive |
| **N waiting** (amber) | that many rounds still to upload |
| **No signal** (amber) | the phone has a network and Drive is not answering — the pit |
| **Offline** (grey) | no network at all |
| **Upload failing** (red) | a destination is returning errors |
| **Not syncing** (grey) | no upload destination configured |

Tapping it opens the Queue screen, where the detail and the retry are.

### How the defect was found

Every position records a **Detection Method** (ISO 14224 Table B.3) beside the severity,
defaulting to *DM-02 Visual inspection* for a routine walk-around. It is what separates a
condition-monitoring finding from a breakdown, and without it a reliability programme
cannot show it is working — `DM-08 Oil / fluid analysis` and `DM-09 Vibration analysis`
are what the CM programme reports under.

### A graded finding has to say what comes next

What a grade asks for is one table, `GRADE.requires` in `mobile/grade.js`, read by the
phone's Save and by the office. A **3** needs a recommended action and a target date; a
**4** adds a comment and a close-up photograph of the defect; a **5** adds the defect
code and the supervisor's notification. For 3, 4 and 5 the form also takes who is
responsible, the machine's operating status and a work order (or says one is required).
A failure mode the matrix rates critical, a reading past its condemn limit or a
temperature past its alarm **proposes 5**; the inspector may confirm or raise it, and may
set it lower only with a reason, which stays on the record with who and when.

Every inspection also needs a whole-machine **overview photograph**, an undercarriage
round both **sides**, a tray round the **whole tray**, a GET round the **whole assembly**;
a point's photographs can be relabelled as the defect close-up, a measurement, the plate
or an extra. Saving will not finish while any position marked **Critical** — grade 5 —
has no defect or no recommended action. The app jumps to that
position and names what is missing, rather than reporting an error at the bottom of a long
form. Planning cannot act on a critical finding that does not say what is wrong or what to
do, and it is why the Pareto charts used to have blanks at the top.

Deliberately Critical only. Applying the same rule to Serious was considered and rejected:
a rule that blocks too often gets satisfied with whatever is top of the list, which is
worse for the data than an honest blank.

### The priority the work request is raised at

A recommended action that raises a job in 1C asks for the priority 1C files it under, in
1C's own four words:

| Code | English | Русский |
|------|---------|---------|
| P1 | Breakdown | Остановка (авария) |
| P2 | Defect | Остановка (неисправность) |
| P3 | PM | Остановка (ППТО) |
| P4 | Planned Repair | Остановка (плановый ремонт) |

The field appears only once an action has been chosen, and disappears again if the action
is cleared — there is no priority without a job to raise. Choosing the action suggests the
priority that matches the severity (Critical → P1, Degraded → P2, otherwise P4) and puts it
at the top of the picker, but it is only a suggestion: the person standing at the machine
decides, and an override sticks.

Severity and priority are not the same thing and are not printed as though they were.
Severity says how bad the part is; priority says how the repair gets scheduled. In the
report the priority is an outlined tag beside the action, never a filled chip like the
severity.

The code travels with the finding — into the record, `entries.json`, the action register
and its CSV, and the printed report. The dashboard's correction panel can set or change it
from that end too, for a planner working from the desk rather than the machine.

### Deleting a round, and where it actually lives

**Delete permanently** trashes the files in Drive. A round that is not in Drive cannot be
deleted from Drive — so the panel checks where the round is held before it asks:

- **In Drive** — the files go to Drive's trash, recoverable there for 30 days, and the
  deletion is logged with the name and reason.
- **Imported from a file** — nothing was ever in Drive. The dashboard's own copy is removed
  and it says so.
- **Drive answers "nothing found"** — no file carries that name any more; somebody removed
  it there, or it never arrived. The row here is a leftover, so it is cleared and the
  message says plainly that Drive was not touched. If the files do exist under another
  name, **Reload everything** brings the round back.
- **Bundled sample data** — built into the page, not a record. It cannot be deleted here.

In every case the unit number has to be typed to confirm first. **Void** remains the
reversible option: it withdraws the round from every count, chart and report, keeps the
photographs, and can be undone.

### Two inspectors, one round (multi-device merge)

Each phone has a device id. Tap **⇄ Send round** to export that phone's records (photos
and video inlined) and **📥 Receive round** on the other phone to merge them. Records are
keyed `TYPE|UNIT|DATE`, so the same unit inspected on both phones merges into one record
instead of doubling: missing items are added, the richer capture wins on a clash, and both
inspectors' names are kept.

---

## When Drive stops being enough

Google Drive was the right call for a pilot — no server, no IT approval, no hosting bill —
and it is the wrong call for a product. One shared secret instead of per-user identity, an
Apps Script quota of about 90 minutes a day, no server-side conflict resolution, no way to
push, and a folder listing that is O(files). All of that is fine at twenty phones and none
of it is fine at two hundred.

So there is a backend, in `server/`: Postgres, four REST endpoints, and server-sent events
so the dashboard is *told* rather than asking every three minutes. It is tested against a
real Postgres, not a mock — see `server/README.md`.

**Drive is not deprecated.** A site whose IT blocks everything but a browser can still run
the whole system out of a shared folder, and keeping that working is a feature.
`dashboard/sync-adapter.js` is the seam that lets both be true: one interface, two
implementations, and nothing else in the dashboard knows which it is talking to. Set
`cm_api_url` and `cm_api_token` and it uses the server; leave them unset and it uses Drive,
exactly as now.

| | Drive | Server |
|---|---|---|
| A lost phone | rotate the secret on every phone | revoke one row |
| Phone → dashboard | ~3 minutes (the poll) | 2–5 seconds (pushed) |
| Conflicts | by hand, per dashboard | by hand, recorded once, shared |
| Audit | the deletion log | every request, including refusals |
| At 100,000 photographs | slows down | indexed |

## Getting inspections into the dashboard

An inspection is two things: the **records** (readings, grades, coded defects) and the
**photos**. The phones upload both, side by side — `TK146_4C_31.07.2026_MP.jpg` next to
`TK146_31.07.2026_MP.json`. Everything below is about getting those to the dashboard.

Click the status chip in the header, or **Data sources**, to open the panel. Three routes,
and you can use more than one at a time:

| Route | Brings | When |
|---|---|---|
| **☁ Google Drive** | records **and** photos | IT will not allow the Google Drive client on the laptop. Reads over plain HTTPS from the Apps Script `/exec` URL — nothing to install. |
| **📂 Folder on this PC** | records **and** photos | The N: drive, an OneDrive-synced SharePoint library, or a Drive-for-desktop letter. Chrome/Edge only. |
| **📄 Import a file** | records only | A single `entries.json` exported from one phone. No photos — it is a fallback for a browser that cannot open a folder. |

The status chip always answers *what am I looking at, and from where?* —
`31 inspections · 17 units · 480 photos · N:\Condition Monitoring`.

**Folder on this PC** reads the `.json` sidecars *and* the images, recursing through the
monthly sub-folders, so pointing it at *Condition Monitoring* once is enough.

> Before build 42 this button was labelled **Photo folder** and it lived up to the name —
> it loaded the images and ignored the `.json` sidecars sitting beside them, so the folder
> gave you photos with no inspection data and you had to import the records separately.
> It now reads both.

**☁ Google Drive** — paste the `/exec` URL and the shared secret once, then **Load from
Drive**; **Test connection** checks the deployment — both halves of it, see below. Photos are
indexed by name but only downloaded when you open a unit or generate a PDF with photos — a
month of rounds is hundreds of megabytes, so pulling it all up front would be pointless.

Every inspection arrives in **one request**. The reading loop runs inside Apps Script,
where Drive is local, and the dashboard sends back the last reply's cursor so a refresh
only carries what is new:

| | Before | Now |
|---|---|---|
| First load, 300 inspections | 301 requests | **1** |
| Refresh, nothing new | 301 requests | **1**, no files read |
| Reopening the dashboard | 301 requests | **0** — cached |

A consumer Google account allows ~90 minutes of script runtime a day, and the old path
spent about 5 of those minutes on every load. **Reload everything** re-reads from scratch;
use it after deleting files in Drive, since an incremental refresh asks "what is new?" and
so cannot notice a deletion.

### Dropping photographs into Drive by hand

You can. Put them in the same folder the phones upload to — the script files them under
`YYYY-MM`, and a photo dropped into that month folder is found.

The name is what matters, and it is not free-form:

```
TK152_4C_31.07.2026_MP.jpg
└──┬─┘ └┬┘ └────┬───┘ └┬┘ └┬┘
 unit  position   date   type  extension
                (DD.MM.YYYY)
```

For **Inspection** and **Temperature** the position is a real register component and the
separator is a dot, not an underscore: `TK152.DRS.ENG_31.07.2026_INSP.jpg`. A second
photograph of the same position is `…_MP_2.jpg`, a third `…_MP_3.jpg`, up to four. The
signature is `TK152_31.07.2026_MP_SIGN.png`.

Three things quietly find nothing:

- **No extension.** Windows hides them; the dashboard requires one — `.jpg`, `.jpeg`,
  `.png`, `.JPG` or `.webp`.
- **An ISO date.** It must be `31.07.2026`, not `2026-07-31`.
- **No inspection to attach to.** This is the usual one. *A photograph is not an
  inspection.* The count on the dashboard is of **rounds**, and a round is the `.json`
  sidecar the phone uploads beside the photos — `TK152_31.07.2026_MP.json`. Photographs
  hang off that record by name. Drop a photo into a folder with no matching sidecar and
  nothing appears, because there is no round for it to belong to.

So hand-dropped photographs work for **adding pictures to a round that already exists**.
They cannot create one. To create a round without a phone, import an `entries.json`
through **Import a file**, or capture it in the app.

> The `Photos/` folder in this repository is a different thing entirely — the old
> `<Unit>/<Date>/<Position>.jpg` layout read by **Open photo folder** from a local disk.
> Uploading there does nothing for a dashboard reading from Drive.

### Nobody presses Sync

Synchronisation has two halves and they fail differently. Both are automatic.

**The phone pushing.** A round is queued the moment it is saved and sent as soon as
anything can be reached. The upload is attempted:

| When | Why |
|---|---|
| Immediately after Save | the obvious one |
| At startup | anything left from last shift |
| On the browser's `online` event | a network interface came up |
| **When the app is brought back to the foreground** | out of the pit, in the crib room, on camp wifi |
| **On a timer, while anything is queued** | 20 s, then backing off ×1.8 to a 5-minute ceiling |

That timer is the one that matters. `online` fires when a network interface *attaches*, not
when the network starts *working* — drive out of a dead zone on the same cellular
connection and it never fires at all, because the interface never went away. Before this,
a round captured at the face could sit in the queue for the rest of the shift while the
phone showed full bars, until somebody thought to press Sync.

The backoff resets to 20 seconds the moment anything gets through, and the timer disarms
completely when the queue empties — a phone in a locker does nothing. It is also cancelled
while the app is in the background, so it never works the radio behind the inspector's
back.

**And it says so.** A queued round now reads `2 inspections waiting to upload · will retry
by itself`, and a failed one `Upload failed: … · will retry by itself` — including on the
error line, which is the one an inspector in the pit actually sees. "Upload failed" with
nothing after it reads as work lost.

**The dashboard pulling.** See below — on open, every 3 minutes, on focus, on reconnect.

**End to end:** a round saved with signal is on the dashboard within about three minutes,
with nobody pressing anything at either end. Saved without signal, it goes as soon as the
phone can reach anything and appears on the next dashboard check.

### It is a web app, and it is also two store apps

Same code. Capacitor puts the *same* `mobile/` folder inside an Android and an iOS
container — no port, no second codebase, and no build step, because the app is plain HTML.
The URL your technicians already use is unaffected by any of it.

One file, `mobile/native.js`, is the only thing that knows which it is running in.
Everything else calls `CMNative.photo()`, `CMNative.geo.here()`, `CMNative.net.onChange()`
and gets the same shapes back either way. That is deliberate: `if (isNative)` scattered
through the capture logic is how one codebase quietly becomes two, with the web half
getting the bug fixes and the native half getting the attention, until the report a phone
prints and the report the office prints disagree.

The web path is the reference implementation, not an apology. Native is an optimisation for
four things a browser genuinely cannot do well: the camera (the file input re-encodes and
drops EXIF), large binaries (150 photographs is not what IndexedDB is for), knowing whether
the network actually works, and handing a PDF to a share sheet instead of a downloads
folder.

Building it: **`docs/BUILDING-THE-APP.md`**. Submitting it: **`docs/STORE-SUBMISSION.md`**.

### Installing it on a phone

**Android.** Chrome offers *Install app* on its own. The manifest declares a maskable icon,
so Android does not letterboxing it inside a white circle, and the two long-press shortcuts
go straight where they say: **New round** opens a clean capture screen, **Upload queue**
opens the queue.

**iPhone.** Safari → Share → *Add to Home Screen*. It opens full-screen with no browser
chrome. iOS does **not** read the manifest for this — it needs an `apple-touch-icon`, and
without one it puts a screenshot of the page on the home screen, which is unreadable at
icon size and looks like a bookmark rather than an app. That is now declared.

Once installed, everything works with no signal: the service worker precaches the whole
shell, all the reference data, the icons and the manifest, so a cold start in a pit is the
same app as a cold start on wifi.

### The service worker may never be why the app fails to open

An inspector at a machine with no signal has no way to clear website data, no console to
read, and no second phone. If the offline layer cannot serve the page, the round does not
get captured. That is the one rule this file is arranged around, and it was learned the
hard way — a build reported from the field showed Safari's own error page:

> FetchEvent.respondWith received an error: TimeoutError: network too slow

That string was ours. Three decisions, each defensible alone, combined into it: `install`
swallowed precache failures and took over anyway, `activate` then deleted the *previous*
build's cache, and `fetch` threw when it found nothing. A flaky signal during an update was
enough to leave a registered worker that intercepted every request and could only fail —
until somebody cleared website data, which is not a thing you can do in a pit.

Four rules now:

- **An incomplete build does not take over.** `install` checks that the page, the register,
  the defect reference, the wear limits and the report engine are all actually cached. If
  any are missing it stays in waiting, the old worker keeps serving, and the app keeps
  working on the old build. That is the correct outcome, not a degraded one.
- **The old cache is not deleted until the new one is proven.** `caches.match()` searches
  every cache, so last week's copy of the register is the fallback that makes a bad update
  survivable. A week-old equipment list beats an empty picker.
- **A page navigation is served from cache first.** Network-first put a timeout on the
  critical path of every cold start in the field. Cache-first opens the app in about
  150 ms with the radios off, and revalidates behind the reader — the half-hourly build
  check is what tells anyone a new version exists.
- **Nothing in `fetch` rejects.** Worst case it answers with a plain page that says the
  download did not finish, that nothing captured has been lost, and offers a retry. An
  honest offline page is recoverable; a browser error page is not.

It also repairs itself. iOS evicts cached files under storage pressure, so if anything is
found missing the worker quietly finishes the download the next time something happens.
**⚙ System** reports the state plainly — *"Offline copy complete — all 12 files"* or
*"⚠️ 11 of 12"* with a button to finish it. A phone that can say "11 of 12" is diagnosable
over a radio; one that just fails is not.

**And an update never pulls the page out from under anybody.** A new worker taking over
used to reload the page on the spot — which on a phone is an inspector halfway through
typing a measurement whose screen resets under their thumb, losing whatever the draft had
not yet committed. Rare, in the way that means it happens to somebody else and never in
front of you. Now the reload happens only when it cannot cost anything: nothing typed,
nothing part-captured, no edit open, no dialog, no cursor in a field. Otherwise the banner
that already exists says a version is ready and waits to be tapped. If the app cannot tell,
it assumes somebody is working.

For the same reason the previous build's cache is kept rather than swept immediately. A
page still running on the old build fetches the PDF engine and the QR reader on demand,
under the old `?v=`; deleting that cache means an inspector who was mid-round when an
update landed cannot print, in a pit, for no reason they can see.

### Is this phone safe to walk away from wifi with?

That question has one moment where it can still be answered usefully — while the person is
standing in the office next to the wifi — and it used to be answerable only by opening
Settings, which is where questions nobody thinks to ask go to die.

So it is the first thing on the capture screen, and it has exactly two states:

- **`● Ready to work offline`** — a slim green line. Present enough to glance at and trust,
  quiet enough that it does not become the banner everyone stops seeing by Wednesday.
- **`⚠️ Not ready to work offline — 11 of 12 files downloaded`** — a full card, above the
  fold, with **Finish downloading now** on it. This is the state worth interrupting
  somebody for, and the only one they can still fix cheaply.

It re-checks when the app is opened and every time it comes back to the front — which is
what catches a phone that has been in a locker since iOS evicted a file under storage
pressure.

**And the app opens at the top.** Browsers restore the scroll offset across a reload, and
this app reloads itself — when the service worker first takes over, and again whenever an
update lands. The phone was opening about 150 px down, with the readiness check and half
the header already off screen, which defeats the one thing a go/no-go check has to do.
Restoring scroll is right for a document somebody was reading and wrong for a form they are
filling in: there is no "where I was" here, only a round that starts at the beginning.

### Updating is not somebody's job

An inspector should never have to think about versions, and the app should never go into a
pit on last month's reference table because nobody tapped a banner.

Three steps, deliberately separate, because only the first two are safe at any moment:

| | When | What |
|---|---|---|
| **Find** | on open, on focus, on reconnect, every 5 minutes | fetch `sw.js` — a few hundred bytes |
| **Fetch** | the instant a newer build is found | the service worker downloads it into a *new* cache; the running one is untouched, and a link that dies half way simply leaves it unfinished |
| **Apply** | only when nobody is mid-round | a reload — and a reload with an open draft is somebody losing a measurement they already took |

The old behaviour only did the first, and put up a banner. A phone could sit on that banner
all week and still be on the old build when it drove out of signal.

**If the phone is idle it updates itself**, silently, with nothing tapped — which is the
usual case, because the moment somebody opens or refreshes the app is exactly the moment
they are not typing into it. **If somebody is working it waits**, and then applies by
itself the instant they are free: the round is saved, the app comes back to the front, the
dialog closes. The banner is information, not an instruction, and it disappears on its own.

Refreshing the page while online therefore does get you the latest: the page opens
instantly from cache, the new build is already downloading, and it swaps a couple of
seconds later without being asked.

And an update that cannot finish never takes over. The phone stays on the build that works.

**How it knows.** The service worker serves the copy it has, so a stale phone looks exactly
like a current one from the inside. The app asks instead: it fetches `sw.js` with
`no-store`, so no cache between here and the server can answer, and compares the build
number with the one running.

Silence stays silence. A pit with no signal is not a problem worth reporting, and nothing
is said unless there is a real difference. **⟳ Update** at the bottom of the screen is still
there for the case where somebody wants to force it — it clears the service worker, every
cache and the browser's own HTTP copies, then reloads.

### Does the dashboard need a button press? No.

A round saved in the pit reaches Drive as soon as the phone has signal. The dashboard is a
page in a browser, and nothing can push it that news — Drive has no way to call a web page,
and Apps Script cannot hold a socket open. So it asks, on its own:

| When | What it does |
|---|---|
| When you open the page | Catches up with anything uploaded since you last looked |
| Every 3 minutes while the tab is open | Asks "anything new?" |
| When you come back to the tab | Asks again — that is the moment you want it current |
| When the network comes back | Asks again |

The check is one request carrying the last cursor. When nothing is new the script reads no
files and answers in well under a second, so repeating it costs almost nothing. When
something *is* new, the page repaints and says so quietly beside the source chip — `✓ 2 new
from Drive`. No dialog, nothing to dismiss.

It stays out of the way in three ways: never while a correction panel is open (the rebuild
underneath would move the record being edited), never while offline or when a check is
already running, and a background failure is silent — the buttons are there to be pressed
and told why, but a toast every three minutes on a flaky link is not news.

**So the three buttons are:**

- **Load from Drive** — ask *now* instead of waiting for the next check. Same cheap
  incremental read.
- **Reload everything** — re-read the whole folder from scratch, ignoring the cursor. Only
  needed after files are **deleted or renamed in Drive**, because an incremental check asks
  "what is new?" and cannot notice something disappearing.
- **Test connection** — check the deployment without pulling anything, both halves of it.

### Saving the script is not deploying it

Reading and writing are two halves of the same deployment and they fail apart. Apps Script
serves the **released version**, not the code in the editor — so a deployment released
before `doPost` existed answers every read, loads every inspection, and looks completely
healthy right up until the first correction, void or deletion, which comes back as one of
Google's error pages (HTTP 404, a Docs 404 in HTML).

**Test connection** now probes both halves and says so:

> ⚠️ Connected — folder "Condition Monitoring". Reading works, writing does not — the
> deployed version is older than the code.

The fix, in the Apps Script editor: **Deploy → Manage deployments → ✏️ Edit → Version: New
version → Deploy.** The URL does not change, so nothing needs re-pasting. Do this after
*every* edit to `google-upload.gs`, including after setting `ADMIN_SECRET`.

The write probe is a POST that carries no file. Any JSON reply — even a refusal — proves
`doPost` is running; only Google's HTML means it is not. Nothing is written either way.

This needs the read actions in `docs/google-upload.gs` — re-paste that file and deploy a
new version if yours predates them. Until you do, the dashboard falls back to the old
one-file-at-a-time path automatically and says so.

### Correcting, voiding and deleting

**Equipment history → ✎ Edit** on any inspection.

| | What it does |
|---|---|
| **Correct** | Severity, recommendation, WO, defect, direct cause and comments, per position, plus a note on the round. Only what you actually change is recorded, and your name goes with it. |

The defect and cause pickers offer what the cascade says this component can do, with a
search box above them; typing narrows the list and shows how many matched, and the search
reads the code and both languages, so an engineer working in Russian can still type the
English term or the code. Whatever is already recorded stays selectable however you filter.
| **Choose a version** | When two phones sent the same round, both are offered with the inspector and position count. Picking one decides what the reports use; neither file is deleted and the choice can be changed. |
| **Void** | Withdraws the round from every count, chart, action list and report, with a reason. Nothing is deleted; **Show voided** brings it back into view, and **Un-void** reverses it. |

A voided round is why the two counters on screen can differ, and the page says so rather
than leaving you to work it out. The **source chip** at the top counts everything loaded —
`22 inspection(s) · 18 unit(s) · 2 voided · Drive`. The **Inspections** tile counts what is
being counted in the view you are looking at, after every filter including the void one, and
when the void filter is what separates the two it carries the difference: `20` over
`17 unit(s) · 2 voided, not counted`. That note is a button — clicking it ticks **Show
voided**, so the rounds being held out are one click away rather than a hunt for a checkbox.
The count is always of the current view, so a search that matches only a voided round reads
`0 · 1 voided, not counted`.
| **Delete** | Sidecar, photos, signature and corrections to Drive's **trash** (30 days), logged with who and why. Off unless `ADMIN_SECRET` is set in the Apps Script. |

Corrections are stored as their own files in `_meta/`, never written into the inspection's
sidecar — the phone that captured it still holds that record and re-syncing overwrites the
sidecar, so a correction stored there would disappear silently. The clients merge the
marker over the record at read time; the original readings, photos and signature are never
altered, and the change is visible as "corrected" with the author and timestamp.

Voids reach the phones too: a withdrawn round drops out of the phones' **System** screen and stops
counting as done in the due list, so nobody skips a unit on the strength of a round the
office has retracted.

### What is due, and what we missed

The due list has its own tab. It used to sit at the bottom of **System**, under
"In the system" — so on a phone that had pulled the whole team's work, reaching the one
list that says what to walk meant scrolling past forty-two rounds of archive. The archive
and the worklist are different questions, and one of them is asked at the start of every
shift.

Each screen answers one question, and shows only the controls that can act on it:

| | asks | holds |
|---|---|---|
| **Capture** | what am I recording? | the round in progress |
| **Due** | what do I walk next? | the schedule, filtered by pills |
| **Queue** | is my work off this phone? | what is on it, and the ways to send it by hand |
| **System** | is this phone fit, and what has the team done? | the readiness checks, and everything uploaded |

A control appears when it can do something. The sync bar is silent while there
is nothing queued and nothing failing — the header pill already says *Synced* in
one word — and returns the moment there is a queue or an error, carrying what the
pill cannot: the count, the server's own message, and the promise that it will
keep trying. Share, Export ZIP and the PDF wait until there is a round to hand
off. The readiness card folds to one line when all six checks pass and opens
itself the moment one does not.

**Capture · Due · Queue · System.** Due is second: after the app's own job, before
everything that is about looking backwards. It carries a red badge with the number of
machines nobody has been to — *missed*, not missed-and-due-soon, because a badge is a call
to action and a round due next Tuesday is not one. Queue badges what is waiting to upload;
System badges a round two phones both sent, which is the only thing in an archive that
needs a decision.

Its filters are pills, not dropdowns — the same pills the card above it uses:

`Missed 5` `Due soon 1` `Put off 1` `All 9`
`All rounds 5` `MP 1` `INSP 1` `UC 3`

The count rides on the control that filters to it, so "how bad is it" and "show me" are one
glance and one tap. A dropdown could do neither: it hides its options until opened and
cannot carry a number, which is why the counts used to be printed again as a sentence
underneath. A round type with nothing in the current scope gets no pill, so a pill can never
lead to an empty list — and the one you are standing on stays put even when the scope you
switch to empties it, or the control that got you there would vanish.

Rounds come round on **hours**, not days — `mobile/due.js` holds the intervals in one
place and both the phone and the dashboard compute from it, so the two can never drift:

| Round | Every |
|---|---|
| Magnetic plug | 250 h |
| Filter cut | 500 h engine, 1000 h everything else |
| Undercarriage, GET, general inspection | 500 h |
| Dump body | 1000 h |

The calendar is a rendering of those at 20 h/day — two ten-hour shifts. Where a machine
has been inspected twice its hour meter has told us what it actually does, and it is
scheduled on **its own** rate instead, so a light vehicle doing eight hours a day is not
called overdue on a haul truck's calendar. The row says which of the two it used. And
where two undercarriage readings have forecast a condemn limit, that forecast wins when
it is sooner than the interval — a machine whose worst point reaches its limit in 300
hours is due in 300 hours, whatever the schedule says.

A round that is due and not walked is not the same as a round nobody noticed. The phone
asks for a reason and a date, writes it to `_meta/deferrals/`, and the dashboard's **Due &
missed** tab shows it on the row — so *"nobody has been to this machine"* and *"this
machine is in the workshop until Friday"* are two different counts instead of one red
line. The reason expires by being answered: once the round is actually recorded, it stops
excusing the machine, and nothing is deleted for that to be true.

> Prefer Void to Delete. Inspection photos are evidence for warranty claims and failure
> investigations. Delete is for test records and mistakes that should never have existed —
> and it needs a password that is deliberately **not** the one the phones carry, because
> the upload URL is effectively public.

### EN / RU

The dashboard has an **EN | RU** toggle in the header, matching the app. Everything
switches — tabs, filters, KPI tiles, table headings, severity and inspection-type names,
the data-sources sheet and the edit panel — and the choice is remembered per browser. The
PDF reports were already bilingual and print both languages side by side regardless.

### Finding things once the data is in

* **Search** (or press `/`) matches unit, defect, cause, comment, inspector and WO across
  every tab.
* **Click to filter** — a Pareto bar, a severity band in the mix tile, a unit row. The
  filter applies to the whole dashboard, so "which failure mode is worst?" is one click
  away from "on which units?".
* Everything active shows as a removable chip under the controls, with **Clear all**.
* The fleet table sorts on any column; click again to reverse.

---

## PDF reports (dashboard → Reports tab)

Bilingual **EN / RU** — every heading and column shows both, so nothing is lost between
expat and local staff. Three scopes share one section library:

| Scope | Answers | Contains |
|---|---|---|
| **Equipment** | "how is this machine trending?" | KPIs, severity mix, a **condition timeline** per component across every round, then each inspection in full |
| **Round** | "what came out of today's shift?" | KPIs, then a **cross-unit action table** sorted worst-first — what the supervisor reads — then per-unit detail |
| **Fleet summary** | "what is the month telling us?" | KPIs, coverage by type, Pareto of failure modes / direct causes / ISO 14224 mechanisms, worst units, outstanding actions |

**Each inspection type prints its own layout**, because they answer different questions:

* **Magnetic Plug** — position, grade, severity, particle count, component/oil hours, coded
  defect and cause, with the debris photos in a horizontal strip.
* **Filter Cut** — filter, grade, what the cut media showed, cause, action.
* **Inspection** — coded defect (with ISO mechanism/mode), direct cause, action and WO,
  plus a compact "checked, no findings" line so coverage is provable.
* **Temperature** — reading, ambient, rise, and a **limit bar** showing the reading against
  that component's warn/alarm thresholds, with exceedances called out above the table.

### What it was last time

An **Equipment** report on a machine with more than one round prints the latest round in
full, and then **every earlier round the way the dashboard shows it**: a one-line header —
date, round type, hour meter, inspector, verdict — and under it the photographs, with what
each point was written beneath its own picture. Grade, severity, reading, finding. Nothing
else.

There is no summary table and no point-by-point grid. There were both, and they were struck
out on a returned sheet as redundant, which they were: every fact in them is on a card.
Three renderings of one truth is not thoroughness, it is three places for them to disagree.

The blocks are compact on purpose — about a fifth of a sheet each, so **four or five rounds
fit on a page**. What is *not* reprinted is the furniture: one masthead, one drawing of the
machine, one signature block per document. That was the point of collapsing the rounds in
the first place — a two-round report that ran to six sheets and said nothing new on four of
them.

Two exceptions, both deliberate:

* An earlier round where every point was fine and nobody photographed anything gets no
  block. There is nothing to show, and a header with no evidence under it is a section that
  exists to hold its own heading.
* An **undercarriage or dump-body** round is not reprinted: its record is millimetres.
  Its photographs still are.

One table survives, and only for rounds recorded in millimetres — **Measurement history**,
one row per point, one column per round, oldest on the left, with the condemn limit, the
change over the series, the percentage worn and the hours left. None of that is on a card
and none of it can be reconstructed by looking, so it is not redundant.

A single-round report is deliberately one round: the button on a history card asks for that
inspection, and gets that inspection.

Pages are laid out as real A4 boxes and flowed block by block, so a table row is never
sliced in half and a section heading never strands at the foot of a page. Nothing takes a
sheet it does not need — a short round with a short history is one page, not two. Photos and
supervisor signatures come from whichever data source is loaded — **Folder on this PC**, or
Google Drive, which fetches just the photos that report needs. Set one up before generating
if you want them included.

The temperature limits are shared with the app (`mobile/temp-limits.js`), so a reading is
judged identically on the phone and in the report.

---

## Auto-upload (phone → SharePoint / server)

The Field Capture app can upload photos, video and inspection data automatically
whenever it is open and online — no manual Share/Export.

Open **⚙** in the app and set the upload mode, URL and optional secret header:

| Mode | Sends | Use when |
|---|---|---|
| **Google Drive (Apps Script)** | `{name, folder, contentType, file, secret}` as `text/plain` | **Fastest to set up and to run** — free, no premium connector, one hop |
| Power Automate (JSON + base64) | `{name, folder, contentType, file}` | You need the files in SharePoint / on the N: drive |
| Plain HTTPS POST (multipart) | `file`, `name`, `folder` | Your own server endpoint (needs CORS) |
| Off | — | Manual export only |

Failed uploads are retried; nothing is deleted from the phone until the server confirms.

* **Google Drive:** **[docs/GOOGLE_UPLOAD_SETUP.md](docs/GOOGLE_UPLOAD_SETUP.md)** — paste
  `docs/google-upload.gs` into script.google.com and deploy. About 10 minutes.
* **SharePoint:** **[docs/AUTO_UPLOAD_SETUP.md](docs/AUTO_UPLOAD_SETUP.md)** — Power
  Automate flow into a document library.

### Setting up more than one phone

Upload settings live in the browser's `localStorage`, so they are per device. There are
two ways to avoid setting up each phone by hand.

**Phone to phone (nothing published).** Configure one phone, then **⚙ → Show setup code**
and **⚙ → Scan setup** on the next one — or **Copy setup link** and send it. Both
destinations, folder prefixes and photo size come across in one scan.

**Built into the app.** `mobile/upload-defaults.js` holds a destination list that any
phone with no configuration picks up on first open, with Google Drive and SharePoint both
enabled. The URLs ship **empty**; paste yours in and new phones need no setup at all.
Settings already saved on a phone always win, and switching a destination off sticks.

> ⚠️ **Filling those in publishes a write credential.** The site serves
> `upload-defaults.js` to anyone who opens the app, so anyone who finds the URL could
> write files into the Drive folder and the SharePoint library — with no way to tell who.
> It can be a fair trade for removing setup; make it knowingly. Hosting behind
> **Cloudflare Pages + Access** makes it safe, and the setup-code route above avoids it
> entirely. To undo: clear the fields **and rotate both endpoints** — clearing alone does
> not un-publish what was already served.

A record is only marked uploaded once every enabled destination has taken every file.

### Where the files land

The **Folder** field in ⚙ takes placeholders and creates sub-folders as needed. The shipped
default is **`{TYPE}/{UNIT}/{YYYY-MM-DD}`** — inspection type, then the machine, then the day:

```
MP/DZ004/2026-06-14/    DZ004_4C_14.06.2026_MP.jpg  …  DZ004_14.06.2026_MP.json
MP/DZ004/2026-08-02/
MP/TK151/2026-08-02/
UC/DZ004/2026-07-19/
```

A month folder is every machine's rounds in one pile; a unit folder is that machine's own
history, which is how anyone actually goes looking — *what did DZ004's plugs look like last
time?* Also available: `{TYPENAME}` (the readable name) and `{YYYY} {MM} {DD} {YYYY-MM}`.
Date parts come from the **inspection** date, not from today, so a round entered late still
files under the day it was done. Each destination has its own folder setting.

Two older defaults shipped before this one — `{YYYY-MM}` and `{TYPE}/{YYYY-MM}`. A phone on
either of those exact strings is moved forward once, automatically; a folder you typed
yourself is left alone. Files already in Drive are not moved, and the dashboard reads the
whole tree, so old rounds keep working — the new layout starts from the next upload.

One thing to watch as the archive grows: the Drive read walks every folder under the root on
each refresh, and one folder per machine per round is many more folders than one per month.
A few hundred rounds is fine; at a few thousand, either switch the folder to
`{TYPE}/{UNIT}/{YYYY-MM}` — same shape, ~30× fewer folders — or move to the REST backend in
`server/`, which walks nothing.

A destination that is failing no longer holds up one that is working: upload state is
tracked per destination, so with SharePoint down every record still reaches Drive, and
nothing is ever re-sent to a destination that already has it.

### The undercarriage map, and the GET round

Both screens are the same screen, because they answer the same question: which part of
*this* machine am I standing at?

**A photograph of this model, and the client's own eleven numbers on the parts they name.**
Not a diagram, and not a track frame in general — a `CATERPILLAR D9R` with its sprocket
lifted clear above two ground idlers looks nothing like a `KOMATSU PC800`, and a picture
that is wrong about where the sprocket is teaches the wrong end of the machine. The
numbering is the client's undercarriage catalog, so a number on the screen is the number on
the printed page in the ute.

Three pieces of geometry put a number on a part. `LAYOUT` is where each number sits as a
fraction of the track frame; `BOX` is where the track frame sits inside *this* model's
photograph; `LABELS` is what it is called, in both languages. The middle one is what makes a
single shared layout land correctly on twenty-nine different photographs — without it the
numbers float somewhere near the machine. All three are in
[`mobile/uc-points.js`](mobile/uc-points.js).

**One picture, with Left and Right as a choice above it.** There used to be two frames side
by side; with photographs they were the same photograph twice, saying nothing and costing
half the screen.

**A number is a place; the app measures more finely than that.** Number 6, *centre track
rollers*, is six separate measurements on an eight-roller frame. Tapping a number opens what
it covers as a row underneath and lands on the first one still to be taken, so a half-done
group resumes where it stopped.

**Three checks the catalog has and the caliper table never did** — track adjuster / recoil,
track frame / guards, and track sag / top chain — are now in the round, graded rather than
measured. Sag especially: it is the single biggest lever on undercarriage life and it costs
nothing to look at. The round is 42 positions where the paper tab is 36.

**GET gets the identical treatment.** A photograph of the machine's own bucket or blade with
the catalog's eleven numbered points on it — teeth, adapters, retainers, lip, side cutters,
shrouds and wear plates for a bucket; end bits, three cutting-edge segments, blade corner,
wear strips and the ripper for a blade. Which tool a model carries comes from the catalog,
with the family as a fallback. Every position is graded and **a round is complete on grades
alone**; a millimetre is accepted wherever somebody had a tape, and a visual check is not
offered a number box to invent a figure into.

**The unit list only offers machines the round applies to.** Choosing Undercarriage narrows
1,128 units to the 45 with tracks the app can measure; GET narrows it to the 71 with a bucket
or a blade. Offering the whole fleet and refusing once a machine is chosen wasted the choice,
and on a list that long it was a real hunt.

**Where there is no photograph the frame is drawn**, with the same eleven numbers over it, so
the screen is the same screen either way. The drawing follows the model too: the chain is a
belt around real wheels, so an elevated sprocket comes out as the triangle it is; the lower
rollers are the model's own count; and the bigger of the idler and sprocket rides higher so
the bottom run stays flat, the way the machine stands on it.

**The report keeps the drawing.** It is printed, often in grey, and it has to carry the
colour of every point — which is why the frame is drawn as parts rather than pictured.

Artwork lives in `mobile/machine/uc/` and `mobile/machine/get/` — WebP, about 20 KB each,
900 KB for the fleet — and is named per model in
[`mobile/machine-photos.js`](mobile/machine-photos.js) and [`mobile/get.js`](mobile/get.js).
Keys are the model as the register writes it; matching ignores case and punctuation and
aliases resolve both ways.

### Upload speed

Photographs are the whole cost of an upload; everything else in a round is about ten
kilobytes. Three things happen to make them cheap, and none of them asks anyone anything.

**Photographs are shrunk as they are taken**, not as they are sent. A phone hands the app
3–5 MB of twelve-megapixel JPEG; it is re-encoded to 1600 px on the spot, while the
inspector is still standing at the machine and the phone has nothing else to do, and only
the small one is ever stored. Measured on a five-photograph round: **13.9× fewer bytes on
the wire**, and the same reduction in what the phone has to hold. By the time sync runs
there is nothing left to compress — it is pure network.

1600 px is not a compromise. The report prints 420 px thumbnails and the dashboard's
viewer fits a browser window, so it is four times more than anything in the system ever
displays, and it still resolves fuzz from chips from flakes on a magnetic plug.
**Medium — 1600 px** is the default. *Large — 2000 px* and *Original* stay in ⚙ for a
photograph that is evidence in a warranty claim or a failure investigation. Signatures and
the JSON sidecar are never resized.

**The sidecar goes up first.** It is the whole round — findings, severities, actions, who
and when — and it is small. Once it lands the dashboard has the inspection and the team's
due list is correct, even if the photographs are still climbing out over the next ten
minutes. It also goes on its own, which means the `{TYPE}/{UNIT}/{YYYY-MM-DD}` folder chain exists
before anything else arrives.

**Then three files at a time.** On a pit link a 200 KB photograph is a few hundred
milliseconds of transfer sitting behind a second or more of round-trip; sending them one
after another paid that latency once per file. Three in flight overlaps it.

**On a weak link the phone adjusts itself.** Where the browser reports a 2g connection,
photographs go to 1280 px and uploads drop back to one at a time — three in flight on a
saturated link only produces three timeouts. The ⚙ menu still shows the chosen setting,
so it never looks as though it changed itself because someone walked behind a dragline.

### First open, and what it costs

Everything above is about getting a round *out*. This is about getting the app *in* — the
one moment a phone is on a network it may not see again for a shift.

**249 KB to a usable screen, 1.4 MB for the whole app**, gzipped, as a host serves it.
The screen an inspector can start capturing on needs 16 files; the other 47 are machine
photographs and the tools that print a report, and they arrive behind it.

The rule that keeps it that way is **order, not absence**. The service worker fetches
everything eventually — that is the point of it, and it is why a report still prints in
the pit — but it fetches the files the app cannot start without *first*, one at a time,
and only then the optional 1.2 MB in parallel. A phone that loses signal halfway through
install has a working app and no photographs, which is recoverable. The other way round
is not.

The easy way to break that is a page-side warm-up. The PDF engine, the QR reader and the
QR writer are 228 KB between them and a round of measurements touches none of them, so
they are fetched on the tap that needs them and warmed in quietly afterwards. "Afterwards"
used to mean *once the browser looks idle*, which on a fresh install is about a second in —
putting the PDF engine on the same socket as the files the app cannot start without, at
the one moment the link is busiest. It now means *once the service worker is in control*,
by which point the same warm-up is a cache read and costs nothing. `audit3.cjs` checks the
ordering on the server's own request log, so it cannot drift back.

**Nothing on the first screen waits for a photograph.** The 29 undercarriage pictures and
18 tool pictures are cached by the worker and served from cache; where one is missing —
a model nobody has shot yet, or a genuine cache miss — the numbered map falls back to the
drawn frame rather than putting eleven numbers over a blank rectangle. On a GET round it
falls back to bare numbers instead, because a track frame under a missing bucket is not a
fallback, it is a wrong answer.

### How to take the reading

A wear figure is only worth the method behind it. Two inspectors measuring the same track
roller — one across the tread, one over the flange — produce numbers that trend against
each other and mean nothing; the roller appears to be growing. The reference tables say
what the limit is. Until now nothing said how the number was supposed to be taken, so the
method lived in whoever trained the inspector, which at 1,128 units and a rotating crew is
not a place to keep it.

Every measurement point in both rounds — nine on the undercarriage, twenty-two across the
bucket and the blade — now carries three things, in English and Russian, one tap under the
reference line:

- **Bring** — the tool. A caliper, a straightedge and depth rule, an ultrasonic gauge, a
  torque wrench. Not knowing before walking out is how a position comes back "no tool for
  it".
- **How to measure** — where exactly, and which way the number moves. Idler tread *grows*
  as it wears; link pitch must be taken over the same four links every round or the trend
  invents stretch that is not there; UT through packed dirt reads thick.
- **What to look at** — the finding beside the number. A cracked lip weld, a seized carrier
  sawing into the link rail above it, a missing tooth already in the load and heading for
  the crusher. The round asks for a millimetre; this is what else is in front of you while
  you are down there with a torch.

It is collapsed by default and the choice is remembered, so an inspector on their hundredth
roller does not read three paragraphs between the reference and the millimetre box, and one
on their first has it a tap away rather than in a folder in the ute.

The method lives in `mobile/inspect-guide.js` and the limits do not — those stay in
`wear.js` (per model, from the supplier's charts) and `get.js` (generic until the supplier's
figures arrive). `guide.cjs` fails the sweep if a millimetre figure appears in the method
file, because a limit in two places is a limit that drifts.

### Photographs the phone already has

**Add photo** and **Video** each ask where the file comes from — take one now, or choose one
already on the phone. Both answers are offered every time, and neither is hidden behind the
other.

That is deliberate. Attaching a photograph the phone already holds is not an exception to be
tucked away: it is what happens whenever somebody shot the machine before they could get the
app open, which on a bad signal is most shifts. The whole mechanism is one attribute — the
camera inputs carry `capture="environment"`, so the phone skips its picker and opens the
lens; the gallery input does not, so the phone offers its library. The picker is narrowed to
what was asked for, so choosing a photograph does not open a library full of clips.

Several at once, so a position photographed five times is five taps shorter. Everything
picked goes down the same path as something captured here: photographs shrunk to 1600 px on
the way in, because a 12-megapixel frame out of the gallery is the same four megabytes on
the link otherwise; clips through the same one-minute check the record button uses, from the
same piece of code, because a second copy of that rule is a copy that forgets.

**Ten photographs per component, and one video clip.** Per component, not per machine — a
magnetic-plug round is four positions, an undercarriage round thirty-six, and each has its
own strip. Ten because a cracked bucket lip is not one photograph: it is the crack, the
crack with a rule beside it, both ends of it, the weld it runs into, and one from far enough
back that the office can tell which bucket it is. Four ran out on exactly the findings that
most needed the evidence, and a limit that bites hardest on the worst defects is the wrong
limit. It is a ceiling, not a target — nobody photographs a sound roller ten times.

The printed report prints **all** of them: the first big as the establishing shot, the rest
in a strip that wraps three to a row. It used to print four and end in a "+6" badge, which
was the same failure in a different place — the badge appeared on the positions with the
most photographs, which are the positions where something is wrong.

Where more is picked than will fit, what fitted is kept and the phone says how many were
not. Silently dropping two of five is how an inspector comes to believe evidence is in the
record when it is not.

### A link that keeps dying

The uploader used to have no memory of what had already arrived. Every attempt rebuilt the
whole round and sent it from the first file, so a link that dropped part way through spent
the next attempt re-sending what was already in Drive.

Measured, six photographs, link dropping after the fourth file: **eleven uploads to deliver
seven files**. That is the mild case. The severe one is a link that dies after two or three
files every time — then the round *never completes at all*, because each attempt exhausts
itself re-sending the sidecar and the first photograph. Measured on the old code: four
attempts, eight uploads, two distinct files delivered, and the round still marked unsent.
From the yard that is indistinguishable from a slow upload, and no amount of waiting fixes
it.

Each destination now remembers the file names it has taken, written as they land — including
on the way out of a failure — and saved with the record in the write that was already
happening. The next attempt sends only what is missing. Same test: **seven uploads for seven
files, nothing sent twice**, and a round survives a link that never lasts more than two files
at a time.

The list is keyed to the revision and thrown away when the round completes. An edited round
re-sends in full, which is right — the file behind a name may not be the file that name meant
last time.

### Why is uploading slow?

⚙ has a second button next to **Test connection**. That one answers whether the endpoint is
wired up. This one answers why a round crawls, which is a different question and the one
nobody at the mine could answer from the yard.

Four causes look identical to an inspector watching a progress bar, and they have opposite
fixes:

| What is actually wrong | What fixes it | What does nothing |
|---|---|---|
| The endpoint is slow per request | Fewer, larger requests | Smaller photographs |
| The link or VPN is slow for everything | Fewer bytes | Changing endpoint |
| Bandwidth is thin | Smaller photographs, dropping base64 | Batching |
| Nothing — it is already healthy | — | Everything |

The method is two probes of different sizes to the same place. Time is overhead plus bytes
over rate; measure at two sizes and both terms fall out, which one number never gives you. A
high overhead with a healthy rate means round trips are the enemy. A low overhead with a poor
rate means bytes are.

The control is the app's own host, which is not Google. **If Google is slow and the app's own
host is fine, that is interference with Google specifically, and no amount of shrinking
photographs will help.** That single comparison is the point of the screen.

Both probes go as `{op:"ping"}`, which the Apps Script answers without writing anything — the
padding rides along and is discarded. So this works against a deployment nobody has touched:
no redeploy, no new endpoint, nothing for IT to approve. It ends with a plain-language verdict
and a **Copy this for IT** button, because the person who can act on the numbers is not the
one holding the phone.

Where a destination does not answer, the reason is the diagnosis, so it survives to the
screen. "Cannot be reached" covering both *the network refused to carry this* and *the server
answered, and said no* is not a reading anybody can act on — the first is a blocked route and
the second is a misconfigured deployment, and they have nothing in common. So the screen
distinguishes four kinds of nothing, each with its own verdict:

- **Refused** — the browser would not make the request. A firewall, the VPN, or a wrong URL.
- **Answered with an error** — HTTP 403 and the like. The connection is fine, the setup is not.
- **Swallowed** — the request goes out and nothing ever comes back. Throttling, or a route
  that drops it silently. Smaller photographs will not help.
- **Everything unreachable, including the app's own host** — the phone is not really online.
  Move and try again before reading anything into it.

Only the Apps Script destination is timed. It is the one with a request that costs a round
trip and writes nothing (`{op:"ping"}`). A Power Automate flow or a plain POST endpoint has
no such thing — send it a ping and it rejects a body it does not recognise, which is the
endpoint working correctly and would be reported as the endpoint being broken. Those are
skipped, and the screen says why, because a measurement that invents a fault is worse than
no measurement.

The verdict judges the round first and the cause second. An earlier version was a chain of
absolute cutoffs — overhead over four seconds, rate under sixty kilobytes — and it called a
link **healthy** that was taking seven seconds a photograph, because no single term crossed
its line alone: 3806 ms of overhead came back fine for being under 4000. A threshold that
says nothing is wrong when a round takes half a minute is worse than no verdict at all,
because it sends the reader away certain. So the question is now *is a photograph slow*, and
only then *which half of it* — by share, not by a number somebody picked. The split is on
screen either way: **waiting** against **sending**, because they have different fixes.

### Several files in one request

The measurement said 56% of a photograph was spent waiting, so that is what got attacked.

Every file used to be its own Apps Script invocation: a round trip, a script start, a
redirect, then three Drive operations inside it. The script now takes a batch and resolves
the folder chain once for the whole thing rather than once per file. Ten photographs: **thirty
folder lookups became three, and eleven requests became four.** Shrinking the photograph could
not have touched any of it.

Four files a batch, not forty. A batch that fails costs its whole contents a retry, and on a
link that drops this often that has to stay small — four is about thirteen seconds on the link
the mine actually has, well inside the timeout.

**Nothing has to move together.** The phone asks the endpoint once whether it takes batches
and remembers the answer; a deployment that predates this says nothing about batches and that
phone keeps sending one file at a time. A phone that updates before somebody redeploys the
script is not a phone that stops working, and there is nothing to configure either side. If a
batch is ever refused in a way that says the script is older than it claimed, the phone sends
that batch as singles there and then and never asks again.

Each file in a batch still succeeds or fails on its own. The phone marks off what landed by
the name it asked for — not the name Drive used, which differs when another phone already owns
it — so a half-delivered batch re-sends only the half that is missing.

### How to measure it, drawn

The GET round now carries a drawing per position, the way the undercarriage round already
did. The photograph on the map shows what the part looks like; the drawing says the thing a
photograph cannot — where to put the tool, which face is the datum, and which number to
write down.

The same four things every time, so reading one teaches you all twenty-two:

| | |
|---|---|
| **dashed grey** | the profile when it was new — what has been lost |
| **solid** | what is left |
| **red** | the dimension to record, with extension lines to the faces it runs between |
| **blue** | the tool, sitting where it should sit |

Two positions are pass-or-fail rather than a number — retainer pins and edge bolts — and
those are drawn as the two answers side by side, seated against standing proud, with a tick
and a cross. No dimension, because there is nothing to measure.

**Both languages are generated separately, not translated at render time.** Russian strings
run about half as long again as the English, so a layout that fits one is exactly the layout
that overlaps in the other — and it would overlap on the phones of the people who need it
most. `figtext.cjs` lays out all forty-four in a real browser and measures every label: none
may sit on another, none may be struck through by a tick or a centreline, none may hang off
the frame, and none may fall below nine pixels at the width the panel actually gives it. It
found three genuine collisions and one Russian label running off the edge, which is the
whole reason it exists rather than a set of eyeballed drawings.

It also checks every `var()` resolves to a colour the app defines. An undefined variable is
not a slightly wrong colour — the browser throws the whole declaration away — and that is how
the green tick and the crack's end marks came to be invisible on a screen nobody had looked
at closely enough. Same failure as `--bad`, found the same way.

The undercarriage set now runs on the same generator. It gained a header naming the point and
the tool, a Russian set generated separately from the English one, and — the reason it needed
doing at all — working arrowheads.

**Every measurement arrow on all nine drawings had been rendering black.** The marker fills
live in `<defs>`, not in the stylesheet, so the token substitution never reached them; they
named a variable the app does not define, the fill was invalid, and it fell back to black. On
the dark theme that is a red dimension arrow you cannot see, on the one screen whose whole job
is to say which number to write down. Third instance of that same failure in a day, and the
reason `figtext.cjs` now checks every `var()` in both sets against the palette.

Two more it caught: a caliper jaw resting on the roller flange — the exact mistake the label
beside it exists to warn against — and plain leader lines drawn in the dimension colour, which
says "this is a measurement" about something that is a note.

`figtext.cjs` covers both sets: 31 drawings, 62 layouts. It also had a bug of its own worth
recording — it measured with `getBBox()`, which reports coordinates in each element's *own*
user space, so a header outside a translated group and artwork inside one were compared in
different frames and a clean layout was reported as a collision. Screen-space rectangles are
the only honest way to ask whether two things overlap on a screen.
