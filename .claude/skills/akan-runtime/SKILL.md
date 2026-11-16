---
name: akan-runtime
description: "Configure how an app runs: web surfaces, route prefixes, gateway vs solo, akan start and logs, the Docker image, native and desktop apps, database modes, ops, assets and the build pipeline."
---

<!-- akan:generated -->

# Akan runtime

Runtime and build settings are declared in `akan.config.ts`. What must hold when you edit it, `main.ts` or an env
file — the prefixes, the `main.ts` import, the image, log sinks, the desktop server's guard — is the `config` rule in
the agent guide's Path Rules table.

## Where each setting lives

| Want | Setting |
| --- | --- |
| API only, or no CSR bundle for native apps | `web: false`, `web: { csr: false }` |
| Move the API or websocket mount | `new AkanApp({ prefix, websocketPrefix })` in `main.ts`, mirrored in `api: { … }`; read with `getApiPrefix()` / `getWsPrefix()` |
| The production image | `docker: string \| { image, preRuns, postRuns, command }` |
| iOS, Android, desktop | the `native` section; `desktop: { server: true }` carries the server |
| SQLite, several databases, a cluster | `database: { modes: [...] }` (`single`, `multiple`, `cluster`), picked by `AKAN_DATABASE_MODE` |
| URLs without `/<locale>/`: one language, or paths fixed from outside (OAuth callback, QR code, mail link) | `i18n: { localePrefix: "as-needed" }` — the default locale's pages and `<Link>` hrefs drop the prefix, other locales keep it |

## Running and logs

- `akan start <app>` (`a,b` or `all` for several) runs the dev server; `akan build <app>` checks the production
  build. A supervised session writes `local/apps/<app>/runtime/dev.log` (previous: `dev.prev.log`) — hand over that
  path, not a paste of the live view. Tail with `akan logs <app>`.
- Run a build without Docker with `cd dist/apps/<app> && bun main.js`: it boots with the env the Dockerfile sets,
  read from `akan.env.json` beside it, and a variable you set yourself (`PORT=3000`) wins.

## Native and desktop

A `start-*` command loads its pages from a running `akan start`; a desktop app carrying its server starts it itself.

```bash
akan start-desktop <app>                   # Run the desktop app on this computer
akan start-ios <app>                       # Run it in a simulator or on an iPhone (start-android alike)
akan build-desktop <app>                   # Build it for this computer into dist/native/<app>/<target>/build
akan build-desktop <app> --installer true  # Windows: add a per-user setup program
akan update-keygen <app>                   # Make the update signing key once; print its public key
akan publish-update <app>                  # Build a key-signed release for updates.url; --sign true also code-signs it
```

A device capability the framework lacks is a plugin the app owns in `native/<id>/`: `native-plugin.json`,
`src/index.ts` (the page API, used from a `webkit/` hook), `src/desktop.ts`, Kotlin and Swift.

Full detail: `get_guideline` with `runtimeRule` (keys, `--plain`, boot waves, `--kill`, watch scope, booting a
server in a test, native targets and updates).

## References

The full guidelines, split where each part fits one read; `akan guideline show <name>` prints the same text.

- `.agents/skills/akan-runtime/references/runtimeRule-1.md` — Web Surfaces — Building And Serving Without SSR/CSR · Route Prefixes — Where The API Is Mounted · The Process Model — Gateway And Solo · The Dev Server And Local Runs — `akan start` · Logging — Records, Request Context And Live Tail
- `.agents/skills/akan-runtime/references/runtimeRule-2.md` — The Generated Image — `docker` In `akan.config.ts` · Native Apps — The `native` Section
- `.agents/skills/akan-runtime/references/runtimeRule-3.md` — A Desktop App's Server — `bin` And `trustedDependencies` · Database Modes — `database` In `akan.config.ts` · Operations — Snapshots, Restore And The `/_akan/ops` Channel · Shipped Assets — `assets` In `akan.config.ts`
- `.agents/skills/akan-runtime/references/runtimeRule-4.md` — The Build Pipeline — `pipeline` In `akan.config.ts`
