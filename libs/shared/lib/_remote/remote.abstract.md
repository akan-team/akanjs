# remote Service Abstract

Holds each user's connections to other servers and hands them to `agentService.loop({ remotes })`, so an agent running
here calls another server's MCP tools as that user.

## Rules

- Off unless `remote.enabled`: on, a signed-in user makes this server fetch an address they name. Every such request
  goes through `RemoteFetch`, which refuses a private address, pins the one it checked and follows no redirect;
  `remote.allowUrl` narrows the addresses further.
- A connection is one user's OAuth grant at the other server (authorization code, PKCE `S256`), which decides by its
  own guards what that user's agent may do there. Accounts are never matched across servers, and an admin console
  session connects nothing.
- A sign-in lives ten minutes, is bound to the user who started it, and its `state` is answered once. The answer's
  `iss` must be the authorization server that was asked.
- Tokens and the client secret are stored sealed (`RemoteVault`) and never returned: `listRemoteConnections` shows
  the address and the time alone, and a browser only ever carries `state` and the code.
- This app registers once per authorization server (RFC 7591), as a confidential client where that server issues
  secrets, and every user's connection there shares the registration.
- An access token is renewed a minute before it lapses and after a 401, one renewal at a time per connection in a
  process. A refused renewal closes the connection; a server that merely fails to answer keeps it.
- Disconnecting hands the grant back (RFC 7009) and forgets it whether or not the other server answers.
- A server that lists its tools to a caller with no credential is connected at once, with no token to hold.
- The endpoints take `Person` and stay off `/mcp`: an agent, least of all one reached through another connection,
  never connects, lists or disconnects a server.

connect -> authorization (10 min) -> complete -> grant -> renewed … -> disconnected | refused
