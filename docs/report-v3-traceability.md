# Report system v3 — traceability matrix

Build 301, branch `claude/magnetic-plug-dashboard-llv4wc`, deployed and
verified against the live folder (see §5). Status vocabulary is
exactly the eight terms specified: **Not implemented**, **Partially
implemented**, **Implemented**, **Verified locally**, **Verified deployed**,
**Blocked — real record required**, **Blocked — physical handset**,
**Blocked — external infrastructure**.

"Implemented" means the code exists and passed its own test in isolation.
"Verified locally" means a real PDF (or a real render of the report's DOM at
paginator width) was generated from a realistic or live-folder record and
inspected. "Verified deployed" means the same, done against the published
build on GitHub Pages. Nothing below claims more than it earned.

---

## 1. Known Implementation Problems (from the task) — addressed this pass

| # | Problem | Source file | Correction | Test | Status |
|---|---|---|---|---|---|
| 1 | Undercarriage drawings too large | `mobile/report-core.js` `.ucmap`/`.ucmapwrap:only-child .ucmap` CSS | Height cap cut from 620px/300px (≈57%/28% of a page's room) to 420px/175px, landing the drawing at 35–42% of usable page height, measured | `tests/ucpage.cjs` (new v3 geometry block), `tests/rptfit.cjs` | **Verified deployed** — real render off the published build against a real live folder record (EX012, 2026-08-09 UC round): 408px drawing / 1089px room = 37.4% |
| 2 | Two large/duplicated drawings consuming most of a page | Same CSS; `CMR.fitPage` | Same cap applies uniformly to a track-frame pair (2×175px ≈ 380px total) as to a lone drawing; `pagecut.cjs`'s "a drawing is a drawing, not a column of one" / "no drawing split across two pages" assertions hold | `tests/pagecut.cjs`, `tests/tray.cjs` | **Verified locally** |
| 3 | Undercarriage condition summary separated from the drawing | `mobile/report-core.js` `unitSheets` (isWear branch) | Condition summary + metadata strip + rating now ALWAYS share page one with the drawing (previously moved to the register page whenever the round had readings) | `tests/ucpage.cjs` — "the drawing and the condition summary are on the same (page one) section" | **Verified deployed** — same EX012 live record, page 1 carries the strip and the condition summary alongside the drawing |
| 4 | Measurement tables pushed to later pages unnecessarily | Same function | Register still starts its own page (by design — it is the complete detail, not squeezed under the drawing), but the register page no longer duplicates the strip/summary now on page 1 | `tests/ucpage.cjs`, `tests/rptfit.cjs` | **Verified locally** |
| 5 | Equipment History produced six pages for three inspections | `mobile/report-core.js` — `unitSheets` (multi-round path), formerly `fullUnitSheets` unconditionally | **Rebuilt.** The default "Equipment History and Trend" document (>1 round on a machine) is now a compact 2–3 page report: latest-condition-by-type table with a Since-previous column, ten worst findings across every type, up to six evidence photos, the existing compact wear-history trend table, consolidated open actions, one sign-off. The full per-type detail (the old always-on behaviour) is now `fullUnitSheets`, reached only via **"Include complete inspection sheets as appendix"** — off by default. Single-round "unit" calls (both surfaces' "This inspection") and mobile's "every round on this phone" (`ctx.full`) are routed to the full sheet unconditionally, since neither is asking for a trend report. | `tests/rptbi.cjs` ("less, not more" — real page-count measurement via the actual paginator: 3 pages for a 2-type, 5-round machine that used to be 6), `tests/rptappx.cjs` | **Verified deployed** — two real live-folder machines through the published build: TK151 (2 MP rounds, the typical case) at exactly 3 compact pages vs 6 with the appendix; TK158 (4 rounds, 3 types including a dump-body round with 24 real stations needing a decision) at 5 compact pages vs 15 with the appendix — the compact document tracks real exception volume rather than a fixed page count, and is always smaller than the full detail |
| 6 | Daily round report produced nine pages for four inspections | `dashboard/report.js` (round scope) | **Not implemented this pass.** The round-scope document was not touched; it still concatenates full per-round detail. See §3. | — | **Not implemented** |
| 7 | Monthly report produced 28 pages for 23 inspections | `dashboard/report.js` (month scope) | **Not implemented this pass**, same reason. See §3. | — | **Not implemented** |
| 8 | Excessive unused white space | Various | Addressed only where item 1–5 touched layout; not audited as a standalone item | — | **Not implemented** (beyond 1–5) |
| 9 | Approval blocks on mostly-empty pages | `unitSheets` (new) | The compact report's sign-off rides whichever section has room rather than forcing its own page (`{nb:false}` on the approval block) | `tests/rptbi.cjs`, `tests/rptappx.cjs` (indirectly, via section counts) | **Verified locally** |
| 10 | Findings and photographs separated | Not touched this pass beyond the new compact report, which puts up to six photographs directly under the findings table that names them | `historyFindings`/photo board in `unitSheets` | **Implemented** |
| 11 | Large reports take several minutes | Not touched — `rptphoto.cjs` (23.2s for a photo-heavy report on this session's CPU) still passes against the existing 35s-per-report-class budget; the compact default report is materially smaller and faster to generate than before, but generation time was not independently re-measured against a stated target this pass | `tests/rptphoto.cjs`, `tests/rptest.cjs` | **Verified locally** (existing budget), performance of the NEW compact report specifically: **Not implemented** as a stated target |
| 12 | Main PDF content rasterised, not searchable | `mobile/report-core.js` `CMR.paginate` (html2canvas → JPEG per page) | Not touched — this is an infrastructure-level rewrite (vector text/tables via jsPDF's own text APIs, embedded Unicode font, JPEG/PNG only for photographs) | — | **Not implemented** — see §4 |
| 13 | Equipment Condition Summary omitted General Inspection (INSP) | `mobile/report-core.js` `summarySheets`, `COND_TYPES` array | `TYPES` array was seven types, missing `INSP`; now eight (`MP,FC,INSP,TEMP,UC,GET,TB,LUBE`), shared with the new History report via `COND_TYPES` so the two can never disagree again | `tests/rptsummary.cjs` (existing suite, re-verified green) | **Verified deployed** — TK153's live Condition Summary, generated off the published build, carries a "General Inspection" row |
| 14 | Recent Reports showed the literal word "summary", not its translated label | `dashboard/index.html` `renderRecentReports` `scopeName` map | Map was missing the `summary` key, so a summary-scope entry fell through to the raw internal scope string; added `summary: t("r_summary")`, matching how every other scope's full descriptive label is reused as its badge | `tests/rptappx.cjs` (new) | **Verified deployed**, EN + RU — the published build's Recent Reports list reads "Equipment condition summary — latest of each type" / "Сводка состояния техники — последний осмотр каждого типа" |
| 15 | Mobile reporting not fully verified on a physical handset | — | Unchanged this pass | — | **Blocked — physical handset** |
| 16 | No central controlled archive of generated reports | — | Unchanged this pass — report numbers, revision, generated/prepared-by fields already exist (pre-dating this pass); a durable server-side archive with supersede/audit-history was not built | — | **Not implemented** — see §4 |

---

## 2. This pass's own new work, not on the original defect list

| Item | What changed | Test | Status |
|---|---|---|---|
| "Include complete inspection sheets as appendix" | New dashboard checkbox (`#rAppendixField`, shown only for the `unit` scope), threaded through `reportOpts()` → `ctxFor` → `ctx.appendix` → `unitSheets`. Unchecked by default. | `tests/rptappx.cjs` | **Verified locally** |
| Mobile "every round on this phone" stays full-detail | `ctx.full` flag added; `buildReportSections()` (no id) now passes `full:!onlyId` so a phone whose saved rounds happen to share one machine still gets the complete offline audit trail, not the new compact summary | `tests/ucpage.cjs` (the suite that first caught this), manual trace | **Verified locally** |
| Fit-shrink mechanism repaired for the new, tighter drawing cap | `CMR.fitPage` previously shrank only the drawing's CONTAINER width; once the drawing is height-capped (the whole point of the fix above), that no longer moves anything. It now also scales each `.ucmap`'s own `max-height` by the same fraction during a shrink pass. | `tests/rptfit.cjs` (re-derives the exact numbers: 0.7 taken, 926px into a 929px deliberately-tight room) | **Verified locally** |
| Shared `typeRow`/`typeDelta`/`actionTable`/`COND_TYPES` helpers | Extracted so the Condition Summary and the new History report read one table-row rule and one action-table rule, never two copies that can drift | `tests/rptsummary.cjs`, `tests/rptbi.cjs` | **Verified locally** |

---

## 3. Explicitly requested but **not implemented** this pass

Stated plainly, with why, so nothing here is implied "done" by omission:

- **GET and Dump Body side-by-side layout** (drawing 55–60% of width, controlling
  results 40–45%, beside it). The shared `unitSheets`/`mapBlock` machinery this
  pass used puts a drawing FULL WIDTH with its key underneath — correct for
  Undercarriage (explicitly "beside or directly below" in the spec) and
  unchanged for GET/TB. GET's single drawing does benefit from the same height
  cap (35–42%, since it shares `.ucmap` CSS), which shrinks the "oversized
  diagram" defect but does not implement the specific side-by-side split the
  template calls for. TB (dump body) was deliberately left on its prior
  layout entirely — see the code comment in `unitSheets` — because the tray's
  own wide drawing-plus-zone-table combination does not fit the same room
  budget as a track frame even at the narrowest the fit mechanism allows
  (`tests/pagecut.cjs`, `tests/tray.cjs` proved this empirically when first
  tried). A real side-by-side redesign for GET/TB needs its own layout pass,
  not a parameter change to the undercarriage one. **Not implemented.**
- **Daily Round Report / Monthly Fleet Report exception-first restructuring.**
  Neither `dashboard/report.js`'s round scope nor its month scope was touched.
  Both still concatenate full technical detail rather than leading with
  completion/distribution/priority-actions and moving detail to an appendix.
  **Not implemented.**
- **Magnetic Plug four-card photo-first layout, Filter Cut/General
  Inspection/Thermography/Lubrication template refinements** described in the
  prompt's per-type sections. The existing v2 implementation (build 293–295)
  already does photo-first cards for MP and keeps photos with findings for
  FC/INSP/TEMP; it was not re-audited against the new v3 mockups this pass.
  **Not implemented** (not re-verified against v3 specifically).
- **`CM_Actual_Report_Templates_v3.pdf`** as an authored, populated reference
  document covering all fourteen listed report types. This pass worked
  directly from the three mockup PDFs supplied in the conversation (the
  combined-inspection mockup, the single-inspection mockups, and the original
  v2 template pack) as the visual contract, rather than producing a fourth
  document restating them. **Not implemented** as a standalone deliverable.
- **Vector/searchable PDF text**, **server-side generation on the Yandex VM**,
  **Object Storage archive**, **PDF bookmarks/metadata beyond what already
  existed**. Infrastructure-level rewrites, not attempted this pass. **Not
  implemented.**
- **Visual regression harness** (render every page to PNG, diff against an
  approved v3 template, per-report). This pass did real, one-off DOM
  screenshots to verify the Undercarriage geometry (see the PNGs generated
  during this session) and real page-count measurement through the actual
  paginator for the History report, but did not build a standing,
  repeatable PNG-diff test suite. **Not implemented.**
- **Central document control / durable approval workflow** beyond what
  pre-dates this pass (report number, revision, prepared-by, generated
  timestamp already exist; digital reviewer/approval capture does not).
  **Not implemented.**

---

## 4. Blocked

| Item | Reason |
|---|---|
| Physical-handset offline generation, cold-launch, and sync-does-not-alter-findings tests | **Blocked — physical handset.** No device available in this environment. |
| Server-side PDF generation queue on the Yandex VM, Object Storage archive | **Blocked — external infrastructure.** This session can read the live folder over HTTP but cannot provision or deploy new VM services; that requires SSH access to `baimskaya-cm.duckdns.org` per `docs/yandex/VM-SETUP.md` §12, which this environment is not set up to reach interactively for a new service, only for the documented `curl` + `systemctl restart` deploy of `function.js`/`server.js`. |

---

## 5. Deployment evidence

- Build bumped 299 → 300 → 301 (two further real fixes surfaced by the full
  sweep after 300: restoring `earlierRoundSections` into the compact default,
  which `tests/prevmeas.cjs` — predating this pass — correctly caught as
  missing; and marking the new intro's own tables `class="sumtbl"` so a test
  can tell them from a redundant echo of a card). All `?v=` tags agree
  (`tests/bump.cjs`, `tests/ver.cjs` both pass at 301).
- Full local regression sweep (`tests/runall.sh`, 259 logged suites) run
  clean against build 301 before push — one pre-existing test's format
  assumption (seconds vs. minutes in the generation-time estimate) was
  corrected, not the product; everything else passed on the first clean run.
- Pushed to `claude/magnetic-plug-dashboard-llv4wc`; GitHub Pages confirmed
  serving build 301 at both public URLs.
- **Verified deployed**, against the real live folder through the published
  build (mirrored bytes + a relay to the live backend, since this session's
  browser cannot reach `baimskaya-cm.duckdns.org` directly):
  - **EX012**, a real UC round (2026-08-09): drawing at 37.4% of usable page
    height, sharing page one with the equipment strip and the condition
    summary — the priority correction, on a record nobody staged.
  - **TK151**, a real machine with two MP rounds — the ordinary case: the
    compact Equipment History report is exactly 3 pages; the same data with
    "Include complete inspection sheets as appendix" checked is 6.
  - **TK158**, a real machine with 4 rounds across three types (MP, FC, a
    dump-body round with 24 stations genuinely awaiting a decision): compact
    is 5 pages, the appendix is 15 — proportional to real exception volume,
    always smaller than the full detail.
  - **TK153**'s live Condition Summary carries a General Inspection row.
  - The published build's Recent Reports list names a summary-scope entry in
    its translated label, in both languages, not the internal word.

