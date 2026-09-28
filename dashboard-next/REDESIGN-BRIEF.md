# Condition Monitoring Dashboard: Redesign Brief for Claude Code

Repo: `rblmarrero-sketch/Condition-Monitoring` (commit inspected: `b46c277`)
Design reference: the interactive "Overview (redesign)" artboard on the Design canvas (grade tiles, act-first table, correction drawer, per-row sync state).

## 1. Goal

Make `dashboard/index.html` clean, calm and readable for two audiences, without touching how data moves between the phone and the office.

- **Maintenance team:** see what to fix first, and correct a round in two taps.
- **Management:** see condition, compliance and open actions in five seconds.
- **Reliability engineer:** every parameter that can be corrected from the office is editable, and the phone shows the correction after its next sync.

## 2. Findings from the code (what constrains the redesign)

1. **The sync layer is already a clean seam.** `dashboard/sync-adapter.js` exposes `pull / push / live / label` and picks Drive or REST. The dashboard reads only through it. Nothing in this brief changes it.
2. **Corrections are markers, not edits to the original.** The office writes `_meta/<round-id>.edit.json`. `mobile/edits.js` (`CMEdits.apply`, `CMEdits.latest`) is loaded by both the phone and the dashboard, so both surfaces apply corrections with one rule. Last write wins per key.
3. **Editable fields already exist** (grade 1-5, target date, responsibility, defect cause, deferral reason and `until`, work-order link, round-level `smu`/`by`/`sup`/GPS, move to another unit/date/type, remove a position, photo placement, void). The redesign exposes them better. It does not invent new ones.
4. **The repo has hard release rules** (from `CLAUDE.md`):
   - `BUILD` must be bumped in `mobile/sw.js`, `mobile/index.html` and `dashboard/index.html` (about 59 `?v=` stamps) or phones never receive the change.
   - Run `node tests/ver.cjs` and `node tests/bump.cjs` before every push.
   - Backend changes (`docs/yandex/function.js`) are not live on push and need the VM deploy block.
   - `tests/updatesafe.cjs` fails on `.unregister()` or `caches.delete(`.
5. **`dashboard/index.html` is a single 1.2 MB file** that loads `mobile/report-core.js` and other shared scripts. Report and PDF output depend on shared code, so a full rewrite would change print output.

## 3. Recommendation: reskin, do not rebuild

Change presentation only. Keep the data layer frozen.

| Layer | Action |
|---|---|
| `dashboard/sync-adapter.js`, `dashboard/drive.js` | Do not edit |
| `mobile/edits.js`, `mobile/normalize.js`, `mobile/report-core.js` | Do not edit (shared with the phone) |
| Marker format `_meta/<round-id>.edit.json` | Do not change fields or names |
| `dashboard/index.html` markup, CSS, view code | Redesign |
| `dashboard/report.js` | Do not edit (print output unchanged) |

Why not a from-scratch rebuild "without Claude Code": the repo has roughly 300 tests that encode past failures (photo dedupe, tombstones, stale service worker, list/agenda disagreement). A parallel rebuild would skip them and could silently disagree with the phone. The redesign should run inside this repo, against its test suite.

## 4. Information architecture

The dashboard has 11 tabs today. Group them in the sidebar; keep every route id. Route names stay the same, so links such as `#overview?sev=4` and `?b=480` keep working.

- **Monitor:** Overview, Failure Analysis, Wear & Remaining Life
- **Act:** Maintenance Actions, Inspection Schedule, Plan vs Actual, Defects raised
- **Assets:** Equipment History, Lubrication
- **System:** Data & Sync, Reports

"Fleet dashboard" is the site subtitle under the brand, not a tab. An earlier mockup treated it as a tab and it has been removed from the canvas. A fleet-by-class summary would be a new feature, not part of this reskin.

Global chrome on every screen (top bar): search, a data-source chip that opens the Data sources dialog, theme toggle, EN / RU switch, build number.

Rule: the URL hash and query parameters are a public contract. Do not rename or reorder them.

## 5. Screen specs (Overview first)

1. **Header:** title, one-line purpose, Definitions link, Generate report.
2. **Filter bar:** Grade, Type, Class, Period, "Show voided", "Clear all", and a count ("n of N inspections"). When the page opens with `sev=4`, show a visible chip so the filter is never hidden.
3. **Six tiles:** Critical equipment (5), Severe equipment (4), Degraded equipment (3), Overdue inspections, Open maintenance actions, Unassigned actions. Each has its number, label and a plain-language cue. Color is never the only signal.
4. **Trend and compliance:** stacked monthly condition chart (grades 2 to 5); inspection compliance bar; "Severity mix" buttons that filter the table.
5. **Equipment requiring attention:** highest grade first, then longest overdue. Columns: Machine, Priority (grade chip), Finding, Action owner, Due, Sync. Machine ID is a real button that opens the Edit inspection drawer.
6. **Edit inspection drawer (right side).** Use the real fields, in this order: Your name; The round itself (Unit, Date, Round type, Hour meter, and "why the round is being re-filed" when any of those change); Condition (grade 1 to 5, each with its one-line meaning); WO / notification; 1C priority; Recommendation; Defect; Direct cause; Comment; Note on this inspection. A collapsed "Withdraw or destroy this inspection" section holds Void and Delete permanently; delete asks for the admin password and the unit number. Buttons: Cancel, Save correction. Saving writes one correction marker through the existing path.
7. Responsibility and target date belong to the follow-up plan (`FollowUp.dc.html`), not to this drawer.

Every other tab follows the same frame: header, filter bar or segmented "Show" filter, KPI tiles, then one main table. See section 13 for the full screen list and section 16 for the coverage matrix.

## 6. Editing rules (must match existing behavior)

- In the follow-up plan, choosing a grade proposes the target date and responsibility (the phone's `targetAuto` behaviour): 3 gets the next service interval and Maintenance Supervisor; 4 gets 7 days and Maintenance Superintendent; 5 gets tomorrow and Maintenance Superintendent. These are defaults only.
- A date the user typed by hand is never overwritten by a later grade change.
- `gradeAuto` (proposed from a defect) can be cleared automatically. `gradeMan` (typed by a person) is never touched.
- Every save carries `by`, `at` and `reason`. A blank field means "unchanged"; clearing a value means writing `""` explicitly.
- The original inspection record is never modified. Only the marker is written.
- Setting a round to Grade 5 from a lower grade needs a second explicit confirmation (section 12) before the marker is written.

## 7. Sync-state display (this is how the team trusts the screen)

Each row and each drawer shows one of:

- **Synced:** the marker is written and confirmed.
- **Pending sync:** saved locally, not yet confirmed.
- **Needs attention:** the write failed or the round has a conflict.

Show this only from real adapter results (`push` result `accepted / stale / errors` on REST; the confirm listing on Drive). Never show "Synced" optimistically. On a failed or partial write, treat the batch as failed and keep the edit visible for retry. `CLAUDE.md` states that a partly failed batch is a failed batch.

## 8. Visual system

- Warm neutral ground `#F4F2ED`, panels `#FBFAF7`, ink `#1B1F23`, muted text `#5A6169`.
- Accent `#1F5C7A`. Grade scale is the one in `mobile/grade.js`: 1 Normal, 2 Incipient, 3 Degraded, 4 Severe, 5 Critical (ISO 14224 map: 1 NOF, 2 INC, 3 DEG, 4 DEG, 5 CRI). Use the production hex ramp for bars and dots (5 `#c8232c`, 4 `#d9511f`, 3 `#ec835a`, 2 `#fab219`, 1 `#0a7134`). Chips use a light tint with the darker text ramp so text passes 4.5:1 (tints: 5 `#F6D6D8`, 4 `#F8DDD1`, 3 `#FBE3D8`, 2 `#FDF0CC`, 1 `#E1F0E6`). Always show grade number and name on every chip.
- Type: IBM Plex Sans for text, IBM Plex Mono for numbers, machine IDs and dates.
- Touch targets at least 44px. Body text at least 14px. Contrast at least 4.5:1.
- Report and print styles keep their existing minimums (labels no lighter than `#5b6670`, nothing under 8.5px). Do not restyle print.

## 9. Implementation plan for Claude Code

Do it in slices. After each slice run the checks in section 10 and commit.

1. **Tokens:** add CSS variables (colors, type, spacing) at the top of `dashboard/index.html`. No markup change yet.
2. **Navigation:** regroup the sidebar. Keep every route id and hash.
3. **Overview:** rebuild the Overview view to section 5, reading the same stores it reads today.
4. **Correction drawer:** replace the current edit panel UI, calling the existing marker-writing function. Do not add a second write path.
5. **Sync state:** add the per-row indicator from real adapter results.
6. **Other tabs:** apply tokens and table styles to Action register, Due & missed, Plan vs Actual, Defects raised, Lubrication.
7. **Bump `BUILD` and run the suite.**

## 10. Acceptance checks

- `node tests/ver.cjs` and `node tests/bump.cjs` pass; `BUILD` bumped everywhere.
- Existing dashboard tests pass: `dash.cjs`, `dashui.cjs`, `dashdue.cjs`, `dashrpt.cjs`, `edit.cjs`, `edit5.cjs`, `edall.cjs`, `edgrade.cjs`, `officesign.cjs`, `parity.cjs`, `sync-writeback-race.cjs`, `syncops.cjs`, `urlstate.cjs`, `tabsa11y.cjs`.
- Phone/office parity: a grade set in the drawer appears in the phone history after sync (`tests/parity.cjs`, `tests/edgrade.cjs`).
- `#overview?sev=4` and `?b=480` open the same view and filters as before.
- PDF/report output is byte-comparable in layout to the previous build (`rptall.cjs`, `pagecut.cjs`).
- No change to `sync-adapter.js`, `drive.js`, `edits.js`, `normalize.js`, `report-core.js` (verify with `git diff --stat`).
- Keyboard: every control reachable by Tab, icon buttons have `aria-label`.

## 11. Out of scope

Backend changes, new marker fields, phone UI changes, report layout. If a new editable field is wanted, it needs a marker field, a `CMEdits.apply` rule and phone support in the same change. Treat that as a separate task.

## 12. Decisions from the reliability team (final)

1. **Visibility:** management and engineers both see everything, including every correction. No role-based hiding of views or corrections. Build no permission layer.
2. **Grade 5 confirmation:** setting a round to Grade 5 (Critical) from a lower grade needs a second, explicit confirmation before the marker is written. The mockup shows this in the correction drawer (red confirm block with "Go back" and "Confirm Grade 5"). Lowering from 5, or editing a round that is already 5, does not need it.
3. **Language:** the dashboard screen itself must work in English and Russian, not only the reports. See section 14.

## 13. Mockup inventory (Design canvas)

The canvas holds 24 screens, dialogs and drawers, plus 7 shared components. Every screen is 1440 px wide with the grouped sidebar and top bar. Links between screens work in Play.

| Screen | File | What it shows |
|---|---|---|
| Overview | `Main.dc.html` | Filters, 6 tiles, trend, compliance, severity mix, attention table, Edit inspection drawer with grade-5 confirmation and per-row sync state |
| Overview (RU) | `OverviewRU.dc.html` | Same screen in Russian, the language reference |
| Failure Analysis | `Failure.dc.html` | Filters, Pareto of failure modes, direct causes, ISO 14224 mechanism classes, affected equipment |
| Wear & Remaining Life | `Wear.dc.html` | 6 tiles, Show filter, measured positions table with life left and reason when no life can be projected |
| Maintenance Actions | `Actions.dc.html` | 6 tiles, closed-out progress, Show and View filters, bulk apply bar, action register |
| Inspection Schedule | `Due.dc.html` | 4 tiles, 9-way Show filter, Round filter, rounds by due date, Start / Defer |
| Plan vs Actual | `Plan.dc.html` | 6 tiles, 1C plan date and round filters, Open/Completed/All, CM coverage, two-week grid, plan vs actual table |
| Defects raised | `Defects.dc.html` | 1C defect work orders, by-person filter, status filter, planned-services toggle |
| Equipment History | `History.dc.html` | Machine search, List / Photos view, inspection cards with Report and Edit, position cards with band status |
| Lubrication | `Lube.dc.html` | Programme coverage, deciding the standard, 2027 shelf, not on the sheet, machine reference with Save / Undo / Export |
| Lubrication matrix | `LubeMatrix.dc.html` | Fleet matrix and shop posters (whole fleet, one model, one asset class; fit; print) |
| Data & Sync | `Sync.dc.html` | Grade review, conflicts, media waiting, corrections needed, evidence waiting, admin diagnostics, device activity, what the dashboard cannot check |
| Reports | `Reports.dc.html` | Scope (5 kinds), language (EN / RU / EN + RU), photos, quality (Standard / High / Small file), appendix, provisional vs controlled final, recent reports |
| Dialog: Data sources | `DataSources.dc.html` | Google Drive, Server, folder on this PC, import a file, clear imported data |
| Dialog: Follow-up plan | `FollowUp.dc.html` | Responsible, due, status, action; why it happened; root cause; corrective and preventive |
| Dialog: Defer | `Defer.dc.html` | Reason, own reason, review date, deferred by, cancel the deferral |
| Dialog: No action required | `Disposition.dc.html` | Reason and approver |
| Dialog: Conflict | `Conflict.dc.html` | Two phones' versions side by side, "Use this one" |
| Dialog: Photo editor | `PhotoEditor.dc.html` | Rotate, straighten, zoom, crop, ring and arrow marks, caption, include or exclude, remove from record, delete file |
| Drawer: Position detail | `Detail.dc.html` | Gallery, key finding, location, readings, comment, Report, Edit, photo actions |
| Drawer: Edit inspection (full) | `EditRound.dc.html` | Every editable thing on a round: see section 17 |
| Dialog: Assign photographs | `AssignPhotos.dc.html` | Photos that arrived with no component: assign, keep as general evidence, or exclude with a reason |
| Dialog: Missing photo files | `MissingPhotos.dc.html` | Expected photos that have not reached the dashboard, with Check again |

Shared components: `Nav`, `TopBar`, `Head`, `Tile`, `Seg` (segmented filter), `FilterBar`, `DataTable` (chips: g1 to g5, ok, warn, bad, info, neutral).

Placeholders: every machine name, finding, date and number is a placeholder such as `[Unit A]` or `00`. Real values come from the existing stores. Chart shapes are illustrative only.

Not verified against the code: the wording and exact options inside the dialogs and Lubrication, Data & Sync and Reports screens were taken from the dashboard's text dictionary and page structure, not from running the app. Claude Code should compare each against the live tab before building.

## 14. Russian on the dashboard

- Every visible string needs an EN and an RU form, switched by the EN / RU control in the top bar. The choice is remembered per browser.
- The dashboard already has this: `dashboard/index.html` carries an EN / RU dictionary of about 377 `data-i18n` keys (prefixes such as `ov_`, `ed_`, `sy_`, `lg_`, `lm_`). Reuse those keys and their Russian text. Do not fork a second glossary. Also check `mobile/terms.js`, `tests/lang.cjs`, `tests/rptlang.cjs`, `tests/terms.cjs`.
- Russian grade names in the dictionary: 1 Норма, 2 Зарождающийся, 3 Ухудшение, 4 Серьёзно, 5 Критическое. Where the mockup's Russian differs from the dictionary, the dictionary wins. Have a native speaker on the team check the maintenance wording before release.
- Layout must survive Russian text, which runs about 15 to 25 percent longer. Do not fix widths on chips, buttons or table headers. Tile tags in `OverviewRU.dc.html` are still tight; allow them to wrap.
- Reports keep their existing language setting (EN, RU, EN + RU). The dashboard language does not change report output unless the user picks it in Reports.

## 15. Handing this to Claude Code

1. Give Claude Code this brief and the canvas link. It can read each screen's source from the canvas files (`project/*.dc.html`).
2. Tell it to start by reading `CLAUDE.md` in the repo and to follow section 9, one slice per commit.
3. The `.dc.html` files are design references, not code to paste. The dashboard stays a single `dashboard/index.html`; translate the markup, tokens and behavior into it.

## 16. Coverage of the original (what was checked)

Checked against the cloned repo's `dashboard/index.html` structure and `mobile/grade.js`:

- **All 11 tabs** are in the canvas with their real names, tiles, filters and tables.
- **Edit inspection** uses the real fields, with the grade-5 confirmation added as decided.
- **Dialogs:** Data sources, Follow-up plan, Defer, No action required, Conflict, Photo editor, Position detail.
- **Global chrome:** search, data-source chip, theme, EN / RU, build.
- **Removed:** the invented Fleet dashboard tab.

Not in the canvas, so Claude Code must keep them as they are: the Definitions dialogs' text, the Columns picker on Maintenance Actions, the print/report layout, the Lubrication programme's inner tables beyond the outline shown, and the Data & Sync diagnostics detail. These are represented by a labelled panel, not designed in full.

## 17. The 1C feed, round editing and photographs

Read from the repo's `CLAUDE.md`, `.github/workflows/refresh-work-orders.yml`, `ingest/ingest_work_orders.py` and the dashboard's text dictionary. Not run against live data.

**1C work orders are the base of the inspection plan.**
- 1C's `WO.xlsx` reaches the repo through the AS_KPI pipeline. `ingest/ingest_work_orders.py` turns it into `data/work_orders.js` (dashboard) and `data/schedule_slim.json` (phones).
- An hourly GitHub workflow runs the pull. GitHub's schedule is best effort, so `server.js` on the VM also watches the export's headers and starts the workflow as soon as they change (needs `WO_GH_TOKEN` in `cm.env`).
- The dashboard re-reads the file every 10 minutes and when the tab comes back into view, and swaps it in only when 1C's own `generated` stamp has moved. Phones do the same on a 10-minute timer with a 15-minute freshness gate.
- The refresh job deliberately does not bump `BUILD`. The redesign must not add caching that breaks this.
- The FTP step sits upstream of this repo (the office quote in `CLAUDE.md` says the file "has been updated in FTP every hour"). I could not see that step from the repo, so confirm with whoever runs the AS_KPI pipeline.
- Screens that must show freshness: Plan vs Actual ("Pulled from 1C [time]", "Refresh now", and the late-pull warning), Defects raised, Inspection Schedule, and a new "1C work-order feed" panel in Data & Sync. The panel also shows how each defect's date and cause were sourced, so a stopped or wrong-column feed is visible.
- A round stores the 1C order stamp as it was on the day. It is read-only in the editor and must not change when 1C's schedule moves.

**Editing a round** (`EditRound.dc.html`; the Overview drawer links to it). Every correction is a marker saved beside the inspection. The original, its photos and its readings are never altered.
- Round-level: your name (required); inspected by; verified by; hour meter; latitude and longitude (both or neither, with range checks).
- Re-file: change unit, date or round type, with a required reason. Refused if the target already exists, if the unit is not on the fleet list, or if the date is in the future. Shows "Re-filed from [key] by [name] on [date]" and can be put back.
- Per position: grade 1 to 5; a required reason to lower a grade; severity with an override reason when it differs from the grade's ISO mapping; recommendation; WO / notification; 1C priority; defect; direct cause; comment; component (point), where choosing an occupied point swaps the two; remove or keep a position (blocked while it holds photos); restore a removed position; retire a stale old condition when the grade is right. Positions with no finding are folded away behind a "show them" control, and a search narrows the list.
- Grade 5 from a lower grade needs the second confirmation decided in section 12.
- Void with a reason (reversible; leaves every count, chart, action list and report; nothing deleted). Delete permanently needs the admin password and typing the unit number; on Drive it goes to a 30-day trash, on the server there is no trash. Deletion is off until an admin sets the password, and the screen must say so. Bundled sample data cannot be deleted.
- Two phones sending the same round: the Conflict dialog picks the version reports use.
- Saved state must come from real adapter results: "Saved, sending…", "Saved", or "Not saved, the change has been undone".

**Photographs.**
- Add a photo or video to a position or to the machine, with your name recorded; a position has a maximum and says so when full.
- Move a photo to the machine (as a category such as overview, sides, tray or plate) or under a point.
- Photo editor: rotate, straighten, zoom, crop (full frame, freeform, 1:1, 4:3, 16:9), ring and arrow marks, caption, undo and redo, show original, reset to original. Edits are saved as a copy beside the original. If the original is still uploading, the edit waits.
- Use in the report: include or exclude; excluding needs a reason and the photo is marked "not in the report".
- Remove from the record: reason required, reversible, comes off every screen and report, file kept. Delete the file: reason and typed confirmation, permanent, logged.
- Assign photographs: photos that arrived with no component reference are assigned to a point, kept as general evidence, or excluded with a reason. Nothing is guessed.
- Missing photo files: a record names photos whose files have not arrived; readings and actions still count; "Check again" reports received and still missing. A corrupt or duplicated upload cannot be detected by the dashboard, and the screen says so.
- Equipment History has a Photos view; reports take photos as included, excluded or off, and at three qualities.

Not confirmed: whether the photo editor's mark-up and crop are stored as a flattened copy or as edit parameters. Check `dashboard/index.html` before changing how they are saved.


## 18. Audit and implementation record (2026-09-28)

**Correction to the mockup.** The mockup assumed a plain app. The live dashboard already had column filters on the action register, the fleet table, the due list, the plan table and the defects table, plus a paginator and no desktop sliders. The redesign therefore builds on those and does not replace them. Worth knowing before you compare the mockup with the real app.

**What was built (branch `redesign-2026-09`, BUILD 481, not live).**

- One shared table kit (`tkApply`, `tkHead`, `tkWire`). It filters (word-start match) and sorts (three states, numeric-aware, blanks last) over the whole row list before paging, so page two of a sorted list is the next rows in the sort and a filter finds a machine that sits on page nine.
- Converted to the kit, which gives a filter box over each column and a sort on each heading: failure "affected machines", the wear register, the coverage panel, the Due list (sort added), the sync lists, the lube scorecard, the two lube gap lists, and the equipment history (one shared filter and sort across every round's table, with the boxes over the first table only).
- Deliberate exception: the lube reference editor (`lrTbl`). It is an input form, and a filter would hide fields that are being edited.
- Worksheet look: rows about 28 px, hairline cell rules, tabular figures, zebra striping, header 11 px.
- Status is coloured text, not a chip: pills, tags, need, restate, void, edit, band, delta and nav badges all lose their background and padding. A new `--severe-ink` variable covers grade 4.
- No sliders on desktop: at 1280 and 1366 px no table scrolls sideways on any tab. The fortnight grid (15 day columns) is fixed-layout and wraps its captions. At tablet widths (under 1100 px) the old scroll behaviour is kept as a fallback, because tests require nothing to be cut off there.
- A filter box keeps its caret across a background redraw, for example a sync arriving mid-typing.
- Hover shows the full text of any cell that has been cut short.

**How it was checked.**

- New suites: `tablekit.cjs` (45 checks: filter, sort across pages, focus, no sliders, no chips, history and lube tables) and `tablekit-scale.cjs` (about 1,000 to 2,000 rounds).
- Regression subset of about 95 dashboard, sync, scale and perf suites, run five times. Snapshot screenshots were taken for all 11 tabs at 1600, 1366 and 1280 px, with zero page errors.
- About 87 further dashboard suites (history, photos, galleries, reports) were run once on the new build and once on the original.
- Suites that fail on the untouched original and are not caused by the redesign: `lubesync` (waits for network idle, which the sandbox blocks), `p1ui` and `phase3`/`phase6` (flaky), `orphanphoto` (2 checks), and `rptest` (timing).
- Five older contract checks were changed on purpose: two row-height checks (40 to 48 px became 26 to 52 px), two that count header cells or compare header text (now ignoring the filter row and the sort arrows), and one check that counted the lube scorecard's header cells.

**Scale finding (already in the original, not caused by the redesign).**

- Loading a folder into the dashboard rebuilds everything on each refresh. At about 2,100 rounds the page took about 16 s to become responsive again. This was measured while another test run was using the machine, so treat it as an upper bound. The original app measured the same, so the redesign did not cause it. At year volume (70 a day is about 25,000 rounds) this needs attention.
- Filter and sort stay quick at scale, at about 50 to 140 ms per click at 2,000 rounds.
- Recommendation for 30 users and 70 inspections a day: window the dashboard to the last 90 days by default, with an explicit "all time" load.
