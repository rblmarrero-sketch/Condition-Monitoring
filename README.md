# Condition Monitoring — NHL TR60 Dump Trucks

An interactive condition-monitoring dashboard for the mine's haul-truck fleet.
Select an equipment unit and see the **full history** of its inspections, with
grade, hours, comments, and the actual inspection **photos**.

The first component is live; the others are stubbed in the UI and will be added
the same way:

| Component | Status |
|-----------|--------|
| **Magnetic Plug** | ✅ Live |
| Filter Cut | 🔜 Planned |
| Oil Analysis | 🔜 Planned |
| Temperature | 🔜 Planned |

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

**Grades are optional.** Either click a photo and pick `A/B/C/D` in the app
(remembered in your browser), or put the grade in the file name
(`4C_C.jpg` or `TK146_4C_2026-10-15_C.jpg`).

### Recording readings, grades & comments (no Excel)

Each photo card has type-in fields, filled in straight on the dashboard:

- **Grade** (`A/B/C/D/X`) — click to set the plug's condition.
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

## Grade / severity colours — please confirm

The workbook records a letter **Grade** (`Степень`) per plug position. This file
had mostly `C` and a few `X`. Because the workbook has no legend, the dashboard
ships with an **assumed** scale:

| Grade | Assumed meaning | Colour |
|-------|-----------------|--------|
| A | Good | green |
| B | Watch | yellow |
| C | Serious | orange |
| D | Critical | red |
| X | Not inspected | grey |

> ⚠️ **This mapping is a placeholder.** Confirm it against your inspection
> standard and edit the `GRADE_SCALE` object near the top of
> `dashboard/index.html` (one place, clearly commented). Set
> `GRADE_ASSUMPTION = false` there to hide the on-screen warning once confirmed.
> The raw grade letter is always shown, so colour is never the only signal.

---

## Repository layout

```
Condition-Monitoring/
├── dashboard/
│   └── index.html              # the dashboard (open this)
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
