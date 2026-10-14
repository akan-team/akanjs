# oauth Service Abstract

Issues, from the same process that serves `/mcp`, the OAuth 2.1 tokens that MCP endpoint accepts: authorization-server
metadata, authorization with PKCE and a consent page, client registration, token exchange and refresh.

## Rules

- Every access token is signed with the app's own secret and names the MCP endpoint as `aud`, so `AccountMiddleware`
  accepts it unchanged and `McpAuth` verifies it through `option.setMcp`. Guards stay the only authorization decision;
  no scope narrows what the token may do.
- An authorization request lives ten minutes, binds to the first signed-in account that opens it, and is decided once.
  A code lives sixty seconds and is consumed on first exchange, whether or not that exchange succeeds.
- PKCE `S256` is the only method. A redirect URI must be registered and match exactly, except that a loopback address
  may vary its port; a private-use scheme is accepted only when configuration names it.
- Refresh tokens rotate on use through `refreshSession`; a token reused within thirty seconds of its rotation is answered with
  a rotation of its own (a client that holds it twice is not a thief), one reused later revokes that grant's lineage only — never
  the account's other sessions. A refresh presented by a client other than the one it was issued to is refused.
- Registration is open (RFC 7591), rate-limited per address and public-client only; a `client_id` that is an HTTPS URL is
  read as a Client ID Metadata Document — resolved first and refused when it points into a private range, never fetched
  from the server's own network — unless configuration turns the feature off.
- A grant is revoked as a whole (RFC 7009 `/oauth/revoke` by the client, or the account's owner disconnecting it): its
  refresh lineage is closed and the lineage id is denylisted for an access token's lifetime, which is how a stateless
  token dies early. Revocation answers 200 whether or not the token was live, so it cannot be used to probe tokens.
- A token this server minted names its client and the MCP resource; a browser session names neither. That difference is
  what `isAgentCall` / `Person` read to keep an act a person may take from being taken on a model's say-so.
- Disconnecting an app and deciding a consent are such acts: an agent's token is refused, an MCP App view's relayed
  call included. Listing connections stays open to a token, so it can find its own grant.
- None of these endpoints is published to MCP: they are the protocol and the account's own controls, not tools.

authorize -> pending -> approved | denied -> code -> token -> refresh -> revoked
