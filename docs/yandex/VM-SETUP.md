# Kazakhstan: the same endpoint, on a small machine

**kz1 has no Cloud Functions.** Search the console's service list for
`serverless` and the only thing that comes back is Message Queue. Object Storage
is there, so the bucket half of [SETUP.md](SETUP.md) is unchanged — steps 1 to 4
still apply exactly as written. What is missing is the thing that answers HTTP.

This replaces step 5 with a small virtual machine running the same
`function.js`, and it changes nothing else: same bucket, same service account,
same key, same URL field in the app.

---

## What you are building

```
phone  ──HTTPS──>  Caddy (port 443)  ──>  node server.js (127.0.0.1:8080)
                     gets the certificate         runs function.js
                                                        │
                                                        ▼
                                             storage.yandexcloud.kz
```

`server.js` is thin on purpose. It turns a request into exactly the event object
a Yandex function would have received, hands it to the same handler, and writes
back exactly what comes out — so there is one implementation, and a fix made for
either region is a fix in both.

---

## First, the thing that decides everything: a domain name

**You need one.** This is not decoration.

The app is served over HTTPS from GitHub Pages, and a browser flatly refuses to
let an HTTPS page call a plain `http://` address. It does not warn the
inspector; it blocks the request, and the round sits in the queue looking like
no signal. A Cloud Function comes with HTTPS. A bare virtual machine has an IP
address and no certificate — and certificates are not issued to bare IPs.

So: any domain or subdomain you control. If you already own one for the mine, a
subdomain like `cm.example.kz` is free and takes two minutes.

### If you do not own one

**Ask whoever runs the company's IT for a subdomain. Try this first.**

The mine already owns a domain — it is in everybody's e-mail address. A
subdomain of it, `cm.thecompany.kz`, costs nothing, takes one e-mail, and is the
only option on this page that belongs to the ORGANISATION rather than to a
person. That matters more than it sounds: a system 1,128 units depend on should
not reach the field through a name registered to one engineer's personal card,
renewable from one engineer's personal inbox. Ask for an A record pointing at
the VM's IP address — that is the whole request, and any IT department will
recognise it.

**Otherwise, buy one.** Not a `.kz` — that zone wants a Kazakh administrative
contact and some registrars charge for a local-presence service to satisfy it,
which is expense and paperwork for nothing. A plain `.com` or `.org` has no residency rules at
all, costs ten to fifteen dollars a year, and takes about five minutes with a
card. Cloudflare Registrar, Porkbun and Namecheap all work fine from
Kazakhstan.

Take `.com` over the one-dollar novelty endings. Those are cheap for the first
year and dear afterwards — `.xyz` and `.site` renew at several times what they
advertise — and the failure they set up is a renewal notice missed in a personal
inbox, after which the endpoint stops resolving and every phone in the pit
reports no signal. Fifteen dollars a year, flat and forever, is the cheaper
number.

Buying it has a second payoff worth having. Your region includes **Cloud DNS**,
so the zone can live in the same Yandex Kazakhstan that the pit already reaches
— endpoint, storage and name resolution all inside one network you have
tested, with no third party in the path.

**Or start today at no cost: [DuckDNS](https://www.duckdns.org).** Sign in,
pick a name, and you have `something.duckdns.org` pointing at any IP you give
it. Free, and everything below works unchanged — a plain Caddy gets a
certificate for it the same way, because Let's Encrypt only needs the name to
resolve to the machine and port 80 to be open.

The trade is honest: DuckDNS is a free service run by volunteers, and it sits in
the path between an inspector's phone and the mine's data. If it is down or
gone, the endpoint is unreachable until you move — which you can, because
switching costs one line in the Caddyfile and re-scanning the setup code on the
phones. Fine for proving the whole thing works this week. Buy the domain before
1,128 units depend on it.

Pick the name now — everything below uses it. This guide writes it as
**`cm.example.kz`**; substitute yours everywhere, DuckDNS name included.

---

## 1–4. The bucket, the account and the key

Exactly [SETUP.md steps 1 to 4](SETUP.md). Nothing changes. Come back here with:

- the bucket name
- the **Key ID**
- the **Secret key**

---

## 5. The machine

**Compute Cloud → Create resource → Virtual machine instance**

| Setting | Value | Why |
|---|---|---|
| Image | **Ubuntu 24.04 LTS** | Anything current is fine; the commands below are Ubuntu's |
| Availability zone | `kz1-a` | The only one there is |
| Tab | **Shared-core**, not Custom | Custom starts at a 20% guaranteed share and prices accordingly. This machine is idle between rounds and busy for seconds at a time, which is exactly what shared-core is for |
| vCPU | 2, **guaranteed share 5% or 20%** | It bursts above the guarantee when a round arrives |
| RAM | 1 GB | |
| Preemptible | **unchecked** | A preemptible VM is stopped after 24 hours. Cheaper, and useless as an endpoint |
| Disk | 10 GB — **network HDD** if offered | Cheaper than SSD and fast enough: the photographs are in the bucket, this disk holds four files |
| Public IP | **Auto** | Then make it static straight after — see below |
| Service account | `cm-function` | So the machine can use the bucket. It still needs the static key below, but this keeps the machine inside your own IAM |
| Login | **`cmadmin`** | The console rejects anything under three characters, so `cm` will not do |
| SSH key | paste your **public** key | See the note after this table |
| Backup | **off** | See below — it blocks creation and you do not want it |

**Create.** Note the **public IP** it gives you.

**Then pin that address.** *Virtual Private Cloud → IP addresses →* the new
address *→ Make static.* An automatic address is released when the VM is
stopped and started, and the next boot comes back on a different one — at which
point the name points at nothing and every phone in the pit reports no signal,
with nothing in any log to say why. It costs a little to reserve. Pay it.

**On cost:** watch the estimate panel on the right of the create form; it is
live and it is the only number that matters. Expect something in the region of
a few thousand tenge a month — meaningfully more than a Cloud Function would
have cost, and the price of kz1 having no serverless. If the figure looks high,
the three levers are the shared-core tab, network HDD instead of SSD, and not
reserving more RAM than 1 GB.

> **No SSH key?** On your own computer — PowerShell on Windows, Terminal on Mac
> or Linux:
>
> ```
> ssh-keygen -t ed25519
> ```
>
> Press Enter at every prompt. Then print the public half and copy it:
>
> ```
> cat ~/.ssh/id_ed25519.pub                       # Mac / Linux
> type $env:USERPROFILE\.ssh\id_ed25519.pub       # Windows PowerShell
> ```
>
> One line beginning `ssh-ed25519`. Paste that into **Add key**.
>
> The file WITHOUT `.pub` is the private half. It never leaves your computer and
> is never pasted anywhere — same rule as the bucket's secret key. Yandex warns
> that losing it means losing access to the VM, and that is true: back it up
> somewhere you will still have in a year.

> **Turn Backup OFF.** It defaults on, wants a service activated in the folder,
> and shows a red error until you do — so it will stop you creating the machine.
> You do not want it either. Nothing on this VM is worth restoring: the
> photographs and the records are in the bucket, and the machine itself is four
> files and ten minutes of this guide. Backing it up would cost money to protect
> something rebuildable.

---

## 6. Point the domain at it

**A domain you bought** — wherever it is registered, add an **A record**:

| Type | Name | Value |
|---|---|---|
| A | `cm` | the public IP from step 5 |

**DuckDNS** — open your [duckdns.org](https://www.duckdns.org) page, put the
public IP from step 5 in the box next to your name, and press **update ip**.
That is the whole of it.

> DuckDNS is built for addresses that change. Yours does not — take a **static**
> public IP in step 5 and you never touch this again. On an ephemeral IP the
> address changes when the VM is stopped and started, and the endpoint quietly
> stops answering until somebody updates that box.

Give it a few minutes. Check it took, from your own machine:

```
ping cm.example.kz
```

You want to see the IP from step 5. Caddy cannot get a certificate until this
resolves, so do not go further until it does.

---

## 7. Open the door

The VM's default security group blocks almost everything. In the console:
**Virtual Private Cloud → Security groups → the one on your VM → Edit**, and add
two **incoming** rules:

| Port | Protocol | Source | For |
|---|---|---|---|
| 22 | TCP | `0.0.0.0/0` | **you**, to log in at all |
| 443 | TCP | `0.0.0.0/0` | the phones |
| 80 | TCP | `0.0.0.0/0` | Let's Encrypt's check |

Port 22 is on that list because a security group with no ingress rules blocks
SSH too, and the symptom — a connection that hangs rather than refuses — reads
exactly like a machine that failed to boot. Add it first, before concluding
anything about the VM.

Port 80 is not for the app: Caddy uses it to prove it owns the name, at first
request and at every renewal. Shut it afterwards and the certificate expires
silently about two months later.

Leave outgoing traffic allowed, or the machine cannot reach the bucket.

> Tighter, if you want it: the phones' rule could be limited to the mine's
> public ranges instead of `0.0.0.0/0`. Only do that once you know those ranges
> and know they are stable — an endpoint that works in the office and not in the
> pit is a worse problem than an open port on a machine whose only job is to
> answer this one URL.

---

## 8. Install it

SSH in:

```
ssh cmadmin@cm.example.kz
```

Then, one block at a time.

**Node and Caddy:**

```
sudo apt update
sudo apt install -y nodejs caddy curl
node --version          # 18 or higher
```

> If `caddy` is not found, Ubuntu's version is behind — follow the two-line
> install at [caddyserver.com/docs/install](https://caddyserver.com/docs/install)
> and come back.

**The endpoint itself:**

```
sudo mkdir -p /opt/cm && cd /opt/cm
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/function.js
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/server.js
ls -l                   # both files, non-zero
```

**The settings.** This asks for the three values and writes them itself:

```
sudo bash -c 'read -rp "Bucket: " B; read -rp "Key ID: " K; read -rsp "Secret key: " S; echo; printf "BUCKET=%s\nKEY_ID=%s\nKEY_SECRET=%s\nS3_REGION=kz1\nS3_ENDPOINT=storage.yandexcloud.kz\nSECRET=\nADMIN_SECRET=\nPORT=8080\nHOST=127.0.0.1\n" "$B" "$K" "$S" > /opt/cm/cm.env; chmod 600 /opt/cm/cm.env; echo written'
```

Prompted, not pasted, and deliberately so. This step used to be a template with
`PUT_THE_SECRET_HERE` in it, to be filled in and pasted — which means the secret
exists as text in a clipboard, a Notepad window and a terminal scrollback, and
from there it reaches a chat window or a screenshot. That is not a hypothetical:
it is the single most likely way this deployment leaks, and it has already
happened on this project more than once.

`read -rsp` does not echo what you type, so the secret never appears on screen
and there is nothing to copy. Typing it by hand is a small price.

Two things it also fixes for free: `chmod 600` is applied in the same breath
rather than a step later, and `printf` cannot pick up the stray space that
`KEY_SECRET= abc` introduces — a leading space in the secret produces a
signature that fails as **403**, indistinguishable from a wrong key.

**If a secret is ever exposed** — pasted into a chat, caught in a screenshot,
committed — treat it as spent. *IAM → Service accounts → `cm-function` → the
key → Delete*, create a new one, and run the line above again. It costs a
minute, and the alternative is a credential that grants read and delete on every
photograph of every machine to whoever saw it.

`S3_REGION=kz1` and `S3_ENDPOINT=storage.yandexcloud.kz` are the Kazakh ones.
**Confirmed against the live endpoint**, which is worth saying because Yandex
documents neither: their S3 pages give `ru-central1` and warn that another value
"may lead to an authorization error", and say nothing at all about the Kazakh
host. `kz1` is right — verified by a request that came back `ok:true`, not by
inference.
Left at the Russian defaults the function signs for the wrong region against the
wrong host and Yandex answers **403** — which looks exactly like a bad key, and
sends you back to regenerate one that was fine.

`ADMIN_SECRET` stays empty: that switches deletion off, and the dashboard says
so plainly rather than failing when somebody presses the button.

**Keep it running:**

```
sudo tee /etc/systemd/system/cm.service >/dev/null <<'UNIT'
[Unit]
Description=Condition Monitoring endpoint
After=network-online.target

[Service]
EnvironmentFile=/opt/cm/cm.env
ExecStart=/usr/bin/node /opt/cm/server.js
Restart=always
RestartSec=3
User=nobody
# Nothing here needs to write to the disk or see the rest of the machine.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now cm
sudo systemctl status cm --no-pager
```

`Restart=always` is the point of this file: the machine reboots, the process
crashes, somebody deploys — it comes back without anyone noticing.

**Check it before putting HTTPS in front of it:**

```
curl -s localhost:8080 | head -c 300
```

You want `{"ok":true,...,"backend":"yandex"}`. If not, the reason is in
`sudo journalctl -u cm -n 50`.

**HTTPS.** Replace the domain with yours:

```
sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDY'
cm.example.kz {
	reverse_proxy 127.0.0.1:8080
}
CADDY
sudo systemctl restart caddy
```

That is genuinely the whole TLS configuration — Caddy gets the certificate from
Let's Encrypt on first request and renews it for ever after.

---

## 9. Check it from outside

From your own computer, not the VM:

```
curl -s https://cm.example.kz | head -c 300
```

```json
{"ok":true,"folder":"baimskaya-cm","files":0,"sidecars":0,"photos":0,
 "secret":false,"canDelete":false,"backend":"yandex"}
```

**`"ok":true` over `https://` means everything is wired.** That URL is the whole
configuration.

| It says | What it means |
|---|---|
| connection refused / times out | Security group — step 7 |
| a certificate warning | DNS is not pointing at the VM yet, or port 80 is shut |
| `SignatureDoesNotMatch` | The key id and the secret are from **different keys** — the likeliest cause by far. Create a new key and read BOTH values off the one screen that shows them together. If a fresh matched pair still fails, run `checkkey.js` (below), which asks the endpoint which region it wants instead of guessing |
| `InvalidAccessKeyId` | That key id does not exist — deleted, or mistyped |
| `S3 403` otherwise | The service account has no role on the bucket |
| `S3 404` | `BUCKET` is misspelled |
| nothing at all | `sudo systemctl status cm` and **`sudo journalctl -u cm -n 50`** — the `sudo` matters: without it journalctl prints "No entries" and hides the very error you are looking for |
| `Failed to load environment files` | `cm.env` was never written. `ls -l /opt/cm` — if it is not there, run the settings command again, in the terminal |

---

## 10. Point one phone at it

[SETUP.md step 8](SETUP.md#8-point-one-phone-at-it) — unchanged. One phone
first, keep the old URL written down, capture a short round, look in the bucket
for `MP/TK149/…`. Then the dashboard, then the rest of the phones by
⚙ → **Show setup code**.

---

## 11. Move what is already in Drive

The Drive folder and the bucket are the SAME level. `Condition Monitoring/` in
Drive holds `MP/TK149/2026-08-24/…`; the bucket holds exactly that, at its root.
The bucket replaces the folder — do not make a folder called "Condition
Monitoring" inside it, or everything sits one level too deep and the app finds
nothing at all.

Both endpoints speak the same JSON, so this needs no Drive credentials, no S3
keys, and no downloading a season's photographs to a laptop. On the VM:

```
cd /opt/cm
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/migrate.js
node migrate.js --from "<the old /exec URL>" --to "https://<your endpoint>" --dry
```

`--dry` lists what would move and writes nothing. Then run it again without it.

**Safe to run twice.** It matches on full path, skips whatever the destination
already holds, and retries a bad minute rather than dying on it — so a run that
stops is resumed by repeating the command, not restarted from nothing at 90%.

**Run it once more at the very end.** While the changeover is under way some
phones are still uploading to the old backend only; their rounds land there and
are invisible to everything reading the new one. The last run has to come after
the last phone has moved across.

---

## 12. When the server code changes

The phone and the dashboard update themselves — they are pages on GitHub, and a
push puts the new version in front of everybody. **The server does not.**
`function.js` and `server.js` were copied onto this machine once, in step 6, and
they stay exactly as they were until somebody copies them again. So a fix that
touches the backend is not live when it is pushed; it is live when you run this.

Three lines, in the same PowerShell window you use for everything else:

```
ssh cmadmin@baimskaya-cm.duckdns.org
```

then

```
cd /opt/cm
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/function.js
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/server.js
sudo systemctl restart cm
sudo systemctl status cm --no-pager
```

The last line should say **active (running)**. If it says `failed`, the new file
did not start — put the old one back with `sudo systemctl stop cm`, tell whoever
made the change, and read the reason with `sudo journalctl -u cm -n 50`.

Nothing in the bucket is touched by this, and `cm.env` — the file with the keys
and the admin password in it — is not one of the files being replaced. Restarting
takes about a second, during which a phone that happens to be syncing retries.

---

## What this costs you that a function did not

**Money:** a few dollars a month instead of near-zero. Small.

**Attention:** this is a machine, and machines need patching. Once a month:

```
ssh cmadmin@cm.example.kz 'sudo apt update && sudo apt upgrade -y && sudo systemctl restart cm'
```

Or switch on unattended upgrades and forget it:

```
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

**One machine, one point of failure.** A function is redundant across a region;
this is one VM in one availability zone. For a fleet where a round waits in the
phone's queue until the endpoint answers, that is an acceptable trade — nothing
is lost when it is down, only delayed. It is worth knowing rather than
discovering.

---

## Proving it, the same way

```
node tests/yandex.cjs
```

`tests/ya-srv.cjs` puts every request through `server.js`'s own request path —
not a copy of it — so the suite that holds this backend to the Apps Script's
contract is testing the wrapper that deploys. It also checks the two things the
platform used to do for you and now nobody does: an oversized body is refused
rather than held in memory, and refused with a CORS header the page can read.
