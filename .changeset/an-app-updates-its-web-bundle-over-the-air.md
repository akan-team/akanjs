---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

An installed app updates itself: a phone its web bundle over the air, a desktop app the whole app.

- `mobile.updates: { url, publicKey, channel?, readyTimeout? }` in `akan.config.ts`, per target too, the target's
  fields winning. It brings the runtime's `updates` plugin. A channel left unnamed is the backend env the binary is
  built for (`main`, `develop`, `debug`, …), so a `build-desktop` app (`debug` unless `--env` names another) takes
  only the releases published for that env.
- The CSR frame confirms a release on trial once the first page is on screen, in every native shell (an unconfirmed
  one is rolled back at the next launch). On a phone it also keeps the bundle current by itself: at start and on each
  return to the front it looks for a newer one and downloads it, and it runs from the next cold start. A desktop
  release is the whole app and a relaunch, so the app checks, downloads and applies it on its own schedule. A dev
  build's pages are left alone. `akanjs/client/native` exports `updates`, `markReady` and `useUpdateState`.
- `akan update-keygen <app> [--platform]` makes the signing key of the app's id once and prints its public half.
  `akan publish-update <app>` builds a release on this machine and signs it: the whole app for this computer's desktop
  OS and CPU (with the app's server when the target's `native.desktop.server` says so, as for `build-desktop`), or the
  web bundle for `--platform android|ios`. It writes the manifest and its files under `.akan/mobile/<target>/updates`,
  to upload to `updates.url`, on the channel of its `--env` (`main` unless named); `--channel` publishes to a pilot
  channel first.
- `akan pack-update <app> --platform ios|android [--target] [--env] [--out]` writes an unsigned phone update instead,
  for a signer that keeps the key elsewhere: `files/<sha256>`, `bundle.json` and `manifest.template.json`, the
  manifest with `channel`, `sequence` and `bundle` left for the signer. `--against <store bundle.json>` also checks
  the bundle runs in that store build, writes `compat.json`, and fails when it needs a new binary. The signing
  contract is in the native runtime's architecture notes: fill the three fields, sign exactly the bytes you upload,
  upload `files/` first.
- `publish-update` refuses a `--channel` outside the names `updates.channel` accepts (lowercase letters, digits, `.`,
  `_`, `-`) before it builds, and numbers a release past the one its channel already has in the updates folder,
  warning when this computer's clock is behind it. Apps compare against the time their own build was made, so keep the
  building and the publishing computers' clocks in step.
- A release of a desktop app that carries its server is confirmed only once that server answered ready, and its trial
  clock starts once the server answered or gave up: a release whose server never comes up is rolled back like one whose
  page never renders, and a server slow on its first run (its new files being scanned) costs no rollback.
- An installed desktop app refuses a release that carries a server when it has none, or none when it has one: the
  download fails with `NOT_ALLOWED` and the release is marked failed, since either way its pages' backend would change
  place. Turning `native.desktop.server` on or off for an app already installed takes a reinstall.
- On Windows an app started from its install folder (the installer, the Start menu, Explorer) applies and rolls back
  updates: Windows renames no folder a process works in, so the app moves to its local data folder before the webview
  starts, and the update helper and the app it starts work elsewhere.
- A desktop release on trial whose carried server hangs while it boots is rolled back: its clock starts when the server
  answers, gives up, or 120 s have passed. The update state and the unpacked releases live in the app's local data
  (`%LOCALAPPDATA%\<app id>\akan-native-updates` on Windows), and plugins get that folder as `ctx.appLocalDataDir`.
- An app installed under another folder name (`/D=`, a renamed `.app`) takes updates; a download older than a
  reinstalled build is dropped; a Windows swap that had to be undone is kept as failed instead of retried in a loop.
- `publish-update` checks the signing key before it builds and writes `<channel>.json` together with its signature.
  The channels `bundle`, `manifest.template` and `compat` are refused. `akan start` keeps `.akan/mobile`, where
  releases wait to be uploaded, and the `bin` downloads.
