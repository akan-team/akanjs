---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

An installed app updates itself from releases `akan publish-update` signs

`mobile.updates: { url, publicKey, channel?, readyTimeout? }` (a target's own too) ships the runtime's updates plugin
with the app. A channel left unnamed is the backend env the app is built for, so a `build-desktop` app (`debug` unless
`--env` names another) takes only the releases published for that env. `akan update-keygen <app>` makes the signing
key once and prints its public half; `akan publish-update <app>` builds a release — the whole app for this computer's
desktop OS and CPU (`--server` carries the app's server, as `build-desktop --server` does), the web bundle for
`--platform android|ios` — and writes the signed manifest and its files under `.akan/mobile/<target>/updates`, to
upload to `updates.url`, on the channel of its `--env` (`main` unless named). `--channel` publishes to a pilot channel
first. akanjs confirms a new release once the app's first page mounts, so a release that never renders is rolled back;
`updates`, `markReady` and `useUpdateState` come from `akanjs/client/native` for the app to check, download and apply on
its own schedule.
