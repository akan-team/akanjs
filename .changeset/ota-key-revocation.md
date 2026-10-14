---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A phone web bundle release can start revoking an update signing key, and the config keeps the revocation.

- **Start one:** `akan publish-update --platform ios|android --revoke <keyId,...>` (`akan-native update publish ios|android --revoke <keyId>`, repeatable) revokes keys of `updates.publicKeys`; `--reset-sequence` adds `resetSequence` to that release. `akan update-keygen` prints each key's keyId.
- **Keep it:** `native.updates.revokedKeys` lists the keyIds every phone release revokes, so a release published from a fresh checkout still revokes them. A release carries `revokedKeys`, the channel's published revocations and `--revoke` together, and warns about a revocation the list does not hold.
- **Refused before the build:** a keyId the key ring does not hold, more than 16 revoked keys, `--reset-sequence` without a revocation, either flag on a desktop release, and a signing key the release revokes or that is listed before a key it revokes. The error names where the revocation came from and the key to sign with (`AKAN_NATIVE_UPDATE_KEY` picks its file).
- **API:** `publishUpdate` and `checkPublishUpdate` take `revoke` and `resetSequence`, and `checkPublishUpdate` validates the `updates` settings too; `updateKeygen` returns `keyId`. The native build API is 0.12.0.

Upgrade note: the akan CLI needs native build API 0.12.0, so install matching versions of akanjs and @akanjs/cli; an older API would publish without the revocation.
