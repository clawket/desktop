#!/usr/bin/env bash
#
# build-macos-release.sh — Signed + notarized + stapled macOS release build.
#
# Runs LOCALLY on a Mac whose login keychain holds the
# "Developer ID Application: NAME (TEAMID)" certificate. Contains NO secrets —
# it validates the signing env, builds the bundle, then notarizes + staples the
# .dmg. `pnpm tauri build` does the .app code-signing + notarization itself from
# the same env vars.
#
# Source your signing env first, e.g.:
#   set -a; source ~/.config/agent-deck/release.env; set +a
#   bash scripts/build-macos-release.sh
#
# Required env vars
# ----------------
# Signing (always required):
#   APPLE_SIGNING_IDENTITY   e.g. "Developer ID Application: Jane Doe (AB12CD34EF)"
#
# Notarization — provide EXACTLY ONE method:
#   Method A — Apple ID + app-specific password:
#     APPLE_ID  APPLE_PASSWORD  APPLE_TEAM_ID
#   Method B — App Store Connect API key:
#     APPLE_API_KEY  APPLE_API_ISSUER  APPLE_API_KEY_PATH
#
# clawket/desktop is a pnpm monorepo: the Tauri app is at apps/desktop and the
# shared @clawket/ui package must be built first. clawket desktop bundles NO
# nested binaries (clawketd is spawned from the plugin install dir, not bundled),
# so unlike agent-deck there is no nested-binary signing step.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${REPO_ROOT}/apps/desktop"

err()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; }
info() { printf '\033[32m▸ %s\033[0m\n' "$1"; }

missing=()
[[ -z "${APPLE_SIGNING_IDENTITY:-}" ]] && missing+=("APPLE_SIGNING_IDENTITY  (e.g. \"Developer ID Application: NAME (TEAMID)\")")

have_a=false; have_b=false
[[ -n "${APPLE_ID:-}" || -n "${APPLE_PASSWORD:-}" || -n "${APPLE_TEAM_ID:-}" ]] && have_a=true
[[ -n "${APPLE_API_KEY:-}" || -n "${APPLE_API_ISSUER:-}" || -n "${APPLE_API_KEY_PATH:-}" ]] && have_b=true

method=""
if [[ "$have_a" == true && "$have_b" == true ]]; then
  err "Both notarization methods partially set — provide EXACTLY ONE."
  exit 1
elif [[ "$have_a" == true ]]; then
  method="A (Apple ID + app-specific password)"
  [[ -z "${APPLE_ID:-}" ]]       && missing+=("APPLE_ID")
  [[ -z "${APPLE_PASSWORD:-}" ]] && missing+=("APPLE_PASSWORD  (app-specific password)")
  [[ -z "${APPLE_TEAM_ID:-}" ]]  && missing+=("APPLE_TEAM_ID")
elif [[ "$have_b" == true ]]; then
  method="B (App Store Connect API key)"
  [[ -z "${APPLE_API_KEY:-}" ]]      && missing+=("APPLE_API_KEY")
  [[ -z "${APPLE_API_ISSUER:-}" ]]   && missing+=("APPLE_API_ISSUER")
  [[ -z "${APPLE_API_KEY_PATH:-}" ]] && missing+=("APPLE_API_KEY_PATH")
  [[ -n "${APPLE_API_KEY_PATH:-}" && ! -f "${APPLE_API_KEY_PATH}" ]] && missing+=("APPLE_API_KEY_PATH file not found: ${APPLE_API_KEY_PATH}")
else
  err "No notarization credentials. Provide Method A (APPLE_ID+APPLE_PASSWORD+APPLE_TEAM_ID) or Method B (APPLE_API_*)."
  method="<none>"
fi

if (( ${#missing[@]} > 0 )) || [[ "$method" == "<none>" ]]; then
  err "Cannot start a signed release build. Notarization method: ${method:-<none>}"
  for m in "${missing[@]:-}"; do [[ -n "$m" ]] && printf '    - %s\n' "$m" >&2; done
  err "Source your signing env (e.g. ~/.config/agent-deck/release.env) and retry. Aborting."
  exit 1
fi

VERSION="$(node -p "require('${APP_DIR}/package.json').version")"
info "Signing identity: present (APPLE_SIGNING_IDENTITY)"
info "Notarization method: ${method}"
info "Building Clawket Desktop v${VERSION} (signed + notarized + stapled .app + .dmg)…"

cd -- "${REPO_ROOT}"
pnpm install --frozen-lockfile
pnpm -r --filter=./packages/* build
node scripts/sync-version.mjs
# Universal build (Apple Silicon + Intel) so one .dmg runs on every Mac.
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null 2>&1 || true
# Tauri signs + notarizes the .app during the bundle. --bundles app,dmg.
pnpm --filter @clawket/desktop exec tauri build --bundles app,dmg --target universal-apple-darwin

DMG="$(ls -t "${APP_DIR}"/src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg 2>/dev/null | head -1)"
[[ -z "${DMG}" ]] && { err "No .dmg produced under apps/desktop/src-tauri/target/release/bundle/dmg/"; exit 1; }

# Tauri notarizes/staples the .app but only signs the .dmg wrapper. A downloaded
# .dmg must itself be notarized + stapled or Gatekeeper rejects it on mount.
info "Notarizing the dmg wrapper: ${DMG##*/}"
if [[ "$method" == A* ]]; then
  xcrun notarytool submit "${DMG}" --apple-id "${APPLE_ID}" --password "${APPLE_PASSWORD}" --team-id "${APPLE_TEAM_ID}" --wait
else
  xcrun notarytool submit "${DMG}" --key "${APPLE_API_KEY_PATH}" --key-id "${APPLE_API_KEY}" --issuer "${APPLE_API_ISSUER}" --wait
fi
xcrun stapler staple "${DMG}"
xcrun stapler validate "${DMG}"
spctl -a -vvv -t install "${DMG}" || true

info "Done: ${DMG}"
echo "${DMG}"
