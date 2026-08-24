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
| Platform | the cheapest offered | |
| vCPU | 2, **guaranteed share 5%** | Bursts to full when a round arrives, costs almost nothing while idle |
| RAM | 1 GB | |
| Disk | 10 GB SSD | The bucket holds the photographs, not this |
| Public IP | **yes** — take an ephemeral one, or a static one if you prefer | The phones have to reach it |
| Service account | `cm-function` | So the machine can use the bucket. It still needs the static key below, but this keeps the machine inside your own IAM |
| Login | **`cmadmin`** | The console rejects anything under three characters, so `cm` will not do |
| SSH key | paste your **public** key | See the note after this table |
| Backup | **off** | See below — it blocks creation and you do not want it |

**Create.** Note the **public IP** it gives you.

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
| 443 | TCP | `0.0.0.0/0` | the phones |
| 80 | TCP | `0.0.0.0/0` | Let's Encrypt's check, once |

Port 80 is not for the app — Caddy only needs it to prove it owns the domain.
Leave outgoing traffic allowed, or the machine cannot reach the bucket.

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

**The settings.** This file holds the bucket's key, so it is readable only by
root:

```
sudo tee /opt/cm/cm.env >/dev/null <<'ENV'
BUCKET=baimskaya-cm
KEY_ID=PUT_THE_KEY_ID_HERE
KEY_SECRET=PUT_THE_SECRET_HERE
S3_REGION=kz1
S3_ENDPOINT=storage.yandexcloud.kz
SECRET=
ADMIN_SECRET=
PORT=8080
HOST=127.0.0.1
ENV
sudo chmod 600 /opt/cm/cm.env
sudo nano /opt/cm/cm.env      # put the real key values in, Ctrl+O, Enter, Ctrl+X
```

`S3_REGION=kz1` and `S3_ENDPOINT=storage.yandexcloud.kz` are the Kazakh ones.
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
| `S3 403` | The key is wrong, or `S3_REGION`/`S3_ENDPOINT` are not the Kazakh pair |
| `S3 404` | `BUCKET` is misspelled |
| nothing at all | `sudo systemctl status cm` and `sudo journalctl -u cm -n 50` |

---

## 10. Point one phone at it

[SETUP.md step 8](SETUP.md#8-point-one-phone-at-it) — unchanged. One phone
first, keep the old URL written down, capture a short round, look in the bucket
for `MP/TK149/…`. Then the dashboard, then the rest of the phones by
⚙ → **Show setup code**.

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
