#!/usr/bin/env bash
# Capture the compiled email previews at true 600px measure via kimi-webbridge.
# Usage: bash tools/capture-emails.sh [class-id ...]
set -uo pipefail

DAEMON="http://127.0.0.1:10086"
SESSION="reliastra-admin-email"
OUT="${OUT:-C:/Users/USER/AppData/Local/Temp/opencode}"
BASE="http://localhost:4000/dev/email-preview"

ALL=(dependency_failure evidence_delivery customer_dependency_alert billing
     support_reply partner vendor_ops security internal_ops)
IDS=("$@")
[ ${#IDS[@]} -eq 0 ] && IDS=("${ALL[@]}")

REQ="$(mktemp -t wb-XXXXXX).json"
trap 'rm -f "$REQ"' EXIT

call() {
  printf '%s' "$1" > "$REQ"
  curl.exe -s --max-time 110 -X POST "$DAEMON/command" \
    -H "Content-Type: application/json" --data-binary "@$REQ"
}

call "{\"action\":\"find_tab\",\"args\":{\"url\":\"$BASE\",\"active\":true},\"session\":\"$SESSION\"}" >/dev/null 2>&1
call "{\"action\":\"navigate\",\"args\":{\"url\":\"$BASE\"},\"session\":\"$SESSION\"}" >/dev/null

# 660px viewport: the 600px message plus the 30px each side that an inbox shows.
call "{\"action\":\"evaluate\",\"args\":{\"code\":\"document.body.style.margin='0';'ok'\"},\"session\":\"$SESSION\"}" >/dev/null

for id in "${IDS[@]}"; do
  printf '  %-28s ' "$id"
  call "{\"action\":\"navigate\",\"args\":{\"url\":\"$BASE/$id?view=embed&r=$RANDOM\"},\"session\":\"$SESSION\"}" >/dev/null
  sleep 2
  out=$(call "{\"action\":\"screenshot\",\"args\":{\"format\":\"png\",\"fullPage\":true,\"path\":\"$OUT/email-$id.png\"},\"session\":\"$SESSION\"}")
  echo "$out" | grep -q '"ok":true' && echo "ok" || echo "FAILED: $out"
done
