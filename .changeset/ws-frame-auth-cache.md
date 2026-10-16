---
"akanjs": patch
---

A websocket no longer re-verifies the same credential on every frame. `MachineAccount` keeps a socket's verdict on the machine token it presents until the token changes, the token's expiry passes, or the machine keys in the env change, so a device streaming frames pays one EdDSA verify per connection instead of one per frame. `libs/shared`'s `AccountMiddleware` does the same for a session's JWT signature, up to its `exp`. Revocation is unchanged and still checked on every frame: a revoked session's socket loses access at its next frame, and a machine is still revoked by the version its guard compares.

`MachineToken.proofOf(authorization)` returns the identity together with the second it lapses at, and `MachineToken.keyEpoch()` moves whenever the keys read from the env change. A subscribe and a live event resolve the websocket adaptor from a per-registry memo instead of scanning the registry each time.
