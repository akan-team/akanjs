---
name: akan-mcp
description: "Expose an app to MCP clients: what /mcp publishes from guards, mcp: false curation, option.setMcp settings, OAuth, refusals, page prompts and MCP Apps, and the exposure test."
---

<!-- akan:generated -->

# Akan MCP

Every app serves its signals as an MCP server on `POST /mcp`, mounted by default. **Exposure follows the guards**:
an endpoint with a real guard is published, one with none is refused, and so is a mutation guarded only by
`Public`. There is no per-endpoint opt-in.

## Curation is not authorization

- `mcp: false` on an endpoint, or a `slice()` `mcp` map mirroring `guards`, keeps a perfectly guarded step (a UI
  state-machine step a model would only call by mistake) off the shelf. It is an opt-out; everything else still
  publishes.
- `guards: [Every, Person]` reserves an act for a person; `.with(AgentCall)` narrows what an agent's call may do.
- A guard's `static scope` decides whether a listing can hide the entry: `"account"` guards are evaluated per
  caller, `"resource"` guards stay visible and stop the call.

## Settings

- `option.setMcp({ … })` in the app's `lib/option.ts`, never `main.ts`; `AKAN_MCP=false` takes the surface off.
- `JWT_SECRET` is required outside `local`.
- Every published entry needs a `.desc()`; model-facing text is English.
- Never make a refusal message more helpful.

## Pages for the host

- `page().prompt(name, description)` briefs a screen as an MCP prompt.
- `page().app(name, description, load)` publishes one component a host draws in the chat, as a read-only tool
  whose `load` may only query.

## Verify

- One exposure test per app in `srvkit/mcpExposure.signal.test.ts`: list the tools with a user token, pin the names
  with `toEqual`, and assert the curated and admin-only ones are absent. A guard change fails it first.
- Then `akan verify <app>` and the boot log.

Full detail: `get_guideline` with `mcpRule`, or `transportRule` for guards and rate limits.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-mcp/references/mcpRule-1.md` — Purpose · Exposure Rule · Keeping An Endpoint Off The Shelf — `mcp: false` · Configuration · Declaring Endpoints · …
- `.agents/skills/akan-mcp/references/mcpRule-2.md` — Authentication — The Authorization Server Is The Same Process · Page Prompts — `page().prompt()` · MCP Apps — One Component Of A Page, Drawn In The Chat · Progress Reporting · Rolling MCP Out To An App · …
- `.agents/skills/akan-mcp/references/mcpRule-3.md` — Writing `instructions` · Verifying An App
