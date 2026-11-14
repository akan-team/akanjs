# remoteConnection Abstract

One connection of the signed-in account to another server, as the account's own list of them shows it.

## Rules

- It carries nothing a caller could act with: the tokens and the registered client stay in `remoteGrant`, on the server.
- `url` is the MCP endpoint the server normalized, which is also what `disconnectRemote` takes.
