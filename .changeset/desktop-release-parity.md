---
"akanjs": minor
---

feat(native): a desktop app is released the way a phone app is

A phone app's update could be packed without a key, driven from a pipeline and watched through its reports; a
desktop app's could not. Six gaps are closed.

- **Reports.** With `native.updates.report.url`, a desktop app posts what became of each release (downloaded, applied,
  confirmed, rolled back, failed) in the body a phone posts, with its CPU in `arch`, the key that signed the release in
  each event's `keyId`, and two reasons of its own: `signer` and `server` (`UPDATE_REPORT_DESKTOP_REASONS`).
- **An unsigned pack.** `akan pack-update <app> --platform desktop [--arch] [--sign] [--notarize] [--previous <archive>]`
  builds the app and writes `app/<tar sha256>.tar.gz`, the delta from `--previous`, `manifest.template.json` and
  `pack.json`, with no update key on the build host. Whoever holds the key signs it with `fillManifest`, `manifestBytes`
  and `updateEnvelope` (or `sealManifest`) of `akanjs/native/api`, which also gains `packAppUpdate`.
- **A rollback.** `akan publish-update <app> --republish <bundle>` signs a release already published again as its
  channel's newest, with no build (`republishUpdate`). A publish keeps each desktop envelope at
  `<os>-<arch>/<channel>/releases/<bundle>.json` and `--upload` sends it, so a fresh checkout reads the release back
  from `updates.url`.
- **The pipeline.** `{ use: "desktop-ota", platforms: [{ os, arch }] }` packs a desktop app's update after `ota`, one
  step per target and entry, with the slots `desktop-ota` and `after-desktop-ota`.
- **A desktop plugin and the user's tools.** `ctx.userPath()` is the PATH of the user's login shell,
  `ctx.resolveCommand(name)` finds a program in the app's bin folder or on it, and `ctx.spawn(cmd, options)` starts one
  as a child that ends with the app however the app ends, a crash included.
- **A Linux install that updates itself.** `akan build-desktop --installer true` writes, beside the AppImage,
  `<file>-<version>-<arch>.tar.gz`: the app folder with an `install.sh` that installs it for the user in
  `~/.local/opt/<app id>` with its launcher entry, and an `uninstall.sh`.

The guideline no longer says a desktop app trusts only the first of `updates.publicKeys`: since protocol v2 (3.1.1) it
trusts the whole ring, as a phone does.

**Upgrading.** No code change is needed; every addition is optional. Three things differ in what a build does:

- A target whose `updates.report.url` was set for its phones now gets reports from its desktop apps too. The endpoint
  sees `platform` `macos`, `windows` or `linux`, the new `arch` and `keyId` fields and the reasons `signer` and
  `server`; one that rejects unknown values with 400, 413 or 422 makes the app drop those reports.
- A Linux `--installer true` build makes two files. A CI that collects `*.AppImage` keeps working, and collects
  `*.tar.gz` as well to ship the install that takes updates.
- A pipeline executor reading a plan handles the `desktop-ota` action and its two slots, which appear only when a
  config lists the action. `PipelineActionName`, `AppPipelineStageInput` and `PipelinePlanActionStep` each gain a
  member, so a `switch` over them that TypeScript checks for exhaustiveness needs the new case.
