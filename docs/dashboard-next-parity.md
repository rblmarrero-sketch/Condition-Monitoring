# dashboard-next parity tracking

Purpose: an honest, checkable record of where `dashboard-next/index.html` (the
Stage-N redesign candidate) diverges from `dashboard/index.html` (the live
production office dashboard), so nobody has to re-derive this from scratch
before a cutover is considered. Nothing has been deactivated. This is prep
work only — see CLAUDE.md's "Branch and deployment" section: every push to
`claude/magnetic-plug-dashboard-llv4wc` is live immediately, so a wrong
inventory here is exactly the kind of thing that costs someone a bad decision
later.

**Status: NOT ready for cutover — 7 of 9 known gaps open (2 closed).**
Of the 7 open: 1 is a real functional regression worth a product decision
(conflict-resolution detail), 1 is a test-coverage gap (dashboard-next has
no presence in the standard regression sweep), 4 are test-currency gaps
(app behavior verified correct by direct code read; the shared parity test
itself hasn't been updated for an intentional, verified redesign), and 1 is
a shared pre-existing weakness surfaced — not caused — by a test's design.

Method: every one of the 27 `tests/*-next.cjs` parity suites was re-run
against the current branch tip (`d4ca80c` at the time of this pass, prior to
this doc's own commit), plus direct code reading in both files wherever a
test failed, to tell an actual functional difference apart from a test that
simply hasn't caught up with an intentional, verified-correct redesign. No
app code was changed in this pass — inventory only, per the brief that asked
for it.

---

## Open gaps

- [ ] **Conflict resolution panel shows round-level summary, not per-position
  detail** — `dashboard-next/index.html`, `renderConflict()` (~line 13473),
  backed by `cfRoundFields()`/`CF_CARD_ROWS` (~line 13441-13471). **Kind:
  regression (deliberate, but consequential).** **Severity: medium — the one
  finding in this whole pass with real office-decision impact.**
  Detail: `dashboard/index.html`'s conflict card calls `cfDiffHTML(cfDiff(...))`
  (~line 11334) to show the reviewer exactly which POSITIONS two rival
  inspection copies disagree on — grade, defect, cause, per finding.
  `dashboard-next`'s Stage-6 redesign (matched to `Conflict.dc.html`'s
  "Phone A / Phone B" mockup) replaced that with four fixed, ROUND-level
  summary fields per device card: worst grade, SMU, that worst finding's own
  comment, and total photo count. The code's own comment is explicit about
  the resulting gap: *"A round where two DIFFERENT positions each hold the
  more severe grade can therefore agree on the Grade row while genuinely
  differing elsewhere."* `cfDiff`/`cfDiffHTML` (the real per-position
  comparison) are untouched in the codebase and still callable — they are
  simply not wired into the new card markup. Confirmed via
  `tests/conflict-next.cjs`'s own failure: *"the same findings are named in
  the comparison on both pages — A has 1A/4D/3C: true,true,true; B:
  false,false,false."*
  Why it matters: this panel exists for exactly the highest-stakes moment —
  two field inspectors genuinely disagreeing about a machine's condition —
  not the common case of one phone's repeated saves. A reviewer picking a
  version from the new summary card could miss a real disagreement on a
  lower-severity position (different defect, cause, or action) that the old
  panel would have shown in red.
  Needs a product decision before cutover: is the mockup's 4-field summary
  an accepted trade-off, or does the itemized per-position view need to be
  restored (e.g. as an expandable detail under each summary card, reusing
  the untouched `cfDiff`/`cfDiffHTML` functions)? Not fixed here per the
  brief's own instruction to inventory, not patch.

- [ ] **dashboard-next has zero coverage in the standard regression sweep** —
  `tests/runall.sh`. **Kind: test-coverage gap.** **Severity: high, as a
  precondition for cutover confidence (not a functional bug in the app
  itself).**
  Confirmed by direct search: `grep -o "[a-zA-Z0-9_-]*-next\.cjs"
  tests/runall.sh` returns nothing. None of the 27 `tests/*-next.cjs` files
  are in `runall.sh`'s suite list, and there is no separate `runall`-style
  orchestrator for them — each must be run individually, by hand, with no
  single command exercising all of them together the way `bash
  tests/runall.sh` does for `mobile/`+`dashboard/`. This means: every time
  something lands on `mobile/index.html`, `mobile/report-core.js`, or the
  shared `drive.js`/`sync-adapter.js`/`report.js` (all of which
  `dashboard-next/index.html` also loads by reference), the ~150-suite sweep
  that gates every push to this branch says nothing about whether
  dashboard-next still works. The only reason this pass caught the six
  items below is that a maintainer asked for a feature-diff by hand.
  Before cutover: either fold the `-next` suites into `runall.sh` (or a
  sibling script `runall-next.sh` that CI/the push discipline also runs),
  or explicitly accept and document that dashboard-next ships without the
  same regression net dashboard/ has.

---

## Test-currency gaps (app behavior verified correct by direct code read; the
shared parity test itself checks for elements/text an intentional redesign
replaced, and needs updating — not an app fix)

- [ ] **`tests/sync-next.cjs` — Sync tab KPI tile set (4 FAILs)** —
  `dashboard-next/index.html`, `renderSync()` (~line 20219-20258).
  **Kind: not-yet-reconciled test.** **Severity: cosmetic.**
  `dashboard-next` intentionally reduced the Sync tab from six KPI tiles to
  the four `SYNC.DC.HTML` mockup specifies (Grade review / Conflicts /
  Waiting on media / Critical waiting), dropping `syRecs` ("Inspections
  loaded") and `syMedia` ("Field photos received") from the tile row per an
  explicit comment (~line 20240-20250). Verified the two dropped figures are
  NOT lost: `RECS.length` still renders via `#srcText`/`sy_r_total`
  (~line 14000, 20070), and the quarantine count via `#sy_h_held`/`s.quar.length`
  in the reconciliation panel below the tiles (~line 20322). Separately,
  `openEdit()`'s edit-sheet title reads `"Edit inspection: {u}"` in
  dashboard-next (~line 12452, matched to `EditRound.dc.html`) versus
  dashboard/'s `"{unit} · {type} · {date}"` (~line 10394) — but the round
  type, date and grade are shown in the adjacent `#edSub` subtitle
  (~line 12454), not dropped. Needs: `tests/sync-next.cjs` updated to check
  the new 4-tile set and to compare `edTitle`+`edSub` together rather than
  `edTitle` alone.

- [ ] **`tests/followup-next.cjs` — direct-cause readback (crashes on
  `#follDirect`)** — `dashboard-next/index.html`, `openFollow()`
  (~line 11928-11951). **Kind: not-yet-reconciled test (net improvement, if
  anything).** **Severity: none — arguably ahead of dashboard/.**
  `dashboard/index.html` shows the direct cause as read-only text,
  `#follDirect` (~line 9933: `[it.cause, it.causeCode].filter(Boolean)`).
  `dashboard-next` replaces it with an EDITABLE select, `#follCause`
  (~line 11945-11951), sourced from the same coded vocabulary every other
  cause picker in the app already uses (`CAUSE_BY`/`HME.directCauses`) — so
  a supervisor can correct the direct cause from this dialog rather than
  only read it. The existing value is preserved on open (`causeKeyOf(it)`),
  with a `data-legacy` fallback for a value outside the current vocabulary
  so nothing is silently dropped. Separately, the fixed 5-slot "why" chain
  became a dynamic, addable list starting at one field (`follWhysState`,
  ~line 11916-11926) per its own mockup — also a deliberate UX change, not a
  loss (a why can still be added as many times as needed). Needs:
  `tests/followup-next.cjs` updated to check `#follCause`'s value instead of
  `#follDirect`'s text, and to not assume exactly 5 why-inputs render by
  default.

- [ ] **`tests/missingphotos-next.cjs` — orphan-photo assignment buttons
  (crashes on `#opGeneral`)** — `dashboard-next/index.html`,
  `renderOrphan()` (starts ~line 13106; the per-row markup discussed below
  is ~line 13184-13253). **Kind:
  not-yet-reconciled test.** **Severity: cosmetic (real workflow change
  worth a training note, not a functional loss).**
  `dashboard/index.html` uses a bulk model: select photos via checkboxes,
  pick ONE shared point from a dropdown, then press `#opAssign` or
  `#opGeneral`. Neither button exists in `dashboard-next` at all. Per
  `AssignPhotos.dc.html`'s own mockup (comment ~line 13185-13190), each
  photo row now carries its OWN "Shows point" select that assigns itself the
  instant it changes (staged into `opDraft`, ~line 13210, 13251), with
  "Keep as general evidence" folded in as that same select's own blank
  option (~line 13212). A single `#opSaveAll` button (~line 13342) commits
  every staged row at once; the checkbox is repurposed for the one thing
  that stayed genuinely bulk — `#opExclude`, "Exclude selected from report"
  (~line 13365). The full write path exists and is wired; this is a more
  granular interaction model (one point per photo, not one shared point per
  bulk selection), not a dropped capability. Needs: `tests/
  missingphotos-next.cjs` rewritten for the new per-row select + Save-all
  flow instead of the retired `#opAssign`/`#opGeneral` buttons.

- [ ] **`tests/reports-next.cjs` — Recent reports panel (crashes on
  `#rRecent`)** — `dashboard-next/index.html`, `renderRecentReports()`
  (~line 16150-16182). **Kind: not-yet-reconciled test.** **Severity:
  none — dashboard-next's version is strictly more capable.**
  `dashboard/index.html`'s "Recent reports" is a plain `<ul id="rRecent">`.
  `dashboard-next` replaced it with a sortable, searchable table,
  `#rRecentTbl` (markup ~line 4672), with its own search box (`#rRecentQ`),
  a "{n} kept, newest first" hint (`#rRecentHint`), and a shown-count
  footer (`#rRecentShown`) — same underlying `recentReports()` data source,
  richer presentation. Needs: `tests/reports-next.cjs` updated to read
  `#rRecentTbl` instead of the retired `#rRecent`.

---

## Shared pre-existing weakness, surfaced (not caused) by a test's design

- [ ] **`tests/tablekit-scale-next.cjs` — crashes with "Execution context
  was destroyed, most likely because of a navigation"** —
  shared `busy()`/`look()` self-update gate, present in BOTH
  `dashboard/index.html` (~line 18402-18446) and `dashboard-next/index.html`
  (~line 21173-21249). **Kind: shared, pre-existing gap in both dashboards'
  own update-safety check, made far more likely to fire during a
  dashboard-next test because of a second, separate, also-pre-existing
  condition.** **Severity: low-but-real.**
  This suite loads ~4,200 records and drives filter typing and sort-header
  clicks across four tabs with no mock of `mobile/sw.js` (unlike
  `tests/equipment-panel-next.cjs`, which learned to mock it — see below).
  Against the REAL, unmocked `mobile/sw.js`, `dashboard-next`'s own `?v=`
  tags are a snapshot (still `482` as of this pass) that lag the mainline's
  constantly-bumped `BUILD` (`486` as of this pass) — a gap that is
  currently always true by this project's own explicit design ("this
  branch's own tag is not kept in lockstep"). `look()` finds "newer" at
  ~4s after load and reloads the instant `busy()` returns false — and a
  plain `th.sortable` click, or the gap between two keystrokes in a filter
  box, holds no element focus and satisfies none of `busy()`'s checks
  (`.ov`, `#pxPanel`, `#lb`, `#drw`, `fleetAll`, `CMB` popups, or a
  currently-focused input/select/textarea). `dashboard/index.html` carries
  the IDENTICAL gap in its own `busy()`, but almost never hits it in
  practice because its own `?v=` tags ARE kept in lockstep with `BUILD` by
  the mandatory "bump.cjs" discipline — so `look()` essentially never finds
  "newer" during a normal dashboard/ session or test. dashboard-next's own
  design choice (deliberately NOT bumping its tag) makes this shared gap
  far more likely to actually fire on that page specifically.
  Real-world read: an office worker on dashboard-next, mid-filter or
  mid-sort on a large table with no dialog open, could have the page
  silently reload out from under them — no data loss (these tabs hold no
  unsaved form state), but a jarring, unexplained reset of scroll position
  and filter/sort state. This is the same defect CLASS this project has
  already fixed five times over for other overlays (see "Closed gaps"
  below) — a sort-header click or an idle filter box is simply a sixth
  case `busy()` doesn't yet recognize as "the reader is doing something."
  Needs: either extend `busy()` on both files to also treat "a table body
  the reader is actively filtering/sorting" as busy (harder — there is no
  persistent DOM signal for that today, unlike a dialog's own hidden
  class), or accept the current, already-small real-world risk and instead
  fix the TEST (mock `mobile/sw.js` here the way `equipment-panel-next.cjs`
  already does, so the suite stops being at the mercy of live BUILD drift).

---

## Confirmed NOT gaps (investigated and cleared; recorded so nobody re-opens
the question)

- **`tests/equipment-panel-next.cjs`** — this test does not fail or hang. It
  deliberately reboots the page 7 times, each with a ~9.5s settle window (to
  let the self-update timer arm and prove it's correctly held off by
  `busy()`), plus two screenshot captures. Total real runtime is
  ~110-130 seconds. Every earlier "Terminated"/no-output result in this and
  the prior session's pass was simply a test timeout set too short (90-100s).
  Confirmed: `timeout 180 node tests/equipment-panel-next.cjs` → **all 20
  assertions pass.** No code or test change needed — only a longer timeout
  when re-running it by hand.

---

## Every tab, checked

| Tab | Suite(s) | Result |
|---|---|---|
| Overview / Fleet | `overview-next.cjs`, `data-window-next.cjs`, `period-filter-next.cjs`, `detail-next.cjs`* | Pass (*detail-next's 2 fails are the sync-next-style title/subtitle split, see below) |
| Data & Sync | `sync-next.cjs`*, `conflict-next.cjs`*, `datasources-next.cjs`, `missingphotos-next.cjs`*, `assignphotos-next.cjs` | Pass except the two `*` items logged above |
| Inspection Schedule (Due) | `due-next.cjs` | All pass |
| Lubrication | `lube-next.cjs` | All pass |
| Plan vs Actual | `plan-next.cjs` | All pass |
| Defects Raised | `defects-next.cjs`, `cmwo`-tab coverage via same suite | All pass |
| Maintenance Actions register | `actions-next.cjs`, `followup-next.cjs`*, `disposition-next.cjs` | Pass except followup-next (logged above); disposition-next fixed this session (see Closed gaps) |
| Equipment History | `history-next.cjs`, `equipment-panel-next.cjs`, `editround-next.cjs`, `photoeditor-next.cjs` | All pass (equipment-panel-next needs a longer timeout, see above — not a real failure) |
| Wear & life | `wear-next.cjs`, `detail-next.cjs`* | Pass except detail-next (below) |
| Failure Analysis | `failure-next.cjs` | All pass |
| Report generation | `reports-next.cjs`* | Fails on retired `#rRecent`, logged above — generation itself (`CMReport.sectionsFor`, shared `report-core.js`) is untouched and shared code, not duplicated |
| Nav shell / cross-cutting | `nav-shell-next.cjs`, `tablekit-next.cjs`, `tablekit-scale-next.cjs`* | Pass except tablekit-scale-next (logged above) |

`detail-next.cjs`'s 2 fails (drawer title `"TK905 · 4D · 2026-09-14"` vs
`"4D"`, and body content reordered around a new "Key finding" summary lead-in)
are the same shape as sync-next's edit-title split: presentation reorganized
per mockup, the same facts (finding, cause, WO, priority, SMU, inspector) all
still present, just relocated — not logged as its own row above to avoid
double-counting the identical pattern, but the test needs the same kind of
update (compare full rendered content, not one element in isolation).

---

## Closed gaps

- [x] busy() auto-update guard did not recognize the disposition dialog
  (`#dispBox`) as "reader is mid-decision" — fixed 2026-09-30 in BOTH
  `dashboard/index.html` and `dashboard-next/index.html`, commit `9390b99`.
  Proven by `tests/dispreload.cjs` (both files, plus a control proving the
  reload still fires when genuinely idle).
- [x] `mobile/index.html`'s `DEVICE` id silently churned on every reload
  when `localStorage` failed to persist, manufacturing false "sent by two
  phones" conflicts on the dashboard's own conflict banner — fixed
  2026-09-30, commit `9390b99` (wording corrected in `522352e`). Proven by
  `tests/deviceid.cjs`. (Mobile-only; listed here because it was the
  live-backend symptom that started this whole investigation.)

---

## How to re-run this inventory

```
for f in tests/*-next.cjs; do echo "=== $f ==="; timeout 180 node "$f"; done
```

`equipment-panel-next.cjs` genuinely needs the full 180s; everything else
finishes in under 30s. None of these are in `tests/runall.sh` (see the open
gap above) — this loop is the closest thing to a full dashboard-next sweep
that exists today.
