# Setting it up, step by step

Written for someone who has not used Yandex Cloud before. About 30 minutes.

You will do four things: make a **bucket** (where files live), make a **service
account** (an identity for the function), make a **key** (so the function can
prove it is that identity), and make the **function** (the thing the app talks
to). Then paste one URL into the app.

> Yandex changes its console wording from time to time. If a button is not
> named exactly as below, look for the nearest thing that means the same — the
> **order** and the **values** are what matter, not the labels.

> **Cannot get into the console at all?** The console is one door, not the only
> one. [CLI-SETUP.md](CLI-SETUP.md) does all of this from a terminal, signing in
> through a different page — and it starts by working out whether the problem is
> the console or the account, because only one of those the CLI can get past.

---

## Before you start

Go to **console.yandex.cloud** and sign in.

**Unless your account is Kazakh** — a `@yandex.kz` address, or you registered in
Kazakhstan. Then it is **kz.console.yandex.cloud**, and it is a genuinely
separate cloud: different console, different storage host, different region
name.

> **Kazakhstan has no Cloud Functions.** Steps 1 to 4 below are still exactly
> right — the bucket, the service account and the key are all there. Step 5 is
> not: search the service list for `serverless` and only Message Queue comes
> back. Follow **[VM-SETUP.md](VM-SETUP.md)** from step 5 onward, which runs the
> same code on a small machine.

Use these values throughout:

| | Russia | Kazakhstan |
|---|---|---|
| Console | `console.yandex.cloud` | `kz.console.yandex.cloud` |
| `S3_REGION` | `ru-central1` | `kz1` |
| `S3_ENDPOINT` | leave unset | `storage.yandexcloud.kz` |

The Yandex ID is the same on both sides; the *account* is what is regional. If
the console will not let you in at all, [CLI-SETUP.md](CLI-SETUP.md) starts by
working out whether that is the console or the account.

You need a **billing account** linked, even to use the free tier. The console
says so in the top right — **"Billing account not linked"**, with a red dot —
and until you fix it every **Create** button below fails. Deal with it first.

Click that message. A Kazakh account settles in **KZT** and takes a card from a
non-Russian bank; linking one puts a small hold on it that is released, not
charged. A first billing account also comes with a starting grant, and this
fleet costs cents a month — a round is a few megabytes — so the grant will cover
the trial comfortably. If you would rather not link a card at all, there is a
minimum top-up instead (1,500 ₸).

At the top you will see a **cloud**, and inside it a **folder** (usually called
`default`). Everything below goes in that folder. Note its name; you will pick
it in a few dropdowns.

**Cost, so it is not a surprise:** for this fleet you are in cents a month.
Storage is priced per GB and functions per invocation, and an inspection round
is a few megabytes. The free tier likely covers it. Set a budget alert anyway:
**Billing → Budgets** — it takes a minute and means a mistake cannot run up a
bill quietly.

---

## 1. The bucket — where photographs live

1. Left menu → **Object Storage**
2. **Create bucket**
3. **Name**: something like `baimskaya-cm`.
   It must be globally unique across all of Yandex, lowercase, digits and
   hyphens only — **no underscores, no capitals**. If it says the name is
   taken, add your site's initials.
4. **Max size**: 50 GB is plenty to start. It is a cap, not a reservation — you
   pay for what you use.
5. **Object read access / List access / Read ACL**: leave **all three
   Restricted**.

   This is the important one. Public means every photograph of every machine is
   on the open internet to anyone who guesses the URL. The function is what
   gives the app access; the bucket itself never needs to be public.
6. **Storage class**: Standard.
7. **Create**.

---

## 2. The service account — who the function is

1. Left menu → **Identity and Access Management** → **Service accounts**
2. **Create service account**
3. **Name**: `cm-function`
4. **Add role** → `storage.editor`
5. **Create**

> `storage.editor` on the folder lets it read and write **any** bucket in that
> folder. If you would rather it could only touch this one, skip the role here
> and instead: **Object Storage → your bucket → Security (or ACL) → assign
> `storage.editor` to `cm-function`**. Both work; the second is tighter.

---

## 3. The key — how it proves that

1. Still on **Service accounts** → click **cm-function**
2. **Create new key** → **Create static access key**
3. A box appears with **Key ID** and **Secret key**

**Copy both now, into somewhere safe.** The secret is shown **once** and cannot
be recovered — if you lose it you delete the key and make another. Do not paste
it into a chat, a ticket, or a screenshot: it is read *and delete* on the
bucket.

---

## 4. The function — what the app talks to

1. Left menu → **Cloud Functions** → **Create function**
2. **Name**: `cm-endpoint` → **Create**
3. You land on the function's page. Click **Create editor** / **Editor**
4. **Runtime**: `nodejs18` or newer
5. **Method**: choose **Code editor** (paste, not upload)
6. There will be a file called `index.js`. Delete what is in it, and paste the
   whole of **`docs/yandex/function.js`** from this repository.
7. **Entrypoint**: `index.handler`

   Exactly that. It means "the file `index.js`, the thing it exports as
   `handler`". If you renamed the file, this has to match.
8. **Timeout**: `60` seconds. **Memory**: `256 MB`.
9. **Service account**: pick `cm-function`.
10. **Environment variables** — click add, six or seven times:

| Name | Value |
|---|---|
| `BUCKET` | your bucket name, e.g. `baimskaya-cm` |
| `KEY_ID` | the Key ID from step 3 |
| `KEY_SECRET` | the Secret key from step 3 |
| `SECRET` | a password you invent, or leave empty |
| `ADMIN_SECRET` | **leave empty** |
| `S3_REGION` | `ru-central1` — or `kz1` on the Kazakh side |
| `S3_ENDPOINT` | leave empty — or `storage.yandexcloud.kz` on the Kazakh side |

**About `SECRET`:** this is what the app sends as `?secret=`. Empty means anyone
with the URL can read and write. The URL is long and unguessable, and it is what
the current setup does — but if you set one, you must type the same value into
the app's ⚙ under "Secret". Start empty; you can add one later.

**About `ADMIN_SECRET`:** leave it empty. It is the password that allows
**deleting** inspections, and empty means deletion is switched off and the
dashboard says so plainly. Only set it if you decide you want that, and only
ever here — never in the app.

11. **Create version**. It takes a few seconds.

---

## 5. Make it answer the internet

On the function's **Overview** page, find **Public function** and switch it
**on**.

Without this, every call comes back "unauthorized" and the app looks broken.

---

## 6. Take the URL

On the same page, copy the **invoke URL**. It looks like:

```
https://functions.yandexcloud.net/d4e1abc23def45gh6ij7
```

**That is the whole configuration.** Everything the app needs is that one line.

---

## 7. Check it works before touching any phone

Open the URL in a browser. You should see:

```json
{"ok":true,"folder":"baimskaya-cm","files":0,"sidecars":0,"photos":0,
 "secret":false,"canDelete":false,"backend":"yandex"}
```

**`"ok":true` means it reached the bucket.** If you see this, you are done.

If you see an error instead:

| It says | What it means |
|---|---|
| `Missing required` or nothing at all | Public function is still off — step 5 |
| `S3 403` | The key is wrong, or the service account has no role on the bucket |
| `S3 404` | The `BUCKET` name is misspelled |
| `ok:false` with something else | Copy the message to me and I will read it |

The function's **Logs** tab shows what actually happened on each call. It is the
first place to look for anything above.

---

## 8. Point one phone at it

Do **one** phone first, and keep the Google URL written down so you can put it
back in ten seconds.

1. On the phone: **⚙** → the **Google Drive** URL field
2. Replace the URL with the Yandex one → **Save**
3. Capture a short round and let it upload
4. **Object Storage → your bucket** — you should see
   `MP/TK149/2026-08-24/…` with the sidecar and the photographs

Then the dashboard: **Data sources** → paste the same URL.

When you are happy, the rest of the phones take it by **⚙ → Show setup code**
and scanning from each one. The URL travels phone to phone and never touches
the published website — which matters, because that URL is a write credential
and anyone who opens the app can read the site's source.

---

## What to send me

The invoke URL, once step 7 shows `"ok":true`. I will run the full suite against
the live endpoint — the same one that proves the Google backend — before a
single inspector's phone is switched over.

If you would rather not send the URL, run this yourself and send me the output:

```
node tests/yandex.cjs
```

and tell me what step 7 printed.
