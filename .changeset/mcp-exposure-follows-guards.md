---
"akanjs": minor
---

feat(mcp)!: expose every endpoint its guards admit, and mount `/mcp` by default

MCP exposure was opt-in per endpoint, per slice and per CRUD verb. It is now derived from the guards an endpoint
already declares, and `/mcp` is mounted unless `AKAN_MCP=false` says otherwise.

The old model asked the same question twice. `guards` is the authorization decision, and `McpDispatcher`
re-evaluates the account-scoped ones on every `tools/list` — so a second per-endpoint switch said nothing the
guards did not, while guaranteeing that every endpoint added later was invisible to agents until somebody
remembered to flag it. The framework's own OpenAPI document has no per-endpoint opt-in either: one env flag
publishes the whole HTTP surface, which is the same enumeration.

**The rule, applied globally with no way to configure it per endpoint or per app:**

- a real guard publishes
- **no `guards` at all is refused** — nobody decided who may reach it, and a catalogue entry is where that omission
  would stop being invisible
- **a mutation whose only guard is `Public` is refused**, unchanged: `[Public]` is having none, spelled out
- an explicit `guards: [Public]` on a *read* publishes. It is a decision someone wrote, the data is already served
  anonymously over HTTP and in the OpenAPI document, and refusing it would break a public docs or search endpoint
  while hiding nothing

Every structural refusal is unchanged: `pubsub`/`message`, an `Any` or `Upload` return, a file upload, a required
`Any` argument, and the three a prompt's flat string map cannot carry.

**Removed:** `mcp` on a signal option, on a slice option and on the signal's CRUD verb map — `McpOption` and
`McpSliceOption` are gone, and `mcp: { expose: true }` no longer typechecks. Delete it; nothing replaces it. The
`readOnly` / `destructive` / `idempotent` hints are now derived from the endpoint type and key rather than
overridable, which costs nothing a client trusts. `resource` is gone the same way: the generated reads are
addressable, a custom endpoint is not, and neither was ever configurable in practice.

`McpDocument.unguarded` is gone, subsumed by the refusal that now covers it. The `akan.mcp.missing-description`
and `akan.mcp.unguarded-exposure` quality-scan rules are gone with `McpScanner`: both found the exposure by
matching an `mcp: { expose: true }` literal in source, which no longer exists. The boot log already answered both
from the resolved catalogue, and it is now the only place that can.

**`GuardCls.scope` is required.** Unmarked meant `resource`, which is never evaluated for a listing — so with
exposure following the guards, one forgotten marker would list its endpoint's name and argument schema to every
caller and refuse only the call. There is no safe guess, so the author states it: `"account"` for a verdict that
reads the caller and nothing about the call, `"resource"` for one that needs the call's arguments.

**Upgrading:** delete every `mcp:` option from your signal files, and add `static scope: GuardScope = "account" |
"resource"` to every guard class. Then read the boot log — `MCP catalogue: tools=…` followed by one line per
refusal — because with no opt-in to be missing, that log is the only explanation for a tool that is not there.
An endpoint you want an agent to reach needs real guards, which it needed anyway.

**Settings moved off `new AkanApp(...)`.** `AkanAppOptions.mcp` is gone; the server settings live on the option
chain in `lib/option.ts` — `option.setMcp({ enabled, readOnly, path, version, instructions, allowedOrigins,
pageSize, language, auth })`. The old field is a type error on upgrade, which is the signal to move it.
