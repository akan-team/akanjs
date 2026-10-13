---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan build-desktop` and `akan publish-update` sign only with `--sign` and notarize only with `--notarize` (as does `akan-native build` / `update publish`): `AKAN_NATIVE_MACOS_*` and `AKAN_NATIVE_WINDOWS_*` name the identity and no longer decide to use it, and a build that finds them set without the flag says it is unsigned. A release build or `publish-update` of an app that carries its server, signed or not, first searches that server for every secret value of the workspace's server env files and refuses it with the file and key paths, and an env file it cannot evaluate stops the release; one line then names the identity and the service a signed app goes to. The SSR route bundle now takes the server env plugin too, so a build carries only its own environment's app env there and a profile build swaps the libs' env defaults in it as it does in the backend. `akan publish-update --arch arm64|x64` publishes a desktop release for another CPU into that CPU's feed folder.

Upgrade note: signing and notarizing are opt-in. A CI that only sets `AKAN_NATIVE_MACOS_*` or `AKAN_NATIVE_WINDOWS_*` now builds and publishes unsigned macOS and Windows apps, after a line saying those variables went unused and a warning that the app is not signed, and an installed signed app refuses such an update. Add `--sign true` to `akan build-desktop` and `akan publish-update`, and `--notarize true` for macOS, to sign and notarize as before.
