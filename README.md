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
30 days). Tap a unit to load it into the form. It is built from what that phone has
recorded — use **Load history file** with an `entries.json` exported from the dashboard to
seed last-done dates for the whole fleet.

### Two inspectors, one round (multi-device merge)

Each phone has a device id. Tap **⇄ Send round** to export that phone's records (photos
and video inlined) and **📥 Receive round** on the other phone to merge them. Records are
keyed `TYPE|UNIT|DATE`, so the same unit inspected on both phones merges into one record
instead of doubling: missing items are added, the richer capture wins on a clash, and both
inspectors' names are kept.

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
supervisor signatures come from the folder opened with **📂 Photo folder** — open it before
generating if you want them included.

The temperature limits are shared with the app (`mobile/temp-limits.js`), so a reading is
judged identically on the phone and in the report.

---

## Auto-upload (phone → SharePoint / server)

The Field Capture app can upload photos, video and inspection data automatically
whenever it is open and online — no manual Share/Export.

Open **⚙** in the app and set the upload mode, URL and optional secret header:

| Mode | Sends | Use when |
|---|---|---|
| Power Automate (JSON + base64) | `{name, folder, contentType, file}` | **Recommended** — Power Automate / Logic Apps into SharePoint (syncs to N:) |
| Plain HTTPS POST (multipart) | `file`, `name`, `folder` | Your own server endpoint (needs CORS) |
| Off | — | Manual export only |

Failed uploads are retried; nothing is deleted from the phone until the server
confirms. Step-by-step Power Automate instructions (you can set it up yourself,
no IT ticket to trial it): **[docs/AUTO_UPLOAD_SETUP.md](docs/AUTO_UPLOAD_SETUP.md)**.
