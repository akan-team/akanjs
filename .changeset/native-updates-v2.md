---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

Phone web bundle updates move to protocol v2.

- **Path:** a binary reads only its own native API's manifest, `<url>/<platform>/<channel>/<nativeApi>.json`, so two store generations on one channel each take their own fixes.
- **Envelope:** that file is one envelope holding the manifest's bytes, the signer's `keyId` and the signature, so a CDN can never pair a new manifest with an old signature.
- **Keys:** `native.updates.publicKeys` lists 1 to 3 trusted keys, the online signing key first. `publicKey` stays as the one-key form.
- **Revocation:** a manifest can carry `revokeKeys`, plus `resetSequence` to recover from a polluted sequence. A key may revoke only keys listed before it, and a revocation is kept for good on the device.
- **Publishing:** `akan-native update publish` carries the channel's revocations forward into each new envelope and refuses to sign with a key they revoke, so a routine publish never undoes a revocation.
- **Store build:** `bundle.json` records the binary's update URL, key ids and `embeddedSequence`.
- **Server-side helpers:** `openEnvelope`, `keyIdOf` and `updateDecision` are exported for a server that signs or registers releases.

Desktop app updates keep protocol v1 and trust the first key.

Upgrade note: no phone binary that shipped with `updates` reads the new layout. Rebuild the binary before publishing, and point a signer at the new path. `akan pack-update` writes a schema 2 template.
