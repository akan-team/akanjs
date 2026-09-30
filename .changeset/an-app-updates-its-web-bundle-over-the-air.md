---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A mobile app updates its web bundle over the air, signed by whoever holds the key.

- `mobile.updates: { url, publicKey, channel?, readyTimeout? }` in `akan.config.ts`, per target too, the target's
  fields winning. It brings the runtime's `updates` plugin. A channel left unnamed is the backend env the binary is
  built for (`main`, `develop`, …).
- The CSR frame keeps the bundle current by itself: it confirms a bundle on trial once the first page is on screen
  (an unconfirmed one is rolled back at the next launch), and at start and on each return to the front it looks for
  a newer one and downloads it; it runs from the next cold start. A dev build's pages are left alone.
  `akanjs/client/native` exports `updates` for a screen that applies one now.
- `akan pack-update <app> --platform ios|android [--target] [--env] [--out]` writes an unsigned update:
  `files/<sha256>`, `bundle.json` and `manifest.template.json`, the manifest with `channel`, `sequence` and `bundle`
  left for the signer. `--against <store bundle.json>` also checks the bundle runs in that store build, writes
  `compat.json`, and fails when it needs a new binary. The signing contract is in the native runtime's
  architecture notes: fill the three fields, sign exactly the bytes you upload, upload `files/` first.
