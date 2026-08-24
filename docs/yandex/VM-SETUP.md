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

So: any domain or subdomain you control. A `.kz` costs a few dollars a year.
If you already own one for the mine, a subdomain like `cm.example.kz` is free
and takes two minutes.

Pick the name now — everything below uses it. This guide writes it as
**`cm.example.kz`**.

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
| SSH | paste your public key, login `cm` | See the note after this table |

**Create.** Note the **public IP** it gives you.

> **No SSH key?** On your own computer: `ssh-keygen -t ed25519` (press Enter at
> every prompt), then paste the contents of `~/.ssh/id_ed25519.pub` — the `.pub`
> one. The file WITHOUT `.pub` is the private half and never leaves your
> machine, exactly like the bucket's secret key.

---

## 6. Point the domain at it

Wherever your domain is registered, add an **A record**:

| Type | Name | Value |
|---|---|---|
| A | `cm` | the public IP from step 5 |

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
ssh cm@cm.example.kz
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
ssh cm@cm.example.kz 'sudo apt update && sudo apt upgrade -y && sudo systemctl restart cm'
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
