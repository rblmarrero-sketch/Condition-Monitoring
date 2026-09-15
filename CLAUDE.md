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

### IF IT NEEDS THE VM, SAY SO AND HAND OVER THE COMMANDS

**Standing rule, asked for on 2026-09-14.** A change under `docs/yandex/` is not
live when it is pushed. So any answer that ships one must END with the deploy
block, ready to paste into PowerShell — never "this needs a VM deploy" on its
own, and never a pointer to this file. The maintainer is on Windows; the
commands are written for the terminal they actually have open.

State three things every time: **what** is waiting, **what it changes on the
running server**, and **what is still true until it runs** — a backend fix
described as done, sitting undeployed, is this project's signature defect with
a person's memory as the place the value gets lost.

A change that needs NO deploy should say that too, in one clause, so the two
cases are never confused.

Copy-paste block (also in `docs/yandex/VM-SETUP.md` §12, with the verification):

```powershell
ssh cmadmin@baimskaya-cm.duckdns.org
```
then, on the VM:
```bash
cd /opt/cm
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/function.js
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/server.js
sudo systemctl restart cm
sudo systemctl status cm --no-pager
```

`cm.env` is never among the replaced files.

**No double quotes inside a command sent through `ssh` from PowerShell** — it
strips them, so `grep "cm endpoint"` arrives as two arguments and a deploy that
worked reports a failure on its last line. Use a pattern that needs no quoting
(`grep cm.endpoint`). VM-SETUP §12 carries the case.

**Every expected number comes off the file in the repository as the instruction
is written, never from memory.** A check quoting the wrong figure reports a
working deploy as a broken one, and what the reader learns is to stop believing
the check. It has happened twice: `MEDIA_MAX` was quoted as 0 when the file's
own comment carries the old name once, and the `grep "cm endpoint"` quoting
above. Both deploys were fine.

**Always include a check that proves the NEW file is the one running** — a deploy that did not happen looks exactly
like one that did, which is how the request cut sat at two minutes for months
while everyone believed it was ten.

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

**A build's cache holds only that build's page.** Until build 343 the worker
revalidated `index.html` on every open and put whatever the server sent into
its OWN cache — so with a newer build on Pages and its install unfinished, the
old worker served the new page against the old scripts: a mixture of two
releases, and offline a 503 for every `?v=<new>` module. `keepPage()` reads
the `const BUILD` out of the page and refuses one that is not its own,
starting the install instead (`tests/swmixed.cjs`).

**A queue that cannot be read is not an empty queue.** `pendingCount()`
answers `null` when IndexedDB fails, never `0` — `0` disarmed the retry
clock and painted "All sent" over fifteen waiting rounds. The pill, the
badge, the queue screen and the sync bar all say "queue could not be read"
(`net_qbad`) instead (`tests/recovery.cjs`).

**The read-back puts a missing file back on the send list.** A file the
server lists as missing, empty, or SHORTER than what was sent is re-sent —
only that file, at most `CONF_RESEND_MAX` times per revision. A file the
server holds LARGER than what was sent is a different file: recorded on
`conf.differs`, named on the row, never overwritten from the phone. Two
rules keep that from looping: the listing is searched under the name the
server said it FILED the file as (`STORED`, a rival device's `~DEV`
variant), and a listing entry with no size makes no finding (`null`, not
0). **A test mock that accepts an upload must list it afterwards** —
`tests/mock.cjs` records single-file POSTs in `UPLOADED` for exactly this
reason; a mock that accepts and forgets now makes every round re-send.

**The readiness card routes a waiting queue by what is wrong with it**
(`yardCheck` §5): a photograph that needs recovery (`localState:
"unreadable"`, no `serverHeld`) → "Recovery inventory"; a queue nobody has
attempted for `STALL_MS` while the server answers → stalled, assistance;
otherwise waiting, and "Connection interrupted. Upload will resume
automatically." when the last failure was the link. Verdict keys
`queue_recover` / `queue_stalled` outrank `queue`.

**A photograph the phone can no longer read does not hold the round when
the manifest's receipt proves the server holds those bytes** (`serverHolds`:
receipt sha256 equal to the wire or stored hash). It is marked
`localState:"unreadable"`, `serverHeld:1`, said on the row, and never
sent; without the receipt the round waits and the photograph is named.

**`recover.html` is also the recovery inventory** (`#inventory`): read-only
— every round, every attachment with the manifest's claim beside what the
phone can read now, and an export one file at a time (record JSON per round,
readable photographs under the app's own names, `RECOVERY_REPORT.txt`
naming the rest with their server copies). The app's own ZIP no longer
aborts on one unreadable photograph and reports real counts
(`tests/recoverinv.cjs`, `tests/recovery.cjs`). The dashboard's file index
says when it could NOT be refreshed (`CMDrive.mediaIndexState`,
`tests/medstale.cjs`) instead of handing back the stale count as fresh.

**A photograph one reader refuses is not a photograph the phone has lost.**
Read off a handset on build 347: every photograph of every round failed in
`FileReader.readAsDataURL` — "can no longer be read … Retake the position",
62 attempts on one round, zero photographs on the server — while the same
phone's recovery inventory read every one of them in full through
`blob.arrayBuffer()` four minutes later and hashed them to the manifest. The
same phone had stored 3–5 MB camera originals for every round since
2026-09-12 21:45Z where every earlier round held 300–1,100 KB, because
`createImageBitmap` had been refusing the same files and nothing was shrunk.
`readBlobBytes` asks `arrayBuffer()`, then FileReader as an ArrayBuffer, then
as a data URL, and calls a file unreadable only when every reader has refused
it — the error carries each reader's verdict (`e.readers`) and the banner
prints them (`up_noread`), and never tells anybody to retake a position.
`decodeImage` falls back from `createImageBitmap` to an `<img>`. The upload
reads each photograph ONCE, decodes from a memory copy of those bytes, and
sends the stored file again only where nothing shrank. A test that wants a
reclaimed file must rig ALL THREE readers (`tests/staleblob.cjs`,
`tests/recovery.cjs`); one that rigs FileReader alone is the field case, and
the photograph is expected to be SENT (`tests/readpath.cjs`).

**A FAILURE WITH NOWHERE TO GO STILL LEAVES A MARK** (`bad`, `window.__errs`,
build 372). `try{ dbDel(DRAFT_ID); }catch(e){}` reads as a guard and catches
nothing: the call returns a promise before it can fail, so the catch never runs
and the failure becomes an unhandled rejection — which neither surface listened
for. Six had shipped. The one with a round in it is `resetForm()`: on a phone
whose IndexedDB refuses writes the draft outlives its own round and
`offerDraft()` restores it on the resume path WITHOUT ASKING, which is how one
walk reaches the folder twice (`draftStale` makes that path ask). The others
were the readiness card at three call sites — a rejection left the card showing
its previous verdict — the worker's config mirror and `askPersist`. The cut is
in two places, not six: `bad(where,e)` plus `unhandledrejection` and window
`error` listeners ABOVE EVERY OTHER SCRIPT on both surfaces, so a failure
nobody handled is recorded anyway, including in code written later; and
`tests/audit-scan.cjs` refuses a sync `try` around a call the file declares
`async` (`tests/norej.cjs`).

**AN IDLE OFFICE PAGE MAKES NO WORK FOR ITSELF** (build 374). Equipment
History, a unit with photographs, a backend attached: the whole history
destroyed and rebuilt every 15 ms — 210 repaint batches in three seconds,
measured, with nobody touching the page. `renderHistory()` ends by asking for
the unit's photographs, `pullDrivePhotos()` repaints when photographs arrive,
and `ensurePhotos()` answered with how many the unit WANTS rather than how many
that call ADDED, so with everything cached it was truthy for ever. Under it,
the cache pass held every stored copy to the INDEX's claimed length — right for
a re-sent round landing under the same name with other bytes, but a file whose
index size is simply wrong is then dropped and refetched on every pass, with a
request in it. What a person sees is not "slow": it is a photograph that cannot
be CLICKED, because the card is rebuilt under the cursor before the press
lands. The pull reports what it added; the cache is held to our own measurement
once we have one, and `stale()` remains the one place "the index now says a
different length" is answered (`tests/noloop.cjs`).

**THE UPLOAD IS PREFLIGHTED, AND `function.js` ANSWERING OPTIONS IS LOAD-BEARING.**
`postT` is an XMLHttpRequest because fetch cannot watch its own upload, and
ATTACHING ANY LISTENER TO `xhr.upload` makes a request non-simple whatever its
content type — so "both clients send text/plain, so no preflight is needed"
stopped being true the day the idle timeout arrived, silently, and two comments
went on asserting it. Live it costs one round trip an hour, not one per file
(`Access-Control-Max-Age: 3600`). Two things follow: this endpoint must GO ON
answering OPTIONS — remove it and every photograph and sidecar stops uploading
everywhere at once — and the retired Apps Script has `doGet` and `doPost` and no
`doOptions` and cannot serve one, so switching the old backend back on is NOT a
one-step fallback. `tests/audit.cjs` §8 asserts the preflight happens and is
answered.

**A RED SUITE THAT NOBODY READS IS THE NOISE THE NEXT FAILURE HIDES IN.** Four
suites — `phase3`, `prevmeas`, `wedge`, `audit` — were carried as "known" for
months. Every one was correct; one was reporting the re-render loop above. None
needed a judgement call to diagnose: a DOM mutation counter, a request log, a
stack trace and the app's own constants settled all four. Three of them were
keeping their own copy of something the app owns — a page count the report's
stated shape had outgrown, a 30 s deadline where the app gives
`TEAM_TIMEOUT_FULL` 150, a network flag flipped while a paint was still in
flight (`netfresh`, which failed under load and passed alone, i.e. "flaky").
**A failing suite is fixed or explained the same day; it is never carried.**

**AND EVERY INSTRUMENT PROVES IT CAN STILL SEE, ON EVERY RUN.** A clean report
and a blind one are the same text, so each tightening of a check is a step
toward one that looks at nothing and never complains. `tests/audit-scan.cjs`
plants one fault of every kind it knows and reports a check that misses its own
as BLIND, in place of the clean bill; `tests/crawl.cjs` plants a throw and a
`console.error`; `tests/noloop.cjs` plants a repaint. Each also states what it
READ — the language tables' sizes, the constants compared, the screens visited —
because a zero over a zero is not an answer. The scanner's own first two
answers were wrong in exactly the two shapes this project produces: 86 findings
that were artefacts of its parser, then silence caused by a lexer that did not
know a regex literal from a division and read a template literal as "up to the
next backtick". Every unit's braces must balance to exactly zero; that balance
is the proof the reading is real.

**NOTHING REACHES STORAGE THAT THIS PAGE HAS NOT READ END TO END** (`ownBytes`,
called unconditionally from `intakeNoted`). Read off a handset on 2026-09-14,
38 GB free and every earlier photograph cleared: `1 photo(s) could not be read
… (NotFoundError)`. `NotFoundError` is the whole diagnosis and it is not build
347's fault — NotReadable means the bytes resist, NotFound means the file the
Blob points AT is gone, which is also why all three readers failed together.
A `File` from `<input type=file>` is not bytes: on WebKit it is a reference to
an item in the browser's temporary store, `new File([thatFile], name)` copies
the REFERENCE (the spec permits a lazy copy and WebKit takes it), and iOS
clears the camera's staging file on its own schedule — IndexedDB is then
holding a faithful pointer to nothing. Six paths returned the picker's own File
to storage: a JPEG already inside the limit, a re-encode that came out no
smaller, a video, bytes that are not a photo type, "Original" chosen on
purpose, and a HEIC the decoder refused. A frame that went through the canvas
in `reencode` came back as a blob the PAGE had made — which is why one round on
that phone verified byte for byte in the same hour another lost every
photograph. The read is unconditional, a canvas blob included, because a rule
with an exception is a rule somebody has to remember; and it is the earliest
possible detection — it happens with the inspector still at the machine, where
retaking costs ten seconds, not at the upload after they have driven away. A
file that is ALREADY gone is kept, never discarded, and said as its own reason
(`gal_odd_own`, via `intakeWhyKey`). The `?` in a saved round's thumbnail is
this same defect showing itself hours earlier. `askPersist()` is asked at boot,
not at the first save (`tests/ownbytes.cjs`).

**An upload is dead when its bytes stop moving, not when a clock runs out.**
"Press Sync four times and it goes through" (build 348): `fetchT` gave a POST
90 s whatever it was doing, a 4 MB original at 55 KB/s needs 100, the server
kept the file the client abandoned, and the next press found it and gave up
on the next one. `postT` (XMLHttpRequest, because fetch cannot see its own
upload) bounds a POST by `UP_IDLE` of silence while the body goes up,
`UP_REPLY` once it is all up and the server is hashing and writing it, and
`UP_MAX` outright; the error is the app's own timeout sentence
(`tests/upidle.cjs`). `fetchT` stays for GETs and the ping.

**A BATCH THAT PARTLY FAILED IS A FAILED BATCH.** `putBatch` threw only when
EVERY file of a chunk was refused, so a reply of `{saved:3, failed:1}` returned
as success: the lane took the chunk as done, the round went `up:1` with a
photograph never sent, and the read-back was its only rescue — once. It now
raises on any `failed` entry; the names that landed are already in `sent`, so
the retry costs only the file that failed. A receipt saying `verified:false`
counts as failed too (the server measured its own object and the check did not
agree), and `function.js` re-writes a "duplicate" whose read-back now fails
instead of answering "already here" for ever.

**THE SAME NAME AT THE SAME LENGTH IS NOT THE SAME FILE.** `landedAnyway` — the
lost-reply recovery — also reads the listing's `updated` and requires the
folder's copy to have been written since the request began (`LANDED_SKEW` for a
phone clock that runs ahead). Without it an edited round's re-sent sidecar, very
often the same byte length as the one already there, was marked sent, never
sent, and read back as confirmed.

**A POST IS NOT CUT SHORT BY THE SERVER EITHER.** `server.js` set
`requestTimeout = 120000` believing it was lengthening Node's default; Node 18's
default is 300 s, so it was SHORTENING it to two minutes — under the phone's own
`UP_CLOCKS.max` (900 s) and under what a 2 MB batch takes at the 55 KB/s a
handset measured with three lanes sharing the link. That is the shape of "press
Sync four times": each press lost the slowest request, the others landed, and
the last press found little enough left to fit. It is 960 s now, with
`headersTimeout` short and `MAX_BODY` still the guard. **This is a VM change and
is not live on push** — see the deploy steps. `putAll` also drops to one lane
while any chunk is over `LANE_SOLO_BYTES`.

**A PRESS DURING A RUN IS KEPT, NOT DROPPED.** `syncNow` returned immediately
when `syncing`, and the run it collided with was usually the retry clock's,
twenty seconds after the error the inspector was reading — a press that did
nothing looked exactly like a press that failed.

**A PHOTOGRAPH OUT OF THE GALLERY IS BROUGHT INTO ONE SHAPE** (`standardise`,
`sniffType`, `reencode`): the BYTES decide what a file is, not the picker's
`type` — an empty type, `application/octet-stream` and `image/heic` all failed
`isPhotoType` and skipped the shrink entirely, so a 12 MP frame went into the
queue whole. Every photograph is re-encoded to JPEG at `photoPx()`; a frame
already JPEG and inside the limit is handed back untouched. What this phone
cannot convert (HEIC on Android) is KEPT, named with its real extension —
`extOf` used to call everything `.jpg`, which is how an intact file became a
broken frame in the office — and said out loud (`gal_odd_heic`). `intake`
returns the attachment as it always did; `intakeNoted` returns the reason as
well (`tests/intake.cjs`).

**THE OFFICE NORMALISES IDENTITY ON THE WAY IN TOO** (`idType` / `idDate` in
`dashboard/index.html`, the phone's `teamType` / `teamDate` word for word). It
did not, and every index it builds is keyed on the raw strings: a sidecar
written `insp` or `31.07.2026` was dropped from Due in silence and listed as
NEVER INSPECTED, while the phone counted the same round as walked. The office
also READS DELETION MARKERS now (`setDeleted`, a tombstone set): only the
browser that pressed Delete removed the round, so a second desk kept it in every
count and report for as long as its cache lived. `autoRefresh` is no longer
gated on `navigator.onLine`.

**THE DATE A DEFECT WAS RAISED IS NOT THE DATE SOMEBODY PLANS TO FIX IT.**
The Defects raised register read its date off **"Start date plan"** — the
second candidate in `CM_FIELDS` and the one this workbook has — so a defect
written up this morning and scheduled for the 28th was filed under the 28th,
the panel sorted newest-first on a column of FUTURE dates, and the twelve rows
dated next week sat above everything raised today. From a desk that is exactly
what a stopped feed looks like: *"already 24 hours since Defects raised
updated, but it has been updated in FTP every hour"* — while the file behind
it had refreshed six times that day. The workbook's own column is
**"Work request creation date"** (58 of 61) and it is now the only thing
`date` is read from; the planned start and the detection date are carried in
their own fields (`planStart`, `detected`), every row says which of the three
it was filed under (`dateFrom`), and the file totals them (`cmDateFrom`) so a
future workbook that stops carrying the creation date makes the panel SAY so
instead of quietly sorting on the plan again. A fallback is not a degraded
answer to this question — it is the answer to a different one
(`tests/cmraised.cjs`).

**AND THE CAUSE IS WRITTEN IN THREE PLACES, AT THREE DIFFERENT MOMENTS.** The
register read it off `WODefect cause` — the WORK ORDER's field, which the
office named and which is correct — but 1C only fills that once a work order
has actually been raised. Measured on 2026-09-14: of 48 defects, every one of
the 19 at status "Registered" had a blank cause and every one of the 29 past it
had one. Not eighteen of nineteen. All of them. A defect at Registered is still
a WORK REQUEST and the cause the inspector typed is in `WRDefect cause`, so a
field the site treats as mandatory printed an em-dash against an answer that
had been given. All three are read now, in the order 1C settles them (work
order, then request, then certification), each row records which one it came
from (`causeFrom`) and the file totals them (`cmCauseFrom`) — so "nobody has
typed one yet" can never again be confused with "this file looked in the wrong
column", and the office gets a number to chase instead of a row of dashes.

**ONE WORK ORDER, ONE CAPTION IN THE PLAN GRID.** A tier includes the tiers
below it, so TK156's 4,000 h order is four rounds — and each one printed the
same `WO-015691` and the same `4000h · 13.09` under its own pill. Four
identical captions in a cell 90 px wide is three lines of noise in front of the
one thing a planner is reading, and it made the fortnight grid three times
taller than the work in it. The rounds of one order on one day share a caption
now: pills on one line, the order and the hours once beneath them, each pill
titled with its OWN round name. Nothing is merged across orders — two orders on
one day are two visits — and the key is every word the caption would say
(order, hours, plan date, and whether it is a pre-check), so two entries share
one only when it would have been identical.

**AND NOTHING IN A CELL MAY READ AS A CLOCK TIME.** The caption said
`1000h · PM 07.09`, and at 11 px mono the interpunct is a colon and "PM"
after a number is a meridiem, so it spelled **ten in the evening** — on data
that carries no time at all. Reported from the office as "what's with the
time in INSP?". It is `1000 h` with a space now, and the pre-check note is
its own line in words. `tests/progchg.cjs` fails on any cell text matching a
clock shape or containing a bare "PM".

**A ROUND WALKED AHEAD OF ITS SERVICE IS MARKED IN A CHANNEL COLOUR CANNOT
TAKE AWAY.** The General Inspection is carried out `PA_PREINSP_DAYS` before
the service it belongs to, so it sits three columns left of the order it is
for — and that was said in the FILL alone, amber for a pre-check. A pill on a
day already gone turns red for being late and red wins, so exactly the
pre-checks somebody most needs to see lost the only mark saying what they
were, while the subtitle went on promising "General Inspection is
highlighted". It carries a **dashed ring** (`.pa-pre`) now, which is
orthogonal to the fill and survives greyscale and print, and the caption
states the gap **measured from the two dates on screen** — `3 d before
service 10.09`, `the service is today`, `service was 01.08 — not carried
out`. Never the rule's own 3 quoted back: a pre-check clamped forward to
today, or one whose service has passed, is not three days ahead of anything.
The key under the grid shows the ring rather than describing it.

**AN UNREADABLE DOCUMENT IS COUNTED ONCE, BY NAME.** `action=records` now
returns `failedKeys` beside `failed`; the phone keeps the set (`badNote`). The
count used to be ADDED on every incremental pull, and an unreadable document
sits on the cursor — so one bad file made the Due screen's warning climb by one
every five minutes, 288 times a day.

**A COMPONENT IS NEVER PRINTED IN TWO HALVES, AND THE RULE THAT PROMISED THAT
MATCHED NOTHING.** `atomBands` tells the cutter where a fold may not fall, and
its list said `.cell` — a class no element on this report has ever carried. The
component card is `.cel`. One letter: no error, no warning, nothing protected,
for as long as the list has existed, and a filter card sheared across the page
break in a signed PDF. The height cap was the second half: a literal 520 canvas
pixels, about a fifth of a page, where a card with a photograph is 814. It is
one page's worth now, passed in by the paginator — anything that CAN fit on a
page is moved whole, anything taller must still break or the document never
advances. `tests/rptclean.cjs` puts `.cell` back and watches a 631 px card get
cut, so the selector can never again select nothing in silence.

**"NOT RECORDED" IS FOR A FIELD THAT SHOULD CARRY SOMETHING AND DOES NOT.** A
position graded Normal with no defect has no direct cause and no detection
method, and printing "Not recorded" against it says an inspector left a form
half-filled when what happened is they found the machine in order — the
false-alarm half of this project's signature defect. `tbClean`/`tbNA` give a
clean position an em-dash and keep "Not recorded" wherever a finding makes the
field expected. The Maintenance action strip is the same story one level up:
`flagged` counted `it.action`, EVERY position carries one (a Normal one carries
"Monitor / re-inspect next PM"), so a round of nothing but 1s printed five
empty fields. It counts a defect, a cause or a grade of 3 and up; a clean round
gets one sentence — and still gets the heading, because an absent section reads
as a lost one.

**THE INSPECTOR'S OWN WORDS REACH THE OFFICE SHEET, IN THE GRADE'S INK.** A
table-bodied round — FC, INSP, TEMP, GET — had no column for the comment and no
row under the position, so everything an inspector typed about a filter was on
the phone, in the record, in the export, and nowhere on the document a
superintendent reads. `typeTable` gives it a `.rnote` row under its position.
The colour is `GRADE.TEXT`, a ramp of the same five grades **as ink on white**:
the chip HEX is a fill and set as 10.5 px type its middle collapses (the amber
is 1.83:1). The ink ramp measures 5.9–6.8 against white, past the report's own
floor. Never use `HEX` for text; never use `TEXT` for a chip.

**THE MASTHEAD IS NOT REPEATED THREE CENTIMETRES BELOW ITSELF.** The four-cell
MODEL / SMU / INSPECTED BY / LOCATION strip went on 2026-09-14: the subtitle
line already says the unit, the date, the SMU and the model, and the approval
table already names the inspector with the date beside it. What was only there
is the location, and that is one quiet line when the round carries a fix and
nothing when it does not. `metaStrip` still exists and still answers — it just
answers with the one fact the sheet does not already hold.

**THE CONDITION SCALE IS COLOUR-CODED AND THE COLUMN IS NAMED AS ISO NAMES IT.**
The scale wears the sheet's own five colours as filled swatches with the number
inside and the name beside, so it maps to the chip above without the reader
carrying five pairs in their head, and so it still maps in monochrome. The cell
headed LEVEL is headed SEVERITY / ISO 14224 and carries the class code
(`GRADE.iso`: NOF · INC · DEG · DEG · CRI) after the grade's own name.

**THE GRADE ALREADY KNOWS BY WHEN.** A target date is filled in rather than
asked for: 3 gets the next planned service for that round on that machine
(`DUE.days` with the class AND the unit, so DZ011's 500 h filter cut is its
own), 4 gets seven days, 5 gets tomorrow (`GRADE_DUE_DAYS`, `defaultTargetFor`).
A default and not a rule — only into an empty field, written into the record the
same instant it appears, and never over a date somebody typed.

**THE REPORT CARRIES ITS OWN FONT AND ITS OWN RESOLUTION.** `CMR.FONT_CSS`
embeds CM Sans (a kerned subset of Liberation Sans, Cyrillic in full, ~15 kB a
weight) as data URIs — a relative font URL would resolve against the wrong
directory on the office page, and `system-ui` meant a different set of glyph
widths, line breaks and page counts on every device. **Keep the `kern` feature
when re-subsetting**: the first subset dropped it and every capital T grew a
gap. The default raster scale is `2.4` on both surfaces (`RPT_SCALE`,
`DEF_SCALE`, `PHONE_PDF`) — the page IS a bitmap, so the scale is the print
resolution: 105 ppi × scale on A4, i.e. 253 instead of 190. The matrix timed the
same nine pages at 207/209/208 s across three qualities, so this costs size
(~290 kB a page), not time. Nothing in the report is lighter than `#5b6670` and
no label is under 9.5 px; `.alt` — the second language — is `.94em`, not
`.84em`; the vector footer is 8.5 pt at `#5b6670`. `CMR.PHOTO_PX` / `PHOTO_Q`
say once how big a photograph goes in, and the phone reads them.

**A TEAM SHEET SAYS WHEN IT IS MISSING PHOTOGRAPHS.** `teamPhotosFor` returns
what it asked for and what arrived; a deadline that expired mid-fetch used to
print three photographs where six were taken with nothing on the page saying so
(`rep_nophoto_part`, and `norm.gap` so the document's status can see it).
`rep_nophoto_off` was unreachable — it sat in the branch where there is no
destination at all.

**A PHONE THAT CANNOT WRITE DOWN WHAT IT SENT SAYS SO, LOUDLY.** Read off a
handset on 2026-09-13: nineteen rounds "waiting to upload", every one of them
already complete on the server — checked file by file against the folder, all
23 rounds that phone held, 18 byte for byte and 5 at the resized size the app
is designed to send (that phone stored 2–5 MB camera originals and shrank them
at upload; on 11 and 12 September the manifest and the folder match exactly,
because those were shrunk at capture). The phone's IndexedDB was refusing
writes, so `fresh.up = 1` could never be stored, the queue never shrank, and
every run sent all nineteen again over a pit link. `bookFail` holds the rounds
whose upload finished and whose bookkeeping failed, and the readiness card
says it in those words — the count, and that the server has them verified.
**It does NOT skip the record on the next run**: the retry is also what marks
the round up the moment the phone can write again, and it re-sends nothing to
do it, because `sent` already holds every name (`tests/recovery.cjs` §7 caught
exactly that when the first attempt skipped it). The verdict key is
`storage_nowrite`, ranked BELOW `queue_recover` and `queue_stalled` and kept
apart from `storage`: a quota estimate is the browser's opinion and reads
comfortable while the writes are already failing. The same phone also throws
`NotFoundError` on photographs the OS has reclaimed, which fails locally in
under a second — that is the "instant error on pressing Sync", and no request
was ever made.

**A SUBSCRIPTION THE PUSH SERVICE REFUSES IS RETIRED BY THE END THAT KNOWS.**
Read off the VM on 2026-09-13: six of seven handsets refused by Apple with
`BadJwtToken`, two of them since 6 September — every build push, every folder
push and every daily readiness push lost, with nothing visible but a log line
claiming the phone "re-subscribes by itself at its next open". It does not, and
it cannot: the phone decides by reading the key its subscription was MADE with,
Safari does not expose it, so the phone falls back to what the page remembers
storing — which matches — and a dead subscription is indistinguishable from a
live one from the handset. So `pushAll` counts consecutive 401/403 on the
subscription document and drops it at `PUSH_BAD_MAX` (2, not 1 — a push service
can have a bad minute and retiring a healthy phone costs it every wake-up); a
success clears the count; `op:"held"` lets a phone ask whether the server still
has it, and the phone acts on `held:false` ONLY, never on silence
(`tests/pushdead.cjs`). Both backends answer `held`.

**THE 1C PULL REFRESHES ITSELF, AT BOTH ENDS.** `data/work_orders.js` is a
`<script>` tag: read once at load, never again — so an office screen opened at
the start of the shift showed the work orders as they stood at breakfast, all
day, while the inspections beside them refreshed every three minutes.
`woRefresh()` fetches the file every `WO_MS` (10 min) and on returning to the
tab, parses the object out of it as JSON rather than evaluating it, replaces
`window.CM_WO_DATA` only when `generated` actually moved, and redraws just the
tab on screen (`tests/wofresh.cjs`). The cache is stepped past with a
timestamp, never the build tag: the hourly job deliberately does NOT bump
BUILD, so the tag cannot carry this file's freshness. At the other end,
**GitHub's schedule is best-effort** — the "hourly" job was measured running at
21:49, 23:35, 02:09 and 07:47 — so `server.js` watches the pipeline's WO.xlsx
by its HEADERS every `WO_POLL_MS` and dispatches the workflow the moment they
change, at most one run per `WO_GH_GAP_MS`. It is off unless `WO_GH_TOKEN` is
in `cm.env`, and says so once when it is not (VM-SETUP §12).

**AND THE PHONE IS THE THIRD END.** `data/schedule_slim.json` — the same pull,
sliced for the handset — was fetched on exactly three occasions, every one of
them requiring somebody to touch the Due screen: the toggle going on, This week
being opened, and a Due paint that found the cached copy over an hour old. The
shift that produces is the one the office reported: a phone opened at the crib
room, Due looked at once at 06:30, then carried around on the capture screen
all day while the pull behind it refreshed six times. `schedRefresh()` runs on
a `SCHED_MS` (10 min) timer, on `visibilitychange` and on `online`; the
freshness gate is `SCHED_STALE_MS`, cut from an hour to **15 minutes** because
an hour-long gate does not track an hourly source, it tracks it with up to an
hour of lag on top. `schedEnsureLoaded` refreshes the cache's timestamp on
every pull but replaces `SCHED` — and tells the caller to repaint — only when
1C's own `generated` has moved, so a timer, a visibility change and a paint
arriving together cannot make three requests or redraw under a thumb. The Due
screen states the age (`schedAge`, beside `histAge`) and says so only where 1C
is actually on screen (`tests/duetoday.cjs`).

**A MACHINE HELD OFF A ROUND IS HELD OFF IT ON EVERY SCREEN.** `DUE.OFF` is
the one place a machine comes off a round, and `DUE.offRound` the one way to
ask. Two things went wrong with it in two days.

It was ENUMERATED: INSP on 12 September, then MP and TB the same day. Those
three are the rounds class HT puts a KAMAZ on, so the three together happened
to mean "no Condition Monitoring work at all" — happened to. When the site
asked on the 14th for that to be the rule, an enumerated list could not state
it: add a ninth round type, or move one KAMAZ into a class carrying FC or
LUBE, and work reappears for a machine nobody put back on. It is `OFF['*']`
now, a wildcard every round type reads, and `offRound` concatenates it with
anything stated for the round in particular, so a machine held off everything
AND named under one round does not depend on which list is read first.

And `dueWeekRows` — the phone's agenda — was **the only reader of the schedule
that never called it**. planRows had it, dueRows had it, neverRows had it, the
office's duePlanRows had it. So from the 12th the List stopped proposing INSP
for the KAMAZ trucks while the calendar beside it went on drawing INSP for the
same trucks on the same days: two screens, one fact, two answers, and the
wrong one is the one somebody drives out on — the same shape as the
`schedWalkedFor` split, in the same pair of functions. Reported from the field
with TK030 and TK041 circled. Held-off rounds are DROPPED there, not struck
through: `done` is struck through because a walked round is work that
happened, and a held-off round is not work at all (`tests/dueweek.cjs` §6,
`tests/dueplan.cjs`, `tests/onevisit.cjs` — the last two each held a literal
`["FC"]` copy of the 12 September decision and so failed on correct code).

**THE GRADE FILLS IN THE DATE AND THE OWNER, AND KEEPS FILLING THEM IN.**
A 3 gets the round's own interval for this machine, a 4 seven days, a 5
tomorrow (`GRADE_DUE_DAYS`, `defaultTargetFor`); a 3 goes to the Maintenance
Supervisor and a 4 and a 5 to the Superintendent (`GRADE_RESP`,
`defaultRespFor`). Three things had to be true and only the first was.

FOLLOWING THE GRADE. The guard was `if(!p.target)` — fill only when empty.
The condition cards are tapped in order down the screen, so a 3 is usually
selected on the way to a 5; the 3 filled the field and nothing touched it
again. Read off a handset on EX016: a 5 selected, target 03.11.2026, fifty
days — the FC interval on an excavator, the answer for a 3, against "this
machine stops now". A default that cannot follow the thing it is a default OF
is not a default, it is the first tap made permanent. `targetAuto` and
`respAuto` remember what the phone last proposed, so an untouched default is
recomputed on every grade change and a typed one is never moved again.

NOT PAST THE NEXT TIME THE MACHINE IS OPEN. The interval alone is right for
what it was specified against (MP 250 h = 13 days, INSP 1,000 h = 50) and
wrong at the long end: a 3 on an excavator's undercarriage (4,000 h) came out
at 200 days, April 2027. It is capped by 1C's next planned service for that
machine and only ever pulled IN, so a machine 1C has nothing booked for still
gets the interval and nothing drifts later.

ONE ROLE, ONE SPELLING. `resp` is free text printed verbatim, so the default
is written in the phone's language — which alone would put two spellings of
one role in the folder and split one owner into two in the action register.
The stable key travels beside it as `respRole`, and is DROPPED the moment a
person's name is typed over the role. The label is for people, the key is for
counting; the wording is report-core's own `ap_sup`, not a copy of it.

**AND THE WORK ORDER IS ALREADY ON THE ROW THEY TAPPED.** `schedOrdersFor`
answers two questions off the one SCHED that `schedRefresh` keeps current —
`near`, the order this round is being walked against, and `next`, when the
machine is next open — and they are never one figure. `near` fills the 1C
notification / WO field: only into an empty field, written into the record the
instant it appears, never borrowed (a round no order covers gets nothing,
because a number from another job sends the office to the wrong work).
**Its first guard was `window.SCHED &&`, and `SCHED` is `let SCHED = null` at
module scope** — never a window property, so the guard was always false and
the function would have answered "1C has nothing planned" for all 1,128
machines, for ever, with no error and no empty field to notice. This project's
signature defect inside the check written to be careful about it, found by
probing the output rather than reading the code. `tests/schedwo.cjs` §1 plants
a schedule and asserts the lookup SEES it.

**A ROUND ALREADY WALKED IS MARKED DONE, NOT LEFT AS WORK.** `schedWalkedFor`
is the one rule — a CM round of that type on that unit dated on or after the
day 1C wants the service — and it was written inline inside `planRows` and
nowhere else. So the List's 1C scope dropped a finished round within the minute
while the agenda went on listing it for the rest of the fortnight: two screens,
one fact, two answers, and the one that was wrong is the one somebody walks
off. Both read the function now and differ only in what they DO with it — the
List leaves it out because it is a worklist, the agenda marks it `done` with a
tick and the date because a calendar with the work struck off it is the answer
to "did we do it" and a blank day is not. The chips count what is left TO DO;
the day heading says both figures in words.

**The agenda draws today or the fortnight** (`dueSpan`, `cm_due_span`, chips in
`#dueSpanF`). It narrows the DAYS DRAWN and nothing else — same rows, same
source, same late marking — so the two settings can never disagree about what
is on a day. Not a third tab: it is the span of one question, not a second one,
and `tests/tabsa11y.cjs`'s four rules are about panels.

**The office's photo cache is keyed by path, and the bucket rewrites a path.**
A round the phone re-sends — a retake, a new signature — lands under the same
name with other bytes, and the dashboard served whatever it had first seen
under that name for the life of the disk (a signature where the overview
photograph belonged, on 2026-09-13). `cacheGet(id, size)` drops a cached copy
whose length is not the index's, `fetchedSize` refetches a name the index now
reports at another length, and `CMDash.signUrlOf(rec)` hands the round's
`_SIGN.png` to the report, where the Maintenance Supervisor row of the
approval table is filled from the record — name, "Verified in the field
(signed)", date, the signature as an image — and stays an open line where the
record has none (`tests/officesign.cjs`).

**The report's type scale has a floor.** No label under 8.5 px, no text
lighter than `#5b6670` (labels) or `#3d474f` (secondary text); the unit
number is the largest thing on the subtitle line and the date and hours sit
quieter beside it; a grade or severity chip is ONE line with its translation
inline after a slash; a photograph keeps its own proportions (`object-fit:
contain`, height-bounded, on white) and is never cropped into a 4:3 stamp;
the phone's report thumbnails are `THUMB_PX` (900) at `THUMB_Q` (0.8). Senior
management read this on paper; 7.5 px grey was a microscope job.

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

**A BUTTON THAT REFUSES A PRESS MUST LOOK LIKE ONE.** Read off a handset on
build 375: "when you choose Not being done it's not responding — it never
worked." It was never a dead handler. The chip highlighted exactly as
written, and OK's own guard fired exactly as written — but a refusal was one
small grey sentence under a dialog that stayed open, and a phone at −40 with
gloves on cannot tell that apart from a button doing nothing at all. The fix
is not to relax the rule — a reason is still required, on every one of the
ten `DUE_PUT` chips including "off" — it is that `dueNotDoing`'s OK button is
now `disabled` outright until the reason box holds three characters, on every
event that could change that (chip tap, picking from the ten, typing,
clearing), so the button is visibly unpressable rather than silently
rejecting the press; the length check inside the click handler stays as a
second guard, not the only one. Selecting a chip with no reason yet also
moves focus to wherever the reason is entered, because choosing WHEN is not
choosing WHY. `tests/deferwhy.cjs` §7b and `tests/duelist.cjs` assert the
disabled state with a real `page.click()`, which fails the way a finger does
against an element that cannot be interacted with — a program calling the
handler directly cannot tell a disabled button from a live one that merely
declines.

**A GALLERY BATCH IS ONE PERMISSION GRANT, NOT ONE PER FILE PROCESSED IN
TURN.** Read off a handset on 2026-09-15: a component photographed from the
gallery failed to send; the same position retaken with the app's own camera
synchronised immediately. `ownBytes` already reads every photograph into
memory before anything is stored (build 372, the NotFoundError fix above) —
that was not the gap. The gap was ORDER: `addPicked` called `intakeNoted`
once per file, in the SAME sequence it also decoded and re-encoded them in,
and decoding a 12 MP frame is real time. A multi-select gallery pick hands
every file over behind ONE grant; file #1's canvas work held up the READ of
file #4, and by the time #4's turn came in the loop the OS could already have
taken the grant back — every reader failing together, indistinguishable from
a file that was already gone, because by then it was. The camera path never
showed this because it is always exactly one file, read the instant it is
handed over. `addPicked` now secures every photograph's bytes — one pass,
`ownBytes`, no decode — in PARALLEL, for the WHOLE batch, before the
sequential loop starts any of the slow work on any of them; a file that
still cannot be secured is passed through unsecured exactly as before, and
`intakeNoted` makes its own attempt downstream. `tests/gallerybatch.cjs`
makes decoding artificially slow and one file in a five-photo batch go
NotFoundError after a fixed delay — long enough to survive a parallel read at
pick time, too short to survive three files' decoding ahead of it in the old
order — and is the one test that tells the two orderings apart.

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
| INSP | **1000 h** — was 500 h until 2026-09-13, when the site asked for the general inspection to go with "only every 1000, 2000, 3000, 4000 …" service; stated as an interval and not as a list of tiers, for the same reason TB is (Plan vs Actual divides the 1C service's hour figure by this number, so a list in the office page would draw the thousands while the phone went on proposing every 500 h) |
| UC | **1000 h dozers · 4000 h excavators** |
| TB | **2000 h on HT + AT** — was 4000 h until 2026-09-12, when the site asked for the liner to go with the 3,000 h and 6,000 h services too; stated as an interval rather than a list of services so the Due list and the plan grid cannot disagree |
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
  Since Phase 4 the owner, due, status and work-order cells ALSO edit in
  place on a click (`cellEdit`): one editor at a time, built on the click and
  gone on Enter/Escape/blur, committed through `patchItems` like everything
  else — so a suite may assert that no `input`/`select` lives in the rows at
  rest, and must click a `td.ed` cell (not the row) to get one.
- **Overview ranks attention in ONE stated order** (`attentionOf`: Critical,
  Severe, overdue action, unassigned action, Degraded, Incipient) and the
  grade pill lives INSIDE that Priority column (`th[data-sort="prio"]`) —
  there is no separate grade column, because as two columns the Russian
  table ran 180 px past a 1366 screen. Read the grade off `.pill`, the rank
  off `.attn`.
- **The schedule has seven tabs** — Overdue · Due soon · Never inspected ·
  1C plan · Deferred · Completed · All — and **five** of them add up to All.
  Never-inspected rows come from `dueNeverRows()` (the phone's `neverRows`
  rule: a machine whose class is on a round with nothing recorded for it),
  carry no last date and no clock, and are excluded from `dueTabRows()`, whose
  every reader does arithmetic on both. **1C plan** (`duePlanRows`, the office's
  copy of the phone's `planRows`) is somebody else's schedule and is outside the
  sum: a work order planned inside `DUE.inAgenda`, resolved to CM rounds by
  `paHourInfo`, held-off rounds dropped, already-walked rounds dropped, one row
  per unit and round dated by the earlier work order. Folding it into Overdue
  or All would leave two questions answered by one number and neither of them
  trustworthy. Read tab counts by `data-dd` key, never by position.
- **Reports are made in ONE language or both** (`#rLang` / `cm_dash_rlang`
  on the dashboard, `#repLang` / `cm_rep_lang` on the phone). The bilingual
  switch is `ctx.bi`; `report.js` swaps the screen's `lang` for the report's
  only while the sections are built (`withReport`) and puts it back, so a
  suite can assert the screen language is untouched afterwards.
  `CMReport.sectionsFor` returns the document without a PDF and
  `CMReport.estimate` its page count from a real layout — use those, never a
  rasterised PDF, to test wording.
- **The report estimate's time is MEASURED, and the panel learns it.** Twenty-
  two seconds a page is what the matrix harness timed (one page 26 s, two 65 s,
  nine 207 s), and it is the same at every quality because the cost is
  html2canvas laying the page out, not the resolution — so quality is in the
  size (~200 kB a page × the 1.5 power of the scale ratio) and not in the time.
  `generate` times itself and folds the result into `cm_rpt_secpp`, so the
  figure a planner is quoted is their own machine's. It was 1.6 s a page and
  promised fourteen seconds for a report that takes three and a half minutes;
  `tests/rptest.cjs` makes a real PDF and holds the estimate against it.
- **The lubrication fleet matrix pages at 25 like every other table.** Rows
  page; the columns and the legend come from the whole filtered list, so the
  sheet's shape does not change as you turn the page, and a page that opens
  mid-class repeats the class heading. A suite that wants a particular model
  narrows with the class chip or presses `[data-pg="lubeMtx:size:100"]`.
- **A photograph can be marked, and a mark is part of the recipe.** `marks` in
  the `px` recipe — rings and arrows in fractions of the rotated, straightened
  frame, drawn onto the canvas BEFORE the crop so a crop clips them. The
  original is still never written to. `pxVisual` and `pxTouched` both count
  them, so a marked frame gets a derivative and a bare drag of nothing does
  not (`tests/pxmark.cjs`).
- **A unit report has a stated shape, and page one is fitted to hold it.**
  Page 1 the machine, the verdict, the drawings and the key; page 2 what was
  measured on this visit; then the history, which always starts a page of its
  own (`nb` on the first of each). A section marked `fit` is measured against
  the room a page has and its drawing narrowed 5% at a time — never cropped,
  never past `CMR.FIT_MIN` (0.6), because a puck is only readable if the frame
  separates the pucks. `atomBands` is the list of things a fold may not fall
  inside and it reads `> *`, not `> div`: the numbers key is SPANs, and while
  it said "div" a fold went through a key row and put two Russian sub-labels
  alone on a page (`tests/rptfit.cjs`).
- **Every tablist obeys four rules and a suite finds them for itself**
  (`tests/tabsa11y.cjs`): one tab selected, the selected tab matching the panel
  shown, each tab controlling one LABELLED panel, one stop in the keyboard
  order. Two things are navs and must NOT become tablists — the office page
  navigation and the phone's destination bar — and both say where you are with
  `aria-current="page"`, because a CSS class is not read to anybody.
- **Scale is measured on BOTH surfaces, at the size the folder reaches**
  (`tests/bigday.cjs`): 1,000 inspections over 10,000 findings, and the phone
  as well as the office. `scaleload.cjs` proves the office survives it and
  `perf.cjs` times 80 and 400 rounds; this times what a person does at the
  full size. The slowest thing on either surface is choosing a machine on the
  phone.
- **Russian on a tablet is its own acceptance** (`tests/tabletru.cjs`): 768 and
  1024, every page, in Russian, because Russian is longer and a tablet is
  narrower and the two together are what put the overview table 180 px past a
  screen. Its scan asks the LAYOUT whether an ancestor scrolls rather than
  naming containers, ignores one-pixel screen-reader labels, and proves it can
  still see by planting two faults and finding them.

**`TERMS` must never be a hard dependency of boot.** Both pages carry a shim
right after the `terms.js` script tag: if the file did not arrive, every key
answers with its own name so the page still boots and registers the worker.
Build 273 shipped without it, the language table read `TERMS.en` at load, and
a phone whose first load got `index.html` and nothing else had no worker and
no offline page (`tests/swfail.cjs`).
