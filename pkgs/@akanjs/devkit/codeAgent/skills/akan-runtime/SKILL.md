---
name: akan-runtime
description: "Configure how an app runs: web surfaces, route prefixes, gateway vs solo, akan start and logs, the Docker image, native and desktop apps, database modes, ops, assets and the build pipeline."
---

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
| A secret of `env/env.server.<env>.ts` in a deployed server | nothing to declare: `akan build` leaves it out and the server reads it from a variable named after its key path; `akan secret-env <app> --env <env>` lists them |
| URLs without `/<locale>/`: one language, or paths fixed from outside (OAuth callback, QR code, mail link) | `i18n: { localePrefix: "as-needed" }` — the default locale's pages and `<Link>` hrefs drop the prefix, other locales keep it |

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

## Secrets in a deployed server

- Write secrets in `env/env.server.<env>.ts` as before. `akan build` replaces each string under a secret-named key,
  and each URL carrying a password, with a read of an environment variable: `security.sso.google.clientSecret` is
  `SECURITY__SSO__GOOGLE__CLIENT_SECRET`, an array holding a secret is one JSON variable, `security.jwtSecret` is
  `JWT_SECRET`. The built files hold the names (`AKAN_ENV_NAMES` in `akan.env.json`), never the values.
- `akan secret-env <app> --env <env>` prints the variables, never a value. `--out <file> --format k8s --name <name>`
  writes a Kubernetes Secret for `envFrom`, `--format dotenv` a file for `bun --env-file`. Never write it
  under `dist/` or a tracked path, and delete it once applied.
- At boot a variable left unset is one warning naming it. The framework does not stop for it, though whatever reads the value may; 3.5.0 will refuse to boot.
- A secret the env file computes or imports stops the build, whatever its length: write the string at the key, or
  `process.env.<NAME>` there, which the build leaves as that read. A secret string a plain key or the app's code
  holds as well stops it too when long and mixed, and is a warning when short. A key the name rule misses
  (`stripeKey`) stays in the image unless read from `process.env`.
- The build loads the env file to list the secrets, with the shell's variables only when it cannot load without
  them; a file that throws as it loads stops the build by error class and line.
- `akan start`, `akan test`, `akan build --profile …` and desktop and mobile builds read the env file as written.
  `akan build --inline-secrets` keeps the values in the image for one release, for a deployment not ready yet.
- Give every log sink a floor (`Logger.addSink(sink, { minLevel })`) and never log once per delivered record.

## Native and desktop

- `akan start-desktop <app>`, `akan start-ios <app>`, `akan start-android <app>` load pages from a running
  `akan start`; a desktop app carrying its server starts it itself.
- A desktop app's carried server listens on a loopback port any local program can call — guard it like a network
  server. Read runtime files from `AKAN_APP_DIR`, and keep a user's secret with `NativeSecret`, never in a file.

Full detail: `get_guideline` with `runtimeRule`.
