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
  may vary its port; a private-use scheme is accepted only when configuration names it. The token request repeats the
  authorization request's `redirect_uri` byte for byte, and may leave it out only when the authorization request did.
- The subject is the session's user (`self`). A session holding only the admin console identity (`me`) may grant only
  when `oauth.allowAdminSubject` is on (off by default): otherwise authorize sends it to sign in, the consent
  endpoints answer `oauth.error.adminSubjectNotAllowed` (403), and an admin grant issued earlier stops at its next
  refresh.
- Refresh tokens rotate on use through `refreshSession`; a token reused within thirty seconds of its rotation is answered with
  a rotation of its own (a client that holds it twice is not a thief), one reused later revokes that grant's lineage only — never
  the account's other sessions. A refresh presented by a client other than the one it was issued to is refused before any
  rotation, so it cannot spend the legitimate client's token. The first-party refresh endpoints (`refreshJwt`,
  `refreshAdminJwt`, a CLI's `refreshAuthToken`) answer a token this server issued as an unknown one, spending and
  revoking nothing: traded there it would come back without `aud` / `client_id`, and `Person` would admit the model.
- Registration is open (RFC 7591) and rate-limited per address (10 a minute, 20 an hour); a client may register as public or with a secret. A `client_id` that is an HTTPS URL is
  read as a Client ID Metadata Document — resolved first and refused when it points into a private range, never fetched
  from the server's own network — unless configuration turns the feature off.
- A grant is revoked as a whole (RFC 7009 `/oauth/revoke` by the client, or the account's owner disconnecting it): its
  refresh lineage is closed and the lineage id is denylisted for `RevokedSessions.accessTokenDays`, which is how a
  stateless token dies early. A denylist entry's expiry only grows: a later, shorter mark never ends a longer one.
  When the denylist cannot answer, a user's token lives and an admin's (`me`) is refused, with a warning each time. Revocation answers 200 whether or not the token was live, so it cannot be used to probe tokens.
- A token this server minted names its client and the MCP resource; a browser session names neither. That difference is
  what `isAgentCall` / `Person` read to keep an act a person may take from being taken on a model's say-so. Off `/mcp`,
  a token of a client this server registers (dynamic, metadata-document or configured) is refused 403
  `shared.error.agentTokenNotAllowed` at an `mcp: false` or `mcp: "agent"` endpoint (a slice's per-verb value included),
  or one the app names in `offShelfEndpoints` (the same list it hands `setMcp({ excludeEndpoints })`, which the server
  keeps private), unless a `Person`-style guard already refuses it; a token an app mints for its own client (angelo's
  runner) is left to that app's policy.
- Approving, denying, viewing a consent request and disconnecting an app take `Person`: an agent's own token can never
  grant itself, or another client, access.
- None of these endpoints is published to MCP: they are the protocol and the account's own controls, not tools.

authorize -> pending -> approved | denied -> code -> token -> refresh -> revoked
