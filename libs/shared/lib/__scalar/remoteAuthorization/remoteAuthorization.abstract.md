# remoteAuthorization Abstract

A sign-in at another server between the moment this app sent the browser there and the moment the code came back.

## Rules

- It lives ten minutes and is taken out on the first callback that names its `state`, whether or not that callback succeeds.
- It is bound to the user who started it: a callback arriving in another account's session is refused.
- `verifier` and `clientSecret` stay on the server; the browser only ever carries `state`.
