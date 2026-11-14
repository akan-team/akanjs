# remoteGrant Abstract

What the server keeps for one account's connection to another server: where to refresh it, and its tokens.

## Rules

- `clientSecret`, `access` and `refresh` are `RemoteVault` ciphertext, so a copy of the cache alone yields no token.
- It never leaves the server: no endpoint returns it, and `remoteConnection` is what the account's own list shows.
- An empty `tokenEndpoint` marks a remote that asked for no sign-in; such a grant holds no token and is never refreshed.
