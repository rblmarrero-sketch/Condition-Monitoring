# Condition Monitoring — NHL TR60 Dump Trucks

An interactive condition-monitoring dashboard for the mine's haul-truck fleet.
Select an equipment unit and see the **full history** of its inspections, with
grade, hours, comments, and the actual inspection **photos**.

Four inspection types are live; Oil Analysis will be added the same way:

| Component | Status |
|-----------|--------|
| **Magnetic Plug** | ✅ Live |
| **Filter Cut** | ✅ Live |
| **Inspection** (walk-around) | ✅ Live |
| **Temperature** | ✅ Live |
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

**Grades are optional.** Either click a photo and pick `A/B/C/X` in the app
(remembered in your browser), or put the grade in the file name
(`4C_C.jpg` or `TK146_4C_2026-10-15_C.jpg`).

### Recording readings, grades & comments (no Excel)

Each photo card has type-in fields, filled in straight on the dashboard:

- **Grade** (`A/B/C/X`, X worst) — click to set the plug's condition.
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
same in both: a grade C must not look like a different grade because of the time of day.

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

### A Critical finding has to say what is wrong

Saving will not finish while any position marked **Critical** — grade X, or a severity
raised to Critical by hand — has no defect or no recommended action. The app jumps to that
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

### Two inspectors, one round (multi-device merge)

Each phone has a device id. Tap **⇄ Send round** to export that phone's records (photos
and video inlined) and **📥 Receive round** on the other phone to merge them. Records are
keyed `TYPE|UNIT|DATE`, so the same unit inspected on both phones merges into one record
instead of doubling: missing items are added, the richer capture wins on a clash, and both
inspectors' names are kept.

---

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
Drive**; **Test connection** checks the deployment without pulling anything. Photos are
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
| **Delete** | Sidecar, photos, signature and corrections to Drive's **trash** (30 days), logged with who and why. Off unless `ADMIN_SECRET` is set in the Apps Script. |

Corrections are stored as their own files in `_meta/`, never written into the inspection's
sidecar — the phone that captured it still holds that record and re-syncing overwrites the
sidecar, so a correction stored there would disappear silently. The clients merge the
marker over the record at read time; the original readings, photos and signature are never
altered, and the change is visible as "corrected" with the author and timestamp.

Voids reach the phones too: a withdrawn round drops out of the phones' **System** screen and stops
counting as done in the due list, so nobody skips a unit on the strength of a round the
office has retracted.

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

Pages are laid out as real A4 boxes and flowed block by block, so a table row is never
sliced in half and a section heading never strands at the foot of a page. Photos and
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

The **Folder** field in ⚙ takes placeholders and creates sub-folders as needed, so each
inspection type gets its own: `{TYPE}/{YYYY-MM}` produces `MP/2026-07/`, `FC/2026-07/`,
`TEMP/2026-07/`, `INSP/2026-07/`. Also available: `{TYPENAME}` (the readable name),
`{UNIT}`, and `{YYYY} {MM} {DD}`. Date parts come from the **inspection** date, not from
today, so a round entered late still files under the month it was done. Each destination
has its own folder setting.

`{TYPE}/{YYYY-MM}` is the shipped default, so a new phone splits by type with no setup.
Phones still on the earlier `{YYYY-MM}` default — one folder for all four types — are
upgraded once, automatically; a folder you typed yourself is left alone. Files already in
Drive are not moved, so the split starts from the next upload.

A destination that is failing no longer holds up one that is working: upload state is
tracked per destination, so with SharePoint down every record still reaches Drive, and
nothing is ever re-sent to a destination that already has it.

### Upload speed

**Photo size on upload** (⚙ in the app) is the biggest lever, whichever route you use:
*Original* keeps every pixel the camera captured (3–5 MB a photo); *Medium — 1600 px*
sends a fraction of that and still resolves plug debris clearly. Use Original when a
photo is evidence for a warranty claim or failure investigation. Signatures and the JSON
sidecar are never resized.
