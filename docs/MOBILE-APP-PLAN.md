# From a web app to a product

**What it takes to put this on Google Play and the App Store, sync it properly, make it fit
any fleet, and be ready for 1C the day the client asks.**

Written against build 68. Assumptions are stated where a decision has not been made — none
of them block starting.

---

## 1. The recommendation in one page

**Wrap what exists. Do not rebuild it.**

The thing people underestimate about this codebase is how much of it is *domain*, not
*software*: 132 defect types, 223 direct causes, a pre-computed cascade linking them to
every component of every equipment class, ISO 14224 mechanism mapping, per-model
undercarriage wear limits, read-time reference resolution, a report engine both ends share,
EN/RU throughout, and 44 test suites holding it all down. A native rewrite throws none of
the *code* away for free — it throws away the **1,276 checks** that say the code is right.

So:

| | Wrap the PWA (Capacitor) | Native rewrite (React Native / Flutter) |
|---|---|---|
| Time to first store build | **2–3 weeks** | 4–6 months |
| Capture logic, wear engine, cascade | reused as-is | rewritten |
| Report engine | one engine, both ends | second implementation, will drift |
| Test suites | keep all 44 | rewrite from zero |
| Offline | already works | rebuild |
| Camera / GPS / files | native plugins | native |
| Background sync | possible | better |
| Risk | low | high |

**Capacitor**, not Cordova, not a bare TWA. Capacitor gives you real native plugins
(Camera, Filesystem, Geolocation, Preferences, Network, Push), one codebase for both
stores, and a native project you can drop Swift/Kotlin into when you need to. A TWA is
Android-only and Apple will reject the equivalent.

**Then** go native for specific screens if the field tells you to. Not before.

---

## 2. Google Play — what you actually have to do

**Accounts and money**

- Google Play Developer account — **$25, once**. Register as an **organisation**, not a
  personal account: personal accounts are subject to the *closed testing* requirement —
  20 testers running the app for 14 continuous days before you may apply for production.
  An organisation account skips it. You will need a D-U-N-S number for the organisation;
  allow two weeks to get one.
- Verified organisation details are public on the listing. Decide now whose they are.

**Before you can upload**

- **App bundle (.aab)**, not an APK. Signed by Play App Signing — let Google hold the key,
  it is the only recovery path if yours is lost.
- **Target API level** must be within one year of the current Android release. Capacitor
  handles this; it means a rebuild roughly annually or the listing goes stale.
- **Package name** is permanent. `com.<company>.conditionmonitoring` — pick it once,
  you can never change it without publishing a new app.

**The listing itself**

- Icon 512×512, feature graphic 1024×500, at least 2 phone screenshots (I would ship 6:
  the round in progress, the undercarriage map, a Critical finding with the P1 tag, the
  queue syncing, the report, the dashboard on a tablet).
- Short description 80 chars, full description 4000.
- **Privacy policy at a public URL** — mandatory, and it must be live before review.
- **Data safety form.** This is where wrapped apps get delayed. You must declare: photos
  (collected, transmitted), location (GPS stamp — collected, transmitted), and any
  identifiers. Every answer must match what the app really does. Mismatches are the most
  common cause of rejection.
- Content rating questionnaire, target audience (18+, business), ads declaration (none).

**Review** is typically 1–7 days for a new app, longer for a first submission from a new
account.

---

## 3. App Store — what you actually have to do

**Accounts and money**

- Apple Developer Program — **$99/year**, recurring. An **Organization** membership needs
  a D-U-N-S number too, and Apple verifies by phone.
- You need **macOS with Xcode** to build and upload. If nobody has a Mac: use a cloud CI
  (Codemagic, Bitrise, GitHub Actions macOS runners). Budget for it; there is no way
  around it.

**The rejection risk you must plan for**

App Store Review Guideline **4.2 Minimum Functionality** exists to reject apps that are
just a website in a shell. This app is not — but it must not *look* like one:

- Use native Camera, Geolocation and Filesystem plugins, not the browser's.
- No visible browser chrome, no URL bar, no "pull to refresh" web affordance.
- It must **launch and work with the aeroplane mode on** — demonstrate this in the review
  notes. This is the single strongest argument against 4.2, and it is already true.
- Native share sheet for the PDF, native file save.
- Handle the notch, safe areas, and the iOS keyboard properly.

**Also required**

- **Purpose strings** in `Info.plist`, in plain language — Apple reads these:
  `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`,
  `NSLocationWhenInUseUsageDescription`. "To photograph the component you are inspecting
  and record where the inspection took place." Not "to use the camera".
- App Privacy nutrition label — same content as Play's data safety form.
- Screenshots for 6.7" and 6.5" iPhone, and 12.9" iPad if you ship iPad (you should — the
  dashboard is already tablet-capable).
- **TestFlight** first. Get it onto five real phones in the pit before review.
- Sign in with Apple **is required** if you add any third-party login. Avoid third-party
  login and you avoid the requirement.

**Review** is typically 24–48 hours now, but assume one rejection round on the first
submission and plan the date accordingly.

---

## 4. What has to change in the code first

None of this is large. It is the honest list.

| # | Change | Why |
|---|---|---|
| 1 | Capacitor shell, iOS + Android projects | the container |
| 2 | Swap `<input type="file" capture>` for `@capacitor/camera` | quality, EXIF, and 4.2 |
| 3 | Move photo blobs from IndexedDB to `@capacitor/filesystem` | a 36-point UC round with 4 photos each is ~150 photos; IndexedDB blob storage is the wrong tool at that size, and iOS evicts it |
| 4 | Replace the service worker's update flow with a native update check | web SW updates are invisible inside a shell |
| 5 | Real app icon + splash | store requirement |
| 6 | Deep link `cm://unit/TK151` | QR labels can open the app straight into the machine |
| 7 | `@capacitor/network` in place of `navigator.onLine` | onLine lies on mobile — it reports "online" on a captive portal and on 2 dead bars. Build 69 works around this with a retry timer; a native listener removes the guesswork |
| 8 | Background sync (`@capacitor/background-runner`) | build 69 retries while the app is *open*. A native runner finishes the upload when the phone reaches camp wifi in somebody's pocket — the last thing a wrapper cannot do from the web layer |
| 9 | Crash + error reporting (Sentry) | you cannot debug a phone in a pit any other way |

Items 1–5 are the store minimum. 6–9 are what makes it feel like an app.

---

## 5. Sync — what "fast enough" really requires

**Be honest about what exists today.** Google Drive via Apps Script is a good decision for
a pilot with no IT approval, and a bad one for a product:

- No per-user identity — one shared secret, everyone is the same writer.
- Apps Script has a **daily execution quota** (~90 min on a consumer account). Fine for 20
  phones, not for 200.
- No server-side conflict resolution; the dashboard resolves clashes by hand.
- No push. The dashboard polls (every 3 minutes, on focus, on reconnect — build 68).
- A folder listing is O(files). It will not stay fast at 100,000 photos.

**The design that scales.** The important move is not choosing a backend — it is making the
backend replaceable, *before* you need to replace it.

```
      capture (unchanged)
             │
      ┌──────▼───────┐   append-only, survives a kill
      │   outbox     │   {op, entity, id, rev, payload, tries}
      └──────┬───────┘
             │
      ┌──────▼───────┐   ← the seam. One interface, many adapters.
      │ SyncAdapter  │     push(batch) → {accepted, conflicts}
      │              │     pull(cursor) → {changes, cursor}
      └──────┬───────┘
    ┌────────┼─────────┬──────────────┐
  Drive    REST API   1C HTTP svc   (future)
 (today)   (target)   (direct)
```

Rules that make it fast and correct, all of which the current code already half-implements:

1. **Every record carries a stable UUID and a monotonic `rev`.** Generated on the phone, at
   capture. Never re-issued. This is what makes an upload *idempotent* — a retry after a
   timeout cannot create a duplicate. **The single most important thing to add now.**

   *Checked against build 68, because it matters that this is accurate:* the phone already
   does the hard half. A round gets `id = TYPE__UNIT__DATE__DEVICE__timestamp` at save,
   keeps it across every edit, and carries a `rev` that increments — and both survive the
   phone-to-phone transfer (`recToBundle`). **But neither is written into the sidecar that
   goes to Drive.** `buildEntriesJson()` emits `equip, date, type, cls, by, smu, sup, gps,
   dev, signed, items[]` and drops `id` and `rev` on the floor.

   So everything downstream — Drive, the dashboard, any future backend, 1C — keys on
   `equip|date|type`, which is neither unique (two phones on the same unit on the same day
   is the exact clash the conflict machinery exists to handle) nor stable (correct a
   mistyped date and it silently becomes a different record). Adding two fields to that
   object is most of Phase 0. Do it before more rounds accumulate in Drive that cannot be
   reconciled against anything.
2. **Cursor-based delta pull.** Already how the dashboard reads Drive. Keep it.
3. **Push in batches, records before photos.** The record is 2 KB and makes the round
   visible; the photos are 3 MB and can follow. A supervisor sees a Critical finding in
   seconds, not after the images upload.
4. **Photos upload resumably, newest-critical first.** A P1 finding's photograph matters
   more than a routine one's.
5. **Last-writer-wins per *field*, not per record** — with the existing correction-marker
   pattern (never rewrite a captured record; layer corrections at read time). It is already
   the right model and it is unusual to get right; keep it.
6. **Server assigns nothing the phone needs offline.** No server-generated IDs on the
   critical path, or the app stops working out of signal.

**Realistic latency, once on a real backend:** phone → visible on dashboard in **2–5
seconds** with signal, using a WebSocket or SSE push instead of the 3-minute poll. Photos
follow within a minute. Offline rounds sync within seconds of regaining signal.

**Recommendation:** Postgres + a small REST API (Node or Go), object storage for photos
(S3-compatible), SSE for the dashboard's live updates. Roughly a 3–4 week build. Drive
stays as a fallback adapter for sites where IT blocks everything — that is a genuine
feature, not legacy.

---

## 6. Making it fit any fleet, not just this mine

Right now the domain knowledge is a strength and a lock-in. To sell it to a bus operator,
a port, or a hospital's generator fleet, the following must move from **code** to
**configuration** — loaded per tenant, not compiled in:

| Today, hard-coded | Becomes |
|---|---|
| 5 inspection types (MP, FC, INSP, TEMP, UC) | **inspection templates** — a JSON definition: fields, units, limits, walk order |
| ISO 14224 mining taxonomy | one taxonomy pack among several (ISO 14224 covers oil & gas / mining; others need their own) |
| Undercarriage wear tables | a **measurement-with-limits** field type; undercarriage becomes one instance of it |
| Unit-number prefixes (TK/DZ/EX…) | tenant asset register with its own coding |
| P1–P4 1C priorities | tenant priority list |
| EN/RU | a language pack |

The good news: **the report engine, the severity model, the offline engine, the sync layer
and the photo pipeline are already generic.** The work is a template compiler and an admin
screen to author templates — perhaps 6 weeks — and it turns a mining tool into a product.

**Design principle to hold:** a template must never be able to express something the report
engine cannot print. Author templates against the report, not against the form.

---

## 7. The interface

The app is already good on the two things that matter in a pit: one job per screen, and a
Save button that never scrolls away. What a product needs on top:

- **A home screen that answers "what do I do next?"** — today's route, overdue units,
  what is waiting to upload. Not a menu.
- **The round as a progress object** — 12 of 36 points, resumable, visible.
- **One-thumb capture.** Everything reachable with the phone in one gloved hand. Big
  targets (56 px minimum), no long-press-only actions.
- **Sunlight and gloves.** High-contrast light theme as the *default* outdoors, dark for
  night shift, both already built. Test at 100% brightness outside before shipping.
- **Say the state, always.** Saved / queued / uploading / synced / conflict, on every
  round, everywhere. Uncertainty about whether work was saved is the thing that makes
  people stop using an app.
- **Never lose work.** Already true; make it visible — "3 rounds waiting to upload" on the
  home screen, not buried.

Keep the existing report design. It is the product's most defensible artefact — the thing
management sees.

---

## 8. 1C — what to build now so integration is a configuration exercise later

Assuming **1C:ERP** or **1C:ТОиР** (the standard maintenance/EAM configuration), and that
you do not have access to their system yet. Everything below can be done without it.

### The objects this maps onto

| Ours | 1C |
|---|---|
| Unit (TK151) | Справочник **Объекты ремонта** — match on `Код` |
| Component (4C, DRS.ENG) | Справочник **Узлы объектов ремонта** / an object hierarchy |
| Inspection round | Документ **Дефектная ведомость**, or a custom document |
| Finding with an action | Документ **Заявка на ремонт** (repair request) |
| Priority P1–P4 | the stoppage priority enum — **already aligned, in 1C's own wording** |
| SMU / motor hours | Регистр сведений **Показатели эксплуатации** |
| Photograph | **Присоединённый файл** on the document |
| Inspector | Справочник **Физические лица** / **Пользователи** |

### The three things to add to the payload *now*

These cost almost nothing today and are painful to retrofit:

1. **`uuid` per record and per finding.** 1C needs a stable external key to make an import
   idempotent — without it, a retried exchange creates duplicate documents. Store it in
   1C as `ИдентификаторВнешнейСистемы` or a dedicated `Реквизит`.
2. **`externalCode` on every reference.** Do not send `"TRUCK, DUMP"` and expect 1C to
   match it. Send our code *and* a slot for theirs: `{"equip":"TK151","equip1C":null}`.
   The mapping is filled in once, by them, in a table.
3. **ISO 8601 timestamps with an offset.** `2026-08-02T14:30:00+12:00`. 1C sites run local
   time and Baimskaya is UTC+12; a naive timestamp will be silently wrong by half a day.

### The exchange itself — how a 1C programmer would want it

**Recommend: an HTTP service (HTTP-сервис) published from 1C**, not OData, not a file
exchange plan.

- OData (`/odata/standard.odata/`) is automatic and tempting, but it exposes the raw object
  model, needs full write rights on documents, and couples you to their configuration's
  internals. Their security team will refuse it.
- **File exchange (План обмена + EnterpriseData)** is the classic route and is fine if
  they insist — but it is batch, typically every 15 minutes, and gives no acknowledgement
  a phone can act on.
- An **HTTP service** is a handful of methods their 1C developer writes, in their own
  configuration extension (`Расширение конфигурации`), so nothing in the base config is
  modified and their support contract survives. This matters to them more than anything
  technical.

**The contract to hand them** — four methods, that is all:

```
POST /cm/v1/inspections        one round, with findings.        → {accepted:[uuid], errors:[]}
POST /cm/v1/requests           findings that raise a job.       → {uuid → НомерЗаявки}
GET  /cm/v1/equipment?since=   their asset register, delta.     → codes, names, models
GET  /cm/v1/requests?since=    status of jobs we raised.        → open / in work / closed
```

The two GETs are what turn this from a data-collection app into part of the maintenance
loop: the register stops being a file somebody emails, and the technician who reported a
cracked idler **sees that a work order exists and what happened to it**. That is the
feature that makes people trust the app.

Auth: HTTPS + Basic to a dedicated 1C user with rights to exactly those methods. Not a
shared secret in the app.

### What to write down before you talk to them

A one-page **integration specification** — the four endpoints, the JSON shapes, the field
mapping table with their column blank, and a **mock 1C service** they can point at. Hand
that over and their developer's job becomes a week of work with nothing to design. Without
it, the conversation restarts every meeting.

---

## 9. Phasing

| Phase | What | Effort | Depends on |
|---|---|---|---|
| **0** | Write the `id` and `rev` the phone already holds into the sidecar; teach the dashboard and the script to key on it; extract the `SyncAdapter` seam behind the existing Drive code | **3–4 days** | nothing — do this next |
| **1** | Capacitor shell, native camera / filesystem / geo, icons, deep links | 2–3 weeks | 0 |
| **2** | Store accounts, listings, privacy policy, data-safety declarations, TestFlight + closed track | 1–2 weeks, overlaps | D-U-N-S, a Mac or CI |
| **3** | Real backend: Postgres + REST + object storage + SSE. Drive kept as a fallback adapter | 3–4 weeks | 0 |
| **4** | 1C integration spec + mock service; the four endpoints once their team engages | 1 week spec, 2 weeks build | client's 1C team |
| **5** | Template engine — inspection types as configuration, not code | 6 weeks | 3 |

**Phase 0 is the one to start today** and it is the cheapest. Everything after it is easier
if records carry stable identity, and every week it is delayed is another week of records
in Drive that cannot be reconciled against anything.

---

## 10. What I would not do

- **Do not rebuild native first.** You would spend six months to arrive where you already
  are, and re-open bugs that took real field reports to find.
- **Do not put the app on the stores before Phase 0.** Records without stable IDs are
  records you cannot migrate to a real backend without a reconciliation exercise.
- **Do not wait for 1C to start.** Design the contract, build the mock, keep moving. The
  client's 1C team will engage faster with a specification in front of them than with a
  request for a meeting.
- **Do not let a store deadline force the sync design.** The wrapper can ship on the Drive
  adapter. The backend can land underneath it without a new app release.
