# Moving the backend to Yandex

Google needs a VPN on every inspector's phone at Baimskaya. A VPN in the pit is
a second thing to fail, in the cold, and it fails **silently** — the phone says
"online", the endpoint is unreachable, and the round sits in the queue. This
moves the endpoint onto the network the site already has.

**It is a URL change, not a rewrite.** Neither client is wired to Google: the
phone builds `url + "?action=..."`, the dashboard does the same, and the
destination called `gas` is really "the one that speaks this JSON". Point that
URL at the function in this folder and nothing else changes — no new build for
the phones, no code in the dashboard, and every existing test still applies.

---

## Never done this before?

**[SETUP.md](SETUP.md)** is the click-by-click version — bucket, service
account, key, function, and the one URL that comes out the other end. About
thirty minutes. The summary below is for someone who already knows the console.

**[CLI-SETUP.md](CLI-SETUP.md)** is the same thing without the console, for when
the console will not let you in. `bash docs/yandex/setup.sh <bucket>` does all
five steps and prints the URL.

**[VM-SETUP.md](VM-SETUP.md)** is for the **Kazakhstan region**, which has no
Cloud Functions — the bucket half is identical and the function runs on a small
machine instead. You need a domain name for that one; the reason is HTTPS, and
it is explained there.

## What it measured, on the site's own network

`mobile/compare.html` put both endpoints through the same five probes,
alternating, median of three rounds:

| | Apps Script | Yandex | |
|---|---|---|---|
| Reachable | 2.2 s | 1.1 s | 2× |
| Read the record list | **72.0 s** | **315 ms** | **229×** |
| Write probe | 1.5 s | 321 ms | 4.7× |
| Upload one 299 KB photograph | 7.4 s | 1.3 s | 5.8× |

A round is up to eight photographs, so on upload alone that is about **49
seconds a round**.

**The 72-second read is the interesting number**, because it is not a
preference — it is a bug with a name. `PHOTO_DEADLINE` in the app is 40
seconds: a report gives up fetching photographs after that and prints what it
has. A record list that takes 72 seconds to arrive has already spent the whole
budget before the first image is asked for, which is exactly the report that
came back after 60 seconds with no drawing and no photographs. Not a rendering
fault. The read never finished.

---

## What you set up, once

**1. A bucket** — Object Storage → Create bucket.
Private. Nothing about the app needs it public, and public is the one setting
that would put every photograph of every machine on the open internet.

**2. A service account** — IAM → Service accounts → Create.
Give it `storage.editor` **on that bucket only**, not on the folder.

**3. A static access key for it** — the account's page → Create new key →
Static access key. You get an ID and a secret. **The secret is shown once.**

**4. The function** — Cloud Functions → Create → Node 18 or later.
Paste `function.js` as the only file, entry point `index.handler`, and set:

| Variable | Value |
|---|---|
| `BUCKET` | your bucket name |
| `KEY_ID` | the static key ID |
| `KEY_SECRET` | the static key secret |
| `SECRET` | a password of your choosing, or leave empty |
| `ADMIN_SECRET` | **leave empty** unless you want deletion enabled |
| `S3_REGION` | `ru-central1`, or `kz1` if the account is Kazakh |
| `S3_ENDPOINT` | unset, or `storage.yandexcloud.kz` if the account is Kazakh |

Attach the service account. Set the trigger to **HTTPS, public**. Timeout 60 s,
memory 256 MB.

**5. Take the URL** it gives you. That is the whole configuration.

---

## Pointing the app at it

**One phone**, to prove it: ⚙ → the Google Drive URL field → paste → Save.
Capture a round, watch it upload, check the bucket.

**The rest of the phones**: ⚙ → **Show setup code**, and scan it from each one.
The URL travels phone to phone and never touches the published site — which
matters, because an upload URL is a write credential and `upload-defaults.js` is
served to anyone who opens the app.

**The dashboard**: Data sources → paste the same URL.

---

## Two things that are not optional

**Never point the app at the bucket directly.** Object Storage is
S3-compatible, so it is tempting. An S3 key in a web app grants read *and
delete* on everything in the bucket, to anyone who opens the page and looks at
the source. The function exists so the phone never holds more than a URL.

**`ADMIN_SECRET` stays out of the app.** It is the password that permits
deletion. It belongs in the function's environment and nowhere else — not in
`upload-defaults.js`, not in a QR code, not in a chat message. Left empty,
deletion is switched off and the dashboard says so plainly instead of failing at
the moment somebody presses the button.

---

## Moving what is already in Drive

The naming standard is the same on both sides, so it is a copy, not a
conversion:

```
<TYPE>/<UNIT>/<YYYY-MM-DD>/<UNIT>_<DD.MM.YYYY>_<TYPE>.json
<TYPE>/<UNIT>/<YYYY-MM-DD>/<UNIT>_<ITEM>_<DD.MM.YYYY>_<TYPE>.jpg
_meta/<UNIT>_<DD.MM.YYYY>_<TYPE>.edit.json
```

Download the Drive folder, upload the tree to the bucket with the same paths.
Corrections live under `_meta/` on both.

Run both for a month. The dashboard reads whichever URL it is given, so
switching back is also a URL.

---

## What is not implemented yet, on purpose

`?action=index` — the fast incremental read. **Both clients already handle an
endpoint without it**: they fall back to `records`, and to `list`+`file`, because
deployments in the field are never all on the same version. That fallback is a
tested path (`tests/drv.cjs`, "old deployment"), so the function can ship
without it and gain it later.

What you lose meanwhile: a dashboard refresh reads the sidecars rather than one
small index object. On this fleet that is seconds, not minutes — and Yandex
Functions has no daily execution quota, which is the ceiling the Apps Script was
already being worked around with batching and an index in the first place.

---

## Proving it before you trust it

```
node tests/yandex.cjs
```

Starts both backends and asks them the same questions, comparing the **shape**
of every reply — field names, not values. Then it drives the real app against
the Yandex one: capture, upload, read back, correct, delete.

The point is the comparison. Where a field is missing the clients do not error,
they show nothing, and a sheet with no photographs on it looks exactly like a
round where nobody took any. `tests/ya-srv.cjs` runs `function.js` itself
against an in-memory bucket, so what the suite proves is the code that deploys.
