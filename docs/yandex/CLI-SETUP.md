# When the console will not let you in

The console is one door, not the only one. Everything in [SETUP.md](SETUP.md)
can be done from a terminal with `yc`, Yandex's own command-line tool — and the
sign-in it uses is a different page from the console's, which is often the part
that is actually broken.

**First, work out which of these you have**, because only the first one is a
console problem:

| What you see | What it is | Where to go |
|---|---|---|
| The console page hangs, loops, 500s, or logs you straight back out | The console | The CLI, below — it skips the console entirely |
| "Wrong password", or the login page does not know your account | The Yandex ID itself | [id.yandex.ru](https://id.yandex.ru) → recover. The CLI will not help; it uses the same account |
| It asks for a code and the phone is wrong / gone | Two-factor | Same — account recovery, not cloud |
| "No clouds available", or it lets you in and there is nothing there | The account is fine, it just is not on the billing account | Whoever owns the billing account has to invite it |

The CLI fixes the first row. For the others, tell me what it says and I will
tell you which one it is.

---

## If your account is `@yandex.kz` — read this first

There are **two Yandex Clouds**, not one, and which one you belong to is decided
by the console you signed up in. They are separate: a bucket in one does not
exist in the other.

| | Russia | Kazakhstan |
|---|---|---|
| Console | `console.yandex.cloud` | **`kz.console.yandex.cloud`** |
| Region | `ru-central1` | **`kz1`** |
| Object Storage | `storage.yandexcloud.net` | **`storage.yandexcloud.kz`** |
| `yc` API | `api.cloud.yandex.net:443` | **`api.yandexcloud.kz:443`** |
| Billing | `center.yandex.cloud/billing` | **`kz.center.yandex.cloud/billing`** |

So the first thing to try is **the other console**. A `.kz` account that
registered on the Kazakh side and is signing in at `console.yandex.cloud` gets
in and finds nothing — or does not get in at all — and neither looks like "you
are at the wrong address".

The Yandex ID works in both. The *account* is what is regional.

If you are on the Kazakh side, everything below takes one extra setting:

```
yc config set endpoint api.yandexcloud.kz:443
yc init
REGION=kz1 bash docs/yandex/setup.sh baimskaya-cm
```

`REGION=kz1` is not cosmetic. SigV4 signs the region into every single request,
so a function built with the Russian defaults against a Kazakh key **does not
fail with "wrong region" — it 403s**, which reads as a bad key and sends you
looking in the wrong place for an afternoon. `tests/yandex.cjs` now proves both
regions come out of the environment and neither is baked in.

---

## 1. Install `yc`

**Mac or Linux**

```
curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
exec -l $SHELL
```

**Windows** — in PowerShell:

```
iex (New-Object System.Net.WebClient).DownloadString('https://storage.yandexcloud.net/yandexcloud-yc/install.ps1')
```

Check it: `yc --version`.

---

## 2. Sign in — the part that is not the console

```
yc init
```

It prints a link and waits. **That link is `oauth.yandex.ru`, not the console.**
Open it, approve, and paste the token back into the terminal. Then it asks you
to pick your cloud and folder from a list.

Three things that go wrong here:

- **The link opens a page that says the app is unavailable.** Try it in a
  private window — a half-logged-in session in the normal one is the usual
  cause.
- **You have a `yandex.com` account and the page is `yandex.ru`, or the other
  way round.** They are the same account; sign in on the domain the link gives
  you, not the one you are used to.
- **`yc init` shows no clouds.** The token worked and the account simply has no
  cloud attached — that is the last row of the table above, and no amount of CLI
  will conjure one.

If you already have a token from somewhere, you can skip `yc init`:

```
yc config set token <the token>
yc resource-manager cloud list          # find the cloud
yc config set cloud-id <cloud id>
yc resource-manager folder list         # find the folder
yc config set folder-id <folder id>
```

---

## 3. Run the setup

```
bash docs/yandex/setup.sh baimskaya-cm            # Russia
REGION=kz1 bash docs/yandex/setup.sh baimskaya-cm # Kazakhstan
```

One argument: the bucket name. Lowercase, digits and hyphens, globally unique
across all of Yandex — if it is taken, put your site's initials on the front.

It does the same five things the console does, in the same order: a private
bucket, a service account with `storage.editor`, a static key, the function on
`nodejs18` with the environment set, and the public trigger. Then it calls the
function once and prints what came back.

You are looking for this:

```json
{"ok":true,"folder":"baimskaya-cm","files":0,...,"backend":"yandex"}
```

**`"ok":true` means it reached the bucket.** The last thing it prints is the
invoke URL, and that URL is the whole configuration.

The static key's secret goes straight from Yandex into the function's
environment. The script does not print it, does not write it to a file, and does
not keep it — it is read *and delete* on the bucket, and the fewer places it
exists the better. `ADMIN_SECRET` is left empty on purpose, which switches
deletion off; if you ever want it, it goes in the function's environment and
nowhere else — never in the app.

If it is not healthy, the logs say why:

```
yc serverless function logs cm-endpoint
```

| It says | What it means |
|---|---|
| `S3 403` | The role did not attach. Re-run — the script is safe to run twice |
| `S3 404` | The bucket name in the environment is not the bucket that exists |
| nothing at all | The version did not deploy. `yc serverless function version list --function-name cm-endpoint` |

---

## 4. Then it is the same as before

[SETUP.md step 8](SETUP.md#8-point-one-phone-at-it) — one phone, keep the old
URL written down, capture a short round, look in the bucket. The rest of the
phones take it by ⚙ → **Show setup code**.

---

## If the account itself is the problem

Then Yandex is not the answer today, and it is worth saying plainly: the app
does not care who hosts the endpoint. It builds `url + "?action=..."` and reads
JSON back, and `tests/yandex.cjs` exists precisely to hold any second backend to
the same contract. Anything that answers that contract on a network the pit can
reach will do — another Russian provider, or a small server of your own.

Tell me what the login actually says and I will point at the shortest way
through rather than guessing.
