# The suites

Ninety-odd browser suites that drive the real app and the real Apps Script.
They live here, in the repository, because they kept being written and then
lost — and a test nobody can run is a test nobody has.

## Running them

    npm i -D playwright          # only if it is not already installed globally
    bash tests/runall.sh

The runner starts the fake servers it needs, checks the ports before each
suite, and puts back anything that died — so a helper server that falls over
costs one suite rather than the twenty behind it. One suite on its own:

    node tests/uc.cjs

Every suite prints `PASS` / `FAIL` lines and exits non-zero on a failure, so
`runall.sh` and CI both read the same thing a person does.

## What is being tested against

Nothing here talks to Google. Three fakes stand in:

| file | what it is |
|---|---|
| `ed-srv.cjs` | **the real `docs/google-upload.gs`**, executed over an in-memory Drive. Uploads, conflicts, corrections, deletion and the index all run the code that will be deployed. |
| `mock.cjs` | a hand-written `/exec` that answers the read API. Faster, and it counts requests, so a suite can assert what pressing a button *costs*. |
| `stab-srv.cjs`, `hang.cjs`, `up-srv.cjs` | a flaky link, a connection that accepts and then delivers nothing, and a slow uploader. |

`ed-srv.cjs` takes a port and an admin secret; `NONE` means the shipped default
(deletion switched off), which is the configuration most worth being able to
reproduce. Set `CM_OLD=1` and it runs the **current** script with its newest
actions stripped out — an `/exec` nobody has redeployed. That is derived rather
than kept as a copy on purpose: a snapshot of an old script goes stale the
moment the real one moves, and then the fallback test is passing against a
fixture instead of against the thing it is meant to be older than.

## Two rules these suites are built on

**Press the button a thumb presses.** A test that calls `openRound()` cannot
see that nothing *reaches* `openRound` — which is exactly how the Wear & life
tab shipped unreachable for five builds, and how tapping a round in the system
list shipped as a silent jump to a blank capture form. Suites click.

**A real value rendered as nothing is the worst defect on this project.** A
table wider than the page does not overflow visibly in a PDF; it is rasterised
and the right-hand columns are simply absent. So the suites measure geometry
(`hdrfit.cjs`, `fit.cjs`, `sizes.cjs`) rather than trusting that a layout is
fine because nothing threw.

## Where to start reading

| suite | what it holds down |
|---|---|
| `index.cjs` | reading the folder without walking it — and the fallback for a deployment nobody has redeployed |
| `teamopen.cjs` | a round somebody else did, opened and printed on this phone |
| `rptbi.cjs`, `rpt2.cjs` | the report: both languages on every label, nothing off the page |
| `cf.cjs`, `cfd.cjs`, `cfp.cjs` | two phones, one round, and who decides |
| `ver.cjs` | the phone, the dashboard and the service worker are all on one build |
| `bench.cjs` | not a test — it counts Drive operations per request, which is what the index was built from |

`bench.cjs` is worth running after any change to the read path:

    node tests/bench.cjs

It seeds a season of Baimskaya (900 rounds, 2700 photographs) and reports what
each kind of request costs in Drive round trips. Wall clock against an
in-memory Drive means nothing; the operation count is the number that decides
whether a phone in the pit gets an answer.
