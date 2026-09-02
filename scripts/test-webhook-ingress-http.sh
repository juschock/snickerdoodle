#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
service_root="$repo_root/services/snickerdoodle-webhook-ingress"
log_file="$(mktemp -t snickerdoodle-ingress-http.XXXXXX)"
port=3214
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -f "$log_file"
}
trap cleanup EXIT

(cd "$service_root" && "$service_root/node_modules/.bin/next" start -p "$port") >"$log_file" 2>&1 &
server_pid=$!

for _ in {1..50}; do
  if curl -sS -o /dev/null "http://127.0.0.1:$port/api/stripe/webhook"; then
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    sed -n '1,160p' "$log_file" >&2
    exit 1
  fi
  sleep 0.1
done

status() {
  curl -sS -o /dev/null -w '%{http_code}' -X "$1" "http://127.0.0.1:$port$2"
}

for method in GET PUT PATCH DELETE; do
  [[ "$(status "$method" /api/stripe/webhook)" == "405" ]]
done
[[ "$(status GET /)" == "404" ]]

post_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST -H 'content-type: application/json' --data '{}' \
  "http://127.0.0.1:$port/api/stripe/webhook")"
[[ "$post_status" == "503" ]]

echo "INGRESS_HTTP_SURFACE_PASS methods=4 root=404 unconfigured_post=503"
