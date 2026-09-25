---
"akanjs": minor
---

perf(server): stop rebuilding per-row and per-request state on the backend hot paths

A profile of the backend (`constant` → `signal`) found the database was 3% of a list query and JS
post-processing was the other 97%. On a 50-row `user` query: 14µs of SQL, then 236µs decoding rows and 221µs
hydrating them, allocating ~23 000 objects — about 460 per document returned. None of that was the query.

The same query now runs in **276–293µs and allocates ~3 100–3 900 objects**: −33% latency, −85% allocation.
Four changes, each measured independently.

**`hydrate()` no longer snapshots rows it does not have to.** Every row of every query was deep-cloned —
`JSON.parse(JSON.stringify(sanitizeJson(row)))`, 172µs of the 412µs — purely to back `isModified()`. That
method has two call sites in a real app, both inside `schema.pre("save")` hooks, and a save hook only ever
runs on a document that came from `create()` or the update path. `hydrate` takes a trailing
`{ track }` that **defaults to `true`**, so every caller outside the store — including the `Model(data)`
facade — keeps today's behaviour; only `find` and the projected read behind it opt out.

`isModified()` on an untracked document **throws** with a message naming the fix, rather than guessing.
Both guesses are silently wrong: `false` skips work that was needed, and `true` makes a
`if (!this.isModified("password"))` hook re-hash an already-hashed password. If you hit it, you are calling
it on a document that came straight out of a read — move the call into a save hook, or re-load through
`save()` / `update()`.

The snapshot stays a deep clone where it is taken. A lazy one would be wrong: `isModified()` compares against
state as of hydrate, and document chains mutate `this.status = …` directly, so there is no mutation hook to
defer to. The six per-document closures (`set`, `save`, `refresh`, `isModified`, `toJSON`, `toObject`) also
moved to one prototype per store; it extends the model's own document prototype, so chain methods and
`instanceof` are unaffected and the methods stay non-enumerable exactly as before.

**`ConstantField.getProps()` is memoized.** It rebuilt a 27-key object on every call, and the read paths ask
per field per row — in `decodeDocumentPayload`, again in `crystalize` via `BaseConstant.set()`, again in
`purify`. It is now built once per field and frozen; no caller mutated the result.

**`getDefault()` caches a plan, not a record.** `via()` already memoized it per class, but the database
adaptor called the standalone function per nested scalar value per row. Thunk defaults
(`default: () => dayjs()`), array defaults and nested-scalar defaults are still produced per call — only
values that were already shared before the cache existed are shared now. Caching the finished record would
have frozen `dayjs()` at boot and aliased one `[]` across every document filled from that model.

**Middlewares, guards and slice projections resolve once instead of per request.** `use(env)` takes no
context, so a middleware instance and its handler are a function of `(class, env)` and now live for the
process; a rejected setup is evicted so a transient failure does not poison the endpoint. Guards are already
required to be side-effect free and re-runnable — `revalidateWsRooms` re-runs them outside any request — so
one instance per class serves every call. `Logging`, which is registered by default, built two template
strings per request and discarded them unbuilt at the default log level; it now checks
`Logger.shouldLog("debug")` first (new public method, alongside the existing `isVerbose`).

**`WebRouter` stops rebuilding the merged manifest per request.** `#ensureRoute` took a `snapshot()` and then
merged the runtime manifest over it on every `/*` and `/__rsc` request — four copies of a structure that is
276KB of JSON for a small app. `RouteClientCache` now exposes a `revision` that bumps on every mutation of
`merged`, including a delta merge that leaves `generation` alone, and the merge is memoized against it. In
production the revision never moves after `seed`, so the manifest is built once; in dev a rebuild bumps it and
the next request pays for one copy. The cached object is still a copy, so an in-flight request keeps consuming
a stable manifest across an invalidate, exactly as the per-request snapshot guaranteed.

**`routeElementComposer` and `routeTreeBuilder` are no longer re-exported from `akanjs/server`.** They pull
React and the page module graph, and the only consumer is `rscWorker.tsx`, which imports them relatively in its
own process. Re-exporting them put React into every process touching the barrel — including a
`SERVER_MODE=batch` replica that renders nothing and any `init({ web: false })` server. The barrel import drops
from **44.0MiB / 28 338 objects to 38.8MiB / 24 640**. Import them at `akanjs/server/routeTreeBuilder` and
`akanjs/server/routeElementComposer` if you need them directly.

The DI container was measured too and left alone: 11 services, 11 signals, 26 adaptors, 8 database models and
7 scalars cost 3.7MiB and 27ms, which is 2.5% of process RSS. `diLifecycle.ts` is not where backend memory
goes — the module graph is.
