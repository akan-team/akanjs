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

Which setting does what, running an app and its logs, and the native commands: the `akan-runtime` skill. Read
`runtimeRule` before touching the Docker image, a second database mode, a log sink or a desktop app's server.

- Settings are declared in `akan.config.ts` and narrowed — never widened — by an env at boot; domain code reaches
  none of them.
- **`main.ts` imports `AkanApp` from `akanjs/server/akanApp`**, not the barrel.
- **Route prefixes move together**: `new AkanApp({ prefix, websocketPrefix })` in `main.ts`, mirrored in
  `api: { … }` in `akan.config.ts` for a CSR shell or native bundle. Read them with `getApiPrefix()` /
  `getWsPrefix()` (`akanjs/base`); never write `/api` or `/ws`, never pass one as a prop.
- A single-language app, or URLs fixed from outside (OAuth callbacks, QR codes, mail links, a migrated site), gets
  unprefixed paths from `i18n: { localePrefix: "as-needed" }` and `<Link>`, never from a raw `<a>`.
- **`akan build` leaves the server env's secrets out of the image**: a string under a secret-named key (password,
  secret, token, apiKey, privateKey, …) or a URL carrying a password in `env/env.server.<env>.ts` is read at boot
  from a variable named after its key path, which the deployment sets (`akan secret-env <app> --env <env>` lists
  them). A secret the file computes or imports stops the build: write the string at the key, or
  `process.env.<NAME>` there.
- `akan sync` writes a missing, gitignored `env/env.<side>.<env>.ts`: in a git worktree a copy of the main
  checkout's. Never symlink one from another checkout: its `../lib/option` import resolves over there.
