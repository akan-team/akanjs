---
"akanjs": patch
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

Desktop app updates move to protocol v2, the envelope phones already read. A desktop build now trusts every key of `native.updates.publicKeys` (minus `revokedKeys`) instead of only the first, and reads `<url>/<os>-<arch>/<channel>/app.json`: a manifest, the keyId that signed it and its signature in one file. `akan publish-update --revoke` and `--reset-sequence` work for desktop releases as they do for phones. The manifest names its akan target, and a desktop app refuses a release made for another target, so a signed release cannot be replayed onto a sibling target's feed.

`publish-update` still writes the old `<channel>.json` and `.sig` when the release is signed with the first key, so desktop apps built before this take the new binary through it; a release signed with a spare warns that those apps do not see it. `akan push-update --platform desktop` uploads the envelope, and the old pair only when it is the same release (`release.json` schema 2).

`native.updates.publicKeys` now refuses a non-canonical or small-order Ed25519 key, which would verify signatures nobody made: replace one with a key `akan update-keygen` prints.

Upgrade note: the akan CLI needs native build API 0.13.0, so install matching versions of akanjs and @akanjs/cli.
