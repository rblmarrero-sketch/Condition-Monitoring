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

### Rebuilding the defect taxonomy

`mobile/taxonomy2.js` (the defect / direct-cause list the app and dashboard both read) is
generated, not hand-edited:

```
Defect_type.xls (1C CMMS)  ─┐
mobile/taxonomy.js (HME)   ─┼─▶ ingest/build_defect_taxonomy.py ─▶ mobile/taxonomy2.js
ingest/tags.py  ingest/iso.py ─┘
```

```bash
pip install xlrd                                            # one-time
python ingest/build_defect_taxonomy.py --check              # writes nothing, reports drift
python ingest/build_defect_taxonomy.py path/to/Defect_type.xls
```

`tags.py` holds the applicability tags (which failure modes make sense for which component)
plus the DT9–DT15 extensions that close gaps the 1C list has no code for. `iso.py` holds
ISO 14224 Table B.2 mechanisms and Table B.6 failure modes, and the per-defect mapping.
Run `--check` after editing any of them — it re-derives the file and tells you whether the
shipped copy is still in sync.

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
│   ├── taxonomy2.js            # merged 1C + HME defect/cause taxonomy, ISO 14224 aligned
│   ├── assets.js  components.js# asset register + L7/L8/L9 component templates
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

With Google Drive configured, the **In the system** card lists every inspection the team
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
| **Void** | Withdraws the round from every count, chart, action list and report, with a reason. Nothing is deleted; **Show voided** brings it back into view, and **Un-void** reverses it. |
| **Delete** | Sidecar, photos, signature and corrections to Drive's **trash** (30 days), logged with who and why. Off unless `ADMIN_SECRET` is set in the Apps Script. |

Corrections are stored as their own files in `_meta/`, never written into the inspection's
sidecar — the phone that captured it still holds that record and re-syncing overwrites the
sidecar, so a correction stored there would disappear silently. The clients merge the
marker over the record at read time; the original readings, photos and signature are never
altered, and the change is visible as "corrected" with the author and timestamp.

Voids reach the phones too: a withdrawn round drops out of **In the system** and stops
counting as done in the due list, so nobody skips a unit on the strength of a round the
office has retracted.

> Prefer Void to Delete. Inspection photos are evidence for warranty claims and failure
> investigations. Delete is for test records and mistakes that should never have existed —
> and it needs a password that is deliberately **not** the one the phones carry, because
> the upload URL is effectively public.

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
