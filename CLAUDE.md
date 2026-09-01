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
| the round is saved | `applyUpdateIfIdle()` — reloads the moment the app is idle, so the new build lands between rounds and never mid-capture |
| nothing else worked | the banner, and `#forceUpdate`, which clears worker + caches + browser copies and refetches |

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
