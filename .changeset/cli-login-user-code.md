---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan login` now prints a code such as `BCDF-GHJK` beside the sign-in URL. Type it on the sign-in page, and approve only if it matches what your terminal shows. The URL and its QR code carry a login id, `RemoteAuthCode.loginIdOf(deviceCode)` from `akanjs/common`, instead of the login's device code. The code is derived from the device code, which never leaves the terminal, so it cannot be computed from the link.

The CLI polls `getRemoteAuthToken` with the device code, and also with the login id, so a cloud that still keeps the session under the id in the URL signs the new CLI in as before. That cloud does not ask for the code, so the code protects a sign-in only once the cloud follows the contract below. **Cloud operators** (Akan Cloud, or a cloud serving `/remoteAuth` itself) update the sign-in flow as follows:

- `getRemoteAuthToken(id)`: accept as a device code only an id in the UUID form the CLI mints. For any other id, answer `null` and record nothing. For a device code, derive `loginId = await RemoteAuthCode.loginIdOf(id)`. The first time you see it, register a pending login under `loginId` that remembers the device code, with an expiry of a few minutes. Answer a session only once one was approved for `loginId`, and hand it out once. Never look a session up by the id the poll presents.
- The page at `/remoteAuth?remoteId=<loginId>` asks the signed-in person for the code and never shows it. Approve (`setRemoteAuthToken(loginId, typed)`) only when a login is pending under `loginId` and `RemoteAuthCode.matches(deviceCode, typed)` holds. With none pending, ask the person to run `akan login` again. Three wrong codes expire the login. The next poll then answers a 4xx such as 410, which ends the CLI's wait with the cloud's reason.
- A CLI older than this release prints no code and puts its device code in the URL. The page finds no login pending under that id, so ask the person to update `@akanjs/cli`.

`akan login` no longer loses a session the cloud has already handed out. The session is saved as soon as it arrives, and reading the account afterwards is retried on its own. When the account still cannot be read, the session stays saved and `akan login` reports it. A network error or a 5xx while waiting is reported once and retried with backoff, instead of being taken for "not approved yet". A refusal of the device code's poll (a 4xx other than 408 or 429) ends the login with the cloud's reason instead of waiting out the 10 minutes; a refusal of the login id's poll only stops that poll. `akan logout` now also clears a saved session whose account was never read.

In `@akanjs/devkit`, `CloudApi.getRemoteAuthToken` answers `null` only when the cloud answers that the login is still waiting, and `CloudApi.getRemoteSelf` answers `null` only when the cloud takes no sign-in from the session. Both now throw on a failed request and give up after 20 seconds.
