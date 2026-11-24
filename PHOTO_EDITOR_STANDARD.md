# PHOTO_EDITOR_STANDARD.md — Master Technical Specification: Industrial HME Shared Photo Editor

This specification defines the universal `<hme-photo-editor>` Web Component, its UI/UX structure, interactive features, unified state/schema contract, and downstream export requirements across all five reliability reporting modules:
1. **Failure Investigation Report (FIR)**
2. **Root Cause Analysis (RCA)**
3. **Non-Conformance Report (NCR)**
4. **Asset Currently Down Comments & Notes**
5. **Condition Monitoring (CM) Web Dashboards** (`/opt/cm-dash-src/dashboard/` & `/opt/cm-dash-src/dashboard-next/`)

---

## 1. Architectural Mandate & Web Component Structure

All five modules must interface with photo editing via the standardized `<hme-photo-editor>` Web Component.
- **Encapsulated Scope:** Shadow DOM (or scoped DOM context) protects core tool behaviors, keyboard accelerators, and industrial UI themes from host stylesheet bleed.
- **Modern Industrial Aesthetic:** Dark/slate palette (`#1E2227`, `#282C34`), crisp typography (`IBM Plex Sans`, `IBM Plex Mono`), high-contrast boundaries, and **Signal-Amber** (`#E5A93C` / `#FFA000`) for active, focused, or flagged states.

### Component Layout
1. **Top Bar:**
   - `Undo` & `Redo`: Standard 50-step non-destructive history stack (`Ctrl+Z`, `Ctrl+Shift+Z`).
   - `Before / after`: Hold-to-preview or split-slider compare against the original raw asset.
   - `Keys`: Modal showing full keyboard shortcuts.
   - `Reset`: Returns workspace to the original unedited state with confirmation.
   - `Cancel`: Discards uncommitted workspace changes.
   - `Save as new version`: Exports flattened image + JSON recipe and closes the modal.
2. **Left Toolbar (Tool Groups):**
   - **VIEW:** Select/Move, Pan (`Space` drag).
   - **FRAME:** Crop (presets: Full, Freeform, 1:1, 4:3, 16:9), Rotate Left (90°), Rotate Right (90°), Flip Horizontal, Flip Vertical.
   - **MARK:** Circle/Ring, Box/Rectangle, Arrow (snap-to-angle), Line, Pen (freehand bezier), Highlight (semi-transparent overlay), Eraser.
   - **LABEL:** Text Label (editable inline), Callout Box (pointer + text), Number Badge (auto-incrementing `1`, `2`, `3`...), Industrial Icons (warning triangle, crack indicator, leak droplet, bolt/fastener, wear gauge).
   - **MEASURE:** Calibrated Line/Scale (mm/inch with set reference scale), Angle (°), Diameter (Ø).
3. **Right Panel (`CHECK & SUGGEST`):**
   - Context-aware automated checks based on the component type (e.g. Gear, Bearing, Hydraulic Cylinder, Structural Frame).
   - Replaces generic/hardcoded "Gear / teeth" checks with relevant inspection rules (e.g., spalling, pitting, leakage, fatigue cracking).
   - Fast 1-click actions: `Magnify`, `Auto-Frame`, `Add Callout`, `Generate Caption`.
4. **Bottom `PHOTOS` Strip (Multi-Photo Pool):**
   - Supports a multi-photo staging pool per event/record.
   - Multi-photo upload and drop support.
   - Selective Report Inclusion: Toggles/checkboxes per photo to select which appear in the final report (e.g., FIR up to 6+ images).
   - Dynamic counter: Live `Selected: X / 6` indicator.
   - Drag-or-arrow reordering to sequence images for report layout.
   - Editable Title & Caption fields for each item, eliminating raw cryptographic/hash file names.

---

## 2. Interactive Features & Extended Capabilities

### 2.1 Interactive Magnification & Close-Up Swap
- **Magnification Lens:** Dynamic zoom lens/callout placing an enlarged detail view (adjustable 1.5x–5x) directly on the image with an anchor line to the target region.
- **1-Click Close-Up Photo Swap:** Allows the user to map a *separate* high-resolution macro/close-up photo (from the bottom pool or local disk) into the magnification lens or callout box.
- **1-Click Revert:** Returns the callout back to a zoomed crop of the primary image.

### 2.2 Collage Builder & Custom Placement
- **Layouts Supported:**
  1. **2 Photos Up/Down (Vertical Stack):** Ideal for vertical components or before/after repairs.
  2. **2 Photos Side-by-Side (Horizontal):** Direct lateral comparison.
  3. **Main + Inset Callout:** Wide primary photo with an inset box highlighting the micro-defect.
  4. **2x2 & Multi-Photo Grids:** Symmetrical 4-block grid with synchronized aspect ratios.
- **Controls:** Adjustable gutter/gap spacing, divider line toggle, and unified single-block insertion into the reporting canvas.

---

## 3. Universal Save/Load Contract & Metadata Schema

The editor must NEVER rely purely on unflattened metadata or expect exporters to replicate browser CSS transformations.

### 3.1 Flattened High-DPI Output
When the user clicks `Save as new version`, `<hme-photo-editor>` renders the canvas to an explicit, high-resolution flattened image (`image/jpeg` or `image/png`, min 300 DPI equivalent / standard viewport scale 2.0x):
- All crops, straightens, rotations, and flips are permanently applied.
- All vector marks, badges, callouts, arrows, and magnification insets are baked directly into the pixel buffer.
- The resulting `Blob` is sent to the backend/storage.

### 3.2 Standardized JSON Recipe (`photoDocument:2`)
A JSON metadata object is persisted alongside the flattened image for future non-destructive re-editing:
```json
{
  "version": 2,
  "schema": "photoDocument:2",
  "originalUrl": "/path/to/raw_photo.jpg",
  "flattenedUrl": "/path/to/edited_photo_flat.jpg",
  "aspectRatio": 1.3333,
  "dimensions": { "width": 1600, "height": 1200 },
  "transform": {
    "crop": { "x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8, "ratio": "4:3" },
    "rotate": 90,
    "flipH": false,
    "flipV": false
  },
  "layers": [
    { "type": "arrow", "x1": 200, "y1": 300, "x2": 450, "y2": 500, "color": "#FFA000", "width": 4 },
    { "type": "callout", "x": 450, "y": 500, "text": "Excessive flank spalling", "size": 14 }
  ],
  "magnifier": {
    "enabled": true,
    "source": "separate_photo",
    "photoUrl": "/path/to/macro_photo.jpg",
    "target": { "x": 0.5, "y": 0.4 },
    "placement": { "x": 0.8, "y": 0.2, "radius": 80 },
    "zoom": 2.5
  },
  "reportInclusion": true,
  "caption": "Primary drive gear spalling on tooth #14",
  "title": "Drive Gear Tooth Spalling"
}
```

---

## 4. Downstream Export & Aspect Ratio Rules

To eliminate the photo cutoff and edge-clipping issues present in PR #838, all Word and PDF generators must adhere to the following rules:

### 4.1 Word (.docx) Exporters (`fir_docx.py`, `ncr_docx.py`)
- **No Forced Center-Crop:** Exporters MUST NOT apply hardcoded aspect-ratio calculations or crop windows (e.g. `<a:srcRect>`) that assume a fixed horizontal shape.
- **Intrinsic Ratio Preservation:** The exporter must read the actual pixel dimensions of the flattened image (from the JPEG header) and scale the frame container to fit the photo's intrinsic aspect ratio (`width / height`) within max page-width / cell-height boundaries:
  ```python
  # CORRECT IMPLEMENTATION:
  r = img_w / img_h
  if r >= 1.0:
      cx = max_cell_w
      cy = int(cx / r)
  else:
      cy = max_cell_h
      cx = int(cy * r)
  ```
- **Flattened Image Priority:** Exporters must always load the pre-flattened WYSIWYG image file, ensuring that all annotations, callouts, and collages render identically to the screen preview.

### 4.2 PDF Exporters (`fir_pdf.cjs`, Playwright pipelines)
- The print layout CSS MUST NOT use `object-fit: cover` with fixed-height containers on edited photos.
- Containers must use `object-fit: contain` or dynamic height (`height: auto; max-height: ...`) to respect the intrinsic canvas aspect ratio without clipping.
- Do not render unflattened DOM overlay elements in print views; always reference the flattened canvas output.

---

## 5. Module Integration Compliance

All 5 modules must consume this standard identically:
1. **FIR:** Supports multi-photo strip (up to 6+ images selected), individual photo captions/titles, and zero-clipping Word/PDF export.
2. **RCA:** Integrates with 5-Why and timeline evidence cards, utilizing the magnifier and close-up swap for fracture-surface reviews.
3. **NCR:** Supports side-by-side or stacked Before/After collages for non-conformance rectification evidence.
4. **Asset Down:** Enables quick markup and auto-captioning directly within asset down shift notes and supervisor handovers.
5. **CM Dashboards:** Standardizes classic and next-gen dashboards on `<hme-photo-editor>`, maintaining strict lockstep synchronization.
