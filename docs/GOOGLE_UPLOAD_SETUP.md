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

On the phone, open the app → **⚙** (top right):

| Field | Value |
|---|---|
| **Upload mode** | `Google Drive (Apps Script)` |
| **Upload URL** | the `/exec` URL |
| **Shared secret** | the `SECRET` value, or leave empty if you left it `''` |
| **Folder / prefix** | `{YYYY-MM}` — rolls into a new sub-folder each month |
| **Photo size on upload** | see below |

Tap **Test connection** → *"✅ Connected — test file uploaded."* and a
`connection_test.txt` appears in Drive. Then **Save**.

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

## Getting the photos onto the N: drive / into the dashboard

Install **Google Drive for desktop** on the PC that runs the dashboard. The folder
appears as a normal drive (usually `G:`), so the dashboard's **📂 Photo folder** button
works exactly as it does today — point it at *Condition Monitoring* once and it keeps
finding the new monthly sub-folders.

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
