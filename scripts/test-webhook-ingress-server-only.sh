#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture="$repo_root/tests/fixtures/webhook-ingress-client-boundary"
output="$(mktemp -t snickerdoodle-server-only.XXXXXX)"
trap 'rm -f "$output"' EXIT

if "$repo_root/node_modules/.bin/next" build "$fixture" --webpack >"$output" 2>&1; then
  echo "SERVER_ONLY_BOUNDARY_FAIL: client fixture built successfully" >&2
  exit 1
fi

if ! grep -Eq "depends on .server-only.|server-only.*Client Component" "$output"; then
  echo "SERVER_ONLY_BOUNDARY_FAIL: expected Next.js boundary error was absent" >&2
  sed -n '1,160p' "$output" >&2
  exit 1
fi

echo "SERVER_ONLY_BOUNDARY_PASS"
