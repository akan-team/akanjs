---
"@akanjs/devkit": patch
---

perf(build): bundle every route's client entries in one pass instead of one per route

`AllRoutesBuilder` ran a `RouteClientBuilder` per route, and each one calls `Bun.build`. Entries were already
deduplicated globally through `knownEntries` — 169 routes produced 128 client entries — but **chunk splitting is
scoped to a single `Bun.build` invocation**, so any dependency shared by entries that landed in different
invocations was emitted once per invocation.

In `apps/akan` that meant four complete copies of mermaid's parser layer. Six client entries reach
`import("mermaid")` — `pkgs/akanjs/ui/Constant/Mermaid.tsx`, `Constant/Doc.tsx`, `apps/akan/ui/ModalTests.tsx`,
`Docs/ConstantDocsDemo.tsx`, `Docs/Mermaid.tsx`, `SampleSchema.tsx` — and they were first discovered by four
different routes, so each pass emitted its own 32-chunk, 868KB copy. The macro payload in `lib/useClient.ts` was
duplicated the same way.

Discovery now runs for every route first and the collected entries go through one build. Discovery does no
bundling and is already cached per file, so the extra pass costs almost nothing.

| | before | after |
|---|---|---|
| `.akan/artifact/client` | 26 MB | 8.1 MB |
| `.akan/artifact/client-ssr` | 17 MB | 4.7 MB |
| chunks | 605 | 258 |
| mermaid copies | 4 | 1 |
| build time | 12.9s | 10.1s |

Client entries stay at 128 and the emitted manifest is unchanged: same 169 `routeIds` in the same order, the same
151 `clientManifest` keys, and the same 114 `ssrManifest.moduleMap` entries. mermaid is still reached through
`await import(...)`, so its chunk stays lazy and out of the initial load.

**Only the production path changes.** `AllRoutesBuilder` is constructed once, by `applicationBuildRunner` with
`command: "build"`. Dev keeps one build per route through `incrementalBuilder`, which is what makes an incremental
rebuild cheap, and `discoveredEntries` / `clientDepsByEntry` — consumed only there — are untouched.
`RouteClientBuilder` takes an optional `entries` list that skips discovery; dev never passes it.
