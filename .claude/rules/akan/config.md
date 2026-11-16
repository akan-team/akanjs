---
description: Runtime and build configuration: akan.config.ts, main.ts, env narrowing, native apps, database modes.
paths:
  - "apps/*/akan.config.ts"
  - "libs/*/akan.config.ts"
  - "apps/*/main.ts"
  - "libs/*/main.ts"
  - "apps/*/env/**"
  - "libs/*/env/**"
---

<!-- akan:generated -->

# Runtime And Build Configuration

Which setting does what, running an app and its logs, and the native commands: the `akan-runtime` skill. Full
contract: `runtimeRule`.

- Settings are declared in `akan.config.ts` and narrowed — never widened — by an env at boot; domain code reaches
  none of them.
- **`main.ts` imports `AkanApp` from `akanjs/server/akanApp`**, not the barrel.
- **Route prefixes move together**: `new AkanApp({ prefix, websocketPrefix })` in `main.ts`, mirrored in
  `api: { … }` in `akan.config.ts` for a CSR shell or native bundle. Read them with `getApiPrefix()` /
  `getWsPrefix()` (`akanjs/base`); never write `/api` or `/ws`, never pass one as a prop.
- A single-language app, or URLs fixed from outside (OAuth callbacks, QR codes, mail links, a migrated site), gets
  unprefixed paths from `i18n: { localePrefix: "as-needed" }` and `<Link>`, never from a raw `<a>`.
- The generated Docker image installs only `ca-certificates` and `tzdata` (add the rest in `docker.preRuns`) and
  runs the server as uid 1000 (`bun`) after its root build steps.
- An app running in two database modes avoids `q.raw`.
- **`akan build` leaves the server env's secrets out of the image**: a string under a secret-named key (password,
  secret, token, apiKey, privateKey, …) or a URL carrying a password in `env/env.server.<env>.ts` is read at boot
  from a variable named after its key path, which the deployment sets (`akan secret-env <app> --env <env>` lists
  them). A secret the file computes or imports stops the build: write the string at the key, or
  `process.env.<NAME>` there.
- Give every log sink a floor (`Logger.addSink(sink, { minLevel })`), and never log per delivered record in anything
  that delivers records.
- **A desktop app's carried server listens on a loopback port any local program can call** — guard it as a network
  server — and ships `private/` and its env readable on the user's computer; read runtime files from `AKAN_APP_DIR`,
  and keep a secret the user gives it with `NativeSecret` (the OS credential store), never in a file.
