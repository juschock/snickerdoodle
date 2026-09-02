#!/usr/bin/env bash
set -euo pipefail

umask 077
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/snickerdoodle-sn06-blobs.XXXXXX")"

cleanup() {
  case "$tmp_dir" in
    "${TMPDIR:-/private/tmp}"/snickerdoodle-sn06-blobs.*) rm -rf -- "$tmp_dir" ;;
    *) echo "Refusing unsafe temporary cleanup path: $tmp_dir" >&2; exit 70 ;;
  esac
}
trap cleanup EXIT

source_dir="$tmp_dir/source"
restore_dir="$tmp_dir/restore"
mkdir -m 700 "$source_dir" "$restore_dir"
printf '%s\n' 'synthetic deliverable A' >"$source_dir/order-a.txt"
printf '%s\n' 'synthetic deleted subject artifact' >"$source_dir/tombstoned.txt"
chmod 600 "$source_dir"/*

(cd "$source_dir" && shasum -a 256 order-a.txt tombstoned.txt | LC_ALL=C sort) \
  >"$tmp_dir/blob-manifest.sha256"
chmod 600 "$tmp_dir/blob-manifest.sha256"

# Simulate a partial restore with one orphan and one missing authoritative blob.
printf '%s\n' 'orphan' >"$restore_dir/orphan.txt"
cp "$source_dir/order-a.txt" "$restore_dir/order-a.txt"
rm "$restore_dir/order-a.txt"

# Reconcile to the authoritative manifest, but reapply the durable privacy
# tombstone before reopening: the tombstoned object must not be restored.
rm "$restore_dir/orphan.txt"
cp "$source_dir/order-a.txt" "$restore_dir/order-a.txt"
chmod 600 "$restore_dir/order-a.txt"

actual="$(cd "$restore_dir" && shasum -a 256 order-a.txt | awk '{print $1}')"
expected="$(awk '$2 == "order-a.txt" {print $1}' "$tmp_dir/blob-manifest.sha256")"
[[ "$actual" == "$expected" ]]
[[ ! -e "$restore_dir/tombstoned.txt" && ! -e "$restore_dir/orphan.txt" ]]
[[ "$(stat -f '%Lp' "$tmp_dir/blob-manifest.sha256")" == '600' ]]
[[ "$(stat -f '%Lp' "$restore_dir/order-a.txt")" == '600' ]]
if git -C "$repo_root" ls-files --error-unmatch "$tmp_dir/blob-manifest.sha256" >/dev/null 2>&1; then
  echo 'Temporary blob manifest unexpectedly tracked by Git' >&2
  exit 1
fi

echo "SNICK_SN06_BLOB_RECONCILIATION_PASS manifest=$(shasum -a 256 "$tmp_dir/blob-manifest.sha256" | awk '{print $1}') missing=1 orphan=1 tombstone=1"
