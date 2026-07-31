# Auto-upload to Google Drive (about 10 minutes, no IT ticket)

An alternative to the SharePoint / Power Automate route. Photos, video, the signature
and the JSON sidecar go straight from the phone into a Google Drive folder.

**Why this is usually faster than Power Automate**

| | Power Automate → SharePoint | Google Apps Script → Drive |
|---|---|---|
| Hops | phone → Azure Logic Apps queue → SharePoint | phone → Apps Script → Drive |
| Licence | HTTP trigger is a **premium** connector | free with any Google account |
| Cold start | flow can idle for seconds before running | script runs on request |
| Setup | flow designer, expressions, "who can trigger" | paste one file, deploy |

If the phone was waiting on the flow queue, this removes that wait entirely.

> **Not a fix for a slow connection.** If the pit has weak signal, the bottleneck is the
> photo bytes, not the destination — see [Make the uploads smaller](#make-the-uploads-smaller)
> below, which helps on either route.

---

## 1. Make the Drive folder

In Google Drive create the folder everything lands in, e.g. **Condition Monitoring**.

Open it and copy the id from the address bar — the part after `/folders/`:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz123456
                                        └──────────── this ────────────┘
```

Pasting the **whole URL** works too — the script pulls the id out itself, including a
trailing `?usp=drive_link`.

## 2. Create the script

1. Go to **script.google.com** → **New project**
2. Delete the `function myFunction() {}` stub
3. Open **`docs/google-upload.gs`** from this repo, copy the whole file, paste it in
4. Set `ROOT_FOLDER_ID` to the id you copied
5. *(Optional)* set `SECRET` to any password — put the same value in the app later
6. Rename the project (top left) to `CM Upload` and **save** (💾)

## 3. Authorise it — do this BEFORE deploying

In the editor pick **`setup`** from the function dropdown at the top, then click **Run**.

Google asks you to authorise. You will see *"Google hasn't verified this app"* — expected
for a script you wrote yourself: **Advanced** → **Go to CM Upload (unsafe)** → **Allow**.

The Execution log should end with `"ok": true` and your folder's name. If it throws, the
message tells you exactly what is wrong.

> **Don't skip this.** A deployed web app cannot ask for permission on your behalf, so the
> Drive grant has to be given interactively first. Without it every Drive call fails with
> Google's unhelpful *"Unexpected error while getting the method or property getFolderById
> on object DriveApp"*.

## 4. Deploy it

1. **Deploy** → **New deployment**
2. Click the ⚙ next to "Select type" → **Web app**
3. Set:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone` ← *not* "Anyone with a Google account"
4. **Deploy**
5. Copy the **Web app URL**. It ends in `/exec`. **Treat it as a password.**

**Check it works:** paste that URL into a browser tab. You should see

```json
{"ok":true,"service":"Condition Monitoring upload","folder":"Condition Monitoring"}
```

If you see `ok:false`, the `ROOT_FOLDER_ID` is wrong or the folder isn't yours.

## 5. Point the app at it

On the phone, open the app → **⚙** (top right) and fill in the **Google Drive (Apps
Script)** block:

| Field | Value |
|---|---|
| **(tick the box)** | turns the destination on |
| **Upload URL** | the `/exec` URL |
| **Shared secret** | the `SECRET` value, or leave empty if you left it `''` |
| **Folder** | `{TYPE}/{YYYY-MM}` — a folder per inspection type, per month |
| **Photo size on upload** | see below |

Tap **Test connection** → *"✅ Google Drive"* and a `connection_test.txt` appears in
Drive. Then **Save**.

### Folder layout

The **Folder** field takes placeholders, and sub-folders are created as needed, so each
inspection type can have its own home instead of everything landing in one listing:

| Placeholder | Becomes |
|---|---|
| `{TYPE}` | `MP` · `FC` · `INSP` · `TEMP` |
| `{TYPENAME}` | `Magnetic Plug` · `Filter Cut` · `Inspection` · `Temperature` |
| `{UNIT}` | the unit number, e.g. `TK146` |
| `{YYYY}` `{MM}` `{DD}` `{YYYY-MM}` | parts of the **inspection** date |

`{TYPE}/{YYYY-MM}` gives:

```
Condition Monitoring/
  MP/2026-07/    TK146_4C_31.07.2026_MP.jpg  …
  FC/2026-07/    TK151_HYD_31.07.2026_FC.jpg …
  TEMP/2026-07/  TK146_31.07.2026_TEMP.json  …
  INSP/2026-07/  …
```

Date parts come from the **inspection date**, not from today, so a round entered a few
days late still files under the month it was actually done. Each destination has its own
folder setting, so Drive and SharePoint can be laid out differently.

`{TYPE}/{YYYY-MM}` is the built-in default, so a phone set up from scratch files each type
separately without anyone configuring it.

> **Upgrading from an older build.** The first build to ship a folder default used
> `{YYYY-MM}`, which put all four types in one monthly folder. Phones on that exact
> setting are moved to `{TYPE}/{YYYY-MM}` once, automatically. A folder you typed
> yourself is never touched, and setting `{YYYY-MM}` back deliberately sticks.

Files already in Drive are not moved — the split applies from the next upload. Drag the
old ones into the new folders if you want the history tidy; nothing reads the folder
layout, so it is cosmetic.

### Correcting, voiding and deleting an inspection

**Equipment history → ✎ Edit** on any inspection.

**Correct** severity, recommendation, WO, defect, direct cause and comments, per position,
plus a note on the round. Your name is required and travels with the change.

Corrections are written to `_meta/<UNIT>_<DATE>_<TYPE>.edit.json`, **never into the
inspection's own sidecar**. The phone that captured it still holds that record, and
re-syncing overwrites the sidecar — a correction stored there would vanish without trace.
The clients merge the marker over the record when they read, so the original readings,
photos and signature are never altered. Only fields you actually change are recorded.

**Void** withdraws a round from every count, chart, action list and report, with a reason
attached. Nothing is deleted. Voided rounds still appear in Equipment history, greyed and
flagged, and **Show voided** in the controls brings them back into view. The phones honour
it too: a voided round drops out of *In the system* and stops counting as done in the
due list. **Un-void** puts it back.

**Delete** is switched off unless you set `ADMIN_SECRET` in the Apps Script:

```js
const ADMIN_SECRET = '';   // deletion disabled while empty — the safe default
```

Set it only if you want it, and **never put that value in the app, in
`upload-defaults.js`, or anywhere in the repo**. The `/exec` URL is handed to every phone
and is effectively public; this password is the only thing between that URL and someone
emptying the folder in a single request. You type it into the dashboard when deleting; it
is not stored.

Deleting removes the sidecar, every photo, the signature and any correction — moved to
Drive's **trash**, recoverable for 30 days, never purged — and writes an entry to
`_meta/deletions/` recording what went, when, who and why. The dashboard also asks you to
type the unit number to confirm.

> Prefer **Void** to Delete. Inspection photos are evidence for warranty claims and
> failure investigations, and "who deleted TK146's plug photos?" is a bad conversation to
> have with no answer. Delete is for test records and mistakes that should never have
> existed.

### What the rest of the team has uploaded

The phones read that same endpoint, so every inspector sees the whole team's work, not
just their own phone's. The **In the system** card lists recent inspections with the unit,
grade, date and who did it, and picking a unit shows *"Last done 2026-07-28 (3 d ago) by
B. Ivanov · C"* right on the capture screen — so nobody walks a round that was done
yesterday.

It also feeds **Inspection due**: that list used to know only what *this* phone had
recorded, so a unit someone else covered still read as overdue. Now it is fleet-wide.

The pull is one request, records only — no photos — and it refreshes itself after each
upload. The result is kept on the phone, so it still shows with no signal; a refresh in
the pit says *"Offline — showing what was last pulled"* rather than failing.

### Both destinations at once

Google Drive and SharePoint each have their own block and their own tick box, so you can
run both — Drive for speed, SharePoint as the system of record. With both on, an
inspection is only marked uploaded once **every** enabled destination has accepted every
one of its files; if one fails, the record stays pending and retries. Each destination
keeps its own folder prefix.

**A slow destination no longer holds up a fast one.** Each destination is tracked
separately, so a record that Drive has already accepted is never re-sent there, and the
queue keeps working through every record even while SharePoint is failing. The counter
stays up until *both* have it — that is the queue being honest, not a stall.

> If SharePoint is not your system of record, untick it. Drive alone carries everything,
> and the dashboard reads Drive directly, so nothing needs the SharePoint folder synced
> to a PC any more.

### Setting up the other phones — don't type the URL again

A flow URL is ~250 characters and one wrong character gives a confusing failure. Instead:

1. On the configured phone: **⚙ → Show setup code**
2. On the next phone: **⚙ → Scan setup**, point it at the square

That phone is now pointed at the same destinations, with the same folder prefix and photo
size. **Copy setup link** does the same over Teams/WhatsApp — opening the link configures
the phone and then strips it from the address bar.

> ⚠️ The code and the link **contain your upload credentials**. Internal channels only,
> and re-provision if a phone leaves the company (see Security notes).

---

## Make the uploads smaller

This is the biggest lever on upload time, and it works on **both** routes.

| Setting | What a typical camera photo becomes |
|---|---|
| **Original** | 3–5 MB — every pixel the camera captured |
| **Large — 2000 px** | a few hundred KB |
| **Medium — 1600 px** | smallest and fastest |

A magnetic-plug photo at 1600 px still resolves fuzz vs. chips vs. flakes clearly, so
**Medium** is a reasonable default for routine rounds. Use **Original** when a photo is
going into a warranty claim or a failure investigation, where full detail is evidence.

The signature image and the JSON sidecar are never resized.

---

## Getting the inspections into the dashboard

The dashboard reads **records** (the `.json` sidecars) and **photos** together — they are
uploaded side by side, so any route that reaches the folder brings both.

### If IT will not let you install Google Drive for desktop — read it over HTTPS

The dashboard can read everything from the same `/exec` URL the phones upload to. Nothing
to install, no synced folder, no drive letter.

1. Open the dashboard → **Data sources** in the header (or click the status chip)
2. In the **Google Drive** card, paste the `/exec` URL and the shared secret (leave the
   secret empty if `SECRET` is `''`)
3. **Test connection** confirms the deployment answers and names the folder;
   **Load from Drive** reads every inspection and loads the records

### One request, not one per inspection

`?action=records` reads all the sidecars **inside Apps Script**, where Drive is local,
and returns them together. The dashboard remembers what it already has and sends the
last reply's cursor back, so a refresh only carries genuinely new inspections.

| | Before | Now |
|---|---|---|
| First load, 300 inspections | 301 requests | **1** |
| Refresh, nothing new | 301 requests | **1**, and no files read |
| Reopening the dashboard | 301 requests | **0** — it is cached |

That matters because a consumer Google account allows ~90 minutes of script runtime a
day. The old path spent roughly 5 of those minutes on every single load.

**Reload everything** re-reads the folder from scratch. Use it after deleting files in
Drive — an incremental refresh asks "what is new?", so it cannot notice a deletion.

> If **Test connection** says the deployment is *on the old one-file-at-a-time reader*,
> the script needs redeploying — see step 4 and the gotcha below. Everything still works
> meanwhile; the dashboard falls back to the old path automatically.

Photos are **not** downloaded up front — a month of rounds is hundreds of megabytes. Only
the file names are indexed; the bytes are fetched when you open a unit in **Equipment
history** or generate a PDF with photos included. The settings are remembered, so it is
one click next time.

This needs the read actions in the script, so if your `google-upload.gs` predates them:
re-paste the file, then **Deploy → Manage deployments → ✏️ → Version: New version**.
`?action=file` refuses anything that is not inside your configured folder, even with a
valid file id.

### If you can install it

**Google Drive for desktop** mounts the folder as a normal drive (usually `G:`), so
**Data sources → Folder on this PC** works exactly as it does with the N: drive — point it
at *Condition Monitoring* once and it keeps finding new monthly sub-folders.

### Or keep SharePoint on as a second destination

With both destinations ticked in the app, the same files land in SharePoint too, and the
laptop reads the OneDrive-synced folder with **Folder on this PC** as before.

---

## Troubleshooting

### `{"ok":false,"error":"…getFolderById on object DriveApp…"}`

Google's catch-all for "the Drive service would not answer". In order of likelihood:

1. **The script was never authorised.** Editor → function dropdown → **`setup`** → **Run**
   → **Allow**. Then **Deploy → Manage deployments → ✏️ → Version: New version**.
2. **The edit was never deployed.** Changing `ROOT_FOLDER_ID` in the editor does *not*
   change what the `/exec` URL serves — you must deploy a new version.
3. **The id is wrong** — a file id rather than a folder id, or a folder in someone else's
   Drive / a Shared Drive you only have view access to.

Reload the `/exec` URL after each attempt. The health check now names the cause itself
instead of passing Google's message through.

### `{"ok":false,"error":"ROOT_FOLDER_ID is still the placeholder…"}`

You edited the script but the old version is still deployed — point 2 above.

### The phone says "Unexpected reply — check the deployment is set to Anyone."

"Who has access" is *Anyone with a Google account*, so Google returned a sign-in page
instead of JSON. **Manage deployments → ✏️ → Who has access: `Anyone`.**

---

## Gotchas

1. **Re-deploy a NEW VERSION after every script edit.** Editing the code does not change
   what the `/exec` URL serves. Use **Deploy → Manage deployments → ✏️ → Version: New
   version → Deploy**. This keeps the same URL. (Deploy → *New deployment* mints a
   different URL, which you would then have to paste into the app again.)
2. **"Who has access" must be `Anyone`.** With "Anyone with a Google account" the phone
   gets an HTML sign-in page instead of a reply, and the app reports an unexpected reply.
3. **Don't put the secret in the app's URL.** It goes in the **Shared secret** field —
   the app sends it inside the request body.
4. **The unverified-app warning is normal** for a script you wrote yourself. It appears
   once, during authorisation.
5. **Quotas.** A consumer Google account allows ~90 minutes of script runtime a day; a
   Workspace account ~6 hours. An upload takes a second or two, so a few hundred photos
   a day is comfortable — a full-fleet backfill of thousands at once is not.
6. **Re-uploads overwrite.** Editing a saved inspection and re-syncing replaces the file
   in Drive rather than creating `TK146_… (1).jpg`.
7. **An incremental refresh cannot see a deletion.** It asks "what changed since?", so a
   file removed from Drive stays in the dashboard until **Reload everything**.

---

## How it behaves

Identical to the SharePoint route:

* After each **Save**, the app uploads that inspection's photos, any video, the
  supervisor's signature and the `<UNIT>_<DATE>_<TYPE>.json` sidecar.
* The status strip shows `All synced` / `N inspection(s) waiting to upload` /
  `Uploading…` / `Upload failed: …` with a **Sync now** button.
* **Nothing is lost if upload fails** — the record stays on the phone marked pending and
  retries when the app is next open and online.
* iPhones cannot upload in the background: sync runs while the app is **open** and
  online, in practice when the inspector opens it back in coverage.

---

## Security notes

* The `/exec` URL is a bearer credential — anyone with it can write into that folder.
  Don't paste it into chats or screenshots. To rotate it: **Manage deployments** →
  **Archive** the deployment and create a new one.
* Setting `SECRET` means a leaked URL alone is not enough to write files.
* The script only ever writes into `ROOT_FOLDER_ID`. It cannot read the rest of your
  Drive — but note it runs as **you**, so keep the project in an account you control.
* For production, ask IT to move the script to a shared/service account and share the
  Drive folder with the team rather than the script.
