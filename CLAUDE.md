# Condition Monitoring — what anyone working on this has to know first

Baimskaya, Chukotka. 1,128 machines. Two surfaces, one engine:
`mobile/index.html` (the phone, offline-first PWA) and `dashboard/index.html`
(the office). Both load `mobile/report-core.js`, so a report change lands in
both or neither.

---

## THE BACKEND IS YANDEX. GOOGLE IS RETIRED.

**The live endpoint is `https://baimskaya-cm.duckdns.org`** — `docs/yandex/function.js`
running under `server.js` on a small VM. That is the only backend the fleet talks to.

Both changeovers in `mobile/upload-defaults.js` are **armed**, and every phone has
already done them once:

```
swap    "yandex-2026-08"      Apps Script URL  →  baimskaya-cm.duckdns.org   (main slot)
retire  "google-off-2026-08"  dest "mirror"    →  off                        (the Google copy)
```

So:

- **Never tell anyone to deploy or redeploy `docs/google-upload.gs`.** It is a
  retired backend. Saying otherwise has wasted the maintainer's time three times.
- A backend fix means **`docs/yandex/function.js`**, and it is not live on push —
  see the deploy steps below.
- `docs/google-upload.gs` is still kept field-for-field in step with `function.js`,
  for one reason only: *two backends for one document have to agree on what the
  document IS*, so a backend that is ever switched back on cannot silently
  disagree about the shape of a record. Keeping it in sync is correct. Deploying
  it is not a thing that happens.
- The destination **id** stays `gas` after the swap while its URL points at
  Yandex. Code that branches on `d.id === "gas"` is therefore talking to Yandex.
  Branch on the id, never on the URL.

### Deploying a backend change

The phone and the dashboard are GitHub Pages — a push puts them in front of
everyone. **The server does not update itself.** Full procedure and failure
handling: `docs/yandex/VM-SETUP.md` §12. In short:

```
ssh cmadmin@baimskaya-cm.duckdns.org
cd /opt/cm
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/function.js
sudo curl -fsSLO https://raw.githubusercontent.com/rblmarrero-sketch/Condition-Monitoring/claude/magnetic-plug-dashboard-llv4wc/docs/yandex/server.js
sudo systemctl restart cm
sudo systemctl status cm --no-pager
```

`cm.env` — the keys and the admin password — is **not** among the replaced files.

---

## Secrets

`ADMIN_SECRET` lives in `/opt/cm/cm.env` on the VM and **nowhere else**. It must
never appear in the app, in `upload-defaults.js`, or anywhere in this repo.

`upload-defaults.js` is served to anyone who opens the app, so every URL in it is
public by design — that trade was made deliberately to stop inspectors having to
configure phones. Do not add anything to it that is not already public.

---

## Branch and deployment

`claude/magnetic-plug-dashboard-llv4wc` **is the default branch**, and GitHub
Pages publishes from it. There is no merge step: **every push is immediately
live to the field.** Develop, commit and push only on that branch.

---

## Rounds and intervals

Round types: `MP, FC, INSP, TEMP, UC, GET, TB, LUBE`.
Classes: `HT, AT, EXC, DOZ, LDR, GRD, DRB, DRE, HRB, CRJ, CRC, SCR, GEN`.

Intervals live in **`mobile/due.js` and nowhere else**. They are in HOURS,
rendered to a calendar at 20 h/day, and several are **per class**:

| Round | Interval |
|---|---|
| MP | 250 h — confirmed for the Terex TR60 haul trucks |
| FC | 500 h engine filter, 1000 h the rest |
| INSP | 500 h |
| UC | **1000 h dozers · 4000 h excavators** |
| TB | **4000 h articulated · 1000 h carried forward for the rest** |
| TEMP, LUBE | 30 days, carried forward — no hour figure stated |

An interval is a property of the round **and the machine**. Always pass `cls`
to `DUE.next` / `DUE.hours` / `DUE.spec`. Omitting it schedules every excavator
on the dozer's number — which is exactly what shipped, and walked 21 machines
four times more often than anyone asked for.

**Never write a second interval table.** One did exist in the dashboard, saying
90 days for a 250 h round, and coverage was measured against a window seven
times too wide. `tests/interval.cjs` fails if one comes back.

---

## The defect class this project keeps producing

Almost every real defect found here has one shape: **a real value rendered as
nothing, or a real action that does nothing.** Nothing throws, no warning
appears, the screen looks finished — and it is found months later by somebody in
the field noticing a number is wrong. Its mirror is just as bad: **a panel
claiming to know something it does not.** A false alarm and a false reassurance
are the same failure.

Habits that follow from that, all of them learned the hard way:

- **Say only what can be verified.** `up:1` means "the endpoint accepted every
  file", which is a fact about a conversation. "Confirmed" is reserved for the
  read-after-write that asks the server what it actually holds.
- **Silence is not a verdict.** A server that does not answer produces no
  finding, because a guard that cries wolf is the noise a real failure hides in.
- **Read cells by what they ARE, never by column index.** Three suites learned
  this separately.
- **One source of truth per fact.** Two tables for one interval, two copies of
  one label — that is how surfaces come to disagree.
- **Tests must ask the app, not keep their own copy.** Four suites failed on
  working code because each held a duplicate of something the app owns. Take
  labels from `I18N`, intervals from `due.js`, limits from the running page.

---

## Tests

Full sweep: `bash tests/runall.sh` — ~150 suites, ~4,000 assertions, and it
brings up its own helper servers on 8085/8092/8093/8094/8096/8097/8098/8099/8101/8102.
Register every new suite in the list at the top of that file.

Two traps that have each cost an hour:

- `tests/pw.cjs` exports a **module name string** — use `require(require("./pw.cjs"))`.
- **`pkill -f runall` matches its own wrapper shell** and kills the sweep you
  just started. Never put the pattern and the launch in one command line; use a
  pattern that cannot match itself, e.g. `pkill -f 'run[a]ll.sh'`.
