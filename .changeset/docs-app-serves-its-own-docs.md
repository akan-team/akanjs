---
"akanjs": patch
---

feat(akan): serve the framework documentation over MCP from the docs app

`apps/akan` now exposes its own generated documentation corpus as MCP tools, so an agent working in an Akan
workspace can read the framework's docs instead of guessing at its APIs. Three tools, all `[Public]` — the same
markdown is already served anonymously at `/llms/pages`, so a guard there would protect nothing while making the
tools unusable to the agents they exist for:

- `listDocPages` — the whole index, optionally narrowed to one of the four sections.
- `searchDocPages` — every given word must match, ranked with title hits ahead of body mentions.
- `readDocPage` — one page in full as markdown, code examples included.

This is also the first app in the repo to serve a live `/mcp` catalogue, which is what makes the MCP boot log,
the wire, and the refusal paths exercised by something other than a test.

The corpus under `public/llms/pages` is stale relative to the docs routes — regenerate with
`bun apps/akan/script/generateLlms.ts` to pick up the MCP cheatsheet page and the mobile cheatsheets.
