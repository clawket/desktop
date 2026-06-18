#!/usr/bin/env bash
#
# release-macos.sh — one-command local macOS release.
#
# Builds the signed + notarized + stapled .dmg (build-macos-release.sh), then
# tags + creates the GitHub Release with it. Publishing the release triggers the
# CI workflow (.github/workflows/release.yml, `on: release: published`) which
# builds the Linux .AppImage, attaches it, and opens the clawket/clawket
# components.json desktop pin-flip PR.
#
# Run on a Mac with the signing keychain + gh auth:
#   set -a; source ~/.config/agent-deck/release.env; set +a
#   bash scripts/release-macos.sh
#
# Version published = apps/desktop/package.json#version (currently the 0.1.0
# baseline → v0.1.0). Bump that file first for a later release.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${REPO_ROOT}/apps/desktop"
REPO="clawket/desktop"

err()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; }
info() { printf '\033[32m▸ %s\033[0m\n' "$1" >&2; }

command -v gh >/dev/null || { err "gh CLI not found"; exit 1; }
gh auth status >/dev/null 2>&1 || { err "gh not authenticated (gh auth login)"; exit 1; }

VERSION="$(node -p "require('${APP_DIR}/package.json').version")"
TAG="v${VERSION}"

if gh release view "${TAG}" --repo "${REPO}" >/dev/null 2>&1; then
  err "Release ${TAG} already exists on ${REPO}. Bump apps/desktop/package.json first."
  exit 1
fi

info "Building signed macOS .dmg for ${TAG}…"
bash "${SCRIPT_DIR}/build-macos-release.sh"

DMG="$(ls -t "${APP_DIR}"/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -1)"
[[ -z "${DMG}" ]] && { err "No .dmg found after build"; exit 1; }
info "Built: ${DMG##*/}"

info "Creating GitHub Release ${TAG} on ${REPO}…"
gh release create "${TAG}" "${DMG}" \
  --repo "${REPO}" \
  --target main \
  --title "Clawket Desktop ${TAG}" \
  --notes "Download the installer for your platform below.

- **macOS** — \`.dmg\`, Developer ID signed + notarized.
- **Linux** — \`.AppImage\`, attached by CI shortly after this release is published."

info "Published ${TAG}. CI (on: release: published) now builds the Linux .AppImage,"
info "attaches it, and opens the components.json desktop pin-flip PR in clawket/clawket."
