---
name: akan-runtime
description: "Configure how an app runs: web surfaces, route prefixes, gateway vs solo, akan start and logs, the Docker image, native and desktop apps, database modes, ops, assets and the build pipeline."
---

<!-- akan:generated -->

# Akan runtime

Runtime and build settings are declared in `akan.config.ts` and narrowed — never widened — by an env at boot.
Domain code reaches none of them.

## Where each setting lives

| Want | Setting |
| --- | --- |
| API only, or no CSR bundle for native apps | `web: false`, `web: { csr: false }` |
| Move the API or websocket mount | `new AkanApp({ prefix, websocketPrefix })` in `main.ts`, mirrored in `api: { … }`; read with `getApiPrefix()` / `getWsPrefix()` |
| The production image | `docker: string \| { image, preRuns, postRuns, command }` |
| iOS, Android, desktop | the `native` section; `desktop: { server: true }` carries the server |
| SQLite, several databases, a cluster | `database: { modes: [...] }`, picked by `AKAN_DATABASE_MODE` |

- `main.ts` imports `AkanApp` from `akanjs/server/akanApp`, never the barrel.
- Never write `/api` or `/ws` literally, and never pass a prefix as a prop.
- The generated image installs only `ca-certificates` and `tzdata`; add the rest in `preRuns`.
- An app running in two database modes avoids `q.raw`.

## Running and logs

- `akan start <app>` (`a,b` or `all` for several) runs the dev server; `akan build <app>` checks the production
  build. A supervised session writes `local/apps/<app>/runtime/dev.log` — hand over that path, not a paste of the
  live view. Tail with `akan logs <app>`.
- Run a build without Docker with `cd dist/apps/<app> && bun main.js`: it boots with the env the Dockerfile sets,
  read from `akan.env.json` beside it, and a variable you set yourself (`PORT=3000`) wins.
- Give every log sink a floor (`Logger.addSink(sink, { minLevel })`) and never log once per delivered record.

## Native and desktop

- `akan start-desktop <app>`, `akan start-ios <app>`, `akan start-android <app>` load pages from a running
  `akan start`; a desktop app carrying its server starts it itself.
- A desktop app's carried server listens on a loopback port any local program can call — guard it like a network
  server. Read runtime files from `AKAN_APP_DIR`, and keep a user's secret with `NativeSecret`, never in a file.

Full detail: `get_guideline` with `runtimeRule`.

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-runtime/references/runtimeRule-1.md` — Web Surfaces — Building And Serving Without SSR/CSR · Route Prefixes — Where The API Is Mounted · The Process Model — Gateway And Solo · The Dev Server And Local Runs — `akan start` · Logging — Records, Request Context And Live Tail · …
- `.agents/skills/akan-runtime/references/runtimeRule-2.md` — Native Apps — The `native` Section · A Desktop App's Server — `bin` And `trustedDependencies`
- `.agents/skills/akan-runtime/references/runtimeRule-3.md` — Database Modes — `database` In `akan.config.ts` · Operations — Snapshots, Restore And The `/_akan/ops` Channel · Shipped Assets — `assets` In `akan.config.ts` · The Build Pipeline — `pipeline` In `akan.config.ts`
