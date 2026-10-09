# akan.config.ts

- Source: /conventions/applib/config
- Mirror: /llms/pages/conventions/applib/config.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- akan.config.ts Overview (#akan-config-overview)
- Config File Shape (#config-shape)
- routes (#routes)
- native (#native)
- database (#default-database-mode)
- web (#web)
- images (#images)
- i18n (#i18n)
- publicEnv (#public-env)
- secrets (#secrets)
- syncPageLibs (#sync-page-libs)
- externalLibs (#external-libs)
- barrelImports (#barrel-imports)
- optimizeImports (#optimize-imports)
- docker (#docker)
- Library Config Fields (#library-config-fields)

## Content

akan.config.ts

akan.config.ts Overview

Every app and library keeps one `akan.config.ts` at its root. It declares how that app is served, built and packaged: domains, web surfaces, the native app, the database modes and the Docker image.

Start from an empty object. Every key you leave out takes a framework default, so add a key only when the default stops fitting:

Every key at a glance

An app declares its config as `AppConfig` and a library as `LibConfig`. The sections below cover each key; `api`, `assets` and `plugins` are in the full reference.

Key

App

Library

- Serving the web

  - routes: Which domains open the app, and which basePath each one maps to.

  - web: Which web surfaces the build produces: SSR pages, the CSR shell, or API only.

  - api: Where endpoints and the websocket are mounted. Defaults to `/api` and `/ws`.

  - i18n: The locales the app serves and the default one.

  - images: Sizes, formats and allowed sources for the image optimizer.

  - syncPageLibs: Which libraries' page folders this app serves as its own routes.

- Native apps, data and env

  - native: The iOS, Android and desktop app: its identity, platform settings and targets.

  - database: The database modes the build can run in; a deployment picks one with `AKAN_DATABASE_MODE`.

  - publicEnv: An allowlist of extra env names for browser code. The build does not read it yet.

  - secrets: Private files that ship with `akan upload-env` and stay out of git.

- Build and image

  - externalLibs: Packages kept out of the bundle and installed in the production image.

  - barrelImports: Extra barrels whose imports the build rewrites to the exact file.

  - optimizeImports: Extra packages the browser build parses only as far as they are used.

  - docker: The production image. A library adds `preRuns` and `postRuns` only.

  - assets: Which fonts the build prunes from its `public/` copy. A library sets `keepFonts` only.

  - plugins: Akan plugins the CLI reads for runtime packages, native setup and assets.

Can be declared

Not accepted

Config reference

Types and defaults for every key, including every native field.

Multi Client

How routes and basePath split one app into several clients.

Config File Shape

`AppConfig` and `LibConfig` accept a plain object or a function that returns one. Use an object unless a value depends on the app's own name:

The function form receives `{ name, type }` of the app or library being loaded:

**Same keys.** The function returns exactly what the object form would contain.

**Name and type only.** The argument is `AppConfigContext` (`type: "app"`) or `LibConfigContext` (`type: "lib"`).

**Default export.** Akan reads the file's `export default`; a named export is ignored.

routes

`routes` tells the server which domains open the app. Give each route a `basePath` when one app serves several clients, such as a shop and its admin:

- basePath (string): The client this route opens, with pages under `page/<basePath>`. Omit it for a single client.

- domains ({ [branch]: string[] }): Hosts that open this route, keyed by branch: `debug`, `develop`, `main` or your own key.

**The host picks the client.** A request whose host is listed under a route is served from that route's `basePath`.

**Every branch gets a default host.** For `debug`, `develop`, `main` and any branch key you add, each basePath also answers on `<basePath>-<branch>.<AKAN_PUBLIC_SERVE_DOMAIN>`.

**No basePath, one client.** Without any basePath the app answers on `<app>-<branch>.<AKAN_PUBLIC_SERVE_DOMAIN>` and serves every page under `page/`.

**Declare a basePath here before the native app uses it.** A `basePath` in `native` or one of its targets must be one of the basePaths in `routes`.

native

`native` defines the iOS, Android and desktop app the `@akanjs/native` runtime builds from this app's web surface: its name, bundle id, version and permissions, with what only one platform reads under `ios`, `android` or `desktop`.

One native app is written straight into native. To ship several, add targets: each takes the same fields and overrides native's field by field, merging objects key by key and replacing lists and every other value. Without targets the app has one target, named default:

- appName (string, default the app name): Display name of the native app.

- appId (string, default com.<repo>.<app>): Android applicationId and iOS bundle id.

- version (string, default 0.0.1): User-facing version: Android versionName and the iOS marketing version.

- buildNum (number, default 1): Store build number: Android versionCode and the iOS build number.

- basePath (string): The client the app opens, a basePath declared in `routes`. Leave it out when the app has none.

- permissions (("camera" | "contacts" | "location" | "push" | "speech")[], default []): Native permissions. Each one turns on the matching plugin's native setup.

- targets (Record<string, AkanNativeSettings>, default { default: {} }): One entry per native app, keyed by its name. Each takes the fields of `native` but `targets`.

**More fields.** `indexPath`, `icon`, `splash`, `plugins`, `deepLinks`, `updates` and the platform sections `ios` (Info.plist, entitlements, the privacy manifest, bundle files), `android` (google-services.json, manifest XML, files) and `desktop` (a carried server, kiosk settings) are listed in the config reference.

**Pin a real appId before you ship.** Placeholder ids such as `com.example.*` are usually taken on Apple's portal, and `akan doctor --ios` warns about them.

**Keep the CSR shell on.** The native app ships it, so a `native` section cannot sit beside `web: { csr: false }`.

**Platform setup.** Firebase files, signing and store builds are covered in Mobile Setup.

**Keep signing secrets out of this file.** Keystore paths and signing passwords are machine-specific, so they belong in local-only files or deployment secrets.

database

`database.modes` lists the database modes the app's build can run in. A mode picks the engines behind storage, the queue and the cache; most apps leave the key out and run on `single`:

Mode

Database, queue and cache

SQLite for all three, so no extra server runs.

One SQLite file on a host volume for data, Redis for the queue and cache.

Postgres for data, Redis for the queue and cache.

Declare every mode a deployment of the app may use. The first one is the default:

**A deployment names one of them.** `AKAN_DATABASE_MODE` picks one of the declared modes and no other. With one declared it may be left out; with several, every deployment names one.

**The CLI picks the same way.** `akan start`, `akan build`, `akan script` and `akan console` use the shell's `AKAN_DATABASE_MODE` if set, otherwise the first declared mode.

**Connection values come from the deployment.** `SQLITE_DATABASE_PATH`, `POSTGRES_URL` and the other connection variables win over the same values in `env.server.ts`, and `REDIS_URI` is read from the environment only.

**Drivers follow the declared modes.** `akan build` puts every declared mode's drivers in the production `package.json`: `multiple` adds `bullmq` and `ioredis`, and `cluster` adds `postgres` too.

**Move up only for a real need.** Locally, `multiple` needs Redis and `cluster` needs Redis and Postgres; `akan start` starts them, and `akan dbup` starts what your apps declare. When to switch is explained in Database Mode.

web

`web` decides which browser surfaces the build produces and the server mounts. The API is always served; only the page surfaces switch.

Surface

- API: Signal endpoints and the websocket. Always served; `web` does not switch it.

- SSR: Server-rendered pages: the route renderer, its pages and client bundles, and the RSC worker.

- CSR: The single-file SPA shell that the native mobile build ships.

Value

- What each value builds

  - web: true: The default. Pages and the mobile shell, for an app that also ships a native app.

  - web: { csr: false }: Pages without the mobile shell, for a web-only app.

  - web: false: API only. Nothing under `page/` or `public/` is served, synced library routes included.

Built and served

Left out

A web-only app with no native build drops the mobile shell like this:

**No CSR-only option.** The CSR shell inlines the stylesheet the SSR build compiles, so CSR without SSR would ship an unstyled app.

**Env vars only narrow.** `AKAN_SSR=false` or `AKAN_CSR=false` turns a surface off for one deployment, but cannot turn on one the build left out.

**Dev keeps everything.** `akan start` ignores `web` and serves every surface.

**A native app needs the CSR shell.** Do not combine a `native` section with `web: { csr: false }` or `web: false`; drop one of the two.

images

`images` configures the built-in image optimizer: the widths, formats and qualities it serves, and the sources it may fetch. Write only the fields you change:

- remotePatterns ({ protocol?, hostname?, port?, pathname?, search? }[], default []): Remote sources the optimizer may fetch. A host not listed is refused.

- localPatterns ({ pathname?, search? }[], default [{ pathname: "/**" }]): Local `public/` paths it may serve.

- deviceSizes (number[], default [640, 750, 828, 1080, 1200, 1920, 2048, 3840]): Widths for full-width images. A width in neither size list is refused.

- imageSizes (number[], default [32, 48, 64, 96, 128, 256, 384]): Widths for smaller, fixed-size images such as avatars and icons.

- formats (("image/webp" | "image/avif")[], default ["image/webp"]): Output formats in order of preference. The first one the browser accepts wins.

- qualities (number[], default [75]): Allowed quality values. A request for any other quality is refused.

- minimumCacheTTL (number, default 14400): Minimum cache lifetime in seconds, even when the source asks for less.

- dangerouslyAllowSVG (boolean, default false): Serve SVG sources. Off by default because an SVG can carry script.

- maximumRedirects (number, default 3): Redirects followed while fetching a remote source.

- fetchTimeoutMs (number, default 7000): Timeout for fetching a remote source, in milliseconds.

- maxRemoteBytes (number, default 26214400 (25 MB)): The largest remote source it downloads.

- maxConcurrency (number, default 0): Images encoded at once. `0` uses half the CPUs of the serving machine, at least one.

**A list replaces its default.** Setting `formats` or `remotePatterns` replaces that list; lists you leave out keep their defaults.

**Remote images are closed by default.** `remotePatterns` starts empty, so list every CDN the app shows images from.

**AVIF needs an OS codec.** `image/avif` is encoded only on macOS and Windows; on Linux the optimizer drops it and serves `image/webp`.

i18n

`i18n` lists the languages the app serves. Every route sits under a locale segment such as `/en/…`:

- locales (string[], default ["en", "ko"]): Locale segments the app serves. Each one prefixes every route.

- defaultLocale (string, default "en"): The fallback when none of the browser's languages match. Must be one of `locales`.

**A bare path redirects.** A URL without a locale goes to the best match for the browser's `Accept-Language`, or to `defaultLocale`.

**Only availability lives here.** Translated copy stays in the dictionary or page that owns the text.

**`defaultLocale` must be one of `locales`.** Setting `locales: ["ko", "ja"]` alone leaves the default at `en`, which is no longer listed, so move `defaultLocale` with it.

publicEnv

`publicEnv` is the allowlist of extra environment variable names that browser code may read. Only the names live here; the values stay in the environment:

**`AKAN_PUBLIC_*` is always public.** Every variable with that prefix is inlined into browser bundles without being listed.

**The current build reads only that prefix.** Names listed here are not inlined yet, so give a browser-visible variable the `AKAN_PUBLIC_` prefix.

**Never list a secret.** Database URLs, private tokens and server credentials must never reach browser code.

secrets

`secrets` lists private files that cannot live inside `env.server.*.ts`, such as service-account JSON, certificates and key files. They travel with the env files and stay out of git:

**Globs relative to the app.** `secrets/**/*` means every file under `apps/<app>/secrets/`.

**Shipped with the env files.** `akan upload-env` archives every match together with the default `env/env.client.*.ts` and `env/env.server.*.ts` files, and `akan download-env` restores them to the same paths.

**Ignored by git on upload.** Each `akan upload-env` writes these patterns into a managed block of the workspace `.gitignore`.

**Only the patterns belong in the config. Never commit the files.** The `.gitignore` block appears on the first `akan upload-env`, so check `git status` before committing a new secret file.

syncPageLibs

`syncPageLibs` lets an app serve routes that a library ships in its own `page/` folder. The library keeps the route files; the app only opts in.

Routes the app serves

The default. No library routes; links from an earlier sync are removed.

Every library dependency that ships a `page/` folder.

Only the libraries listed.

To serve only the routes of `libs/shared`:

**Routes keep their own path.** `libs/shared/page/login/_index.tsx` serves `/login` in the app.

**Edit the library, not the link.** The app sees these routes through a generated, git-ignored folder, so changes go in `libs/<lib>/page`.

**One path, one route.** Two synced routes may not resolve to the same path.

externalLibs

`externalLibs` keeps a package out of the bundle and installs it as a real dependency of the production build. Native and runtime-sensitive packages need this; plain TypeScript helpers do not:

A library declares the packages its own runtime needs the same way:

**Merged across the workspace.** The app's list comes first, then every library's, without duplicates, so `apps/media` resolves to `["shiki", "puppeteer"]`.

**Every library counts.** Not only the app's dependencies are read, so a library declares its package once and no app repeats it.

**List the package in the root `package.json` too.** The production `package.json` installs the version pinned there.

barrelImports

A barrel is an index file that re-exports many files. When code imports `X` from a barrel listed in `barrelImports`, the build points the import at the file that defines `X`, so the rest of the barrel is never loaded.

Already included

- akanjs/webkit, akanjs/common, akanjs/ui, akanjs/server: The framework facets.

- @apps/<app>/{ui,webkit,common,client,server}: This app's own facets.

- @libs/<lib>/{ui,webkit,common,client,server}: The same facets of every library in the workspace.

Add only a barrel outside those facets, such as a design-system package:

**Resolved like an import.** The build looks the barrel up in the tsconfig `paths` first, then in `node_modules`.

**Appended, never replacing.** Your entries are added after the defaults above.

optimizeImports

`optimizeImports` names packages whose barrel the browser build parses only as far as you use it. Importing one icon then loads that icon, not the whole set:

**Merged with the defaults.** Your entries are added to the list above.

**`sideEffects: false` needs no entry.** A package whose `package.json` declares it is optimized automatically.

**Keep your own barrels clean.** One file per export makes the result easy to predict.

docker

`docker` shapes the production image that `akan build` writes. Declare it only when the image needs a system package or a different start command.

The generated image installs `ca-certificates` and `tzdata` and nothing else, so `ffmpeg`, a headless browser or a native toolchain goes into `preRuns`:

- image (string | { amd64?, arm64? }, default oven/bun:1-slim): The base image. The object form picks one per architecture.

- preRuns ((string | { amd64?, arm64? })[], default []): Steps run before `bun install --production`, so native builds find their tools.

- postRuns ((string | { amd64?, arm64? })[], default []): Steps run after the install, before the app files are copied.

- command (string[], default ["bun", "main.js"]): The container's `CMD`.

Order of the generated Dockerfile

`FROM` the image, then `ca-certificates`, `tzdata` and the Asia/Seoul timezone.

`preRuns`: the libraries' steps first, then the app's.

Copy `package.json` and run `bun install --production`.

`postRuns`, in the same order.

Copy the app files, set `PORT`, `NODE_ENV`, the `AKAN_PUBLIC_*` values and `AKAN_LOG_TO_FILE=0`, then `CMD`.

**Start with apt-get update.** The base step clears the apt package lists, so each install in `preRuns` refreshes them first.

**Per-architecture steps.** A `{ amd64, arm64 }` entry runs each command only on its own architecture of a multi-arch build.

A whole Dockerfile

When the image must be fully under your control, write the whole Dockerfile as a string and keep the order above:

**Start from a generated one.** `akan build` writes the Dockerfile it would use to `dist/apps/<app>/Dockerfile`, with the `ENV` lines your config produces.

**Some lines depend on the config.** The generated file adds `AKAN_PUBLIC_BASE_PATHS` when routes declare basePaths, and `AKAN_SSR=false` / `AKAN_CSR=false` when `web` turns a surface off.

**A string is used exactly as written.** Nothing is merged into it, including the `preRuns` and `postRuns` your libraries declare.

Library Config Fields

A library's `akan.config.ts` takes the same object or function shape as an app's. What it declares is added to the apps in the workspace, so no app repeats a library's needs:

Dependents

Other apps

What a library adds

- externalLibs: Appended after the app's own list, without duplicates.

- docker.{preRuns,postRuns}: Runs before the app's own steps, unless the app writes `docker` as a string.

- assets.keepFonts: Globs against the library's own `public/` whose fonts survive pruning.

- plugins: Read by the CLI for runtime packages, native setup and assets.

Applied

Not applied

**No image and no command.** A library adds steps only; the base image and `CMD` stay the app's decision.

**A real example.** `libs/util` ships its mobile features this way: `plugins: [pushNotificationPlugin, cameraPlugin, …]`.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: { main: ["www.example.com"] }, basePath: "store" }],
};

export default config;
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = (app) => ({
  native: {
    appName: app.name,
    appId: `com.koyo.${app.name}`,
  },
});

export default config;
```

### apps/shop/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [
    { domains: { main: ["shop.example.com"] }, basePath: "shop" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
};

export default config;
```

### apps/shop/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: {}, basePath: "store" }],
  native: {
    basePath: "store",
    appName: "Shop",
    appId: "com.koyo.shop",
    version: "1.0.0",
    buildNum: 12,
    permissions: ["camera", "push"],
  },
};

export default config;
```

### apps/enterprise/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  database: { modes: ["single", "cluster"] },
};

export default config;
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: { csr: false },
};

export default config;
```

### apps/catalog/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.example.com",
        pathname: "/products/**",
      },
    ],
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
    maxRemoteBytes: 10 * 1024 * 1024,
    maxConcurrency: 2,
  },
};

export default config;
```

### apps/global/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  i18n: {
    defaultLocale: "ko",
    locales: ["ko", "en", "ja"],
  },
};

export default config;
```

### apps/landing/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  publicEnv: ["PUBLIC_ANALYTICS_KEY", "PUBLIC_FEATURE_PREVIEW"],
};

export default config;
```

### apps/api/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  secrets: ["secrets/**/*", "certs/*.pem"],
};

export default config;
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  syncPageLibs: ["shared"],
};

export default config;
```

### apps/media/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
};

export default config;
```

### libs/report/akan.config.ts

```ts
import type { LibConfig } from "akanjs";

const config: LibConfig = {
  externalLibs: ["puppeteer"],
};

export default config;
```

### apps/admin/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  barrelImports: ["@acme/ui"],
};

export default config;
```

### apps/dashboard/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  optimizeImports: ["@phosphor-icons/react"],
};

export default config;
```

### apps/worker/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: {
    image: "oven/bun:1-slim",
    preRuns: [
      "apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick",
    ],
    command: ["bun", "main.js"],
  },
};

export default config;
```

### apps/custom-runtime/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: [
    "FROM oven/bun:1-slim",
    "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata ffmpeg imagemagick",
    "RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime",
    "ARG TARGETARCH",
    "RUN mkdir -p /workspace",
    "WORKDIR /workspace",
    "COPY ./package.json ./package.json",
    "RUN bun install --production",
    "COPY . .",
    "ENV PORT=8282",
    "ENV NODE_ENV=production",
    "ENV AKAN_PUBLIC_REPO_NAME=akanjs",
    "ENV AKAN_PUBLIC_SERVE_DOMAIN=example.com",
    "ENV AKAN_PUBLIC_APP_NAME=custom-runtime",
    "ENV AKAN_PUBLIC_ENV=main",
    "ENV AKAN_PUBLIC_DEFAULT_LOCALE=ko",
    "ENV AKAN_PUBLIC_LOCALES=ko,en",
    "ENV AKAN_PUBLIC_API_PREFIX=/api",
    "ENV AKAN_PUBLIC_WS_PREFIX=/ws",
    "ENV AKAN_PUBLIC_OPERATION_MODE=cloud",
    "ENV AKAN_LOG_TO_FILE=0",
    'CMD ["bun","main.js"]',
  ].join("\n"),
};

export default config;
```

### libs/report/akan.config.ts

```ts
import type { LibConfig } from "akanjs";

const config: LibConfig = {
  externalLibs: ["puppeteer"],
  docker: {
    preRuns: [
      "apt-get update && apt-get install -y --no-install-recommends chromium",
    ],
  },
};

export default config;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

