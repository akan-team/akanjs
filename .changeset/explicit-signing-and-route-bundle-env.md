---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`akan build-desktop` and `akan publish-update` sign only with `--sign` and notarize only with `--notarize` (as does `akan-native build` / `update publish`): `AKAN_NATIVE_MACOS_*` and `AKAN_NATIVE_WINDOWS_*` name the identity and no longer decide to use it, and a build that finds them set without the flag says it is unsigned. Before signing, the server the app carries is searched for every secret value of the workspace's server env files and refused with the file and key paths; one line then names the identity and the service the app goes to. The SSR route bundle now takes the server env plugin too, so a build carries only its own environment's app env there and a profile build swaps the libs' env defaults in it as it does in the backend. `akan publish-update --arch arm64|x64` publishes a desktop release for another CPU into that CPU's feed folder.
