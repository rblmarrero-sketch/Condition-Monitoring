# Condition Monitoring — what anyone working on this has to know first

Baimskaya, Chukotka. 1,128 machines. Two surfaces, one engine:
`mobile/index.html` (the phone, offline-first PWA) and `dashboard/index.html`
(the office). Both load `mobile/report-core.js`, so a report change lands in
both or neither.

---

## THE BACKEND IS YANDEX. GOOGLE IS RETIRED.

**The live endpoint is `https://baimskaya-cm.duckdns.org`** — `docs/yandex/function.js`
running under `server.js` on a small VM. That is the only backend the fleet talks to.

Both changeovers in `mobile/upload-defaults.js` are **armed**, and every phone has
already done them once:

```
swap    "yandex-2026-08"      Apps Script URL  →  baimskaya-cm.duckdns.org   (main slot)
retire  "google-off-2026-08"  dest "mirror"    →  off                        (the Google copy)
```

So:

- **Never tell anyone to deploy or redeploy `docs/google-upload.gs`.** It is a
  retired backend. Saying otherwise has wasted the maintainer's time three times.
- A backend fix means **`docs/yandex/function.js`**, and it is not live on push —
  see the deploy steps below.
- `docs/google-upload.gs` is still kept field-for-field in step with `function.js`,
  for one reason only: *two backends for one document have to agree on what the
  document IS*, so a backend that is ever switched back on cannot silently
  disagree about the shape of a record. Keeping it in sync is correct. Deploying
  it is not a thing that happens.
- The destination **id** stays `gas` after the swap while its URL points at
  Yandex. Code that branches on `d.id === "gas"` is therefore talking to Yandex.
  Branch on the id, never on the URL.

### Deploying a backend change

The phone and the dashboard are GitHub Pages — a push puts them in front of
everyone. **The server does not update itself.** Full procedure and failure
handling: `docs/yandex/VM-SETUP.md` §12. In short:

```
ssh cmadmin@baimskaya-cm.duckdns.org
cd /opt/cm
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/function.js
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/server.js
sudo systemctl restart cm
sudo systemctl status cm --no-pager
```

`cm.env` — the keys and the admin password — is **not** among the replaced files.

---

## BUMP `BUILD` OR THE WORK DOES NOT REACH ANYBODY

`BUILD` lives in `mobile/index.html` and `mobile/sw.js`, and is repeated as the
`?v=` tag on every shared script in `mobile/index.html` and `dashboard/index.html`
— about 59 places. **Every change that touches those files has to bump it.**

This is not a version label. It is the cache key:

- `CACHE = "plug-capture-v" + BUILD` — leave BUILD alone and the service worker
  goes on serving the previous files to every installed phone, for ever.
- `checkForNewBuild()` fetches `sw.js`, reads its `const BUILD`, and **returns
  early when it equals its own**. An un-bumped build does not merely fail to
  arrive; the phone actively concludes there is nothing new.
- The dashboard's `?v=` tags do the same for the browser cache, and `#dashVer`
  reads its badge off those tags — so the page reports the stale number too.

It has already happened once: an entire body of work — the class-aware intervals,
the photo editor fixes, the send-state vocabulary, re-file, the conflict
comparison, the read-after-write confirmation — was written, tested, committed
and pushed while BUILD stayed at 162. Pages published all of it and not one phone
saw any of it. The pure form of this project's signature defect: a real change
rendered as nothing.

To bump:

```
sed -i 's/v=<old>/v=<new>/g; s/const BUILD = "<old>"/const BUILD = "<new>"/; s/const BUILD="<old>"/const BUILD="<new>"/' \
  mobile/sw.js mobile/index.html dashboard/index.html
node tests/ver.cjs
```

`tests/ver.cjs` checks the stamps agree **with each other**. It cannot know
whether a change should have bumped them, and it passed every run while the
fleet sat on a stale build — agreement is not freshness.

**`tests/bump.cjs` is the guard.** It asks git instead of the page: since the
commit that introduced the current BUILD, has any file under `mobile/`,
`dashboard/` or `data/` changed — committed or still in the working tree? If so
the number is stale and the work is invisible, and it prints the exact sed line
to fix it. It runs in under a second, needs no browser, and is first in
`tests/runall.sh`.

**Run it before every push:**

```
node tests/bump.cjs
```

The full sweep takes about ninety minutes; this takes one, and it is the check
that decides whether any of the work reaches a human being.

---

## THE UPDATE HAS TO REACH THE PHONE BY ITSELF

Bumping `BUILD` is necessary and it is not sufficient. A build sitting on
GitHub Pages that no handset has fetched is the same as no build at all — the
signature defect one level up: real work rendered as nothing, this time by
never arriving.

**Standing rule for every change: assume nobody will ever tap "update".**
An inspector at −40 with gloves on, mid-round, will not read a banner and will
not go looking for a version number. If the update needs a decision from them,
it does not happen. Every technician's phone must end up on the new build with
no action taken by the technician, and the manual route exists only as the
last resort for a phone that has somehow fallen behind.

What the app already does — verify these still work after touching anything in
this path, because each was added to close a real gap:

| When | What happens |
|---|---|
| 1.5 s after boot | `checkForNewBuild()` |
| every 5 minutes, always | `setInterval(checkForNewBuild, 300000)` — a phone is opened at the start of a shift and never closed, so "check on open" means "checked once, twelve hours ago" |
| the app becomes visible | `visibilitychange` → check **and** apply |
| the radio comes back | `online` → check |
| a newer BUILD is seen | `reg.update()` starts the download **immediately**, without waiting for a tap |
| the download completes | the worker takes over only once every essential file is cached — `sw.js` refuses to `skipWaiting()` on an incomplete precache |
| a download stalls | every file is fetched under one deadline for headers AND body (`FILE_WAIT`, abortable). Until build 260 the timeout raced fetch(), which resolves on the headers, so a stalled stream held an install open for a whole shift and every later check did nothing (`tests/updheal.cjs`) |
| a build cannot finish downloading | the install FAILS (throws) when a build is already in charge, so the worker is redundant rather than parked in waiting; the next ordinary check from ANY build of the page installs it afresh, reusing what is cached. A phone's very first install still activates incomplete, to serve the offline page (`tests/updheal.cjs`, `tests/swfail.cjs`) |
| the round is saved | `applyUpdateIfIdle()` — reloads the moment the app is idle, so the new build lands between rounds and never mid-capture |
| a round is left half-walked | a draft counts as work only while somebody is working on it: after `IDLE_MS` (3 min) with no touch, key or typing, `busy()` is false, `reloadForUpdate()` flushes the draft and reloads, and `offerDraft()` brings the round back WITHOUT asking (`cm_resume_silent`). Until build 263 an abandoned draft blocked every update for as long as it lived. A dialog on screen still waits (`tests/autoupd.cjs`) |
| the check fails | **it re-arms itself**: `armCheck` 20 s backing off to 5 min (`CHECK_MIN`/`CHECK_MAX`), so the build lands seconds after the server is reachable again, not at the next five-minute tick. The deadline is `CHECK_WAIT` (25 s) over headers AND body — until build 264 it was 8 s, which a one-bar link misses. `UPD` (`window.__upd`) records every check — when, what the server said, why it failed — and `#updDiag` under the version line prints it: surface (installed app / browser tab), host, reason, last time the server answered, next try. The readiness card reads the same record; it never says "the newest there is" without having heard from the server (`tests/updretry.cjs`) |
| the page's own fetches all fail | **the worker asks instead** (`sw-check`): it fetches `sw.js` from its own process — separate connection, Safari runs workers out of process — and if the server is ahead calls `self.registration.update()` from in there. Build 262 in the field: a Safari tab on a phone with signal read "No signal" on every request while the installed app on the same phone reached the server in the same minute |
| nothing reaches the server for 8 min while the phone reports a network | `stuckHeal()`: STUCK_N (5) failed checks over STUCK_MS through both paths, `navigator.onLine` true, a worker in charge, nobody working → `reloadForUpdate()` once, at most every STUCK_GAP (1 h, `cm_stuck_reload`). iOS is known to hand a page brought back from the background a dead network until it is loaded again; a reload under the worker is served from the cache and costs nothing offline |
| the app is CLOSED | **the worker is woken by a push** (sw.js `wake`): the VM sends one when a build ships (it polls Pages `sw.js` every 5 min and remembers the last build in `_meta/push/_state.json`), when the folder changes (debounced 3 min, at most one per 15 min) and once a day at `PUSH_DAILY_UTC` (18:00 UTC = 06:00 Baimskaya). The woken worker fetches the build, finishes its cache, prefetches the fleet list from the phone's cursor (`cm_config` cache, key `__team-prefetch` — no `./`, because `tests/lint.cjs` and `static.cjs` read every `"./…"` in sw.js as a file to precache — merged by `teamPull(…, pre)` at the next open, even an open in the pit), counts the queue, and shows "Ready for the field" / "Not ready" — iOS REQUIRES a notification per push. Subscriptions are the document `_meta/push/<sha>.json` (`op:subscribe`/`unsubscribe`, `action=vapid`); the keys are `VAPID_*` in `cm.env` or `/opt/cm/vapid.json`, generated by server.js. Crypto is RFC 8291/8292 by hand, held to the RFC's own vector in `tests/bgpush.cjs`. **The one tap that cannot be removed: "Allow notifications", once, on an installed app** — the readiness card asks for it. Android also gets Periodic Background Sync. The worker cannot SEND the queue (that needs the page): the notification says "N rounds still to send — open the app" |
| the readiness check | **runs itself**: at boot, after every send, every 10 min in front, on coming to the front. A loud verdict (work not away, update unfinished, storage, setup) goes on the bar at the top of the capture screen and, when notifications are allowed, into one notification per change. Nobody opens System to learn they are not ready |
| `navigator.onLine` says anything | **nothing is gated on it.** It means "an interface is attached" and is wrong in both directions. The check, the pull, the send, opening a round, the full re-read, the speed probe — all ask; a phone with no network fails the request in a millisecond and is treated as offline in the catch (not as a failed pull, no note). The flag only chooses wording: "No signal" is said only when the phone itself reports no network, otherwise the host and the reason are named. Tests that want a phone in the pit point `up_dests` at `http://127.0.0.1:9/exec` (nobody listens) — faking the flag alone no longer keeps the app off the network |
| nothing else worked | the banner, and `#forceUpdate` → `updateNow()`: asks the worker to fetch the build, waits for it to be proven complete, reloads. If it cannot finish, nothing changes and the label says so |

**THE PAGE MUST NEVER UNREGISTER THE WORKER OR DELETE A CACHE.** Until build
246 the Update button did exactly that — unregister every worker, delete every
cache, swallow any refetch that failed, navigate. On a flaky link that left the
phone with nothing, and the navigation came back as Safari's own "the network
connection was lost": no app, no way back until a full online load succeeded.
Reported from the field minutes after an inspector was told to tap it. `sw.js`
is arranged so a build cannot take over until it is complete and the old cache
survives until then; one handler in the page defeated all of it from outside.
`tests/updatesafe.cjs` reads `mobile/index.html` and fails on `.unregister()`
or `caches.delete(`, and proves that Update tapped offline, or while the
download cannot finish, leaves a phone that still opens offline.

**The same rule governs SYNCHRONISATION, in both directions.** Nobody should
have to press anything to find out whether what is on screen is still true.

The OUTBOUND half was always automatic: a save sends, reconnecting sends,
picking the phone up sends, and `armRetry` backs off and retries. The INBOUND
half was not — `teamPull` ran at boot, on an `online` event, and after this
phone happened to finish an upload, and nothing else. That left the case an
actual shift produces: a phone switched on at the crib room, in signal all day
so `online` never fires again, with nothing of its own to send so no upload
ever completes, and `armRetry` stops its own timer when the queue is empty.
It showed the due list it downloaded at breakfast. Another inspector walks a
machine at 09:00, this phone never hears, and somebody drives out to walk it
twice.

Inbound now runs on a five-minute timer and on `visibilitychange`, both guarded
on `!document.hidden && navigator.onLine`. `TEAM_MIN_GAP` (60 s) throttles every
automatic pull, which is what stops a timer, a visibility change and a finished
upload arriving together from making three requests at one folder — the button
is the only caller allowed to ignore it. `tests/autopull.cjs` asserts the idle
case, the throttle and the offline silence by COUNTING REQUESTS at the mock,
so "it pulls by itself" is a number rather than a promise.

The dashboard's equivalent is `AUTO_MS` (3 min) plus a refresh on returning to
the tab, and `startAuto()` only runs when a backend is attached.

The two banners say different things and are not interchangeable: the one from
`checkForNewBuild` fires when a build has been *found and started*, so its
button must force a full refetch — a plain reload would serve the cached copy
and read as broken. The one from `controllerchange` fires when the new build is
already downloaded and in charge, and only needs a reload.

**Never make an update wait on a technician, and never apply one mid-round.**
Losing a half-captured inspection to a reload is worse than a phone being an
hour behind. `applyUpdateIfIdle` checks `__swBusy()` for exactly that reason.

---

## Secrets

`ADMIN_SECRET` lives in `/opt/cm/cm.env` on the VM and **nowhere else**. It must
never appear in the app, in `upload-defaults.js`, or anywhere in this repo.

`upload-defaults.js` is served to anyone who opens the app, so every URL in it is
public by design — that trade was made deliberately to stop inspectors having to
configure phones. Do not add anything to it that is not already public.

---

## Branch and deployment

`claude/magnetic-plug-dashboard-llv4wc` **is the default branch**, and GitHub
Pages publishes from it. There is no merge step: **every push is immediately
live to the field.** Develop, commit and push only on that branch.

---

## Rounds and intervals

Round types: `MP, FC, INSP, TEMP, UC, GET, TB, LUBE`.
Classes: `HT, AT, EXC, DOZ, LDR, GRD, DRB, DRE, HRB, CRJ, CRC, SCR, GEN`.

Intervals live in **`mobile/due.js` and nowhere else**. They are in HOURS,
rendered to a calendar at 20 h/day, and several are **per class**:

| Round | Interval |
|---|---|
| MP | 250 h — confirmed for the Terex TR60 haul trucks · **on HT + AT** |
| FC | 500 h engine filter, 1000 h the rest |
| INSP | 500 h |
| UC | **1000 h dozers · 4000 h excavators** |
| TB | **4000 h articulated · 1000 h carried forward for the rest** |
| TEMP, LUBE | 30 days, carried forward — no hour figure stated |

**`onClass` says WHO IS ON the round; `byClass` says WHAT THE INTERVAL IS**
where a class differs from the round's own figure. They were one field, and the
overload hid this fleet's most confirmed round from its own programme: a class
reached a round only through `byClass`, `byClass` exists to state a *different*
number, and 250 h is the same for every truck — so no class was ever written
down as being on the plug round, and a haul truck was proposed one only because
somebody happened to have already walked one on a truck of its kind. `onClass`
carries no number and so can never become a second interval table.

An interval is a property of the round **and the machine**. Always pass `cls`
to `DUE.next` / `DUE.hours` / `DUE.spec`. Omitting it schedules every excavator
on the dozer's number — which is exactly what shipped, and walked 21 machines
four times more often than anyone asked for.

**Never write a second interval table.** One did exist in the dashboard, saying
90 days for a 250 h round, and coverage was measured against a window seven
times too wide. `tests/interval.cjs` fails if one comes back.

---

## Grades are 1 to 5, and the table is `mobile/grade.js`

**1 Normal · 2 Incipient · 3 Degraded · 4 Severe · 5 Critical.** The grade is the
inspector's assessment and the ONLY condition field a record carries; there is
no severity control anywhere. Name, colour, the ISO 14224 class it exports as
(`GRADE.iso`: 1 NOF, 2 INC, 3 DEG, 4 DEG, 5 CRI), the meaning per round type
and what each grade requires before Save (`GRADE.requires`) all come off the
integer, from that one file, which both surfaces and `report-core.js` load.

It replaced A/B/C/X. **Never write a letter again, and never compare against
one.** Every ingest path reads a value through `GRADE.num()` (A→1, B→2, C→3,
D→4, X→5, numbers as themselves, anything else null), because letters still
exist in sidecars written before the change, in old team-cache rows and in
fixtures. The migration of the folder itself is `docs/yandex/migrate-grades.js`
(backs up every document locally and under `_meta/backup/`, idempotent,
reconciles counts before and after); it needs a backend that offers
`op:rewrite`, i.e. `function.js` deployed after this change.

**A round carries its own grade, `g`**, since build 254: `GRADE.roundGrade(items)`
— the worst of its positions, a measured station scored from its remaining life,
the machine's own photographs skipped, null when nothing is recorded. The phone
writes it at Save (`recToExport`), the history row reads it (`teamRow`), and
`migrate-grades.js --derive` writes it onto the rounds already in the folder by
the same function. A round with neither a grade nor a reading is left without
one and listed under "Grade review required" — never invent a 1. Save refuses a
position that has evidence and no grade on a graded round type (`gradeAppliesTo`).

The dashboard's `sevOf()` returns the grade NUMBER (a measured point's from its
remaining life via `GRADE.fromWorn`), and `SEV[n]` is keyed by it — attention
is `>= 3`, critical is `=== 5`. A URL `?sev=CRI` still opens: `sevKey()` maps
the old codes.

Machine-level photographs (overview, left, right, tray, GET assembly) live on
the pseudo-position `__general` on the phone; the dashboard keys that item
`MACHINE` and marks it `general`, and nothing may count it as a point.

## The defect class this project keeps producing

Almost every real defect found here has one shape: **a real value rendered as
nothing, or a real action that does nothing.** Nothing throws, no warning
appears, the screen looks finished — and it is found months later by somebody in
the field noticing a number is wrong. Its mirror is just as bad: **a panel
claiming to know something it does not.** A false alarm and a false reassurance
are the same failure.

Habits that follow from that, all of them learned the hard way:

- **Say only what can be verified.** `up:1` means "the endpoint accepted every
  file", which is a fact about a conversation. "Confirmed" is reserved for the
  read-after-write that asks the server what it actually holds.
- **Silence is not a verdict.** A server that does not answer produces no
  finding, because a guard that cries wolf is the noise a real failure hides in.
- **Read cells by what they ARE, never by column index.** Three suites learned
  this separately.
- **One source of truth per fact.** Two tables for one interval, two copies of
  one label — that is how surfaces come to disagree.
- **Normalise on the way IN, and read every marker key by the same rules.**
  The folder is written by more than one thing. The unit was upper-cased on
  ingest and the round type was not, so a sidecar written `insp` keyed as a
  round that does not exist and `dueRows` dropped it in silence — the machine
  simply left the due screen. Dates are the same: `DUE.next` parses ISO and
  returns null on anything else, and `31.07.2026` is how this folder's own
  filenames are written. `teamType()` and `teamDate()` are the two rules, and
  **every place that parses a `unit|date|type` key off the wire — a void, a
  delete, a deferral — must apply them too**, or the marker stops matching the
  round it is about. Ambiguity is never guessed at: `07/02/2026` is left as it
  arrived and counted, because a wrong date is worse than an unreadable one.
- **A number the backend sends about itself has to be read.** `action=records`
  has always returned `failed: n` — sidecars it opened and could not parse. It
  skips them, moves its cursor past them, and nothing in the app looked. Those
  inspections exist in the folder, so a migration counts them as "already
  there" and a backup preserves them, and they reach no client, ever, with no
  gap visible anywhere. `badGet()` holds the figure and the Due screen says it.
- **Tests must ask the app, not keep their own copy.** Four suites failed on
  working code because each held a duplicate of something the app owns. Take
  labels from `I18N`, intervals from `due.js`, limits from the running page.

---

## Tests

Full sweep: `bash tests/runall.sh` — ~150 suites, ~4,000 assertions, and it
brings up its own helper servers on 8085/8092/8093/8094/8096/8097/8098/8099/8101/8102.
Register every new suite in the list at the top of that file.

Two traps that have each cost an hour:

- `tests/pw.cjs` exports a **module name string** — use `require(require("./pw.cjs"))`.
- **`pkill -f runall` matches its own wrapper shell** and kills the sweep you
  just started. Never put the pattern and the launch in one command line; use a
  pattern that cannot match itself, e.g. `pkill -f 'run[a]ll.sh'`.

Three dashboard conventions a suite has to respect since build 271:

- **The large pickers are comboboxes** (`cmbAttach`): `#equipSel`, `#rTarget`,
  `#pfSel`, `#lrModel`, `#lpoModel` are still the value the page reads, but
  they are out of sight (0×0). Choose with `cmbSet("equipSel","TK146")`, never
  `page.selectOption` on the hidden select; type into `#equipQ` / `#rTargetQ`
  to search. A typed query counts only while typing — at rest the box shows
  the chosen item.
- **Every table pages at 25 and offers 50 and 100; there is no "show all".**
  A suite that needs the whole list presses `[data-pg="<key>:size:100"]` and
  walks `:next`. The pager says `N matching · showing a–b`; parse the count
  off `(\d[\d,]*)\s*matching`, not off "of".
- **The action register's rows are read-outs.** Owner, due, WO, priority,
  plan and status are edited in the drawer a row opens (`openFollow`,
  `#follOv`), and "No action required" chosen there opens the disposition
  dialog exactly as the inline list used to.
