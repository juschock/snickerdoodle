#!/usr/bin/env bash

set -euo pipefail

readonly GITLEAKS_VERSION="8.30.1"
readonly RELEASE_BASE="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"

usage() {
  echo "Usage: $0 [--all|--staged]" >&2
}

mode="${1:---all}"
case "$mode" in
  --all | --staged) ;;
  *)
    usage
    exit 2
    ;;
esac

repo_root="$(git rev-parse --show-toplevel)"
os="$(uname -s)"
arch="$(uname -m)"

case "$os/$arch" in
  Darwin/arm64)
    artifact="gitleaks_${GITLEAKS_VERSION}_darwin_arm64.tar.gz"
    checksum="b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5"
    ;;
  Darwin/x86_64)
    artifact="gitleaks_${GITLEAKS_VERSION}_darwin_x64.tar.gz"
    checksum="dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709"
    ;;
  Linux/aarch64 | Linux/arm64)
    artifact="gitleaks_${GITLEAKS_VERSION}_linux_arm64.tar.gz"
    checksum="e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080"
    ;;
  Linux/x86_64)
    artifact="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
    checksum="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
    ;;
  *)
    echo "Unsupported platform for the pinned Gitleaks binary: $os/$arch" >&2
    exit 2
    ;;
esac

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
archive="$work_dir/$artifact"

curl --fail --silent --show-error --location \
  --proto '=https' --tlsv1.2 --retry 3 \
  --output "$archive" "$RELEASE_BASE/$artifact"

if command -v shasum >/dev/null 2>&1; then
  printf '%s  %s\n' "$checksum" "$archive" | shasum -a 256 --check --status
elif command -v sha256sum >/dev/null 2>&1; then
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --status
else
  echo "A SHA-256 verifier (shasum or sha256sum) is required." >&2
  exit 2
fi

tar -xzf "$archive" -C "$work_dir" gitleaks

common_args=(
  --config "$repo_root/.gitleaks.toml"
  --no-banner
  --redact
)

case "$mode" in
  --all)
    "$work_dir/gitleaks" git "${common_args[@]}" --log-opts='--all' "$repo_root"

    # Git mode scans commit patches, not the current uncommitted files. Build a
    # clean file-only view from tracked plus nonignored untracked paths so local
    # release checks also cover the exact candidate without scanning .git,
    # node_modules, build output, or ignored secret files.
    scan_dir="$work_dir/worktree"
    mkdir -p "$scan_dir"
    while IFS= read -r -d '' path; do
      source_path="$repo_root/$path"
      [[ -f "$source_path" || -L "$source_path" ]] || continue
      mkdir -p "$scan_dir/$(dirname "$path")"
      cp -P "$source_path" "$scan_dir/$path"
    done < <(git -C "$repo_root" ls-files --cached --others --exclude-standard -z)
    "$work_dir/gitleaks" dir "${common_args[@]}" "$scan_dir"
    ;;
  --staged)
    "$work_dir/gitleaks" git "${common_args[@]}" --staged "$repo_root"
    ;;
esac
