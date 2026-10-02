---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A macOS desktop release can be downloaded: Developer ID signing, the hardened runtime, notarization and a dmg

`akan build-desktop` signs with a Developer ID when `AKAN_NATIVE_MACOS_IDENTITY` names one in a keychain, or
`AKAN_NATIVE_MACOS_CERTIFICATE` + `_CERTIFICATE_PASSWORD` a `.p12` (imported into a keychain made for the build and
deleted after it, for CI). Every Mach-O file is signed inside out with the hardened runtime and a secure timestamp, and
the executable gets Bun's JIT entitlements plus the camera's or microphone's when a usage text asks for them;
`native.desktop.entitlements` adds the app's own. With `AKAN_NATIVE_MACOS_NOTARY_KEY` + `_KEY_ID` + `_ISSUER` (an App
Store Connect API key) or `_NOTARY_PROFILE`, the app is notarized, stapled and checked with `spctl`.
`--installer true` on macOS adds a dmg with an Applications link, signed, notarized and stapled the same way.
`publish-update` signs a macOS release with the same identity, since the updater checks the installed app's signature.
A release that is not signed with a Developer ID, or not notarized, warns that Gatekeeper blocks a downloaded copy.
