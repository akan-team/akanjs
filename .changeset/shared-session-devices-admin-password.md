---
"akanjs": minor
---

`@libs/shared` can close admin password sign-in, records the device of every sign-in session and lets a user sign one out, and reports security events to the app.

- **Admin password sign-in can be closed.** `setAdminSsoPolicy({ canPasswordSignin })` refuses `signinAdmin` with `admin.error.passwordSigninClosed` when it answers `false`. An admin refresh re-checks the policy: an account that neither the password rule nor any SSO type an admin may use still admits loses every session at its next refresh. `canSignup` now also receives the SSO type.
- **Sessions carry a device.** A refresh session keeps the device kind (`browser`, `native`, `cli`, `signinAs`), the user agent, the network prefix (IPv4 /24, IPv6 /48, never the full address) and `lastUsedAt`. `AccountMiddleware` leaves the caller's device beside the account (`SigninClient`), and `DeviceLabel` in `@libs/shared/common` names the browser and OS for a list.
- **A user signs one session out, or every other one.** `UserService` lists the caller's sign-in sessions and revokes one or all but the current, leaving OAuth app sessions alone. A push token now records the session that registered it, and a remote sign-out drops that session's push tokens.
- **Revocation holds against a racing rotation.** Revoking a lineage marks it (`refreshSessionRevokedById`), so a rotation that the first pass missed is still refused, and a rotation removes the superseded entry from the owner's list.
- **Security events reach the app.** `setSecuritySignalHook` receives `signinLocked`, `refreshReuse` (with the OAuth `clientId` when a client's token was reused) and `newDeviceSignin`; `setAdminAccessHook` also receives admin SQL runs with the caller's address.

Not covered: a websocket opened before a remote sign-out keeps receiving room broadcasts until its access token expires.
