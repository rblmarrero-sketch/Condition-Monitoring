# PROJECT FACTS: Condition Monitoring as it runs today

<!-- CM_FACTS_V1 · facts as of 26.10.2026 · master copy: rblmarrero-sketch/askpi-site ops/cm_facts/PROJECT_FACTS.md -->

**Read this before CLAUDE.md.** Where CLAUDE.md, README.md or a doc in this repo says something different, **this file wins**. Much of CLAUDE.md was written while Yandex was the backend.

The reliability project keeps this file: the claude.ai project "Avialability from Asset State and downtime", with its KB in `askpi-site/docs/kb/` (doc 02 §16 = CM architecture, doc 05 = dated decisions). A copy of this file lives in both repos. A daily check (`askpi-site` workflow "CM facts check") compares the two copies and opens an issue when they differ.

**If your work changes one of these facts,** edit this file in the same PR and say so in your answer to the maintainer (Rickie). The check then reports it, and the reliability project updates its KB and the master copy. Never change a fact here only to make text agree with old CLAUDE.md wording.

Times are site time (Baimskaya, UTC+12) unless marked.

## 1. Backends and hosting
| # | Fact | Since |
|---|---|---|
| F1 | **Yandex is gone.** The VM, `baimskaya-cm.duckdns.org`, the Node backend and Yandex Object Storage were deleted by Rickie. `docs/yandex/` is history only: never deploy it, never send VM / ssh commands for it. Every phone uses Google. | 20.10.2026 |
| F2 | **Phones' backend = Google Apps Script** deployment `AKfycbwWJ1vb…/exec`, writing to the Drive folder `CM_backup_Pechanka` (`ROOT_FOLDER_ID` `1cw-t83KlEZ8Nc103-iVbXKKBHNvxrS37`). **Drive is the MASTER copy of all CM data.** | 06–07.10.2026 |
| F3 | **Firebase Hosting `relconditionmonitoring.web.app` = app host only, no data.** PECHANKA publishes the live branch there within 15 min of a merge (BUILD 538 on 12.10; check with `curl -s https://relconditionmonitoring.web.app/mobile/sw.js \| grep -o 'BUILD="[0-9]*"'`). | 06.10.2026 |
| F4 | GitHub Pages (`rblmarrero-sketch.github.io/Condition-Monitoring/`) still serves the same live branch. It is a standby host, not used by the phones. | 23.10.2026 |

## 2. Apps Script settings (set in the script editor only, never in this repo)
| # | Fact | Since |
|---|---|---|
| F5 | **`ADMIN_SECRET` IS SET** in the script editor, so **office deletes / rewrite / resolve are ON** (`canDelete:true`). The repo keeps the empty placeholder `''` on purpose. Statements that it is "empty by decision" or that deletes are off are out of date. | 20.10.2026 |
| F6 | **Redeploying `docs/google-upload.gs`:** before pasting the new code, copy BOTH lines `const ROOT_FOLDER_ID = …` and `const ADMIN_SECRET = …` from the editor, and put both back after pasting. Then Deploy → **Manage deployments** → Edit → New version (never "New deployment"), so the URL stays `…AKfycbwWJ1vb…/exec`. Never ask for or print the secret's value. | 25.10.2026 |
| F7 | Every Apps Script change is committed to this repo first, then pasted into the editor. | 06.10.2026 |
| F16 | **`DESK_KEY` is a Script property** (Project Settings → Script properties), set in the editor only, never in this repo, and never printed. From `GAS_SAFETY_V1` on, when it is set, the office's changes (`edit`, void / unvoid, `resolve`, `rewrite`, `delete`, `delfile`) and LubeLink's writes of `_meta/lube/**` need the body field `desk` equal to it, which PECHANKA's `/cm-api` adds; anything else gets "office changes go through maintenance.vegadevelopment.com". Not set = no desk check. Phone ops are never gated by it. Being a property, it survives redeploys (F6 copies only the two code lines). The same version refuses uploads into `_meta/` except deferrals, phone diagnostics and the lube master, needs a name on every correction and decision and a reason to void, and makes `dry:true` on a delete change nothing. | 26.10.2026 (from the deploy of GAS_SAFETY_V1) |

## 3. PECHANKA (company server) side, the office role
| # | Fact | Since |
|---|---|---|
| F8 | **PECHANKA follows Drive, including deletions** (CM_FINAL_V1, `cm_gpull.sh`, every minute, full sync at least every 15 min). Files deleted in Drive are moved to `/opt/cm-media-deleted/<date>/`, never erased. `_meta/index/**` and `_meta/push/**` are never copied either way. Statements that PECHANKA "never deletes" or "collects Yandex every 5 min" are out of date. | 20.10.2026 |
| F9 | Office dashboards: `https://maintenance.vegadevelopment.com/cm/dashboard/` and `/cm/dashboard-next/` are copied from the live branch every 15 min. Their `upload-defaults.js` uses PECHANKA's `/cm-api`, which reads the local copy and forwards writes and deletes to Google. **Deletes are ON** (`GOOGLE_CHANGEOVER=0`). | 20.10.2026 |
| F10 | **Work-order data, main path:** PECHANKA builds `data/work_orders.js`, `schedule_slim.json` and `reliability.json` from `WO.xlsx` (CM_WO_LOCAL_V1, every 5 min, builds when WO.xlsx changed) and publishes them to the office copy and Firebase. **Second path:** the workflow `refresh-work-orders-pechanka.yml` runs on the self-hosted runner ON PECHANKA (dispatched at most once per 15 min) and commits `data/work_orders.js` here as **github-actions[bot] "Refresh work_orders.js from Pechanka WO.xlsx [skip ci]"**. Those bot commits are expected. "Unverified" on them is cosmetic and is not a reason to rewrite history. | 17.10.2026 |
| F11 | CM photos are copied off-site nightly at 21:30 site (CM_PHOTO_BAK_V1). PECHANKA's whole app is backed up nightly at 01:47. | 21.10.2026 |
| F12 | Changes on PECHANKA are made only as kits through the private repo `askpi-site` (PR → kit queue). Never ask the maintainer to edit PECHANKA files by hand from this repo's instructions. | 23.10.2026 |

## 4. Repo and release rules (unchanged)
| # | Fact | Since |
|---|---|---|
| F13 | `claude/magnetic-plug-dashboard-llv4wc` is the default and only published branch. It goes to every phone. Never push to it directly and never force-push or rewrite its history. Changes go through a side branch, then a PR, and Rickie merges. Bump `BUILD` when a change must reach the phones. | 06.10.2026 |
| F14 | Lubrication master: **LubeLink (`/lube/` on PECHANKA) is the only editor** of `_meta/lube/master.json`. The CM Lubrication tab is read-only. Two-way sync runs every minute. | 12.10.2026 |
| F15 | `mobile/upload-defaults.js` is public: put nothing in it that is not already public. Secrets live only in the script editor and on PECHANKA, never in this repo. | standing |
