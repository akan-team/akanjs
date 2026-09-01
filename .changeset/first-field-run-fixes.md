---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix: the first field run's findings — request context, module identity, and an honest agent surface

Six fixes from running the in-page agent on a real product app, plus the one its own docs app hit.

**Server components see the request again.** The RSC worker wrapped a render in `requestStorage.run(...)` only,
and the flight stream pumps components after that scope has exited — every `getSelf()` read no cookies and
bounced authed pages to `/signin`. The worker now keeps a request fallback pushed until the render settles, the
same discipline `ssrFromRscRenderer` already used. The stack is global and last-push-wins across concurrent
renders; pumping the flight render inside the ALS scope itself is the follow-up that removes the caveat.

**`akanjs/fetch` is a vendor shared module.** It was bundled separately into the app and the vendored
`akanjs/store` chunk, so `FetchClient`'s static serialized-signal registry split in two and the agent catalogue
silently read the empty copy — every endpoint-named action refused as undescribed. The registry also moved to a
`globalThis` symbol (the anchoring the shared client proxy already had), so a future duplicated module instance
degrades to nothing instead of an empty surface.

**The relay's return scalar registers on the client graph.** `agentTurn` lived in `akanjs/signal`, which no
client bundle loads, so the chat's first probe of `fetch.runAgentTurn` threw `No scalar constant model for
agentTurn`. The scalar now lives in `akanjs/fetch` and `FetchClient` itself force-registers it — Bun links a
barrel's `export *` modules lazily per used binding and its transpiler drops unused imports, so only a real call
survives to do that.

**`labelOf` reads the `text: "title"` role as the `Set` it is.** It asserted `readonly string[]` and called
`.find`, so every screen-context label on a search-indexed model threw.

**`akan build` relaunches itself once with the app env in place.** Bun macros snapshot `process.env` at process
start, so the env the build resolves and publishes later is invisible to them — and any hand-written
`@libs/<lib>/server` import (the sanctioned cross-lib entrypoint) puts that lib's env files, which read
`getEnv()` at module scope, into the `getSerializedSignal` macro graph. `AKAN_PUBLIC_APP_NAME` is the one
required key a workspace root `.env` cannot carry, so the CLI build now spawns itself again with it set and the
child does the real build — the `AKAN_PUBLIC_APP_NAME=<app> akan build <app>` workaround is built in. The
relaunch decision compares the env the process was **born** with, never the live `process.env`: the command
dispatcher writes the resolved app name into `process.env` before any command method runs, which satisfies
runtime readers but not macros — a guard reading the live value never fires (that inert shape is what alpha.19
shipped). A `Relaunching with AKAN_PUBLIC_APP_NAME=…` line in the build output is the observable proof. The
generated `sig`/`dict`/`srv`/`db` barrels also stopped walking parent *server* barrels (they import the lib's
own `@libs/<lib>/lib/<facet>` modules after `akan sync`), and `FetchClient.from` resolves its origin tolerantly,
so a lib whose graph stays clean serializes with no env at all.

**The agent surface stops publishing two lies.** Form setters for the base document fields (`setIdOnX`,
`setCreatedAtOnX`, `setUpdatedAtOnX`, `setRemovedAtOnX`) are no longer tools — the server stamps those. And an
action named after an endpoint is published with the endpoint's schema only when it declares at least as many
parameters: one declaring fewer would silently drop the borrowed tail and read stale form state, which shipped a
resident SMS with the wrong unit number in the field run. Such an action is refused by name and warned once in
the console; trailing extras beyond the endpoint's arguments stay legal, which is the generated
`create<Model>(data, options?)` shape.
