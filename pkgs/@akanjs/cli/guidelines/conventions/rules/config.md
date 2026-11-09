---
description: Runtime and build configuration: akan.config.ts, main.ts, env narrowing, native apps, database modes.
paths:
  - "{apps,libs}/*/akan.config.ts"
  - "{apps,libs}/*/main.ts"
  - "{apps,libs}/*/env/**"
---

# Runtime And Build Configuration

Declared in `akan.config.ts`, narrowed — never widened — by an env at boot; domain code reaches none of it
(`runtimeRule`).

- **`web: true | false | { csr: boolean }`** — `{ csr: false }` drops the CSR bundle native apps ship, `false` is
  API-only.
- **Route prefixes move together**: `new AkanApp({ prefix, websocketPrefix })` in `main.ts`, mirrored in
  `api: { … }` in `akan.config.ts` for a CSR shell or native bundle. Read them with `getApiPrefix()` /
  `getWsPrefix()` (`akanjs/base`); never write `/api` or `/ws`, never pass one as a prop.
- **`main.ts` imports `AkanApp` from `akanjs/server/akanApp`**, not the barrel.
- Give every log sink a floor (`Logger.addSink(sink, { minLevel })`), never log per delivered record in anything
  that delivers records, and tail with `akan logs <app>`.
- **`docker` is `string | { image, preRuns, postRuns, command }`**; the generated image installs only
  `ca-certificates` and `tzdata`.
- **Native apps are the `native` section** (iOS, Android, desktop). A desktop app's carried server listens on a
  loopback port any local program can call — guard it as a network server — and ships `private/` and its env
  readable on the user's computer; read runtime files from `AKAN_APP_DIR`, and keep a secret the user gives it with
  `NativeSecret` (the OS credential store), never in a file.
- **`database: { modes: [...] }`** (`single`, `multiple`, `cluster`), chosen by `AKAN_DATABASE_MODE`; an app running
  in two modes avoids `q.raw`.
- **`i18n: { localePrefix: "as-needed" }`** serves the default locale at unprefixed paths (`/books/x`, and `<Link>`
  renders them so) while other locales keep `/<locale>/…`. Use it, not a raw `<a>`, for a single-language app or URLs
  fixed from outside (OAuth callbacks, QR codes, mail links, a migrated site).

## Running An App

- After changing application code, run `bun run akan start <appName>` (`a,b`, `a b`, or `all` for several); check
  the production build with `bun run akan build <appName>`, and serve it without Docker with
  `cd dist/apps/<appName> && bun main.js` (`PORT` or any variable you set overrides the build's env).
- A supervised session writes `local/apps/<app>/runtime/dev.log` (previous: `dev.prev.log`) — hand over that path,
  not a paste of the repainting full-screen view. Keys, `--plain`, boot waves, `--kill`, watch scope, running a
  built artifact, booting a server in a test: `runtimeRule`.

## Native Apps

`native: { desktop: { server: true } }` in `akan.config.ts` is all a desktop app that carries its own server needs.
A `start-*` command loads its pages from `akan start`, so run that first; a desktop app that carries its server
starts it itself. The full contract — targets, updates, what the carried server ships — is
`akan guideline show runtimeRule`.

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
