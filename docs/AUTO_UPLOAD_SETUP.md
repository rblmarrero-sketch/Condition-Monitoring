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

### Recommended: a folder per month (no extra flow step)

SharePoint's *Create file* **creates missing folders when the path is part of the
File Name**, so you don't need a "create folder if it doesn't exist" action.

Keep **Folder Path** as it is and change **File Name** to this expression (ƒx tab):

```
if(empty(triggerBody()?['folder']), triggerBody()?['name'], concat(triggerBody()?['folder'], '/', triggerBody()?['name']))
```

Then in the app set **Folder / prefix** to `{YYYY-MM}` — the app substitutes the
current year-month at upload time, so files land in
`Inspections/2026-07/…`, `Inspections/2026-08/…` and so on with no maintenance.

Supported placeholders: `{YYYY}` `{MM}` `{DD}` `{YYYY-MM}`.
Leave the field empty to keep everything in one folder.

> The dashboard's **📂 Photo folder** picker searches sub-folders, so point it at
> the top **Condition Monitoring** folder once and it will keep finding new
> monthly folders automatically.

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

---

## Gotchas we hit in practice (read this first)

1. **The flow must be turned ON.** If Power Automate shows *“saved but can’t be
   used”*, it saves the flow **disabled**, and every upload returns
   `HTTP 400 — trigger 'manual' with state 'Disabled'`. Fix the validation error
   (usually an empty field on **Create file**), **Save** until the banner turns
   green — *“Your flow is ready to go”* — then check **My flows → Status = On**.
2. **“Who can trigger the flow?” must be `Anyone`.** The default *“Any user in my
   tenant”* expects an Entra ID token the app cannot supply → 401.
3. **Leave the app’s “Secret header” empty** for Power Automate — the flow URL
   already carries its `&sig=` signature. (A custom header also forces a CORS
   preflight.)
4. **File Content must be the ƒx expression**, not the `file` dynamic-content
   token, or files arrive corrupted/0 KB.
5. **Create the SharePoint folders first** — *Create file* will not create a
   missing folder path.
6. In the **new designer** the HTTP URL only appears on the trigger card *after*
   the first successful save.

### New designer — where things are
| Task | Where |
|---|---|
| Paste the JSON schema | click the **manual** card → *Request Body JSON Schema* → **Use sample payload to generate schema** |
| Add SharePoint step | **⊕** under the trigger → search *Create file* |
| Enter an expression | click the field → **ƒx / Function** tab → paste → **Add** |
| Add the reply | **⊕** → search *Response* → pick it under the **Request** group |
| Copy the URL | click **manual** after saving → **HTTP URL** with the 📋 icon |

### Reading errors
The app now shows the server’s own message, e.g.
`HTTP 400 — Could not execute workflow … trigger 'manual' with state 'Disabled'`.
For anything else, open the flow → **Run history** → the failed run highlights the
step and the exact error.

