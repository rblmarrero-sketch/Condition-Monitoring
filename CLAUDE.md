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

**AND THE CLASS BEING RIGHT IS NOT THE SAME AS THE SCREEN BEING RIGHT.** The
same handset, the same round, one build later (376, minutes after the fix
above shipped): "still don't respond and don't change color when touched."
The chip was in fact gaining `class="btn chipbtn danger"` exactly as written
— this was verified by reading `className`, which is how the first fix's own
test proved it — and NOTHING ON SCREEN CHANGED, because **`.btn.danger` had
no CSS rule on the phone at all**, ever, on any build. Not new: `ask()`'s
own dangerous-confirm button (`$("dlgOk").className="btn "+(danger?"danger":
"primary")`) — the "delete this unsent round" dialog among others — has been
setting the identical class, to the identical nothing, for as long as `ask()`
has taken a `danger` argument. A selected "Not being done" chip and a
"delete permanently" OK button both looked exactly like their own default
state; this project's signature defect one rung further down than usual,
because the STATE changed and even the MARKUP proved it, and still nothing
readable reached the glass. `.btn.danger{background:var(--critical);color:
#fff;}` is the whole fix — the dashboard already had this rule, the phone
never did. **A test that reads `className` is reading the DOM's opinion, not
the screen's**: `tests/deferwhy.cjs` §7b now also reads `getComputedStyle(...)
.backgroundColor` before and after the tap and asserts it actually changed,
which is the one question `/danger/.test(className)` was never able to ask.

**AND THE DIALOG SAVING CORRECTLY WAS NOT THE SAME AS THE SCREEN IT WAS
OPENED FROM SAYING SO.** Third report on the same feature, same shift: "when
I press OK it doesn't do anything — it should update then synchronize." By
this point the dialog genuinely was closing, genuinely was saving — `deferOf`
returned exactly the right document — and the fortnight agenda the dialog had
been opened FROM sat completely unchanged: the same count, the same row, no
mark of any kind. `dueWeekRows()` builds the agenda from 1C's schedule and
had exactly one hold-off check already (`DUE.offRound`, added for the KAMAZ
trucks) and exactly one walked-check (`schedWalkedFor`) — and had never once
asked `deferOf()`. The identical shape as both of those, in the identical
function, for the identical reason: a THIRD reader of the schedule with no
check the List has carried since deferrals existed. `syncDefer` genuinely was
queued to go out on the next run — the "synchronize" half was never broken —
but a phone reads "did anything happen" off the SCREEN, not off a queue it
cannot see, and the screen said nothing had.

The fix reuses the List's own rule rather than writing a second one:
`DUE.status`'s "live" test (`d.at >= last.d` — a deferral is answered by any
round of that type walked since) and its "put" test (a dated deferral holds
only while `d.until` is still ahead; the day it arrives the round is
ordinarily due again). A deferred row is not dropped, the way a held-off one
is — "not work at all" is true of a class the SITE took off a round; it is
not true of an occurrence one inspector answered "not now" or "no" for this
shift, and dropping it silently would be the same defect from the other
side: real work, invisible. It gets the SAME visual demotion `done` gets
(off the outstanding count, sorted to the bottom, muted styling) with its own
reason on the row, printed the same sentence the flat List already prints on
its own copy of the row (`dueRows()`'s `.dueput`) — one wording, read by
`t("due_put_to")` / `t("due_off")` on both, never a second copy. The two
badges an inspector actually watches (`#dueSpanF`'s Today / All 14 days
counts — the exact numbers open in the screenshot this bug was reported
with) now exclude a deferred round the same way they already excluded a
done one. `tests/deferwhy.cjs` §7c asserts the row is still ON the agenda
(never silently dropped), carries its reason, and that both badges actually
move.

**A NAME ABSENT FROM A CACHE NOBODY HAS CHECKED THIS SESSION IS SILENCE, NOT
A VERDICT.** Read live on 2026-09-15: TK115 (2026-08-05) and DZ007
(2026-08-02), weeks old and fully synced — every photograph present and
correctly sized on the server, confirmed directly against the bucket —
flashed into "10 photo file(s) missing" on the Data & Sync tab on every
dashboard reload, and cleared itself moments later with nothing else done.
`orphanPhotos()` built its MISSING placeholders from `CMDrive.hasName`,
which answers off whatever localStorage last cached; `showTab("sync")`
paints once, synchronously, off exactly that cache, and only afterward asks
the server for a fresh listing (deliberately — "the panel that says missing
has to ask last, not earliest"). The FIRST paint was reading an unconfirmed
cache as a confirmed absence. The fix does not wait for a SUCCESSFUL
refresh — `CMDrive.mediaIndexState().fresh` already exists for that, and a
caller that waited on it would wait for ever on a failing link, contradicting
the "stale beats absent" rule the rest of drive.js keeps. It waits for an
ATTEMPT: `tried` flips the instant `refreshMediaIndex()` is CALLED, not once
it settles, so a name absent from a cache this session has already asked
about is trusted as MISSING again, and one it has not yet asked about reads
as LOADING instead — costing nothing, because the keyless point still holds
the round for its own reason either way. A build with no
`CMDrive.mediaIndexState` at all trusts the cache immediately, exactly as
before this fix — there is no later, better answer for it to wait for.
`tests/quarflash.cjs`.

**AND NO BACKEND ATTACHED IS THE SAME SILENCE, NOT A CONFIRMED ABSENCE.**
The fix above still shipped a fresh way to get the wrong answer, on the very
next report: the sibling KPI tiles correctly said "no backend attached —
nothing to compare against" (`CMDrive.configured()` false, `syncScan()`'s own
`linked` guard), while the correction panel underneath them went on
confidently reporting TK115 and DZ007 as "10 photo file(s) missing."
`CMDrive.hasName` is a function whether or not a backend is configured — with
nothing to ask, it simply answers false for every name — and `idxTrust` never
checked `configured()` at all, only `tried`/`fresh`. A backend that was never
asked because there is nothing to ask is exactly as unconfirmed as one that
was asked and has not answered yet; `orphanPhotos()` now requires `linked`
before it will trust the cache as a verdict either way, matching the same
`CMDrive.configured()` check the KPI tiles already used. `tests/quarflash.cjs`.

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

**A SAVE THAT SURVIVES THE WRITE CAN STILL NOT SURVIVE THE PHONE BEING SHUT.**
Read off two trucks on 2026-09-15, in the same slot both times — the last
magnetic plug of an HT round, its second photograph, always from the
gallery: no dialog at the machine (`ownBytes` had already read the file
fine), the round captured and saved entirely OFFLINE, carried for hours
with the phone shut for the ride back, and only found broken once a signal
let the first upload try — NotFoundError, the same name build 372 already
gave a meaning to, but on the STORED copy this time. Re-picking a different
photograph into the same position, on the fixed build, reproduced it again.
`ownBytes` cannot see this class of failure: it only ever answers for the
read it was just handed, at intake, before the record has an id — it has
nothing to say about what IndexedDB does with that copy afterward, on a
phone that is about to be closed and carried for a shift. **Root cause
unconfirmed** — read every reader's bytes at intake and the picker's own
reference is out of the picture, which leaves either a WebKit IndexedDB
blob-durability gap under exactly this pattern (write, then close, then a
long idle/offline stretch) or something narrower this pair of rounds
happens to share; a platform bug is not fixed by asking harder in
JavaScript, so this ships a NET, not a cure. `verifySavedRec` reads the
record straight back out of IndexedDB — by its own id, the identical read
any later upload will make — the moment Save finishes, and if a photograph
does not come back, the inspector is told BY NAME, on the save screen,
while the position can still be retaken, instead of by a banner after a
drive with nobody left at the machine to fix it. It changes nothing about
what is stored or sent — a phone's own defect is never a reason to reject a
round — only which dialog is shown next. `tests/postsave.cjs` plants an
attachment every reader already refuses before Save ever runs (the exact
rig `tests/readpath.cjs` uses for "genuinely gone", keyed on byte size
because a marker property does not survive the clone into IndexedDB) and
proves the retake dialog names it, that a clean round still gets the
ordinary one, and that the round is saved and queued either way.

**AND THE ONLY THING THIS PAGE CAN ACTUALLY HOLD BACK IS THE SCREEN.** A
phone tested with signal the whole time (BL011) has never once reproduced
the failure above; every confirmed case was captured offline and the phone
was closed for a multi-hour drive before the first upload attempt ever ran.
There is no API on this platform to demand that an IndexedDB write reach
disk on command, so the write itself cannot be made safer from here — but
whether the SCREEN is allowed to sleep on its OWN right after Save is this
page's to decide, and a technician who taps Save and puts the phone down,
rather than pressing the power button, is the ordinary case. `holdAwake()`
requests a screen wake lock for a bounded window right when Save starts —
before the write, not after — and releases it itself; a platform that
refuses the request, or does not have the API at all, is swallowed the same
way `ownBytes` swallows a picker it cannot read, because a technician
should never see a permission dialog for a screen timeout. This does not
close the gap — a deliberate power-button lock, or simply carrying the
phone past the window, still can — it only shrinks it, for the specific
case this project has actually seen twice. `tests/wakehold.cjs`.

**FIELD-TESTED THE SAME DAY: NOT SCREEN LOCK, NOT STORAGE CAPACITY, NOT
ANDROID — AND NOT ALWAYS PERMANENT.** Six controlled tests, same shift,
2026-09-15, in direct response to "this never happened before": BS004
(always online) clean; BS005 (airplane mode, 5 min offline, screen ON and
never locked) clean; BL007 — a Samsung Fold, same recipe, same minute —
clean; CD001 (airplane mode, 5 min, screen never locked) reported two named
photographs `NotFoundError` mid-attempt, then **landed all six on the
server anyway** on a later automatic retry; BS002 and BL012 (a plain wifi
toggle off/on, 5 min, screen never locked) each lost photographs for real —
confirmed directly against the server folder, not from the phone's own
say-so — and were deleted from the phone before a further retry could be
tried.

That rules out two theories this file used to carry as the leading
explanation. It is not screen lock or backgrounding: BS002/BL012's screen
was on the entire five minutes. It is not storage capacity: the handset is
a 2 TB iPhone with almost nothing on it. **It also has not reproduced on
Android** on the identical recipe (BL007) — same JavaScript, same intake
path, different engine — which points at Safari/WebKit's own handling of
stored Blobs rather than at this file's code, without this file being able
to prove it further from here.

And CD001 corrects something this file asserted as settled: a `NotFoundError`
photograph is not always gone for good. `putAll`'s own bookkeeping
(`left = payload.filter(f=>!already[f.name])`) never marks a failed read as
sent, so a photograph that fails to read is retried from scratch on *every*
later sync attempt — nothing remembers "this one is dead" and gives up on
it. CD001's two named photographs read as unreadable once and landed
successfully on a later attempt minutes afterward, with nothing done to the
phone in between. So a `NotFoundError` banner means "unreadable on this
attempt," not "unrecoverable" — the only two confirmed-permanent losses
this project has are BS002 and BL012, and both were deleted before the
automatic retry got the chance CD001's got. Don't call a photograph gone
until retries have actually been exhausted over a real span of time, not
one failed attempt.

The mechanism underneath is still unconfirmed at the WebKit level, but one
candidate was found and closed the same day: **`reArmForSave`** (added
right after the finding above). It was always the FIRST photographs of a
round that went bad, never the last — and `draftKeep()` writes the WHOLE
current draft, the very same live Blob/File objects, to IndexedDB under
`__draft__` every time a position is left (`saveCur→draftKeep`). A
photograph taken early in a round has already been the target of several
`dbPut()` calls under the draft's id before Save ever runs; Save then hands
those SAME objects to `dbPut()` again under the round's own id, and deletes
the draft record within moments. If WebKit shares or reference-counts
backing storage across separate `put()` calls for what is, in memory, the
identical object, deleting the draft could silently take the round's own
copy with it — which would also explain why `verifySavedRec` never caught
it: it runs BEFORE that delete.

This does not depend on proving that mechanism. `reArmForSave` removes the
shared identity outright: every photograph and video is re-read into a
BRAND NEW File the instant before it is the record that gets saved — an
object that has never been handed to `dbPut()` under any other id, so
there is nothing left for `dbDel(DRAFT_ID)` to reach through. The
attachment's identity (its file name, which `attIdOf` reads) survives the
swap; only the underlying bytes are a fresh, independent copy. A read that
fails here keeps the original rather than losing the evidence a second
time — `ownBytes` already proved this exact photograph readable once, at
intake, so failure at this point is not expected, only guarded against.
`tests/redraft.cjs` proves the fix's own contract directly — the final
record's photographs are never `===` the objects the draft put into
storage, same name, same bytes — since Chromium does not carry the
suspected WebKit bug and cannot be used to reproduce data loss itself.
This is a candidate closed, not a confirmed cause found; the field test
that would confirm it is the same offline recipe run again on build 386.

**A ROUND WITH NO RECEIPT FOR A FILE THE SERVER ALREADY HOLDS COULD BE STUCK
FOR EVER, NOT JUST UNTIL THE NEXT ATTEMPT.** Read off two trucks on
2026-09-16: TK161's TB round sat at "1 photo(s) could not be read on this
phone… will retry by itself" through a full app restart and, on one of the
two, through a Share Inspection to a second handset — the SAME message,
unchanged, after every recipe the field could try. It was never going to
change by itself. `putBatch` sends what it can read and then throws for
whatever it cannot, on every attempt, always — that throw is correct and
load-bearing (`tests/upload-recovery-edge.cjs`'s own control cases depend on
it) — but it propagates through `putAll` and `syncNow` and keeps the ROUND'S
OWN `up` flag at 0 for as long as one photograph on it stays locally
unreadable with no receipt this phone ever recorded. And `confirmRun` — the
read-after-write reconciliation that is the only code in this file that ever
asks the server whether a stuck file is actually there — only ever runs for
a record already at `up:1` (`justDone`). A round that never reaches `up:1`
never gets asked about, so a photograph the server has genuinely held for
minutes, landed there from a DIFFERENT device via Share Inspection or from
an attempt of this same phone whose reply never arrived, produced the exact
same alarm on the thousandth check as on the first: not a retry loop that
eventually succeeds, a loop that eventually gives the same wrong answer
for ever.

`serverHolds()` cannot rescue this — it answers only from a receipt THIS
PHONE recorded, and a phone that received the file from someone else, or
never heard back the one time it sent it, has none. The fix asks a
different question, one step earlier: before giving up on a chunk, not only
after a round has already succeeded, `putBatch`, `putAll`'s single-file
path and its `oneByOne` batch-fallback all check the destination's OWN
folder listing (the same `action=list` call `confirmRun` already trusts)
for each name they are about to declare unreadable, and what remains
genuinely missing still raises exactly the alarm it always did, naming the
photograph. It costs one GET per chunk that still has an unreadable file
after the local read attempt — nothing on a chunk that reads clean.

**A NAME PRESENT AT A NONZERO SIZE WAS NEARLY THE FIX SHIPPED, AND IT WAS
WRONG THE SAME WAY THIS PROJECT HAS ALREADY BEEN WRONG ONCE.** An
adversarial review of the draft caught it before it went out: `fileName`/
`filesForRecord` derive a photograph's name from the equipment, the
position, the date and an ordinal — never from content or revision — so a
position retaken in a LATER revision lands its new photograph under the
EXACT name an earlier upload already used. A phone that could not read the
new file and asked only "is this name on the server, at some size over
zero" would find the OLD revision's bytes and call the round complete with
the WRONG photograph confirmed and nothing ever alarming — `landedAnyway`
above exists for the identical reason ("THE SAME NAME AT THE SAME LENGTH IS
NOT THE SAME FILE"), and the first draft of this fix repeated the mistake
one function over instead of reusing the guard. It is checked now against
what THIS attachment's OWN manifest entry says it weighs — `byteSize`, the
File object's own reported size, recorded at intake (`attNote`) before
anything about the bytes could go wrong, so it still holds even once they
do — and, where the listing gives one, that the folder's copy was written
no earlier than this attachment was captured (`serverListedAsCurrent`,
`LANDED_SKEW` for a phone clock running ahead — the harder case, where a
retaken photograph coincidentally re-encodes to the same byte count the
old one had, so size alone cannot tell them apart). `tests/upload-
recovery-edge.cjs` §4 carries both controls: a listed size that does not
match this attachment's own, and a listed file written before this
attachment was even captured — same size or not, neither is accepted.

`tests/upload-recovery-edge.cjs` proves the direct case against a mock
server holding the file under no local receipt; its controls (a chunk that
fully reconciles without asking, a file genuinely absent from the listing,
a destination that cannot be listed) prove the check does not paper over a
real loss. `tests/recovery.cjs` §5 carries the same distinction in its own
fixture — dropping a name from the mock's listing (`/__drop`) is what a
truly gone file looks like, and the round still waits and still names it;
restoring the name with no receipt ever given is what TK161 looked like,
and the round now completes on the server's word alone.

**A HISTORY CARD WITH ONE FINDING AND SEVERAL PHOTOGRAPHS IS NOT THE SAME
COMPONENT LOOKING LIKE TWO REPORTS.** `.b1` alone caps a lone card at 340px
— sized for a single short finding sitting among narrower content — and
`mpEvidence` already lifts that cap (the `wide` class) for the one shape
that needs it: one item, more than one photograph. `earlierRoundSections`
(the Equipment History report's older-round cards) never carried the same
check. Read off CR005's Jaw Crusher (CRS.JAW): its 2026-09-08 card — one
position, two photographs — printed squeezed to roughly a third of the
page, while the identical position on the 2026-09-10 visit, one section up,
spanned the full width (that section uses the gallery board, which is
already immune to the cap). The same component looked like two different
reports depending on which visit was showing it. `earlierRoundSections` now
computes `wide` the same way `mpEvidence` does and adds it to the board's
class when it applies. `tests/histwide.cjs` measures the rendered board
width directly (not the class string alone) for both the two-photograph
case and a one-photograph control that must stay capped, and is confirmed
non-vacuous against the pre-fix code. Its own fixture had to learn a
lesson from the surrounding code first: two photographs seeded as the
identical data URI collapse to one on ingest (content is deduplicated), so
a test proving a two-photograph card needs two genuinely different frames,
not one frame repeated.

**A FIX MUST CHANGE ONLY WHAT WAS ASKED, NOT WHAT ELSE LOOKED WRONG ALONG
THE WAY.** The same investigation also proposed hiding an MP plug's card
when it carried no grade and no photograph — a real gap (loadPos() stamps
a work order onto whatever position is on screen the instant it opens,
so a plug merely navigated past on the way to the one actually being
checked picked one up with nothing else) — but the maintainer's own
instruction was narrower: keep the report's existing content and layout,
change nothing there. That change shipped as build 389 and was reverted in
389→390 the same day, because a fix nobody asked for is still a change to
somebody's report, live to the whole fleet the moment it is pushed. It
remains a real defect, undocumented and unfixed, should it ever be asked
for again — but it is not this file's decision to make unasked.

**THE ONE PHOTOGRAPH LEFT ON A ROW OF ITS OWN PRINTS AT ITS OWN SIZE, NOT
STRANDED IN A THIRD OF A TRACK.** Read off EX021's own report: a position
with four photographs printed three across, evenly sized — the fix build
371 shipped for this same equipment, when a portrait frame beside two
landscape ones came out an inconsistent size (`gridCols`'s own history, see
below) — and then a fourth alone on its own row, pinned small to the left
third of the card with two empty tracks beside it nothing was using.
`auto-fill` cannot single that lone photograph out; it only knows how many
200px tracks the row's OWN width admits, not how many photographs are
actually left to place in it — the exact shape a maintainer flagged by
comparing the new report against the OLD, pre-371 one, which happened to
size a genuinely lone trailing photograph larger just because it filled a
whole row of the flexbox layout that build 371 replaced (for a different,
also real, reason: `#rptRoot .cel .phg img{display:block;width:100%;
aspect-ratio:4/3;object-fit:contain}` letterboxes a photograph rather than
stretching it, but html2canvas implements neither `aspect-ratio` nor
`object-fit`, so a mixed-orientation row rasterised inconsistently in the
FILE while it looked fine in the DOM). The ask was narrow and specific —
fix the size of the last photograph, keep everything else exactly as
build 371 left it — so the fix is narrow too: the gallery grid's column
count is computed in JS (full rows of three, `Math.min(3, ph.length)` for
a shorter one) instead of left to `auto-fill`, and a photograph that ends
up GENUINELY ALONE in the final row — a remainder of exactly one after
full rows of three — is marked and given the same explicit-height,
automatic-width treatment `.ph` already uses for a position with only one
photograph: its own size up to 330px, spanning the row instead of one
narrow track. A remainder of two, or no remainder at all, is untouched —
three, five, six or one photograph print exactly as they did under build
371. `tests/galorphan.cjs` proves the marked case (four, and seven —
the same shape one row later) and every one of those controls, and is
confirmed non-vacuous against the pre-fix code.

**THREE PLACES THE UPLOAD PATH TRUSTED SILENCE AS SUCCESS.** Surfaced by an
external code investigation, verified line by line against the running
functions before anything was changed. All three are in the client, not the
deployed backend, which has always answered correctly by construction —
these are about what the phone assumes on a reply that says something else.

`putBatch` threw an "unreadable" error naming ZERO files when a chunk was
already fully reconciled: every photograph in it failed to read AND every
one was already verified on the server (`serverHolds`), so both `built` and
`unreadable` came out empty — nothing was actually wrong — but the guard
only checked `built`, not `unreadable`, and raised anyway.

A batch reply of `{ok:true, saved:[...], failed:[...]}` that left a
submitted file out of BOTH lists was read as complete. `putBatch` marks
`sent` only from `saved` and only raises for names in `failed`; a name in
neither vanished silently. Upstream, `putAll` and `syncNow` read "no throw"
as "this destination is done" and could set the round's own `up:1`, while
`attSettle`'s per-attachment state — built from the very same `sent` map —
correctly kept it `pending`: two answers to the same question on the same
record, the exact shape this file's own rules list warns against. Every
name `built` for the wire is now checked against the union of `saved` and
`failed`; one missing from both is treated as failed, so it stays out of
`sent` and goes again next attempt.

`confirmRun` double-counted a file the server lists at 0 bytes when the
phone also knows what it should weigh: `size(n)===0` satisfied both the
`empty` filter and the `short` filter (0 is never the wanted size), so
`bad = missing.concat(empty).concat(short)` carried the same name twice and
`conf.n = names.length - bad.length` went negative for one bad file in a
one-file round — a confirmation count a person could not trust. `short` now
excludes an already-empty file outright, so the two lists partition `names`
instead of overlapping.

`tests/upload-recovery-edge.cjs` reproduces all three directly against
`putBatch`/`confirmRun` (with controls proving an ordinary batch and a
genuinely unreadable, unverified file are both unaffected), and fails
against the pre-fix code on exactly the four assertions tied to the bugs —
checked by hand before this suite existed, and again after.

**THE TRAY IS DRAWN TO ITS OWN REAL SHAPE NOW, TRACED, NOT APPROXIMATED.** A
maintainer review on 2026-09-16 held the dump-body liner diagram up against
the machine and against a redesign the client had already mocked up, and
neither matched: the app drew the regions each station occupies as a generic
opened-box outline, evenly spaced, landscape, with no relationship to the
manufacturer's own plan-view drawing — readable as data, useless as a map,
because an inspector standing at the tray cannot match a rectangle to the
thing in front of them. HM400 and TR60 each carry their own outline now
(`mobile/body-points.js`'s `regions`, one polygon per zone) and their own
portrait canvas size (`BODY.of(id).vb`) — portrait because that is how the
sheet is drawn and how an inspector actually holds the phone walking a tray,
head at the top, tail at the bottom, the two side walls left and right of the
floor exactly where they sit on the real machine. FRONT/LEFT/RIGHT/TAIL (and
TR60's FLR3) are the manufacturer's own polygons, unioned untouched; only the
floor's internal FLR1/FLR2 boundaries are synthesised (`shapely`'s Voronoi,
seeded on each zone's own points, restricted to the true outline), because
the source draws the floor in horizontal ROW bands and has no per-column
ground truth to copy — a straight-cut alternative was tried and abandoned
because it clips a station out of its own zone where the plate tapers. Point
identity (`k`, `z`, `en`, `ru`, `zones[].n`, `route`) never moved; only
`regions` and `vb` did, verified the same way `tests/bodychk.cjs` always has
— every station lands inside the zone that claims it and no other — so the
whole redesign carries no migration risk and no history-join risk.

**AND EVERY STATION IS NAMED ON THE DRAWING NOW, NOT ONLY THE ONE SELECTED.**
The client's own mock-up labels all sixty-two/forty-four station codes at
once and says so on its face ("point IDs preserved") — matching a plate in
hand against a code on the phone should not cost tapping through every other
station to rule it out first. `body-map.js` prints a small `.bm-code` label
under every dot (`o.codes !== false`), positioned below rather than beside
so it never falls into a neighbouring COLUMN — the tightest columns on this
drawing sit closer side to side than top to bottom. The one adversarial check
this needed — that no two of sixty-three tightly packed labels overlap, and
none sits on a station it does not name — has to measure the REAL rendered
box, at the REAL 6.4px rule, not a default browser font standing in for it:
a first draft of the check ran against `body-map.js` and `body-points.js`
alone, with no stylesheet at all, and every label rendered at the browser's
16px default came back "colliding" against its own neighbour — a false
alarm from a test asking a question the real page was never asked. Checked
instead inside `tests/tray.cjs`, which already boots the real page with its
real CSS for exactly this reason, HM400's own sixty-three labels are clear.

**A DIVISION LINE THE SAME COLOUR AND WEIGHT AS THE OUTLINE IT SITS INSIDE
IS NOT A DIVISION, IT IS THE OUTLINE'S OWN NOISE.** The floor's three rows
(FLR1/FLR2/FLR3) are separated by a plain line (`.bm-div`) so an inspector
can tell which row a reading belongs to without counting stations — and it
shared `--bm-edge` with the zone's own boundary stroke, at the same weight,
so on the pale floor fill it read as nothing: present in the markup, invisible
on the glass. It now draws in `--muted` (the label ink, not a boundary colour)
at 1.6px instead of 1px, fully opaque instead of .7 — the same fix on the
printed report's own `.bm-div`, which had the identical problem in its own
palette. Neither surface had a test asserting this line is actually visible;
this was caught by rendering the real page and looking, the way the client
asked for it to be checked.

**A COMMENT WITH A BACKTICK IN IT INSIDE A TEMPLATE-LITERAL CSS BLOCK IS NOT
A COMMENT.** The report-side fix above was first written as `` `.bm-div` ``
and `` `#5b6670` `` inside a `/* … */` comment, because that is how a code
name or a colour is written everywhere else in this file's prose. `report-
core.js`'s CSS lives inside a JavaScript template literal, and a backtick
anywhere inside one closes it — silently, with no error at the backtick
itself, only a `SyntaxError: Invalid or unexpected token` pointing at
whatever came next, however far down the file that was. Caught by
`node --check` before the change ever reached a test, let alone a push: had
it shipped, every page that loads `report-core.js` — which is both surfaces
— would have failed to parse it and lost the report engine entirely, for a
two-word comment nobody would have thought to suspect. Plain quotes only,
never a backtick, inside any comment that lives inside a template literal.

**THE PRINTED TRAY WAS CUT FOR BOTH MODELS, AND THE LIVE DOM SAID NOTHING
WAS WRONG.** A real report on 2026-09-16, TK108's HM400: the drawing
printed a sliver about 46 CSS px wide — the L-series stations down one
edge, then nothing — with every floor, right-side and tail station simply
gone, no error, no warning. The drawing was correct: `svg.bodymap`
measured a real, right 292x640 in the very DOM handed to html2canvas, and
giving it an explicit pixel width instead of the portrait rewrite's
"auto" changed nothing, because the live box was never wrong. The mis-
render is inside html2canvas's OWN pass over an inline `<svg>`'s children
— the identical renderer `flattenUcmapPhotos` already distrusts for a
nested photograph, on a drawing that carries no photograph at all to
blame it on. Confirmed by rasterising the same markup through the
BROWSER's own SVG-to-canvas path — exactly `flattenUcmapPhotos`'s
technique — and finding every station present, correctly placed, proof
the html2canvas copy was the only thing that was ever wrong.
`CMR.flattenBodyMaps` is that same rescue for every `svg.bodymap`, no
`image` filter, wired into `CMR.paginate` beside the existing one. TR60's
own report was cut exactly the same way the same day, before either was
fixed.

`tests/bodyflatten.cjs` reads the ACTUAL RASTER html2canvas produced on
both models, never the live DOM — the live DOM was correct on 2026-09-16
too, and said nothing about the file, which is exactly how this shipped
in the first place. Confirmed non-vacuous by hand: with the call to
`flattenBodyMaps` commented out, the suite's own "still paints after
flattening" checks fail on both models. A first draft of that same check
sampled a dot's exact centre, which is a pale fill by design
(`var(--surface)`) — the same near-white as a blank page — and so it
called every station "blank" whether or not the fix was in; the check
reads the darkest pixel in a small neighbourhood instead, because a
station's own stroke ring or code label is what actually answers whether
anything was drawn there.

**A LANDSCAPE PHOTOGRAPH IN GENERAL EVIDENCE HAD NO CAP, SO IT WAS NOT A
STANDARD TILE.** `.cel .phg.gallery` (the findings gallery) caps the grid
ITEM itself — the `<img>` is its own track's occupant, and `max-width:100%`
on it is enough. `.shots`/`.genrow` (general evidence, not tied to a
finding) wrap the photo in a `<figure>` for its caption, and that figure —
the actual grid item — carried `max-width:none`, on purpose, from a
narrower fix (`object-fit:cover` cropping a stamp small enough to look
"distorted"). A landscape frame wide enough at its fixed 182px height has
nothing to stop it growing past its own track into the row's free space,
so three photographs on 2026-09-16 printed as two oversized tiles with a
gap where the third belonged — read live and reported as "landscape
photos are not standard tiles". Fitted inside a box now
(`max-width:240px;max-height:182px;width:auto;height:auto`) — the
fit-inside-a-box technique that predates `object-fit`/`aspect-ratio` and
asks html2canvas for nothing beyond what it already does correctly for a
plain `<img>`: derive size from the photo's own ratio. A portrait frame
and a landscape one now occupy the identical footprint.
`tests/rptmirror.cjs`'s own CSS-string check had encoded the BUG as the
contract (`height:182px` and nothing capping width) — updated to check the
box instead, or a real fix would have failed a passing suite.

**A PHOTOGRAPH DOWNSCALED TO 900px COULD NOT FILL A 330px-TALL CELL.**
`CMR.PHOTO_PX` caps the WIDTH a photograph is re-encoded to before it goes
into the document — correct for the ordinary 182px-tall cell, where 900
wide at any real aspect ratio carries more height than the 436 device px
that cell needs at scale 2.4. The one CELL taller than that
(`.last1`, height:330, the lone photograph on its own row) needs 792
device px, and a 4:3 LANDSCAPE photo capped to 900 wide carries only 675
— less than the cell asks for, so the page raster stretched it past its
own resolution, read on paper as soft and worse once a reader zoomed the
PDF in. Raised to 1600 — the same figure the phone already shoots at
(`PHOTO_PX_DEFAULT` in mobile/index.html), not a second capture
resolution to keep in step with the first — a landscape frame at that
width still carries more height than any cell in this report asks for,
16:9 included. Quality raised a step with it (0.86 → 0.9): the extra
bytes an inspector is already carrying at 1600 are worth less if the
second JPEG pass throws half of them away again. This is the SAME first
pass on both surfaces — the phone's own page-raster JPEG quality
(`PHONE_PDF.jpeg`, 0.86) is a separate, deliberate choice for a satellite
link and is untouched; `tests/teamopen.cjs` already asserts it.

**THE EQUIPMENT HISTORY REPORT NEVER GOT THE MASTHEAD IT WAS BUILT WITH THE
SAME MARKUP FOR.** `unitSheets` and `summarySheets` (the "Equipment History
and Trend" and fleet-summary documents) build the identical `.mhead`/`.m1`/
`.msub` masthead markup the single-round report does — title, unit number,
report-number pill — but never wrapped it in the `class="mast"` div that
carries the ACTUAL styling: the 2.5px dark divider, the 20px bold title,
the bold 17px unit number. Zero of it applied, on either document, since
the day this shape was written — the read-off-the-file complaint was "this
looks totally different, not professional" beside a round report's
masthead, and the reason was one missing wrapper class, not a design
difference. Wrapped now, matching the single-round masthead exactly.
`tests/prevmeas.cjs` had encoded the OLD bare masthead as part of its own
"one header, not one per round" check — counting `class="mast"` and
`class="mhead"` together assumed they were mutually exclusive alternatives,
which stopped being true the moment both classes could sit on the same
element; the check now counts `class="mhead"` alone, since that is the one
thing that is still true regardless: exactly one masthead, wrapped in
`mast` or not.

**A GRADE ON A MEASURED STATION CAN EXIST WITH NOWHERE TO FINISH IT.** Read
off a Dump Body Liner round on 2026-09-17: "Can not save… its saying need to
grade but we dont grade dump body… there is no selection for grade thats the
problem." The tray genuinely never shows the manual 1–5 cards — a measured
station's condition is its reading, not a pick, and that has been true since
build 86 — but the defect picker sets a grade on **any** round type when the
chosen defect carries a `defaultSeverity`, with no `gradeAppliesTo()` check of
its own. `renderGradeReq()` — the box holding the target date and the
notification tick a Critical or Serious grade requires — was ALSO gated on
`gradeApplies()`, the same flag that (correctly) hides the manual cards. So a
tray station holding a silently-assigned 5 had the one box that could ever
supply what Save demanded permanently hidden: Save asked for a target date
forever, with nothing on the screen able to give it. Fixed by dropping that
extra gate — the box now shows whenever a finding-level grade exists,
whatever set it, while the manual cards stay exactly as hidden as before.

**AND THE DEFECT THAT SET IT HAD NO MIRROR FOR TAKING IT AWAY.** The same
field visit, TK115's F95: "5 – Critical needs a defect, an action, a target
date, a comment, a close-up photograph, the notification tick" — **every**
field blank, on a station whose cards are never shown at all. Reproduced
exactly: picking a defect with a `defaultSeverity` writes `grade`/`gradeAuto`
onto the position, but clearing that defect back to "— none —", or changing
it to one with no severity of its own, left the grade standing — the code
checked `d.defaultSeverity` before writing a grade and never checked it
before **un**-writing one. On a round with manual cards this is merely
confusing (the inspector can see and correct a stray grade); on a measured
station there is no card to notice it on. The same handler now clears an
unconfirmed auto-grade (`gradeAuto` set, `gradeMan` not) the instant the
defect that proposed it stops applying — a grade a human confirmed by hand is
never touched. `tests/needgrade.cjs` reproduces both: the dead end (fixed by
the first change) and the orphaned grade (fixed by the second), each proven
non-vacuous against the pre-fix code.

**A REJECTION WITH NOTHING TO SAY STILL HAS TO SAY SOMETHING.** The same
phone: "Could not record TK150's progress on this phone **(null)** — the
phone may be out of room." The parenthesis was the whole diagnosis, and it
said nothing. `up_bookfail` builds its reason from
`String((e&&e.message)||e)`, which is right about a real `Error` — but
`dbPut`'s own `onerror` handler was `()=>rej(t.error)`, with no fallback, and
`IDBTransaction.error` is nullable by spec: a transaction can fire "error"
with `.error` still `null`. `dbPut`'s sibling `onabort` handler already knew
this (`t.error||new Error("save aborted — storage may be full")`, one line
below); `onerror` was simply never given the same treatment. A caught `null`
stringifies to the four letters a technician read on the glass. Five other
IndexedDB wrappers shared the exact gap — `idb()` itself, `dbAll`, `dbTeam`,
`dbGet`, `dbDel` — all fixed the same way. This does not explain WHY the
transaction had no error object; only that whatever reaches the technician is
now a sentence, never a null. `tests/dbnullerr.cjs`.

**A CARD WITH NOTHING ON IT IS NOT A CLEAN READING — IT IS ONE NOBODY WALKED
TO.** A printed TK150 report: two of four cards in "Equipment and component
evidence" carried a work-order tag and nothing else — no grade, no photo, no
defect, no comment — the same area on the page as a real finding and none of
its information. `loadPos()` stamps the round's own work order onto whatever
position is on screen the instant it opens, so a plug merely navigated past
on the way to the one actually being checked picks one up with nothing else.
This is the exact gap build 389 found and reverted the same day, because
hiding it was proposed but never asked for — "it remains a real defect,
undocumented and unfixed, should it ever be asked for again." It was asked
for: "remove [it] in the report if no photo or comments… or just maybe a
note that 1 and 4 not taken." `mpEvidence()` now drops a position with
neither a grade, a photograph, a defect nor a comment from the board
entirely, and names whatever it dropped in one quiet line beneath it — "Also
on this round, not inspected: 1, 4" — so the reader still knows the round
has more plugs than the ones printed rather than concluding, wrongly, that
only four exist. A grade of 1 — Normal, even with nothing else on the card —
is a real reading (the inspector stood at that plug and looked) and keeps
its card exactly as before; this is not a "hide anything sparse" filter,
only the one shape that is never a reading at all. `tests/mpskip.cjs`,
confirmed non-vacuous, and `tests/rpttypes.cjs`/`prevmeas.cjs`/`rptmirror.cjs`
re-run clean against it.

**THE PDF'S OWN FIX HAD A SECOND, SEPARATE COPY ON THE LIVE PAGE.** The build
above fixed `mpEvidence()`, in `report-core.js` — the engine both surfaces
share for a generated document. It did nothing for the dashboard's own
Equipment History screen: "still there 1 and 4, no photo and comments" —
because `renderHistory()`'s gallery card view builds its position grid with
its OWN filter, inline, never through `mpEvidence()` at all, and that filter
only ever excluded an empty position on a measured (wear-type) round —
exactly the one case that was never the complaint. A new `histShown(i,rec)`
carries the identical rule report-core's fix already proved correct (a grade,
a photograph, a defect or a comment — any one of them is a reading; none of
them is a plug nobody reached) and `renderHistory()` splits each round's
positions into `shownPos`/`skippedPos` before building the grid, with the
same one quiet line naming what was skipped. `tests/histskip.cjs` opens the
real page, not `sectionsFor()`, because that is the one thing report-core's
own test could never have caught — it never renders `dashboard/index.html`
at all.

**A PICTURE ALREADY ON THIS DISK STILL NEEDED ITS FIRST REPAINT ON A FRESH
TAB.** "find why its not loading the phot. it loads only when I click report
or edit... before it loads fast." `ensurePhotos()` (build 374's own fix for
the re-render loop, see above) answers with what it ADDED to `fetched` —
this module's in-memory map, empty on every fresh page load — never with
what the network did. The browser's own disk cache (`MEDIA_CACHE`, Cache
Storage) survives a reload; a photograph fetched in an earlier tab is still
on it. But the cache-hit loop only ever populated `fetched` and counted
nothing, so `if (!miss.length) return 0` answered "nothing to report" for a
name this PAGE had never shown before quite as confidently as it answered
for a name already painted seconds ago — the card built moments earlier had
no picture in it, and nothing told `pullDrivePhotos` to look again. The loop
now counts `added`: a name the first time THIS session sees it, whichever
store it came from, skipping only a name `fetched` already holds (the
build-374 case, unchanged) — so a page's first look at a unit earns its one
repaint whether the bytes came over the wire moments ago or off a disk a
prior visit already filled, and a second call for the same unit still adds
and repaints nothing. Proving it needed a backend of its own:
`tests/mock.cjs` always answers a photo request with a fixed 13-byte body
while declaring `size:90000` in its index, so `cacheGet`'s own size check —
correct, and load-bearing, see `landedAnyway` above — threw the "cached"
copy away as a different file on every single call, and neither this nor
`noloop.cjs` had ever actually exercised a disk-cache hit. `tests/loadonce.cjs`
carries its own tiny backend where the declared size and the served bytes
agree, the way a live folder's do, and strips the `#equipment?eq=` a first
visit's own address bar carries — restoring it on reload would re-select and
re-fetch the same unit during BOOT, before the test ever asks, which earns a
repaint for a reason the field case does not have.

**THE HISTORICAL SIDE OF A MAGNETIC PLUG ROUND WAS PACKED TWO TO A ROW; THE
CURRENT VISIT NEVER IS.** "photos report are not fixed as agreed... still
very messy photos," with TK150's Equipment History PDF attached: 4E on the
latest visit filled most of the page; the identical position one visit
earlier, in the same document's history section, printed at roughly a
quarter of that. `earlierRoundSections()` already had the lone-item "wide"
exception `histwide.cjs` proved (a single item with more than one
photograph is lifted clear of the `.b1` 340px cap) — but a Magnetic Plug
round almost never carries a lone item, it carries 4E and 4F together, and
`told.length===2` packed them into a two-column row regardless: each item's
own column already halved, and the photo grid inside that column halved it
again. The fix extends the same exception to this shape — two items, each
carrying more than one photograph — the ordinary MP pairing, not a rare
edge case. Confirmed by rendering the actual failing report through
`CMReport.sectionsFor` and measuring the rasterised `.cel` width directly:
187px before, 378px after, against the current visit's own 378px — and by a
control proving a three-item history round (which already packed correctly)
keeps its existing density (`tests/histpair.cjs`).

**RTW'S OWN SIGNATURE PAD NEVER GOT THE ONE CSS LINE THAT MAKES A TOUCHSCREEN
DRAW ON A CANVAS.** Reported plainly: "the whole signature window is not
working." The main wizard's shared pad has carried `touch-action:none` since
it shipped — without it, a real finger-drag on a canvas sitting inside a
scrolling container is a SCROLL gesture to the browser's own gesture
recognizer, not a stream of pointer events to this page's JS, and no ink
ever lands. RTW's own signature canvas sits inside `.rtw-ov-body`
(`overflow-y:auto`, because the checklist screen scrolls) and never carried
the rule. `tests/rtw.cjs`'s own `draw()` — and the main pad's
`tests/signfold.cjs` — call `canvas.dispatchEvent(new PointerEvent(...))`
directly, which invokes the registered JS handlers WITHOUT ever asking the
browser's native gesture pipeline what `touch-action` says, so both suites
passed identically with or without the rule. `.rtw-sign-pad-slot canvas`
now carries `touch-action:none`, matching `.signpad`, and `tests/rtw.cjs`
also asserts `getComputedStyle(canvas).touchAction === 'none'` directly —
the one thing a dispatchEvent-based draw test can never otherwise catch.

**THE MARK COLUMN WAS THE ONE CELL THAT NEVER WENT BILINGUAL.** `tbRtwMark`
called the bare `T("rtw_pass"/"rtw_attn"/"rtw_na")` — makeT's own contract
says the bare form is primary-language-only, for a title attribute or a
joined fragment, never a value shown in a bilingual table — while its two
neighbouring cells (the description, the release verdict) both already went
through `T.both`/`T.I`. Reported as "shifting from English to Russian in
the report has a bug": the Pass/Attention/N/A column stayed in whichever
language it was NOT switched to. Fixed to `T.I(...)`, dropping the `esc()`
wrapper `T.I` already applies. A second, related bug sat one level up:
`rtwSummary`'s release verdict and `rtwChecklist`'s row description and
section title all read `T.both(en, ru, cls)` on a FIXED en/ru pair from
`mobile/rtw.js` — `T.both` always leads with its first argument, and
outside a bilingual report prints ONLY that argument, so a Russian-only
report kept the checklist text and the verdict in English regardless. Both
are `T.pair(en, ru, cls)` now, which reorders on `T.lang` the way every
other fixed-pair caller in this file already does (see `T.pair`'s own
comment on why it exists). `tests/rtw.cjs` §11b regenerates the same round
with `cm_rep_lang` forced to `"ru"` and asserts the checklist text, the mark
column and the verdict all actually switch — not just the labels that were
never broken.

**THE WORK ORDER WAS A BOX PARTWAY DOWN THE PAGE, AND CARRIED NOTHING BUT
ITS OWN NUMBER.** Read off a real DZ014 report, with the box circled: "put
the work order number on top... also include the type of work order and
schedule of work. then put also the hours completed from schedule." The
number, its maintenance type, 1C's own plan date and the hour tier it was
raised against all exist in `ingest/ingest_work_orders.py`'s `work_orders`
rows — `build_rtw_open` only ever carried the number and a free-text
description through to the phone's Pick screen. It now also carries `type`,
`hours` and `plan` (null/blank for a defect work order, which is not
hour-tiered — never guessed); `rtwPickRow` puts them on the draft, Save
writes `rtwWoType`/`rtwSchedHours`/`rtwSchedDate` onto the record, and
**four separate places** turn that record into what a report reads —
`recToExport0` (the synced/dashboard shape), and, on the phone itself,
`rptRecords` (this phone's own PDF) and the team-round reader (a synced
round pulled from another phone) — each needed the same three fields added
by hand, the exact "one fact typed in several places" shape this file's own
rules warn about, and the reason `tests/rtw.cjs` regenerates the real report
through `buildReportSections` rather than trusting any one of them read in
isolation. `rtwHeaderStrip` prints all four facts (WO, type, schedule,
hours) in the same one-line `.sstrip` cell strip the status block already
uses, ABOVE the release verdict — one row of page height whether it carries
one fact or four, not a boxed line per fact.

**"DESCRIPTION OF OPERATIONS" PRINTED TWICE, ONCE PER SECTION, ON A FORM
WITH ONLY TWO.** Read off the same report, the second header row circled:
"remove the description of operation we already have on top." Each of RTW's
two sections built its own `typeTable`, so Section 2 opened with a second
copy of the No./Description/Mark header row a reader had already read once
— on a real printed sheet that reads as leaving one table and starting a
different one halfway down the page. `rtwChecklist` now builds ONE running
`<table>`: the column header prints once, and each section starts with a
divider row inside the same table. The sections are numbered on that
divider now too ("1. Pre-release inspection", "2. Service completion") —
asked for by name, and worth doing regardless: the item numbers alone
(1.1 … 2.4) never said how many sections the form has.

**COMMENTS WERE A ROW UNDERNEATH, NEVER A COLUMN, AND THAT COST A WHOLE
PAGE.** The below-row `.rnote` strip every other table-bodied type uses
(Filter Cut, General Inspection, GET) is the wrong shape for a form this
project was asked to hold to one page — a comment on its own full-width row
costs a row and a half instead of nothing extra per row, on a 23-item
checklist already close to a page's room. Comments print in their own
column now, on the right, in `.rtw-cm` (same ink as `.rnote`, same
left-border stripe technique as `.stripe`, as an ordinary cell). `.rtw-tbl`
tightens the row padding and font a step further for the same one-page
reason. Left BLANK when there is nothing to say — this is an optional
annotation, never a field the round is expected to carry, so `tbMiss`'s own
"Not recorded" rule does not apply to it (see that rule's own comment).

**RETURN TO WORK HAS ONE SIGNER, NOT THREE.** The shared `approvalBlock`
prints CM Technician / Reliability Engineer / Maintenance Supervisor for
every round type — right for a scheduled CM round, which genuinely is
walked by one person and reviewed by another before a supervisor verifies
it. RTW is a checklist one Senior Mechanic completes and signs on the spot;
there was never a second or third role in that workflow, and the other two
rows printed as open, unfillable signature lines asking for signatures the
form never needed. Circled on a real report: "Remove the CM technician and
Reliability Engineer." `approvalBlock(T, rec, onlySup)` takes an optional
third argument — RTW's own call site is the only caller that passes it —
and every other type keeps all three rows exactly as before.

**THE WORK ORDER NUMBER MOVED AGAIN — INTO THE MASTHEAD ITSELF, NOT JUST OUT
OF THE BOX.** The header strip build 436 shipped was still a box of its own
below the title; a second annotated report drew the arrow all the way to the
masthead pill beside the report number. `head` (shared by every branch — the
one thing built before RTW's own branch even runs) now appends
`" · " + rec.rtwWo` to that pill for RTW only; every other type's pill is
untouched. The strip that used to hold the WO number now states what 1C
scheduled and how this release compares to it: **priority** (just the code
— P1–P4 — read off 1C's own text, "P3 Planned (PM)" prints as P3, the same
way a plan-grid pill states priority everywhere else in this project),
**type**, **hour tier** and **plan date**, plus a **calculated** field,
"Released vs. schedule" — the whole-day difference between `rec.date` (when
the checklist was actually completed and signed) and 1C's plan date, printed
as "N d late" / "N d early" / "On schedule", never typed and never guessed:
blank when either date is missing. Priority is a FOURTH field carried the
same way type/hours/schedule already were — Pick → Save (`rtwWoPriority`) →
three read sites (`recToExport0`, `rptRecords`, the team-round reader) — the
same "one fact typed in several places" shape this file's rules warn about,
now four sites deep for this one record.

A debugging note worth keeping: the priority cell appeared to not render at
all on the first pass, and the actual bug was in the TEST, not the code —
`T.I()` wraps a bilingual LABEL in a trailing `<span class="alti">/ ...`
before the closing `</div>`, so a test regex written for the exact string
`<div class="sk">Priority</div>` never matches once bilingual is the report's
default. The same "plain string in a bilingual cell" trap `tbRtwMark`'s own
fix (above) already documents — this time in a test's own assertion rather
than in the code the test was checking. Confirmed by reading
`window.__rtwHdrDebug` off the live page (a temporary hook, removed once the
real cause was found) rather than guessing from the output alone.

**THE EYEBROW WAS GIVEN RTW'S OWN TITLE, AND THAT WAS THE SAME REDUNDANCY
MOVED UP A LINE, NOT REMOVED.** Build 438 swapped the generic eyebrow
("Field condition monitoring") for "Return to work / Контрольный осмотр
перед возвратом в работу" on RTW sheets only, asked for by name. Reverted
the same day, from an annotated report circling BOTH lines: the m1 title
one line below already reads "Return to Work / Возврат в работу", and the
new eyebrow text was not only the same fact twice, it was a LONGER
bilingual copy of it that wrapped onto two lines and visually collided with
the title underneath. "put only one" — the title already was the one; the
eyebrow went back to stating what every report on this sheet has in common,
same as every other type, and `mastHead` lost the `eyebrowKey` argument
build 438 gave it, since nothing calls it with anything but the default
once this reverted. The lesson generalises past this one line: a redundant
fact does not stop being redundant because it moved to a different field —
before adding a second place to say something, check what the FIRST one
already says.

**EDITING A SAVED RTW ROUND OPENED THE GRADED WIZARD, BECAUSE THE QUEUE'S
"EDIT" BUTTON NEVER ASKED WHAT TYPE IT WAS OPENING.** Reported plainly: "if
I select edit, its going to Inspection page, it should go to RTW." The
Saved tab's row handler called `editRecord(rec)` for every type — which
rebuilds `draft` from the GRADED shape (grade/sev/defect/cause) every other
round type carries and RTW never has, so a technician correcting a typo on
an already-signed release checklist landed in Setup → Findings → Review
instead. `rtwOpenForEdit(rec)` is RTW's own mirror of `editRecord`: it
rebuilds `rtwDraft` from the SAVED record's own fields (the shape
`rtwSave()` actually wrote — `rtwWo`/`rtwWoType`/`rtwSchedHours`/
`rtwSchedDate`/`rtwWoPriority`, each position's `mark`/`comment`/`photos`,
the general block, the existing signature reloaded onto the pad) and opens
the checklist screen directly, skipping the Pick screen entirely — the work
order this round was raised against is already on the record, there is
nothing left to pick. `rtwEditing` (parallel to the graded wizard's own
`editing`) carries the original record through to Save, which now keeps its
id and bumps `rev` the identical way the generic Save handler already does
for `editing` — a correction replaces the round, it does not fork a second
one. The queue's row handler is now `rec.type==="RTW" ? rtwOpenForEdit(rec)
: editRecord(rec)` — the only call site that changed; every other type's
edit path is untouched. `tests/rtw.cjs` §13-14 open a saved round from the
real queue list (not a direct function call), confirm the checklist screen
opens with the Pick screen skipped and the generic capture pane never
activated, that the reloaded draft carries the original work order and
senior mechanic, and that re-saving replaces the same id (bumped revision,
no duplicate left behind) rather than minting a second round.

**CONFIRMRUN HAD NO PER-RECORD ISOLATION FOR ITS OWN WRITE, THE IDENTICAL GAP
BUILD 372 ALREADY CLOSED FOR SYNCNOW'S.** Read live: D1ZMK6_2026-09-
21T23-49-53.json, `readback-throw`, "Error preparing Blob/File data to be
stored in object store" — the same blob-clone error `writeback-fail` has
been tracking since build 424 (see the watching-build-424-blob-clone-error
entries above), this time from `confirmRun()`'s own `dbPut(fresh)` rather
than `syncNow()`'s bookkeeping put. `syncNow`'s equivalent write has carried
a per-record try/catch since build 372, with the comment stating the rule
plainly: "ONE ROUND'S BOOKKEEPING MUST NOT END EVERY OTHER ROUND'S TURN."
`confirmRun` never got the same treatment — its `dbPut(fresh)` had NO catch
of its own, so a write failure on any one record propagated out through
every remaining folder and record in that call, straight to the bare,
per-CALL catch around `confirmRun()` itself, which aborted the whole
confirmation pass and reduced the failure to a plain error string
(`readback-throw`), discarding the `.phase`/`.hadReqErr` tags `dbPut`'s own
error object already carries (build 418-420) — the exact instrumentation
this project built specifically to narrow this error down, thrown away at
the one call site that hit it. `confirmRun`'s write now has its own
try/catch, logging `confirm-writeback-fail` with the same phase/hadReqErr/
vis/streak fields `writeback-fail` already captures, and processing
continues to the next record and folder rather than abandoning the pass.
No data was at risk in the traced occurrence — EX006's files had already
landed (the readback listed all 4) before the confirmation write itself
failed — this closes a real availability gap the trace exposed, not a data-
loss one. `tests/confirm.cjs`'s new isolation section rigs one record's
`dbPut` to throw this exact error inside a two-record `confirmRun` call and
proves: the call does not throw out to its caller, the failed record is
never silently marked confirmed, the OTHER record in the same pass still
is, and the logged event carries `phase`/`hadReqErr` rather than a bare
string. The deeper WebKit-level mechanism remains exactly as unconfirmed as
every other `writeback-fail` occurrence — this fix narrows what the NEXT
occurrence, wherever it strikes, will be able to say about itself.

**A GALLERY ROW TESTED CORRECTLY IN THE DOM AND STILL PRINTED CENTRED WITH
BLANK MARGINS ON BOTH SIDES.** Two real reports on TK154, 2026-09-22 — the
single-round INSP PDF ("PHOTOGRAPHS WITH FINDINGS", HS.CV Control Valves,
three photographs) and the Equipment Trend Report ("PHOTOGRAPHS", HS.DL
Hydraulic Lines, five) — showed the exact defect galshort.cjs and
galorphan.cjs already existed to prove fixed: a full row of three held
short by the GAL_MAX_H ceiling printed centred with equal blank margins on
both sides instead of reaching the line, and a fifth (remainder)
photograph printed small on a row of its own. Both suites still PASSED,
because both only ever measured the DOM through Playwright's own Chromium
— which correctly honours `justify-self:stretch` overriding the grid's
`justify-items:center`, and `justify-content:space-between` on the
resulting flex row. The PDF is not drawn by that Chromium. It is drawn by
html2canvas, against the same markup, and this file has now hit
html2canvas failing to reproduce a CSS feature three times before this one
— `object-fit`, `aspect-ratio`, a nested inline `<svg>` — every one of them
a SIZING property. This is the fourth instance and the first in an
ALIGNMENT property: html2canvas evidently does not carry `justify-self`
through to override the grid's own `justify-items:center`, so the row
never stretched to the column's full width in the raster, and centred
inside it exactly as a narrower, un-stretched box would.

The fix does not hunt for an alignment keyword html2canvas honours —
`justify-content` and `justify-self` are retired from this row entirely.
Every photograph's LEFT OFFSET is now plain arithmetic
(`position:absolute;left:Npx`), computed from the same `photoRatio()` this
row already trusted for its own HEIGHT (`justifiedH`) — a number, not a
keyword, the same reasoning that already put an explicit `height` on every
photograph in this sheet instead of `aspect-ratio`. A full row held short
by the height ceiling spends its leftover width as a wider, evenly
computed GAP between photographs, reaching both edges exactly as
`space-between` was meant to; a genuine remainder row (fewer photographs
than a full line) is never spread this way — stretching one leftover
photograph to the width of three others would not be "the same size," it
would be a different, wider tile for the identical finding — it sits at
its own natural width, the same height as the row above it, flush against
the LEFT margin, never centred in the middle of an otherwise empty line.

Getting the arithmetic to match the raster exactly needed one more
correction: `#rptRoot *{box-sizing:border-box}` means an image's explicit
`height:Npx` is the BORDER box, so the browser derives its width from a
content height two pixels shorter (the 1px top/bottom border) before
adding the 1px left/right border back — using the plain `height*ratio`
formula overestimated every photograph's width by about a pixel, and
across a four-photograph row that drifted the last hairline gap from 8px
to 9 (galmixed4.cjs's own control, previously measuring a real flex `gap`
the browser applied for us, is what caught this once the row supplied its
own numbers instead).

Both galshort.cjs and galorphan.cjs now measure the geometry the fix
promises — the row's own left/right span, the size and evenness of its
gaps, a remainder row's left edge matching the row above it — rather than
a CSS keyword, because the keyword is exactly what the real defect hid
behind. Verified against an actual `html2canvas` raster of both reported
shapes (three photographs held short, five as four-plus-one), not only the
DOM, which is the one check this class of bug has repeatedly needed and
repeatedly not had until a real printed report disagreed with it.

**A FIX PROVEN ON TWO SYNTHETIC FIXTURES IS NOT A FIX PROVEN ON THE
DOCUMENT.** The build 441 fix above closed the exact two shapes reported —
and a THIRD real report (TK117's Dump Body Thickness sheet, same day)
arrived showing what looked like the identical defect a build later.
Rendered under the already-fixed code with the same seven photographs
(mixed portrait/landscape, matching the real sheet), it measured and
rastered correctly: the full row reaches the line edge to edge, the
three-photograph remainder sits flush left at the row's own tile size.
The report the maintainer was looking at had simply been generated before
build 441 reached that browser tab — the dashboard carries no service
worker and no self-check the way the phone does, so an open tab keeps
running whatever `report-core.js` it loaded until the page itself is
reloaded, and a fixed function does nothing for a document already made
from the old one. Nothing to fix there; only something to say plainly, and
something to make certain of everywhere else this rule applies.

That "certain of everywhere else" is `tests/photostandard.cjs`: every
report type that ever calls into the shared gallery row — FC and INSP
through `photoGallery()`, GET through its own register tail, TB and UC
(the wear body) through their own trailing gallery, RTW through its own
photo section — walked through its REAL per-type body
(`CMDash.importRecords` → `CMReport.sectionsFor`, not a hand-built
section), with five photographs of five genuinely different aspect
ratios, in English, Russian and bilingual. Every one of the twenty-one
combinations reaches the line edge to edge on a full row and sits flush
left, at the row's own tile size, on a remainder — and one of them
(INSP, bilingual) is also rasterised with the bundled html2canvas and
sampled directly, because a DOM measurement is exactly what let the
underlying defect ship looking fixed twice already. galorphan.cjs,
galshort.cjs, galjustify.cjs and galmixed4.cjs each prove the shared
function against one synthetic fixture; this suite is the standing proof
that every TYPE actually reaches it, in every language the site reads
this document in, not only the ones already covered directly.

**THE GALLERY ROW WAS DELIBERATELY CHANGED FROM "SAME HEIGHT" TO "SAME
SIZE" — WITH THE OLD DEFECT NAMED BEFORE THE CHANGE WAS MADE.** Two more
real reports (TK154, TK117, 2026-09-22), on top of the build-441 fix
above: "the width of photos are not the same, they should be equal or
resize to be equal." The justified row build 441 shipped gives every
photograph its own real width at one shared height — the convention a
contact sheet or photo gallery uses, and the reason this project had
ALREADY tried equal width once and reverted it: TK126 (INSP,
2026-09-19) put two portrait photographs in equal 1fr columns and the
field read the result as "the spacing is too much," a portrait frame
sitting small in a column sized for a wider neighbour. That exact
trade-off — a landscape and a portrait photograph forced into one
uniform box will show white padding on two sides of the narrower one,
because nothing here is ever cropped or stretched past its own shape —
was put to the maintainer directly, by name, before anything was
changed, and confirmed anyway.

`tileSize`/`tiledRow` (report-core.js, replacing `justifiedH`/
`justifiedRow`) give every tile in a row the identical SQUARE footprint —
one width, sized purely from the sheet's own 746px content width and the
column count, height forced equal to it — never derived from what the
row's own photographs look like, the way the old shared-height row was.
Each photograph is letterboxed inside its own square at the largest size
that keeps its true aspect ratio: a landscape photograph fills its
tile's width and is padded top and bottom; a portrait one fills the
tile's height and is padded left and right. A square is the one tile
shape that treats either orientation exactly alike — neither is closer
to it than the other — so which way a photograph happens to be taken
never decides how much of its own tile it fills. The tile itself is
drawn as a visible bordered box so the padding around a narrower photo
reads as a deliberately centred frame, not as an accident of the grid.

The gap between tiles was ALSO asked for by name — "gap spacing should
be tight 1mm" — and is no longer a guessed hairline pixel count: this
sheet's own documented baseline is 105 CSS px per printed inch
(`RPT_SCALE`/`DEF_SCALE`'s own comment), so 1mm of paper is 105/25.4 ≈
4.13 CSS px here, rounded to 4 — replacing the older 8px.

A real bug was caught rewriting the tests for this, not found in the
field: the tile `<div>` was first sized to the photograph's own
letterboxed CONTENT area (`side - border*2`) rather than the tile's own
full outer footprint (`side`), so tiles actually touching edge to edge
were two pixels smaller than the spacing between them assumed — a gap
that looked right in isolation but drifted from the intended ~1mm the
moment two tiles were measured against each other, caught by
`galmixed4.cjs`'s own "same tile size" assertion failing by exactly that
amount. And the OLDER `#rptRoot .cel .phg.gallery img{max-height:182px}`
rule — written for the one/two-photograph technique below this branch —
matches ANY `<img>` under `.phg.gallery`, this new tile's included, so a
portrait photograph's own legitimately-taller-than-182px letterboxed
height was silently cut back to 182 while its width stayed correct;
`max-width:none;max-height:none` on the tile's own `<img>` (the same
override the old justified row already needed, for the same reason)
closes it. Both were caught by `galshort.cjs`'s own letterbox-shape
assertion and `galmixed4.cjs`'s own equal-tile-size assertion failing
against the first draft, not by a field report — the standing suites
this project keeps specifically so a redesign is checked against its own
stated contract before it ships, not after.

`galshort.cjs`, `galjustify.cjs` and `galmixed4.cjs` — all three of which
encoded the OLD "own width, shared height" contract as their premise —
are rewritten to the new one: every tile in a row is the same square
size regardless of the row's own photographs, a landscape and a portrait
row get the IDENTICAL tile (not merely the same line width at two
different heights), the gap is the new tight hairline, and a photograph
is still never cropped or stretched. `galorphan.cjs`, `galportrait.cjs`,
`photogallerysize.cjs`, `phgstretch.cjs` and `photostandard.cjs` needed
no changes — each already asserted the row-level and type-level
invariants (reaches the line, remainder matches the row above it, every
type reaches the shared function, non-gallery boards untouched) in terms
general enough to hold under either design.

**THE LETTERBOXED TILE ABOVE WAS ITSELF REVERSED — BY A REFERENCE
PHOTOGRAPH, NOT A SENTENCE — AND THE RULE WAS THEN GENERALISED PAST ONE
ROUND TYPE.** Every mockup built to prove the square-letterboxed tile was
rejected sight unseen: "that your mock up. nothing was implementted." The
flat-swatch test fixtures this project had been using to prove geometry
read, to the person looking at them, as evidence that nothing real had
shipped — a screenshot of coloured rectangles cannot be told apart from a
placeholder. What settled it was the maintainer's own photograph of four
real magnetic-plug close-ups laid out the way the report is meant to look:
four tiles, identically sized, every one of them filled COMPLETELY by its
photograph — no white bar on any side, no frame of unused tile around a
narrower shot. "this an example of same and standard." That is COVER, the
opposite fit from CONTAIN/letterbox, and it is the one place in this
project's report engine where a photograph is deliberately cropped rather
than padded — everywhere else, a photograph forced narrower than its own
shape is this project's definition of evidence altered. `tiledRow`
(report-core.js) now sizes each photograph to fill its tile on the axis
matching its shape (a landscape/square photograph to the tile's height, a
portrait one to the tile's width) and lets the other axis overflow into
the tile's own `overflow:hidden`, centred, so a crop takes equally from
both sides rather than favouring one corner. The photograph is now a CHILD
of its tile div (the clipping box) rather than a positioned sibling of it,
which is what makes the crop possible at all.

A further instruction — "this will not be applied to magnetic plug only
but to all inspection[s]... it[']s a 4 photo rule per line, all equal" —
corrected an assumption the letterboxed tile still carried: `tileSize` had
solved the tile's own size from `gcols`, the ACTUAL row's photograph count
(3 for a lone three-photograph finding, 4 only once a fourth existed), so
a full row of three photographs was sized as its own wider three-column
line — a smaller version of the exact "same rule, two different sizes"
defect this file already fixed once for the row's overall WIDTH
(galjustify.cjs's own history) and had not yet fixed for the TILE. Every
gallery row on every round type this board serves — FC, INSP, TB, UC, RTW,
Magnetic Plug, anything reaching `cell(..., gallery=true)` — is now a slot
in a FOUR-column grid, always: `GAL_TILE_COLS` is a fixed constant, never
the row's own count, so three photographs get the identical tile a full
row of four uses and simply leave the fourth slot empty, flush left,
rather than negotiating a bigger tile for themselves. `photostandard.cjs`
(FC/INSP/TEMP/GET/UC/TB/RTW × EN/RU/bilingual, 21 combinations) and a real
`html2canvas` raster of a five-photograph magnetic-plug finding built from
photorealistic (gradient-and-noise, not flat-colour) textures both prove
the tile is filled completely with no letterbox bar and that a bare
three-photograph row falls short of the line at the SAME tile size a
four-photograph row uses.

`galshort.cjs`, `galjustify.cjs`, `galmixed4.cjs` and `galorphan.cjs` are
rewritten again: every letterbox-shaped assertion (a displayed image no
larger than its tile, padded top/bottom or left/right) is replaced with a
cover-shaped one (a displayed image reaching or exceeding its tile's own
inner size on BOTH axes, cropped rather than padded on whichever one
overflows), and every "a full row of three reaches the 746px line"
assertion — true only under the old per-row sizing — is replaced with "a
full row of three falls short of the line by design, at the identical
tile size a four-photograph row uses, flush left." `galjustify.cjs` adds a
row built from a genuinely different record `type` (INSP, not MP) proving
the tile size is identical to MP's own three-photograph case, so the rule
reads as type-independent in the test the same way it is in the code.

**A THIRD REASON TO WANT THE SCHEDULE BROKE THE FREEZE BREAKER'S OWN FIX,
AND NOBODY NOTICED UNTIL THE OLD LOOP TEST WAS RE-RUN.** `renderDue()`'s
circuit breaker (build 328, `tests/thawkey.cjs`) exists for exactly one
failure mode: a resolve-triggered repaint loop (build 321) that pegs the
main thread hard enough to block the update mechanism that would otherwise
fix it. Its corrective action has always been narrow and deliberate —
reset `cm_due_sched`/`cm_due_view`, the only two settings that could ever
re-arm the cycle when it was written, and the only two keys `recover.html`
has ever cleared for a phone already frozen. RTW's own entry card later
gave `needSched` a legitimate THIRD reason to want 1C's schedule — `!SCHED`,
so the card is not left hidden for up to `SCHED_MS` on a cold boot — and
nothing updated the breaker to match: a phone that can never reach the
schedule endpoint keeps `needSched` true through `!SCHED` regardless of
what the two keys hold, so a resolve-loop of build 321's own shape,
reintroduced after `!SCHED` shipped, would trip the breaker's one-shot
latch exactly once, reset settings that were never the problem, and then
spin unthrottled for ever — the breaker's own safety margin silently
reduced to zero by a change that never touched the breaker's own code.
Caught re-running `tests/thawkey.cjs` on unrelated work, not from the
field: the suite's case 2 (the currently-shipped build reproducing the
loop) went red, exactly as it is built to do. `needSched` now reads
`!dueRunaway && (dueSched || dueView==="week" || !SCHED)` — once the
breaker has tripped, IT vetoes the kick directly, for the rest of that
page's life, instead of only clearing the two settings that used to be
its sole lever. The same investigation tried making the schedule endpoint
answer for real during the OLDER, breaker-less reconstruction the suite
also carries (build 328's own "before" case), on the theory that a
successful fetch would let the original two-key promise reach all the way
to `needSched=false` again — and it made that reconstruction's freeze
WORSE, not better: `schedEnsureLoaded`'s own cache fast-path resolves on a
bare microtask once warm, so the resolve→repaint→kick→resolve chain never
yields to the event loop at all, and even `page.evaluate()` timed out
unable to get a single tick in. The slow, always-failing round trip was
accidentally the only thing giving that reproduction room to be merely bad
instead of totally inert. That reconstruction — `!SCHED` on a build with no
breaker at all — is a combination that has never actually shipped (the
breaker predates `!SCHED` by many builds) and is not one `recover.html` was
ever able to cure; `tests/thawkey.cjs`'s own case 1 now asserts that honest,
known boundary instead of a promise this exact combination never kept.

**RTW'S OWN GENERAL PHOTOGRAPHS WERE CAPTURED, SAVED, SYNCED — AND PRINTED
NOWHERE.** Read against a real report request: "check why the overall photo/s
is not included in the report." `sane()` (report-core.js, run once before any
round-body function's own code) lifts every `it.general` item — RTW's
"Equipment, work area, other evidence" pseudo-position, `GEN_KEY` — out of
`rec.items` and into `rec.general` before ANY branch runs, exactly as it does
for every graded type; every graded branch reads it back with
`generalBlock()`. RTW's own branch never called it — it built its photo page
from `rtwPhotoItems(rec)` alone, which correctly reads `rec.items` for a
checklist line's OWN evidence, and had nothing left to find the general
photographs with once `sane()` had already moved them out. Not a save bug, not
a sync bug: the photographs were sitting in `rec.general` the whole time, and
nothing on the printed page ever asked for them. Fixed by giving RTW's photo
section the same `generalBlock(T, rec)` call every graded type's already has.
`tests/rtw.cjs` had ZERO coverage of this path — the only existing mention of
`__general` merely excluded it from a position COUNT — and now captures one,
saves it, and asserts it prints through the same `genwrap`/`genrow` markup
every other type's machine evidence uses.

**THE OFFICE'S OWN REPORT NEVER CARRIED RTW'S SCHEDULE ACROSS AT ALL.** A
second, unrelated gap found investigating the same request: `report-core.js`'s
`rtwHeaderStrip()` reads `rtwWoType`/`rtwSchedHours`/`rtwSchedDate`/
`rtwWoPriority` off the record — and `dashboard/report.js`'s `normalizeRecs()`,
the one place that turns a folder sidecar into what report-core.js actually
reads, never mapped any of the four. A round captured on the phone printed a
correct header on that phone's OWN report (`rptRecords()` carries them by
hand); the identical round, opened from the folder on the dashboard, printed
an EMPTY header strip, because `rtwHeaderStrip()` returns `""` once every
field it looks for is gone — this document's own shape of "a real value
rendered as nothing," on a document that has never had a test rendering it
from the OFFICE side rather than the phone's own IndexedDB. New suite
`tests/rtwoffice.cjs` seeds a real sidecar in a fake Drive, loads the
dashboard cold, and proves the five fields (see below) survive
`normalizeRecs()` and reach the printed strip — the one check this gap could
never have failed, because nothing had ever asked the question from that
side.

**THE HEADER ITSELF WAS FIVE FACTS SAYING THREE THINGS, AND THE TWO DATES
THAT MATTER WERE THREE LINES APART.** Asked for by name against a real
printed report: "PM service, Scheduled Date, Type of PM, Actual PM Date,
arrange it good to the eyes." The old strip's "Type" cell printed 1C's own
maintenance-type sentence — which, for every PLANNED service,
`ingest_work_orders.py`'s own filter regex guarantees is always exactly
`"{hours} Hours service Planned"` — beside an "Hours" cell stating the
identical number a second time, and a "Priority" cell truncated to a bare
code (`P1`) that was itself a deliberate, tested simplification from before
this request existed. `rtwPmService(rec)` collapses the two into one: an
hour tier stated compactly (`"250 h Service"`) when there is one, 1C's own
type text when there is not — a REPAIR work order carries no hour tier at
all (`build_rtw_open` leaves `hours` null rather than guessed) and its type
text is genuinely distinct information with nowhere else to print, so the
fallback is exact, not a guess. `rtwPmTypeText(rec.rtwWoPriority)` keeps the
code AND its own classification word (`"P3 Planned"`, `"P2 Urgent"`) — the
part of 1C's sentence that actually says whether this was planned
maintenance, an urgent job, or a planned repair, which is what "Type of PM"
asks — and drops only the trailing `(PM)`/`(Repair)` parenthetical, which
this document already states elsewhere. The scheduled date and the actual
release date now sit NEXT TO EACH OTHER in the strip (`rtwActualDate`,
reading the completion date that used to live only in the masthead subtitle
three lines up) so the comparison a reader wants — was this released on
time — is a glance sideways, not a hunt between two parts of the page; the
calculated day-count cell that already existed follows immediately after,
because it is what those two dates were leading to. `tests/rtw.cjs` §11/§12
prove both the hour-tier case and the raw-text fallback against the two
shapes `build_rtw_open` actually produces.

**THE COMPLETION DATE IS A DAY; THE REPORT NOW ALSO KNOWS THE HOUR.**
`rec.date` stays exactly what every other reader of this record already
depends on it being — plain `YYYY-MM-DD`, used raw in string concatenation
for file names, `DUE.next`, and `teamDate`/`idDate` — asked for by name:
"in the Date include time." A new, SEPARATE field, `rtwTime` (`"HH:MM"`,
defaulted to the wall clock when the checklist opens and freely editable),
rides alongside it exactly the way `rtwWoType`/`rtwSchedHours`/
`rtwSchedDate`/`rtwWoPriority` already do — the same three read sites
(`rptRecords`, the team-round reader, `recToExport0`) each needed the one
extra field, the same "one fact carried by hand at several sites" shape
this file's rules already warn about for RTW's other schedule fields.
`rtwActualDate()` appends it to the header's "Actual date" cell only when
present; nothing that reads `rec.date` on its own was touched.

**A REAL PDF, MADE OFF THE REAL SCHEDULE FILE, IS WHAT FOUND THE NEXT TWO —
NEITHER SHOWED UP IN ANY SYNTHETIC FIXTURE.** Generating an actual
DZ014/WO-016593 release through the real Pick screen (`data/schedule_slim
.json`, not a test's own `SCHED = {...}` override) and opening the resulting
PDF surfaced two defects the header-strip work above had just shipped and
every `tests/rtw.cjs` assertion had still passed against:

1. **Every label on the header strip printed its own HTML as visible text.**
   `rtwHeaderStrip`'s `cell(k, v)` called `esc(k)` on `k`, and `k` is always
   `T.I(...)` — a bilingual label that is ALREADY escaped, ALREADY-marked-up
   HTML (a `<span class="alti">` wrapping the second language, per `T.I`'s
   own contract in `makeT`). Escaping it a second time turned the literal
   markup into text: "PM Service &lt;span class=&quot;alti&quot;&gt;/
   Плановое ТО&lt;/span&gt;" rendered on the actual page, in place of "PM
   Service / Плановое ТО" in two weights. `statusStrip`'s own `cell()`, a
   few hundred lines up, looks identical and IS correct — it wraps a bare
   `T(...)` call with no markup in it — so the same four characters
   (`esc(k)`) were right in one function and wrong in the one that copied
   its shape. This is not new: nothing about it changed when the header
   was redesigned above, and the ORIGINAL "Priority" cell had exactly the
   same defect from the day it shipped — `tests/rtw.cjs`'s own regex,
   `[^<]*(?:<span[^>]*>...)?`, is greedy enough that `[^<]*` swallows the
   escaped span whole (it contains no real `<` character) and still
   matches, so the test passed whether the markup rendered as markup or as
   text. Fixed by not escaping a label that was never plain text to begin
   with; `cell()` now takes `k` raw. `tests/rtw.cjs` asserts directly that
   `&lt;span` and `&quot;alti&quot;` never reach the page — the one check
   this class of bug needs and the DOM-level regex could never provide.

2. **The day-count cell's ALTERNATE language kept the literal placeholder.**
   `rtwVsSchedule` called plain `T.I("rtw_sched_late")` and then
   `.replace("{n}", Math.abs(days))` on the RESULT, instead of passing the
   number to `T.I` directly. `T.I` already returns both languages
   concatenated — `"{n} d late<span class="alti">/ {n} дн. позже</span>"`
   — before the caller ever sees it, and `.replace()` touches only the
   FIRST match. The English half printed its number correctly; the
   Russian half, one `<span>` later, printed the four characters `{n}`
   verbatim, on every bilingual RTW report this cell has ever appeared
   in. The correct call was sitting a few hundred lines away the whole
   time: `T.I("ev_gap", { n: rec.gap.missing, ... })` already passes vars
   straight through, because `T.I`'s own `pick()` helper substitutes every
   key in the vars object across BOTH renderings in one pass — `.replace()`
   on the output was solving a problem `T.I`'s own second argument already
   solves, one language at a time instead of both. Fixed by passing
   `{ n: Math.abs(days) }` as `T.I`'s second argument directly.
   `tests/rtw.cjs` asserts the literal string `{n}` never reaches the page
   and that the Russian day-count actually carries its own number.

Neither of these failed a single existing assertion before being fixed —
both are exactly this project's own signature defect, found the way this
file's own rules say to find it: by generating the real document and
looking at it, off real data, not by trusting a synthetic fixture that
happened not to exercise the code path where the bug lived.

**ONE OR TWO PHOTOGRAPHS CENTRED WHEN EVERY OTHER ROW ON THE SHEET STARTS
LEFT — AND THE FIX HAD ALREADY SHIPPED ONCE, ON THE WRONG BOARD.** Asked
for by name against a real TK112 Magnetic Plug report: "when 1 or 2 photo
is taken it should start from left-justify, not in the center… confirm a
rule was applied to all report, mobile and web dashboard." Two things were
true at once. The standalone "PHOTOGRAPHS" gallery page (`.phg.gallery`,
`cell(..., gallery=true)`) had already been fixed for this — `justify-
content:center`/`justify-items:center` became `start`/`start` — but the
OTHER board that carries a lone or paired photograph, the per-position
"Equipment and component evidence" cards (`mpEvidence`, the `ph.length>1`
non-gallery branch every Magnetic Plug/FC/INSP position uses), reads a
DIFFERENT, base rule — `#rptRoot .cel .phg` — that the gallery-specific fix
never touched. The real report proved it: FRD's two photographs sat
centred in a wide grey card with equal blank margins on both sides,
directly above CTR's own four photographs on the row beneath it, packed
correctly and starting flush left — one board fixed, the other carrying
the identical shape untouched, because the fix was written at the more
specific selector instead of the rule both boards actually share. The base
rule is `start`/`start` now, so a photograph count of one or two starts at
the same left margin as three, four, the checklist table beside it and the
masthead above it, on every round type and on both surfaces, because both
load the identical `report-core.js`. `tests/galportrait.cjs` (the
standalone gallery's own proof) was rewritten from asserting the group was
centred to asserting it starts flush left; the mpEvidence board's own
suites (`mpcard3.cjs`, `phgstretch.cjs`, `histpair.cjs`, `histwide.cjs`)
needed no changes because none of them had ever asserted a horizontal
position, only that photographs were not stretched or squeezed — the exact
kind of assertion that survives a redesign like this one and the reason
this file's own rules ask for tests that check the INVARIANT, not the
implementation.

**A BACKTICK IN A NEW CSS-SECTION COMMENT BROKE THE REPORT ENGINE FOR
EVERY SURFACE, THE IDENTICAL MISTAKE THIS FILE ALREADY NAMED ONCE.** The
fix above was first written with the new comment's own code names
back-quoted — `` `.phg` ``, `` `tests/galportrait.cjs` `` — because that is
how a file name or a selector reads everywhere else in this project's
prose, including in comments that live inside ordinary JS function bodies
a few hundred lines further down the SAME file. This one did not: the CSS
this comment sits beside is itself a JavaScript template literal, and the
first backtick inside it closes that literal — not with an error at the
backtick, but with a `SyntaxError: Unexpected identifier` pointing at
whatever word came after it, however far down the file that landed
(`tests`, from the very next sentence). `node --check mobile/report-core.js`
caught it immediately, before any test ran — every early symptom
(`ReferenceError: CMR is not defined` in a Playwright page, one gallery
suite failing while its neighbours also failed in ways that first looked
like environment resource contention) was this same parse failure wearing
a browser's clothes. Fixed by writing the code names in the comment as
plain text, the exact rule this file's own "A COMMENT WITH A BACKTICK IN
IT INSIDE A TEMPLATE-LITERAL CSS BLOCK IS NOT A COMMENT" entry already
states — restated here because it was written once, forgotten once, and is
now worth a habit: run `node --check` on this file before trusting any
test result against it, the same reflex that entry already recommends.

**LEFT-JUSTIFIED WAS NOT THE SAME AS FILLING THE LINE, AND THE SECOND FIX
HAD TO BE NARROWER THAN THE FIRST ONE'S OWN WORDING SUGGESTED.** The
left-justify fix above (the base `.cel .phg` rule) was tested against a
real TK112 report and confirmed correct — and a SECOND real TK112 report,
sent right after, showed it was not the whole ask: "still TK112 example
not fixed... 4 photos MUST be perfectly align, fill the horizontal line.
Scan example of EX016, take the Height and Width, thats the perfect." FRD's
two photographs were correctly starting flush left; CTR's own four sat in a
small huddle at their own natural width, left-justified but nowhere near
reaching the wide grey card's own line, pointing at the standalone
"PHOTOGRAPHS" gallery page's own EX016 report (already tiled, cover-fit,
edge to edge) as the standard to match. `mpEvidence`'s per-position board
(the `ph.length>1`, non-`gallery` branch of `cell()`) had never been asked
to tile at all — it deliberately keeps `auto` columns, sized to each
photograph's own shape, specifically so a narrow multi-column board (two,
three or four positions packed side by side) shrinks gracefully instead of
overflowing.

The fix is scoped to exactly the shape the report showed: a WIDE board
(`boardCols`' own `wide` flag — one position alone, or few enough that
none would be squeezed) with three or four photographs now shares the
IDENTICAL `tileSize`/`tiledRow` function the gallery board already uses,
at the same 746px target width — same square tile, same hairline gap, same
cover-fit crop, and the same "falls short of the line by design" rule for
a bare three-photograph row that the gallery board already has. A wide
board's one or two photographs, and every photograph on a NARROW
multi-column board regardless of count, keep the existing `auto` sizing
unchanged — cramming a cover-fit square into a quarter-width column would
make an already-small photograph unreadable, and nobody asked for that.
`sh.wide` carries the flag from each of the three call sites that already
compute `boardCols` (`mpEvidence`, the graded findings board, and
`earlierRoundSections`' history board) into `cell()`, reusing the `sh`
object every one of them already threads through for the "shared facts"
band rather than adding a fourth parameter.

`tests/galmixed4.cjs`'s own "NON-GALLERY (mpEvidence) BOARD" section had
encoded the OLD behaviour (auto columns, 2px gap, a portrait photograph
narrower than its landscape neighbours) as its premise, which is exactly
what a real report proved wrong — updated to a WIDE-board case (tiled,
same square footprint as the gallery board, falls short of the line at the
same partial span a bare three-photo gallery row does) and a NARROW-board
control (four positions sharing the row, still auto-sized, never tiled)
added alongside it to prove the fix does not leak into the shape it was
never asked to touch.

**"FILL THE LINE AT FOUR" WAS NOT THE END OF IT — ONE, TWO AND THREE HAD TO
MATCH FOUR TOO, EVERYWHERE.** A THIRD real TK112 report, minutes after the
build above shipped, circled the SAME FRD position again: its two
photographs were correctly left-justified and, on a narrow board, correctly
NOT stretched — but sitting on the SAME wide-board sheet as CTR's and RRD's
now-tiled four-photograph rows, FRD's own pair still read at a visibly
smaller size than its neighbours, because "1 or 2 photographs are not
tiled" had never actually been retired, only the THRESHOLD for a full row
had moved. "if a photo is 1 to 3, it will follow the height and width of
the photos that has already 4... standardize the width and height of all
photos in all components inspected, for all type of inspections." This
reverses a rule this project had asserted twice before as deliberate
("a genuinely LONE photograph is a standard tile, not the whole line
stretched to hold one frame") — the maintainer's own later, explicit
instruction is what changes it, not a rediscovery of the same defect.

Both places a photo count under the gallery's own three-photo threshold
took a DIFFERENT path are gone. The standalone "PHOTOGRAPHS" page
(`cell(...,gallery=true)`) no longer branches on `gcols>=3` at all — every
row, one photograph included, goes through `tiledRow` at the sheet's fixed
four-column footprint; a single photograph is simply the first of that same
four-slot row, the other three left empty rather than the photograph being
stretched to fill them (`tileSize` was already independent of the row's own
count — only the branch deciding whether to USE it depended on the count,
and that branch is what's gone). `mpEvidence`'s own wide-board branch
(`ph.length>1`, non-gallery) drops its `ncols>=3` condition the same way —
`sh.wide` alone decides now — and a WIDE board's single photograph (the
`ph.length===1` case, previously always the unconstrained `.ph` treatment,
up to 330px) gets a matching new branch: tiled at the identical footprint
when `sh.wide`, left as `.ph` only when the board is narrow or `sh` carries
no board information at all. A NARROW multi-column board (several
positions packed side by side) is untouched in every case, for the same
reason the earlier fix left it alone: `tileSize`'s tile is always solved
against the fixed four-column, 746px assumption, and forcing that into a
quarter-width column would produce a tile bigger than the column itself.

Six suites had encoded the retired rule as their own premise —
`galportrait.cjs` and `galjustify.cjs` directly ("a lone photograph… keeps
its own ~137px width," "still NOT tiled to the line"), `galorphan.cjs` at
one assertion ("no g3plus, not stretched"), and `rptmirror.cjs` one level
further in: it asserted every photograph in a document shares one raw
`<img>` HEIGHT, which was only ever true because this fixture had never
before put a portrait photo through a tiled (cover-fit) row, where the
photograph's own overflowing axis is deliberately left uncropped in the DOM
measurement (cropped visually by the tile's `overflow:hidden`) — the
correct, sheet-wide invariant is that every photograph sits in the same
square TILE, not that every `<img>` reports the same box, and the suite now
measures `.phgrow > div` instead of the raw image for exactly that reason.
`photogallerysize.cjs`, `galmixed4.cjs`, `galshort.cjs`, `mpcard3.cjs` and
`phgstretch.cjs` needed no changes: each already asserted the tile-level
invariant (same tile size regardless of count, cropped not squeezed) in
terms general enough to hold under this widening the same way they held
under the narrower one.

**A BARE DATE AND A BARE NUMBER ON THE MASTHEAD WERE TWO MORE QUESTIONS A
READER HAD TO GUESS THE ANSWER TO.** A real EX019 report, subtitle circled:
"can we label the SMU/Hour Meter, Plan date, PM type (5000 Hours if
available); P3 or P4 if available... The SMU is already there just label,
and the date what is that Insp Date? or Plan Date? Make it Standard in all
report" — then, unprompted, the same rule extended past RTW: "even for
Inspection remember we have PM and Schedule from 1C they are following
that. So just put the sched Date, Ins Date, PM Type, etc." RTW's own
masthead (`rtwHeaderStrip`) already carried this shape for its release
checklist — PM Service, Type of PM, Scheduled date, Actual date — sourced
from four fields (`rtwWoType`/`rtwSchedHours`/`rtwSchedDate`/
`rtwWoPriority`) that only RTW's own Pick screen ever fills. Every OTHER
round type's masthead printed the date and the SMU bare, with no label at
all — which is exactly the ambiguity the maintainer's own question proves:
a bare date reads as "which date?" the moment a second date (1C's plan)
might also be on the page.

The date is labelled `f_insp_date` ("Insp. date" / "Дата осмотра") — a
fuller, deliberately different wording from "Scheduled date" / "Плановая
дата", chosen so the two read as clearly separate facts once both appear on
the same line, not two abbreviations a tired reader could transpose. The
SMU keeps its existing `f_smu` label, reused rather than invented, in the
`unitSheets` (Equipment History) and `summarySheets` (fleet summary)
mastheads too — those two never get the schedule strip below, because
neither is tied to one round's own 1C order the way a single-round report
is, and CLAUDE.md's own "a fix must change only what was asked" rule (see
the MP-evidence-visibility entry above) is exactly why they stop there.

A new, generic `schedStrip(T, rec)` (report-core.js) prints the SAME three
facts RTW's strip does — the hour tier or PM type text, the plan date, the
priority code — for every OTHER type, and returns `""` outright for RTW (its
own richer strip, with the actual-vs-scheduled day count, stays untouched)
and `""` when 1C has nothing for this round, never inventing a strip out of
an empty record. It reads three NEW, generic fields — `schedHours`/
`schedDate`/`schedPriority` — a deliberately separate namespace from RTW's
own four, because RTW's facts come from a work order a technician searched
for and picked by hand; every other type's come from `schedOrdersFor(equip,
type).near`, the same lookup the Due list and RTW's own Pick screen already
trust, read automatically at Save with no picker of its own.

**Captured once, at Save, and PRESERVED on an edit — never re-borrowed from
whatever 1C says on the day of a correction.** This is the identical rule
`roundWO()` already keeps for the work-order number itself (`draft.wo`, set
once and never re-read): the graded-round Save handler computes
`schedOrdersFor(equip, type).near` only `if(!editing)`, exactly mirroring
the existing `phv:(editing?(editing.phv||1):2)` branch in the same object
literal, so a round corrected days after 1C's schedule has moved on keeps
printing the plan it was actually walked against, not a later one that
happens to be live when somebody fixes a typo. Carrying the three fields to
where a report actually reads them needed the same four sites RTW's own
four fields already needed, plus the phone's own Save handler as a fifth —
the exact "one fact carried by hand at several sites" shape this file's own
rules warn about, now walked a second time for a second feature:
`recToExport0`, `rptRecords()` (the phone's own PDF), the team-round reader
(a synced round from another device), and `dashboard/report.js`'s
`normalizeRecs()` (the office's own reader of the folder) — the last of
these for the identical reason the RTW-office gap above was a real gap: a
report built from a folder sidecar reads a completely different code path
than a report built from the phone's own live record, and only carrying a
fact to one of them prints it correctly on one surface and silently drops
it on the other. `tests/schedstrip.cjs` proves the capture, the
preserve-on-edit, the empty case, the masthead labels, the generic strip on
a non-RTW type, RTW's own strip staying untouched, and the office's own
`normalizeRecs()` carrying the same three fields off a real sidecar — the
same shape `tests/rtwoffice.cjs` already proved for RTW's four.

**VIEWING A POSITION CAPTURED IT — AND THE FIRST FIX FOR THAT DELETED THE
STAMP IT WAS SUPPOSED TO PROTECT.** A multi-user/scale audit asked to test
what 50 inspectors doing ~70 rounds a day would do to this app found a
machine that counted a plug as "captured" the moment its screen was opened,
whether or not the inspector ever touched it. `loadPos()` stamps 1C's own
work order onto whatever position is open — `roundWO()`, "only into an
empty field" — and to do that it calls `curP()`, which unconditionally
creates `draft.positions[curItem]` if nothing is there yet. That phantom
entry then had `p.wo` set and nothing else, and `hasData(p)` counted `p.wo`
as evidence: a round on any machine with a 1C work order open against it
inflated its own "N of M done" count for every position an inspector so
much as looked at on the way to the one they actually meant, and a reason
picked and then picked again to un-pick it never actually returned the
position to empty, because the `wo`-only entry was still sitting there
counting as "has." `hasData()` no longer counts `p.wo` — that part of the
fix was right the first time.

What was not right the first time: `loadPos()` was also given a companion
line that DELETED the entry it had just stamped, the instant `hasData()`
said there was nothing else on it — which is exactly the entry `p.wo` was
supposed to be the ONE thing left standing in. Three suites this fix was
believed to have closed (`tests/uc.cjs`, `tests/audit.cjs`, `tests/iso.cjs`)
happened to pass regardless, because none of their own fixture equipment
had a live 1C order open at the moment they were run — so the deletion's
own defect never showed up in the very tests written to catch this class of
bug. The FULL sweep did: `tests/schedwo.cjs` — a suite that plants its own
schedule fixture rather than reading live data, specifically so it is never
at the mercy of what 1C says today — failed outright. "and it is in the
RECORD, not only on the screen" is this project's own standing rule for
this exact stamp (see "AND THE WORK ORDER IS ALREADY ON THE ROW THEY
TAPPED" above); a deletion the instant nothing else joins it is the literal
negation of that rule, for the ONE type of entry the rule is about.

The corrected fix removes the deletion from `loadPos()` entirely — the
stamped entry is simply left standing, as the original design always said
it should be. But `hasData()`'s own OR-chain is not the only place this
project treats "empty" as "delete the position": SIX separate call sites
(the undercarriage/GET reason toggles, `saveCur()`, the detect/priority/
action pickers, the defect/cause picker) each already carried their own
`if(!hasData(p)) delete draft.positions[curItem];` — a pre-existing,
correct pattern for clearing a position back to nothing when the field
being toggled was the last thing on it. Once `hasData()` stopped counting
`p.wo`, EVERY one of those six now read a WO-only position as empty too,
and deleted the stamp along with whatever else was being cleared — reached
by `tests/uc.cjs`'s OWN reason-toggle assertion once its equipment (DZ001)
was checked against a REAL live 1C order, exactly the same shape of gap
schedwo.cjs's own header comment warns about. All six now read
`if(!hasData(p) && !p.wo) delete draft.positions[curItem];` — a position is
only ever thrown away when there is truly nothing left on it, WO stamp
included.

The deeper lesson, found investigating this: `tests/audit.cjs`, `iso.cjs`
and `uc.cjs` all point their fixtures at REAL equipment (TK146, DZ001)
reading the REAL, hourly-refreshed `data/work_orders.js` / schedule files —
so whether these suites see a WO stamp at all depends on what 1C's live
schedule happens to say on the day they run, not on anything the test
itself controls. `tests/schedwo.cjs`, `tests/dueweek.cjs` and others
already had the right answer for this: plant `SCHED = {byUnit:{}}` (or a
specific fixture) before running, so the assertion is about the CODE, not
about today's data. `audit.cjs`, `iso.cjs` and `uc.cjs` now do the same —
without it, any one of the three could start silently passing or failing
again the next time 1C schedules or un-schedules a job for this fleet's own
fixture equipment, which is exactly the kind of flakiness this project's
own rules warn against keeping.

**FIVE SUITES WERE READING A PAGE THAT HAD MOVED ON WITHOUT THEM.** The same
audit pass, checking whether the test suite itself still describes the app,
found five assertions asleep at the wheel — none a real defect, all of them
a test that had quietly stopped testing anything:
- `tests/photos4.cjs`, `tests/dashrpt.cjs`, `tests/rptmiss.cjs`,
  `tests/teamphoto.cjs` all counted photographs with a bare
  `<img src="data:image...">` match, which also matches the masthead's own
  letterhead logo (`class="brand"`) on every report page — every one of
  these suites was one photo over its true count on every assertion that
  touched a rendered document. Fixed by excluding `class="brand"` (regex for
  string HTML, `:not(.brand)` for live DOM). `photos4.cjs` also still
  asserted the RETIRED CSS-grid gallery markup (`class="phg g4"`,
  `grid-template-columns`) from before the cover-fit/4-column tile redesign
  further up this file — rewritten against the current `.phgrow` /
  `position:absolute;left:` markup, confirmed against real rendered output
  (30 photographs + 1 logo = 31 images, 9 rows, all tiles the same 184×184).
- `tests/rptfit.cjs` held a flat "narrow to 90% of full height" target for
  its synthetic too-tight-room case, and unrelated report content had grown
  enough since that number was chosen that 90% had become unreachable —
  `CMR.fitPage` narrows a `.ucmaps` block to `CMR.FIT_MIN` (0.6) and gives
  up, and the frames in this fixture are only ~168px of a 758px block, so
  the achievable floor is ~689px, not the 682px the test still asked for.
  Fixed by deriving the target from the actual measured frame height and
  `CMR.FIT_MIN` — the app's own constant, not a copy of it, per this file's
  own "ask the app, don't keep your own copy" rule.
- `tests/grade5.cjs` re-derived grade 3's default target date with
  `day(DUE.days(...))`, missing the "capped by 1C's next planned service"
  rule `defaultTargetFor(3)` actually applies — invisible until live 1C
  schedule data (refreshed hourly by this project's own automated job)
  happened to move the real capped date earlier than the raw interval date
  for this fixture's equipment. Fixed by calling `defaultTargetFor(3)`
  directly.
- `tests/swrescue.cjs` reverted the schedule-kick code back to a pre-328
  shape with an exact-text `.replace()`, and a later, unrelated fix (RTW's
  own entry card, which needed the same repaint signal) had changed that
  code's exact shape — the `.replace()` silently no-op'd, so the "broken"
  build under test was actually already running the modern, non-looping
  code, and the freeze this suite exists to reproduce never happened; the
  suite still reported PASS because nothing it checked contradicted that.
  Fixed with a shape-based match (mirroring the file's own `stripBreaker`)
  and a loud failure guard — `console.error` + `process.exit(1)` — if the
  shape it is looking for ever moves again.

**THE SAME TOCTOU RACE HAD TWO CHANCES TO STAY HIDDEN AND TOOK BOTH.** The
multi-user audit's live question — 50 inspectors, ~70 rounds a day,
synchronising together — pointed at `saveOne()` (`docs/yandex/function.js`):
its only rival check is `headObj(key0)` BEFORE this device writes. Two
phones filing the same round close enough together can both pass that check
seeing no owner, both write straight to the primary key, and the existing
hand-over rival handling never fires for either. Whichever device's own
read-after-write verify happens to run AFTER the other device's write lands
gets back bytes it did not send.

The first fix written for this gated the new check on `!verifyError` —
reasoning that "verify after storage" would only be fooled by a race where
both devices happened to write byte-identical content (the one case that
verifies clean with no error at all). That reasoning solved a case that
almost never happens and missed the one that does: two inspectors' findings
on the same plug are not identical, so the read-back disagrees with `want`
and the EXISTING code already labels it `verifyError: 'stored bytes do not
match what was sent'` — true, and the wrong diagnosis. Read that way alone,
it tells the phone to retry; a retry re-heads the same key, still finds a
hash that is not its own, and writes straight over the rival again, with
neither device ever told a second person is involved. Gating the new check
on `!verifyError` excluded exactly the race it was written to catch — found
by writing the test for it (`tests/toctou.cjs`), not by inspection: the
fixture's own two devices sending genuinely different content failed 7 of
12 assertions the first time it ran, against the "fixed" code.

The corrected condition drops `!verifyError` and reads the owner metadata
as the discriminator instead of the hash: if the object's CURRENT owner is a
real device that is not this one, someone else's write landed in between,
whether or not the bytes also happen to differ. This device's own bytes
move to their own `~dev` variant and a conflict is raised — the same
hand-over mechanism the sequential case already uses, applied one step
later, on this device's own bytes, exactly as if the rival had been seen
before the write instead of after it. A genuine duplicate (this SAME device
resending bytes it already stored, verified clean before this check ever
runs) is still excluded — nothing was lost there, so nothing needs moving —
and a read-back that failed outright rather than disagreeing carries no
owner at all, so it is left as a plain read failure, never guessed at as a
rival.

`tests/toctou.cjs` cannot force a genuine two-connection race reliably (the
interleaving needed depends on which microtask slot two independent fetches
happen to resume on — exactly what makes a naive `Promise.all()` version of
this pass on one machine and miss the window on the next), so it loads the
real `docs/yandex/function.js` the way `ya-srv.cjs` does and instruments
`getObj()` to inject "the other device's write already landed" at the one
instant that matters — inside this device's own first post-write verify
read for a chosen key — instead of hoping two real requests line up.
Confirmed non-vacuous: reverted to the pre-fix code, the same fixture fails
7 of its 12 assertions. A second control proves the `!duplicate` guard is
not dead code (a real resend, with the owner metadata flipped mid-verify to
someone else's, is still answered as a duplicate, never as a rival), and a
third proves the instrumentation itself does not disturb an ordinary solo
save. `docs/google-upload.gs` needs no equivalent change: this project's own
"field-for-field" rule for that retired backend is about the RECEIPT shape
agreeing, not internal race-handling, and this fix changes neither the
receipt's fields nor their meaning.

**TWO DASHBOARD SCREENS WERE STYLED FOR A CLASS THEY DID NOT CARRY.** The
same audit's visual pass found the Data & Sync tab's Defect-work-orders
filter row (`#cwStatus`/search/Export CSV) stacked as four separate block
rows instead of one compact bar — it used `class="ddbar"`... no, it used
`class="toolbar"`, and `.toolbar` has no CSS rule anywhere in this file; the
two sibling tabs' own filter rows (Inspection Schedule, Plan vs Actual) both
use `.ddbar`, which does. Fixed by matching the sibling tabs' own class.
Separately, `openPos()`'s finding-detail drawer (`#drwBody`) renders the
exact same `.pk`/`.pl`/`.cm`/`<dl>` markup the Equipment History gallery
card (`.pos .body`) uses — but every one of those rules is scoped under
`.pos .body`, which the drawer is not inside, so none of them ever matched
and the drawer fell back to unstyled browser-default `dl`/`dt`/`dd`. Given
`#drwBody`-scoped copies of the same rules (not a `.pos` wrapper, which
would also add that card's own border/background the drawer never had).
Both confirmed visually via Playwright screenshot.

**A DEVICE ACTIVITY PANEL, BUILT FROM WHAT THE APP ALREADY COLLECTS.** The
same multi-user audit asked whether the office can see who is using the app
and when — this fleet has no login, an inspector types a name per round and
the phone's own device id is the only durable identity. Rather than build a
login system, the Data & Sync tab's Admin diagnostics section gained a
**Device activity** table: last-seen time and last round PER DEVICE, derived
entirely from `RECS` already loaded (`deviceActivity()`, no network call,
so it costs nothing to show), plus an on-demand "Check builds & storage"
button that lazily fetches each device's newest `_meta/diag` trace for its
BUILD number and storage percentage (`refreshDeviceDiag()`) — never
automatic, since it is a folder listing plus one file per device and this
tab already has enough automatic traffic. A device silent for more than a
day is flagged in the "Last activity" column, the same way a stale queue is
flagged elsewhere on this page.

**A SIGNATURE DRAWN ON THE PAD CAN STILL BECOME NOTHING, WITH NO ONE TOLD.**
Read plainly from the field: "no we put signiture but nothing on the pdf" —
for CN002 (INSP, 2026-09-24, device DMYLFQ), confirmed directly against the
server: `signed:0`, no `_SIGN.png` anywhere in that round's folder, on
BOTH surfaces, not a dashboard-fetch bug. Every other explanation was ruled
out against the real code first — filename and date-format formulas are
byte-identical between the phone and the office, the backend's own media
index already includes PNG, `runReport()` already awaits the fetch before
generating, and `reArmForSave()`'s not touching `rec.sign` is correct
rather than a gap, because a signature is captured fresh at Save and was
never previously written to IndexedDB the way a photograph is, so it was
never exposed to the shared-Blob-identity mechanism that function exists to
defeat. What was left: `signBlob()` handed `canvas.toBlob()` a callback and
trusted whatever came back, including nothing — the one piece of evidence
capture in this whole app with no read-back of what it produced, the exact
gap `ownBytes`/`readBlobBytes` closed for every photograph long ago, and
this project's own stated rule ("nothing reaches storage that this page has
not read end to end") never reached. `signBlob()` now tries `toDataURL()` —
a different code path over the same pixels — when `toBlob()` returns null
or empty, the identical "more than one reader before you call it gone" rule
photographs already get; and if a pad the inspector actually drew on still
produces nothing usable after both, Save refuses outright (`m_sign_fail_t`/
`m_sign_fail_m`) instead of filing the round with `sign:null` and letting it
surface, silently, as a blank line on a printed document days later. The
underlying WHY `toBlob()` might fail on a real device is unconfirmed — this
ships the same net-not-cure this file has already applied to `reArmForSave`,
`ownBytes` and `holdAwake` for the identical reason: the fix does not depend
on knowing the platform-level cause. `tests/signfail.cjs` proves the
ordinary case is untouched, that a `toBlob()` failure alone is invisible
(the fallback rescues it, no dialog, a real signature saved), that a total
failure on a pad that WAS drawn on blocks Save and creates no record, and
that redrawing after readers recover saves cleanly.

**A FILTER BAR SHOWING "N OF M INSPECTIONS" ABOVE A TABLE IT NEVER TOUCHES
IS THE SAME CONTROL-THAT-DOES-NOTHING DEFECT ONE LEVEL UP.** Reported
plainly: "Filters and search are not working" on Defects Raised. Two
separate things were true at once.

`showTab()` already carries the exact fix this needed, for five OTHER
tabs: the global Type/Class/Grade/Period/Status/Search bar at the top of
every page reads `RECS`, and Due, Lubrication, Sync, Reports and Plan vs
Actual each read something else entirely — so each was added to an `own`
list that puts the bar (and its filter chips) away while that tab is open,
"rather than sitting there inert above a list it does not touch," in the
comment's own words. Defects Raised reads 1C's own work-order export
(`window.CM_WO_DATA.cmWorkOrders`), exactly the same shape as Plan vs
Actual — and was simply never added to the list. The bar sat there showing
"N of M inspections" and an active "Search DR" chip that filtered nothing
below it, on every visit, since the tab shipped.

Separately, the panel's OWN search box (`cwQ`) does filter — narrowed 72
defects down correctly by person and status — but as a bare substring
match across nine free-text fields, including the system-component
description. Searching "DR" for the DR007/DR009/DR010 drills also matched
EX019 and EX004, because "DR" sits inside "Hydraulic Pumps" and inside
"EX004.DRS.ENG" (an engine system code) — confirmed against the real,
live `data/work_orders.js`, not a synthetic fixture. `cwWordMatch()`
requires the query to start at the beginning of a word (position 0, or
right after a non-alphanumeric character) rather than anywhere inside one:
a system code that genuinely STARTS with "DR" (`DRS.ENG`) still matches,
"Hydraulic" no longer does. `tests/cmwo.cjs` §7 proves the bar is hidden
on this tab and returns on one it actually narrows; §8 proves the word
match against the exact three-record shape (a real drill, a legitimate
DR-prefixed system code, and the Hydraulic decoy) that reproduced the
field report.

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

**A DEEP-SCAN AUDIT OF THE MOBILE CODE, NOT PROMPTED BY A FIELD REPORT.** Asked
plainly to "find bugs, error, possible error/bugs" in `mobile/`, seven parallel
readers each covering one subsystem. Eight held up under verification:

- **`hasData()` could answer `undefined`, and one caller trusted it as a
  boolean.** Every operand in its `||` chain is `undefined` for a genuinely
  empty position, and `||` on an all-falsy chain returns the LAST operand's
  actual value — so `hasData({})` was `undefined`, not `false`.
  `refreshChips()`'s two direct `classList.toggle("has", posCaptured(...))`
  calls passed that straight through as the `force` argument, and per the DOM
  spec an `undefined` force means "no force given" (plain toggle) rather than
  "remove" — so a blank chip, starting with no class at all, had `"has"`
  ADDED to it the instant it first painted. Every ternary/`filter(Boolean)`
  caller was already immune; `hasData()` now wraps its whole return in `!!(...)`
  so no caller, present or future, can be caught by this again. `p.detect`
  was missing from the OR-chain entirely (a defect's detection method alone
  did not count as "captured"), added the same pass.
- **A mis-tapped grade card left `{gradeMan:1}` behind on an otherwise blank
  position.** Every other single-field setter in that fold (reason, detect,
  priority, action, defect/cause) cleans up an entry that is now empty on
  deselection; the grade segment's own click handler never did, so deselecting
  a grade nobody meant to set left a stray entry that `posCaptured()` then
  read as a real capture. Given the same `if(!hasData(p) && !p.wo) delete
  draft.positions[curItem];` guard every sibling handler already carries.
- **`planRows()` — the "1C plan" scope — was the THIRD reader of the schedule
  with no defer check.** `dueRows()` and `dueWeekRows()` both ask
  `deferOf()`/`deferState()` before listing a round as outstanding;
  `planRows()` never did, so a round an inspector told the app "not now" on
  went on appearing as 1C's own open plan the moment its work order came due —
  the identical shape the KAMAZ hold-off exclusion was already written for,
  one function over. `deferState()` is hoisted out of `dueWeekRows()`'s own
  local closure to a shared top-level function so both readers (and now a
  third) apply the identical rule (`tests/dueplan.cjs` §6).
- **A TEMP reading that proposed a grade had no mirror for taking it away.**
  `syncTempSev()` wrote `p.grade`/`p.gradeAuto` the moment a reading crossed a
  limit — the only thing that ever proposes a grade on a measured round — but
  clearing the reading, or correcting a mistyped value back inside the limit,
  left the stale grade, its defect, action and target date all standing with
  nothing behind them. A reading that stops proposing a grade now clears it,
  unless an inspector has confirmed it by hand (`gradeMan`) (`tests/tempgrade.cjs`).
- **RTW's own approval row was labelled "Maintenance Supervisor," never
  "Senior Mechanic."** `approvalBlock`'s `onlySup` branch — the one row RTW's
  release checklist actually needs — called `T("ap_sup")` instead of the
  label already sitting in the language table for exactly this role,
  `T("rtw_senior")`. The existing test had encoded the wrong label as
  correct; both are fixed together (`tests/rtw.cjs` §11).
- **RTW's own photo cap failed in silence.** `addPicked`'s cap (`MAX_PHOTOS`)
  shows the "not everything fitted" dialog the instant a file is left out;
  `rtwIntakeFiles` — the checklist's own photo intake, a separate function —
  simply `break`s out of the same cap with nothing said, so a checklist item
  or the general-evidence photo taken past ten just had fewer photographs
  than the inspector took (`tests/rtw.cjs` §5b).
- **`addPicked()`/`acceptVideo()` attached evidence to whatever position was
  open when the slow part finished, not the one the picker was opened for —
  and, one level deeper, could lose it outright.** `ownBytes` securing a
  multi-file gallery batch (build 372's own fix) is genuinely slow, and the
  phone is fully interactive again the instant the OS picker returns control
  — long enough for an inspector to tap a different position before the batch
  finishes. `addPicked` read `curP()` only AFTER that wait, so every
  photograph (and the clip, through `acceptVideo`) landed on whatever
  position curItem had drifted to. Capturing the object early is not enough
  by itself: `saveCur()` DELETES an empty position's own entry the instant
  the inspector taps away from it, including the very one this batch belongs
  to, mid-securing — and an object captured before that delete survives in
  memory under no key the round can ever read from again, decoded and
  orphaned. The fix captures the KEY (`curItem`, a string) before the slow
  part and derives `draft.positions[key] ||= {}` again afterward — the
  misattribution is fixed because the key is frozen before anything can move
  it, and the orphaning self-heals because a missing key is simply recreated
  (and one the inspector has meanwhile typed something real into is found and
  added to, never clobbered). `acceptVideo(f, posKey)` carries the same key
  through its own async gap (loading the clip's metadata) the same way,
  re-deriving at the moment of actual use rather than holding an object
  across it (`tests/curitemrace.cjs`).
- **A video clip was one of the six paths that returned the picker's own File
  to storage, and it was never actually closed.** `ownbytes.cjs`'s own
  history names it directly among the six; the other five were closed by
  making `ownBytes`/`intakeNoted`'s read unconditional at intake, but
  `acceptVideo()` never called either — a clip went straight from the picker
  into `p.video` with nothing between it and storage, on the exact platform
  this project has twice confirmed reclaims a picker's backing file on its
  own schedule. `reArmForSave()` does re-read every video's bytes, but only
  at SAVE, the safety net at the end of a round — not the earliest possible
  detection every photograph gets at intake, with the button disabled and the
  inspector still at the machine; a `reArmForSave` failure is also swallowed
  silently (`catch(e){}`), leaving a stale unreadable original in the record
  with nobody told. `acceptVideo` now reads the clip the same way a
  photograph is read at intake, replacing it with a File made from the page's
  own read bytes; a read that fails KEEPS the original (never discard
  evidence) and says so now, in the clip's own wording (`video_odd_own`, not
  the photograph one), while the inspector can still record it again
  (`tests/videoown.cjs`). The same investigation found `extOf()` — the
  function `attWrap()` uses to name a clip's own internal identity file —
  had no video branch at all and fell through to `"jpg"` for every clip,
  the identical "a wrong [type] is a lie the next reader believes" shape this
  function's own comment already warns against for a photograph, one call
  away.
