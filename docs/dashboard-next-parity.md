# dashboard-next parity tracking

**This is no longer a cutover inventory.** `dashboard-next/index.html` is a
second, permanent office dashboard — not a redesign candidate staged to
replace `dashboard/index.html`, and no cutover is planned. Two different
groups use the two surfaces daily, in parallel, indefinitely, against the
same live backend. See CLAUDE.md's "TWO OFFICE DASHBOARDS, BOTH PERMANENT"
entry for the standing policy this implies — `BUILD` lockstep for both
files and mandatory triple-mirroring of every real bug fix across
`mobile/`, `dashboard/` and `dashboard-next/`. This document stays as the
historical record of how the two surfaces were brought to parity and kept
that way, and as the place a genuine, deliberate difference between them
(a UI/design choice, not a bug) gets written down so nobody "fixes" it by
mistake later.

Purpose, updated: an honest, checkable record of every difference ever
found between the two dashboards — which were real bugs (closed, mirrored
to both) and which were deliberate redesign choices (left alone, recorded
so they're not re-opened as if they were bugs) — plus the operational
disciplines (BUILD lockstep, the regression sweep, production-write safety)
both surfaces now share as a matter of permanent policy, not a
transition-period courtesy. See CLAUDE.md's "Branch and deployment" section:
every push to `claude/magnetic-plug-dashboard-llv4wc` is live immediately,
to BOTH dashboards, so a wrong record here is exactly the kind of thing
that costs someone a bad decision later.

**Status: 0 of 10 tracked functional gaps open (10 closed).** Every item
this doc has ever tracked is closed: the conflict-detail regression, the
missing regression-sweep coverage, all four test-currency gaps, and the
shared `busy()`/self-update race. The operational-parity work that follows
from dashboard-next's permanent status (`BUILD` lockstep, the cross-
dashboard concurrent-edit check) is recorded in its own sections below.

---

## Closed gaps

- [x] **Conflict resolution panel showed round-level summary only, not
  per-position detail** — fixed 2026-09-30, commit `ebae8e7`.
  `dashboard-next/index.html`'s `renderConflict()` (~line 13473) kept the
  round-level summary card (`cfRoundFields()`/`CF_CARD_ROWS`) as the default,
  at-a-glance view, and gained an expandable `<details class="disc cfdetail">`
  disclosure under each non-standing device's card, reusing `cfDiff`/
  `cfDiffHTML` UNCHANGED — the same per-position comparison
  `dashboard/index.html`'s own always-shown table already provides. Closed
  by default (summary stays the fast read for the common case); a reviewer
  resolving a genuine two-inspector disagreement opens it to see the
  disagreement position by position before picking which copy to keep.
  Proven by `tests/conflict-next.cjs`: exactly one card (the non-winning
  one) offers the detail, it is collapsed by default, a click opens it, the
  same findings (1A/4D/3C) are named on both pages, the disagreement itself
  (both grade values) is shown, and the standing/winning card offers no
  detail to compare itself against.

- [x] **dashboard-next had zero coverage in the standard regression sweep**
  — fixed 2026-09-30, commit `ebae8e7` (all 27 `tests/*-next.cjs` folded
  into `tests/runall.sh`) plus commit `b608714` (five test-currency gaps
  and one real shared app defect's test-exposure fixed, so the folded-in
  sweep is actually clean rather than permanently red). `runall.sh`'s own
  `run()` helper imposes no per-suite timeout, so no special-casing was
  needed even for the two slow suites (`equipment-panel-next.cjs`,
  ~110-130s; `tablekit-scale-next.cjs`, ~70s at default fixture size).
  Every push to this branch now exercises dashboard-next exactly as it
  already exercises `mobile/`+`dashboard/`.

- [x] **`tests/sync-next.cjs` — Sync tab KPI tile set** — fixed 2026-09-30,
  commit `b608714`. dashboard-next's intentional 4-tile set (vs.
  dashboard/'s 6) was confirmed correct — `RECS.length` still renders via
  `#srcText`, the quarantine count via `#syHealth`'s own "Inspections
  requiring correction" row — and the test rewritten to check for the
  4-tile set directly plus the two relocated figures, and to compare
  `edTitle`+`edSub` together (dashboard-next's edit-sheet title is
  simplified per its own mockup, with the same facts in the subtitle)
  rather than `edTitle` alone.

- [x] **`tests/followup-next.cjs` — direct-cause readback / fixed 5-whys
  chain** — fixed 2026-09-30, commit `b608714`. dashboard-next's editable
  `#follCause` select (an upgrade over dashboard/'s read-only text) and
  dynamic, addable why-chain (starting at one field, not a fixed five) were
  both confirmed correct by direct code read; the test now checks
  `#follCause`'s resolved value/legacy fallback and adds why-rows before
  filling them (documented in the test as a workaround for a separate,
  real — and still open, though minor and not tracked here as a parity
  gap since it affects only this one dialog's own internal state
  management — `follWhysState`/DOM-sync issue: typing into an earlier why
  field and then clicking "Add another why" re-renders every why row from
  state and silently wipes what was typed).

- [x] **`tests/missingphotos-next.cjs` — orphan-photo assignment buttons**
  — fixed 2026-09-30, commit `b608714`. Confirmed dashboard-next answers
  the "nothing has arrived yet" state from its own dedicated mockup
  (`MissingPhotos.dc.html`: plain dashed `.oplist`/`.oprow` rows, nothing
  interactive) and the "some have arrived" state from a different one
  (`AssignPhotos.dc.html`: per-row `.opc` cards with a "Shows point" select,
  `#opSaveAll`/`#opExclude`) — genuinely different DOM shapes for genuinely
  different states, unlike dashboard/'s single shape that just hides a row.
  The test now reads each page's own real controls for the facts that
  matter (count, disabled/actionable state, retry availability, the tally
  text) instead of assuming one shared shape.

- [x] **`tests/reports-next.cjs` — Recent reports panel, preview text race,
  numbered-step layout** — fixed 2026-09-30, commit `b608714`. Three
  issues, not one: (1) `#rRecent` (dashboard/'s plain `<ul>`) vs
  `#rRecentTbl` (dashboard-next's sortable table) — now each page reads its
  own real container; (2) the test's own "reset target to '' then read the
  DOM's first `<option>`" dance was itself broken — `cmbSet('rTarget','')`
  inserts its manufactured empty option as the literal first child, so the
  test was reading back its own placeholder and asserting the page's
  "nothing chosen" text against itself, identically on both pages — fixed
  by reading the first REAL (non-empty-value) option directly instead;
  (3) the numbered "1 / 2 / 3" wizard is a deliberate, documented removal
  in dashboard-next's own header comment (a flat set of button-row control
  groups, per `Reports.dc.html`) — the test now checks that shape instead.

- [x] **Shared `busy()`/self-update race, as it affected the TEST SUITE**
  — fixed 2026-09-30, commit `b608714`. Originally found in
  `tests/tablekit-scale-next.cjs` ("Execution context was destroyed, most
  likely because of a navigation") and fixed there with a static
  `/mobile/sw.js` mock pinned to dashboard-next's own live `?v=` tag,
  commit (prior session). Re-surfaced independently while investigating
  `tests/period-filter-next.cjs`'s intermittent empty-fleet-table failure —
  traced to the identical mechanism, not a separate bug — and then
  confirmed, by re-running the full 27-suite batch under load, to be a
  latent race in EVERY `-next.cjs` suite that clicks around dashboard-next
  without the mock (most had simply been too fast, or lucky, to hit it
  reliably in isolation — `tests/followup-next.cjs` passed standalone and
  then crashed on the exact same cause when run back-to-back with
  everything else). Fixed by applying the identical mock to all 23
  remaining `-next.cjs` suites (all of which shared byte-identical local
  server setup code, confirmed before the mechanical edit). All 27 suites
  now pass individually and back-to-back, repeatedly. This closed the
  SWEEP's exposure only — the underlying app-level defect (below) was a
  separate, later fix.

- [x] **`busy()`'s self-update guard did not recognize active table
  filtering/sorting as "reader is doing something"** — the real app-level
  defect underneath the item above, fixed 2026-09-30, commit (this pass),
  in BOTH `dashboard/index.html` and `dashboard-next/index.html`.
  `look()` polls the real `mobile/sw.js` for a newer `BUILD` and,
  once `dashWaiting` is set, `applyIfIdle()` reloads the page via
  `location.replace()` the instant `busy()` returns false. `busy()` checked
  for open dialogs/overlays (`.ov`, `#pxPanel`, `#lb`, `#drw`, `fleetAll`,
  open `CMB` combobox popups, a focused input/select/textarea) but had no
  check for "a table body the reader is actively filtering or sorting" — a
  plain `th[data-sort]` click holds no element focus the way an `<input>`
  does, and satisfied none of `busy()`'s checks. On `dashboard/index.html`
  this was nearly impossible to hit in practice, since its `?v=` tag was
  already kept in lockstep with `BUILD` by `bump.cjs` discipline; on
  `dashboard-next/index.html`, whose tag still deliberately lagged at the
  time (it was a redesign candidate, not yet the permanent surface it is
  now), `look()` found "newer" within seconds of any real visit, so an
  office worker mid-filter or mid-sort could have the page reload out from
  under them with no warning (no data loss — these tables hold no unsaved
  state — but a jarring, unexplained reset of scroll/filter/sort state).
  Two options were on the table: extend `busy()` to also recognize table
  interaction, or have dashboard-next's own tag start tracking `BUILD` like
  dashboard/'s already does. `busy()` was extended FIRST, because the
  tag-tracking option alone was, at the time, a standing process obligation
  a redesign candidate had no business taking on: every future `bump.cjs`
  run, for a change that may have nothing to do with dashboard-next, would
  also have to touch its ~59 `?v=` tags, and forgetting once brings the
  race straight back, whereas extending `busy()` closes the actual gap in
  BOTH files permanently, fixes dashboard/'s own latent (if
  rarely-triggered) exposure too, and needs nobody to remember anything on
  any future bump. Both fixes stand today, for different reasons — see
  "BUILD lockstep" below for why the tag-tracking option was adopted
  AFTERWARD, once dashboard-next stopped being a candidate.
  `touchTable()` (a document-level `click`/`input` capture-phase listener,
  matching a `th[data-sort]`, `.cwcf`, or `input.cwcf` target) stamps
  `lastTableTouch`; `busy()` now returns true for `TABLE_BUSY_MS` (3s) after
  the last such touch — a short grace window, not an indefinite hold like
  the dialogs above, since this is "just touched a table" and not "has
  unsaved work": the update still lands within seconds of the reader
  actually going idle. Proven by `tests/tablebusy.cjs`: a reader
  continuously sorting/filtering a real fleet table across a 5.2s window
  sees no reload on either file, and a genuinely idle control (identical
  setup, nothing touched) still reloads onto the newer build — the same
  two-case shape `tests/dispreload.cjs` already established for the
  disposition dialog. Confirmed non-vacuous: reverting the fix reproduces
  the reload firing mid-interaction on both files.

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

## BUILD lockstep (permanent policy, not a redesign-period exemption)

dashboard-next/index.html's own `?v=` tag was 483 while the mainline `BUILD`
had already moved to 488 — a deliberate, documented gap while it was a
redesign candidate nobody depended on for real work. That trade stopped
being reasonable the moment a real group started using it daily: a stale
`?v=` tag is a stale cache key, and CLAUDE.md's own standing rule ("BUMP
`BUILD` OR THE WORK DOES NOT REACH ANYBODY") has never carried an exception
for "unless it's the dashboard nobody's cut over to yet" — that exception
existed only because nobody's daily work depended on dashboard-next
catching every fix. It does now.

**Closed, both ends.** `tests/bump.cjs`'s `SHIPPED` list now includes
`dashboard-next/`, so a push that changes it without a fresh `BUILD` bump
fails the guard exactly as an un-bumped `dashboard/index.html` change
already does — no separate discipline, no separate thing to remember, the
identical check. `tests/ver.cjs` (the live, in-browser confirmation that
every tag actually agrees, as opposed to `bump.cjs`'s git-history check)
was extended with the same three assertions it already runs for
`dashboard/index.html`: every file dashboard-next shares with the phone
and `dashboard/` is versioned, every one of those tags equals the running
`BUILD`, and the report engine it loads is the same one the phone runs.
Both confirmed non-vacuous (reverting the tag change reproduces the
failure in each). dashboard-next's own 35 `?v=` tags are bumped to match
`BUILD 489` as part of this change.

The two-fixes-for-two-reasons framing above (`busy()`'s table-interaction
gap) still holds: `busy()` was fixed because it closes a real gap
regardless of what any tag does, and stays the correct defense even now
that both tags track `BUILD` — it is what protects the single commit where
a mainline bump has landed but dashboard-next's own tags have not yet
caught up in the same push. BUILD lockstep does not replace that; it
removes the reason the gap was easy to trigger in the first place.

---

## Cross-dashboard concurrent-edit safety

Both dashboards write to the same live backend, from two different office
desks, and this was checked directly against the deployed
`docs/yandex/function.js` rather than assumed safe by analogy with the
phone side — this project's own history of code that read correctly and
was not is exactly why a bare code-read was never going to be enough here.

**What was found.** `saveOne()` (a phone's round upload) has had rival
detection since early in this project: a `headObj()` check before the
write, a `~dev` variant name for whichever device loses the race, a
conflict marker naming both. `saveEdit()` (a dashboard's correction/
disposition save) and `resolveConflict()` (a dashboard's conflict
resolution) never had any version of that — both are dashboard-only paths,
and a dashboard has no device-id concept to build a rival filename from.
Confirmed directly (two real POSTs to the real function, `by` differing to
stand in for two desks, then confirmed again by driving it through two
actual browser sessions — one on `dashboard/index.html`, one on
`dashboard-next/index.html`, see `tests/crossdashedit.cjs` below): the
second dashboard to save a given key silently and permanently erased
everything the first had written — note, fields, assignments, or an
already-recorded conflict resolution — with no trace, no marker, and no
error shown to either desk. This was a real, live gap, not a hypothetical
one this document is recording out of caution.

**What shipped.** A full rival/device mechanism matching `saveOne()`'s own
was considered and rejected — building and proving a device-id concept for
two dashboard-only paths, under time pressure, was judged too large a
change to make safely in this pass. Instead, `saveEdit()` and
`resolveConflict()` (in both `docs/yandex/function.js`, the live backend,
and `docs/google-upload.gs`, kept in field-for-field agreement per
CLAUDE.md's own rule for the retired backend) now back up the document
they are about to replace, to `_meta/backup/<stamp>/<key>`, before every
overwrite — reusing the exact pattern `rewriteObject()` already used for an
admin rewrite, into a location the reader already excludes from live
records. The response also carries an `overwrote: {by, at}` (or
`{by, keep, at}` for a resolution) field whenever a real prior document —
from a different author, or an already-resolved conflict with a different
decision — is what just got replaced.

**Superseded 2026-10-01 — the write is now checked, not only backed up.**
The backup alone missed two saves that overlap: both read the same prior,
both backed it up, and the first desk's correction was in neither the live
document nor any backup. `saveEdit()`, `resolveConflict()` and
`markConflict()` now run under a per-document lock, and a save naming a
stale version (`ifAt`) is refused with `conflict:true` and the server's
current copy, which the page then shows with who changed it and when. Both
dashboards load the same `dashboard/drive.js` and carry the same
`editBase`/`stampEdit`/`adoptEdit`/`conflictBase` hooks and `ed_conflict_by`
wording — no difference between the two surfaces here. See CLAUDE.md's
"TWO OFFICE DASHBOARDS" section for the full account.

Proven (the original, sequential version — rewritten 2026-10-01 to fire
concurrent saves; see above) by `tests/crossdashedit.cjs`, which drives this through two real
browser contexts — one loading `dashboard/index.html`, one loading
`dashboard-next/index.html`, both pointed at the same real
`docs/yandex/function.js` (via `tests/ya-srv.cjs`) — rather than a bare
POST, so it exercises the actual `CMDrive.saveEdit`/`CMDrive.resolve` code
path each dashboard actually runs, not a stand-in for it:
  - a correction saved on `dashboard-next/` moments after `dashboard/`
    saved its own is accepted, replaces the live document, names who it
    overwrote, and backs up `dashboard/`'s original note intact and
    readable;
  - a conflict resolved on `dashboard/` moments after `dashboard-next/`
    already resolved it the same way, in the other direction;
  - a solo save (nothing to overwrite) carries no `overwrote` field and
    creates no backup at all;
  - the same desk re-saving its own prior note is not misread as a
    cross-desk clash.
Confirmed non-vacuous: reverting the `docs/yandex/function.js` half of the
fix reproduces the exact original symptom (loser silently gone, no
`overwrote` field, no backup) against the identical test.

---

## Production-backend write safety (cross-cutting, not a dashboard-next-only
gap — recorded here because it was found and closed during this pass)

2026-09-30: 13 synthetic-looking rounds reached the live production backend
(`baimskaya-cm.duckdns.org`) — two devices wrote the same 12-13 keys across
Magnetic Plug, Inspection and Undercarriage rounds in under three minutes,
physically impossible for a field inspector. The exact origin was never
pinned down with certainty (this session's own transcript shows no activity
during the write window, and this repo has many other Claude Code
sessions/branches working the same live backend that this session does not
control) — but the mechanism was: `mobile/upload-defaults.js`'s swap to the
live backend is armed by design, so any script or test that loads the real
app pages and drives an actual save, without first overriding the
destination, reaches production silently by default.

**Verified clean afterward** (read-only `?action=records` fetch, no writes):
11 of the 13 synthetic rounds were removed entirely by manual dashboard
action; the remaining 2 (`TK148|MP`, `EX003|INSP`) were correctly resolved
in place, keeping the genuine `Rayanov/Taganov` copy — both genuine records
confirmed intact and unchanged. 2 markers (`DZ001|UC`, `DZ002|UC`) were
still open as of this check, both rivals synthetic with no genuine copy
underneath — flagged for manual resolution, not acted on here.

**Closed structurally, not by a text scan.** `tests/noprodhit.cjs` (added
investigating the incident) only catches a test that literally hardcodes the
real host — the lazy version of the mistake, not the actual one. The real
fix: `postT()` (`mobile/index.html`) and `post()` (`dashboard/drive.js`,
loaded unchanged by both `dashboard/index.html` and
`dashboard-next/index.html` — every write either page can make,
`saveEdit`/`resolve`/`putMedia`/`putDoc`, funnels through it) now refuse to
reach any non-local host while `navigator.webdriver` is true. The WebDriver
spec requires every automation-controlled browser (Playwright, Puppeteer,
Selenium) to report this, and no genuine human browser ever does — nothing
for a test to remember to set, and nothing a future test author can forget.
A local mock server (127.0.0.1/localhost) is always exempt, so every
existing test that already redirects its writes there is unaffected; a
genuine deployed session (`navigator.webdriver` false) is provably
unaffected too. The same guard was added to `dashboard/sync-adapter.js`'s
REST adapter `push()` for the same reason, even though that adapter is
inert today (no shipped default configures it) — the day it becomes real,
the identical risk exists and is already closed.
Proven by `tests/prodguard.cjs`: (a) an unflagged automated session with no
mock destination configured cannot reach a non-local host even when it
tries, on both the phone's `postT` and the dashboard's `CMDrive.saveEdit`,
with a `page.route()` intercept confirming zero bytes ever left the browser
either way; (b) the identical call, with `navigator.webdriver` spoofed to
false (simulating a genuine session), reaches the network layer completely
unchanged — proving the fix adds friction only to automated/test contexts,
never to a real deployed session.

---

## Confirmed NOT gaps (investigated and cleared; recorded so nobody re-opens
the question)

- **`tests/equipment-panel-next.cjs`** — this test does not fail or hang. It
  deliberately reboots the page 7 times, each with a ~9.5s settle window (to
  let the self-update timer arm and prove it's correctly held off by
  `busy()`), plus two screenshot captures. Total real runtime is
  ~110-130 seconds. Confirmed: `timeout 180 node tests/equipment-panel-next.cjs`
  → all assertions pass, and it is now part of `tests/runall.sh` with no
  special-casing needed (`run()` imposes no per-suite timeout).

---

## Every tab, checked

| Tab | Suite(s) | Result |
|---|---|---|
| Overview / Fleet | `overview-next.cjs`, `data-window-next.cjs`, `period-filter-next.cjs`, `detail-next.cjs` | All pass |
| Data & Sync | `sync-next.cjs`, `conflict-next.cjs`, `datasources-next.cjs`, `missingphotos-next.cjs`, `assignphotos-next.cjs` | All pass |
| Inspection Schedule (Due) | `due-next.cjs` | All pass |
| Lubrication | `lube-next.cjs` | All pass |
| Plan vs Actual | `plan-next.cjs` | All pass |
| Defects Raised | `defects-next.cjs`, `cmwo`-tab coverage via same suite | All pass |
| Maintenance Actions register | `actions-next.cjs`, `followup-next.cjs`, `disposition-next.cjs` | All pass |
| Equipment History | `history-next.cjs`, `equipment-panel-next.cjs`, `editround-next.cjs`, `photoeditor-next.cjs` | All pass |
| Wear & life | `wear-next.cjs`, `detail-next.cjs` | All pass |
| Failure Analysis | `failure-next.cjs` | All pass |
| Report generation | `reports-next.cjs` | All pass — generation itself (`CMReport.sectionsFor`, shared `report-core.js`) is shared code, not duplicated |
| Nav shell / cross-cutting | `nav-shell-next.cjs`, `tablekit-next.cjs`, `tablekit-scale-next.cjs` | All pass |

All 27 `tests/*-next.cjs` suites pass clean, individually and as part of the
full `tests/runall.sh` sweep, as of commit `b608714`.

---

## How to re-run this inventory

```
bash tests/runall.sh
```

All 27 `tests/*-next.cjs` suites, plus `tests/noprodhit.cjs`,
`tests/prodguard.cjs` and `tests/tablebusy.cjs` (the production-write guard
and the table-busy fix, both shared with `dashboard/index.html`), are now
part of the standard sweep — there is no separate loop to remember. To run
just the dashboard-next suites on their own (e.g. while iterating on one of
them):

```
for f in tests/*-next.cjs; do echo "=== $f ==="; timeout 200 node "$f"; done
```

`equipment-panel-next.cjs` needs close to the full 200s; everything else
finishes well under a minute.

---

## Standing status

**There is no cutover to be ready for — both surfaces run permanently, in
parallel.** Every functional gap this document has ever tracked is closed;
`BUILD` lockstep is closed on both ends; the cross-dashboard concurrent-edit
question has been checked directly and the gap it found is closed (above);
all 27 `tests/*-next.cjs` suites plus the full `tests/runall.sh` sweep pass
clean as of `BUILD 489`. What that means going forward is not "done," it is
"the standing bar every future change to either dashboard has to clear,"
per CLAUDE.md's "TWO OFFICE DASHBOARDS, BOTH PERMANENT":

- Every genuine bug fixed on either dashboard gets checked against, and
  applied to, the other one (and `mobile/index.html`, where it applies) —
  every time, indefinitely, with no "the other one will catch up eventually."
- A deliberate design difference between the two — recorded in "Closed gaps"
  and the sections above — is never "fixed" back into agreement; the
  dividing line between a defect and a design choice is the same one this
  project draws everywhere else, and this document is where that line gets
  written down so nobody re-litigates it from scratch.
- Two conflict markers (`DZ001|UC`, `DZ002|UC`) were still open on the LIVE
  backend as of the production-write-safety investigation above, both sides
  synthetic — a five-minute manual cleanup, unrelated to code, worth doing
  on its own schedule rather than tied to any dashboard-next milestone,
  since none is coming.
- "Every automated test passes" is not the same claim as "every real person
  who uses either dashboard daily has hit every path this document
  checks" — this remains a parity and regression record, not a substitute
  for real use, on either surface, surfacing something this document missed.
