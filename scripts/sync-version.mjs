#!/usr/bin/env node
// Sync the desktop version SSoT into the two Rust-side manifests.
//
// `apps/desktop/package.json#version` is the single source of truth
// (desktop/CLAUDE.md §5). The three version fields —
//   apps/desktop/package.json
//   apps/desktop/src-tauri/tauri.conf.json (".version")
//   apps/desktop/src-tauri/Cargo.toml      ([package] version)
// — must stay lock-step. The release workflow bumps package.json, then runs
// this script so tauri.conf.json + Cargo.toml follow before the tag is cut.
// Never hand-edit the three in isolation.
//
// Usage: node scripts/sync-version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appDir = join(root, 'apps', 'desktop');
const pkgPath = join(appDir, 'package.json');
const confPath = join(appDir, 'src-tauri', 'tauri.conf.json');
const cargoPath = join(appDir, 'src-tauri', 'Cargo.toml');

const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+([-+].+)?$/.test(version)) {
  console.error(`sync-version: invalid version "${version}" in ${pkgPath}`);
  process.exit(1);
}

// tauri.conf.json — JSON, set top-level ".version" (preserve 2-space format).
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

// Cargo.toml — replace the first line-anchored `version = "..."`, which is the
// [package] version. Dependency versions are written `foo = { version = ... }`
// (not line-anchored) so they are never matched. Checking that the line EXISTS
// is separate from whether the value changed, so an idempotent re-sync (version
// already correct — e.g. the first release at the 0.1.0 baseline) is a clean
// no-op rather than a false "not found" error.
const cargoVersionRe = /^version\s*=\s*"[^"]*"/m;
const cargoBefore = readFileSync(cargoPath, 'utf8');
if (!cargoVersionRe.test(cargoBefore)) {
  console.error(`sync-version: no [package] version line found in ${cargoPath}`);
  process.exit(1);
}
writeFileSync(cargoPath, cargoBefore.replace(cargoVersionRe, `version = "${version}"`));

console.log(`sync-version: tauri.conf.json + Cargo.toml set to ${version}`);
