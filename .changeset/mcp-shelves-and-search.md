---
"akanjs": minor
---

Three `option.setMcp` settings let a client that pays for every listed tool on every turn see fewer of them. Guards,
`Person`, the rate limit and authentication apply exactly as at the root. With none of them set, `/mcp` answers byte
for byte as before.

- **`shelves: Record<string, { endpoints: string[]; instructions?: string }>`** serves another listing at
  `<path>/<name>`, holding only the named entries, which the caller's guards still filter.
  - Its handshake carries the shelf's own `instructions`, or none, never the app's.
  - It lists no resources, page prompts or MCP Apps views, and a call to a tool outside it is `unknownTool`.
  - Each shelf is its own OAuth protected resource. Its resource is `<resource>/<name>`, its metadata lives at
    `/.well-known/oauth-protected-resource<path>/<name>`, and its `WWW-Authenticate` challenge points there.
  - It accepts a token whose `aud` is the shelf or the root, but not one issued for another shelf. The root's
    metadata and audience check are unchanged.
  - Shelves merge by name across `setMcp` calls.
  - A shelf name that is not a lowercase path segment, a shelf with no endpoints, or an entry name no served signal
    has stops the boot with `invalidConfig`. An entry MCP does not publish is warned about.
- **`search: { listed: string[]; limit?: number; keywords?: Record<string, string[]> }`** makes the root list only
  `listed`, plus `findTools({ query, limit? })` and `readTool({ name, args })`.
  - `findTools` ranks the tools the caller's guards would list, by name, `keywords` and description, and returns
    `{ tools: [{ name, description, inputSchema }] }`. Prefix matching handles Korean particles as well as English
    inflection.
  - The tools it returns join that caller's listing, so a client calls each one by its own name and still asks
    before a write. When the client accepts `text/event-stream`, the response announces
    `notifications/tools/list_changed` ahead of the result.
  - `readTool` runs a published query through the same path as a direct call, and refuses a mutation with the code
    `notReadOnly`.
  - The server declares `tools: { listChanged: true }` and drops the listing's cache hint only while search is on.
    Shelves do not search.
- **`structuredContent: "always" | "declared"`** defaults to `"always"`, which behaves as before. `"declared"` omits
  `structuredContent` from a tool that publishes no `outputSchema`, so under `outputSchema: "none"` every model result
  is text alone. An MCP Apps view and an app's own result keep it.

The boot log warns when an `instructions` text runs past 2,000 characters. `McpDocument` gains `knows(name)` and
`publishesOutputSchema(endpoint, mode)`. `OAuthAuthorize.sameResource(requested, resource)` now also accepts a path
under `resource`.

**Upgrading:**

- **No settings:** nothing changes.
- **Redis:** with `search` on, each caller's found tools are stored for 24 hours in the app's cache under
  `<keyPrefix>mcpFound:<caller>`, beside the existing `mcpRate` and `mcpUiSession` keys. A Redis ACL that limits
  key patterns must allow it. Without a cache the set is kept in each process: a replica that did not serve the
  `findTools` call lists only `listed` until the caller searches again there, though a call by name works on any
  replica. Without `auth.verify`, callers behind one address share a found set, and each still sees only what its
  guards allow.
- **Proxy:** a proxy or gateway that routes only `<path>` and its well-known URLs must also route `<path>/<name>`
  and `/.well-known/oauth-protected-resource<path>/<name>` for each shelf.
- **OAuth:** the bundled authorization server accepts `resource=<resource>/<name>` and issues the root's token,
  which a shelf accepts. An external authorization server must issue tokens whose `aud` is either the shelf's
  resource or the root's. A server built on `OAuthAuthorize.sameResource` now accepts any path under its configured
  resource; it issues a token for the configured resource itself.
