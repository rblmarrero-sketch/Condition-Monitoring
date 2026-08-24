#!/usr/bin/env bash
# The whole Yandex setup, without the console.
#
# Does what docs/yandex/SETUP.md does by clicking: bucket, service account,
# static key, function, public trigger — and prints the one URL the app needs.
#
#   bash docs/yandex/setup.sh baimskaya-cm
#
# You need `yc` on the machine and one token (see CLI-SETUP.md). Nothing here
# touches the phones; the last line is the URL you paste in yourself.
set -euo pipefail

BUCKET="${1:-}"
SA_NAME="${SA_NAME:-cm-function}"
FN_NAME="${FN_NAME:-cm-endpoint}"
RUNTIME="${RUNTIME:-nodejs18}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die(){ echo "✗ $*" >&2; exit 1; }
say(){ echo; echo "── $*"; }

[ -n "$BUCKET" ] || die "give the bucket a name:  bash $0 baimskaya-cm
   Lowercase, digits and hyphens only, and globally unique across all of
   Yandex — if it is taken, add your site's initials."
command -v yc >/dev/null || die "yc is not installed — see docs/yandex/CLI-SETUP.md step 1"
yc config get folder-id >/dev/null 2>&1 || die "yc is not signed in — see docs/yandex/CLI-SETUP.md step 2"

FOLDER="$(yc config get folder-id)"
echo "folder $FOLDER"

# ---- 1. the bucket -----------------------------------------------------------
# Private. Nothing about the app needs it public, and public is the one setting
# that would put every photograph of every machine on the open internet.
say "bucket $BUCKET"
if yc storage bucket get --name "$BUCKET" >/dev/null 2>&1; then
  echo "   already there, leaving it alone"
else
  yc storage bucket create --name "$BUCKET" \
    --default-storage-class standard --max-size 53687091200 >/dev/null
  echo "   created, private, 50 GB cap"
fi

# ---- 2. the service account --------------------------------------------------
say "service account $SA_NAME"
if yc iam service-account get --name "$SA_NAME" >/dev/null 2>&1; then
  echo "   already there"
else
  yc iam service-account create --name "$SA_NAME" >/dev/null
  echo "   created"
fi
SA_ID="$(yc iam service-account get --name "$SA_NAME" --format json | grep -o '"id": *"[^"]*"' | head -1 | cut -d'"' -f4)"
[ -n "$SA_ID" ] || die "could not read the service account id"

yc resource-manager folder add-access-binding "$FOLDER" \
  --role storage.editor --subject "serviceAccount:$SA_ID" >/dev/null 2>&1 || true
echo "   storage.editor granted"

# ---- 3. the static key -------------------------------------------------------
# Shown once, by Yandex and by this script — it is read AND delete on the
# bucket. It goes straight into the function's environment below and is not
# printed, not written to a file, and not kept.
say "static access key"
KEY_JSON="$(yc iam access-key create --service-account-id "$SA_ID" --format json)"
KEY_ID="$(echo "$KEY_JSON"  | grep -o '"key_id": *"[^"]*"' | head -1 | cut -d'"' -f4)"
KEY_SEC="$(echo "$KEY_JSON" | grep -o '"secret": *"[^"]*"'  | head -1 | cut -d'"' -f4)"
[ -n "$KEY_ID" ] && [ -n "$KEY_SEC" ] || die "could not read the key back"
echo "   key $KEY_ID created (the secret is not printed)"

# ---- 4. the function ---------------------------------------------------------
say "function $FN_NAME"
yc serverless function get --name "$FN_NAME" >/dev/null 2>&1 \
  || yc serverless function create --name "$FN_NAME" >/dev/null

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp "$HERE/function.js" "$TMP/index.js"
( cd "$TMP" && { zip -q function.zip index.js 2>/dev/null \
    || python3 -c "import zipfile;zipfile.ZipFile('function.zip','w').write('index.js')"; } )
[ -f "$TMP/function.zip" ] || die "could not make the zip — install zip, or python3"

yc serverless function version create \
  --function-name "$FN_NAME" \
  --runtime "$RUNTIME" \
  --entrypoint index.handler \
  --memory 256m \
  --execution-timeout 60s \
  --service-account-id "$SA_ID" \
  --source-path "$TMP/function.zip" \
  --environment "BUCKET=$BUCKET" \
  --environment "KEY_ID=$KEY_ID" \
  --environment "KEY_SECRET=$KEY_SEC" \
  --environment "S3_REGION=ru-central1" \
  --environment "SECRET=" \
  --environment "ADMIN_SECRET=" >/dev/null
echo "   version created on $RUNTIME"

# ADMIN_SECRET is deliberately empty: it is the password that permits deleting
# inspections, and empty means deletion is switched off and the dashboard says
# so plainly instead of failing at the moment somebody presses the button. If
# you ever want it, set it HERE and nowhere else — never in the app.

# ---- 5. let the internet call it ---------------------------------------------
yc serverless function allow-unauthenticated-invoke "$FN_NAME" >/dev/null
echo "   public"

# ---- 6. the URL, and proof it reached the bucket -----------------------------
URL="$(yc serverless function get --name "$FN_NAME" --format json \
       | grep -o '"http_invoke_url": *"[^"]*"' | head -1 | cut -d'"' -f4)"
[ -n "$URL" ] || die "could not read the invoke URL"

say "checking it before you trust it"
sleep 3
OUT="$(curl -s --max-time 30 "$URL" || true)"
echo "   $OUT"
case "$OUT" in
  *'"ok":true'*) echo "   ✔ it reached the bucket";;
  *) echo "   ✗ not healthy yet. yc serverless function logs $FN_NAME  — the Logs are the first place to look.";;
esac

echo
echo "════════════════════════════════════════════════════════════"
echo "  $URL"
echo "════════════════════════════════════════════════════════════"
echo "That is the whole configuration. Paste it into ONE phone first"
echo "(⚙ → the Google Drive URL field → Save), keep the old URL written"
echo "down, and check the bucket after a short round."
