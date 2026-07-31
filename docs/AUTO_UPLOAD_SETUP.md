# Auto-upload setup (Power Automate → SharePoint)

The Field Capture app can upload photos, videos and inspection data automatically
whenever the phone is **open and online**. This guide sets up the recommended route:
a Power Automate flow that drops the files into a SharePoint library (which can be
synced to the **N: drive**, so the dashboard picks them up as usual).

> **You can do this yourself — no IT ticket to try it.** The only thing that might
> block you is the *premium* HTTP trigger; if your tenant doesn't include it, start
> the 90-day Power Automate trial from the same screen. Prove it works on your own
> account first, then hand a working flow to IT to move onto a service account.

---

## 1. Create the SharePoint folder

In the SharePoint site you want to use (a Team site is fine), create a document
library folder, e.g.:

```
Documents / Condition Monitoring / Inspections
```

Optionally click **Sync** in SharePoint so the folder appears on the N: drive / File Explorer.

---

## 2. Build the flow (about 10 minutes)

1. Go to **make.powerautomate.com** → **Create** → **Instant cloud flow**
2. Name it `CM Inspection Upload`, choose trigger **“When an HTTP request is received”** → Create
3. Open the trigger, click **Use sample payload to generate schema**, and paste:

```json
{
  "name": "TK146_4C_31.07.2026_MP.jpg",
  "folder": "2026-07",
  "contentType": "image/jpeg",
  "file": "BASE64CONTENT"
}
```

4. **+ New step** → SharePoint → **Create file**
   - **Site Address:** your site
   - **Folder Path:** `/Documents/Condition Monitoring/Inspections`
   - **File Name:** `name` (from the trigger)
   - **File Content:** switch to the expression box and enter:
     ```
     base64ToBinary(triggerBody()?['file'])
     ```
5. *(Optional)* **+ New step** → **Response** → Status code `200`
6. **Save**. Re-open the trigger and copy the **HTTP POST URL** — it is long and
   contains a signature. **Treat it as a password.**

### Optional: put each month in its own folder
Set **Folder Path** to an expression instead:
```
concat('/Documents/Condition Monitoring/Inspections/', triggerBody()?['folder'])
```
and set the app's **Folder / prefix** field to e.g. `2026-07`.

---

## 3. Point the app at it

On the phone, open the app → **⚙** (top right):

| Field | Value |
|---|---|
| **Upload mode** | `Power Automate (JSON + base64)` |
| **Upload URL** | the HTTP POST URL you copied |
| **Secret header** | leave empty (the URL already carries a signature) |
| **Folder / prefix** | optional, e.g. `2026-07` |

Tap **Test connection** — you should see *“✅ Connected — test file uploaded.”* and a
`connection_test.txt` file appear in SharePoint. Then **Save**.

---

## 4. How it behaves

* After each **Save**, the app uploads that inspection's photos, any video, and a
  small `<UNIT>_<DATE>_<TYPE>.json` sidecar.
* The status strip above the PDF button shows: `All synced` / `N inspection(s) waiting
  to upload` / `Uploading…` / `Upload failed: …` with a **Sync now** button.
* **Nothing is lost if upload fails** — the record stays on the phone marked pending
  and retries when the app is next open and online (and on the `online` event).
* Editing a record marks it for re-upload.

### iOS limitation (be aware)
iPhones do not allow true background uploading from a web app. Sync runs while the
app is **open** and online — in practice when the inspector opens it back in
coverage. Android/Chrome is the same today; a native (Capacitor) build would be
needed for true background sync.

---

## Alternative modes

| Mode | Body sent | Use when |
|---|---|---|
| **Power Automate (JSON + base64)** | `{name, folder, contentType, file}` as JSON | Recommended — Power Automate / Logic Apps |
| **Plain HTTPS POST (multipart)** | `multipart/form-data` with `file`, `name`, `folder` | Your own server / API gateway |
| **Off** | — | Manual **Share / Export ZIP** only |

For a plain server the endpoint must allow **CORS** from the app's origin
(`https://<user>.github.io`), i.e. respond to `OPTIONS` and send
`Access-Control-Allow-Origin`.

**Secret header** accepts one header in `Name: value` form, e.g. `x-api-key: abc123`.

---

## Security notes

* The Power Automate URL is a bearer credential — anyone with it can write files.
  Don't paste it into chats or screenshots; rotate it (regenerate the flow URL) if leaked.
* For production, ask IT to move the flow to a **service account**, restrict the
  library's permissions, and consider adding an API-key check inside the flow
  (a Condition on a custom header, using the app's **Secret header** field).
* The app stores the URL in the phone's local storage only.
