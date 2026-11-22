<!-- akan:generated -->

## Verifying An App

- `akan verify <app>`, then the boot log above.
- The lib's own suites run wherever it is mounted: the OAuth signal test (metadata, registration, both `authorize`
  redirects, code exchange, `/mcp` with the minted token and the refusal of a first-party or forged one, refresh
  rotation) and the refresh-session and option unit tests.
- **One exposure test per app**, in `srvkit/mcpExposure.signal.test.ts`, since it spans every module: list
  `tools/list` with a user token and pin the names with `toEqual`, and assert the curated and admin-only ones with
  `not.toContain`. Exposure is derived from the guards, so a guard change fails this test first — which is the point.
  The framework's own pattern is `pkgs/akanjs/server/mcp/mcp.integration.test.ts`.
- Live: connect a client, consent, call a tool, `claude mcp logout`, authenticate again. `AKAN_PUBLIC_LOG_LEVEL=debug`
  prints one `OAuth token request grant_type=… client_id=…` line per token call; two refreshes in the same second
  both answering 200 is the grace window working, not a fault.
