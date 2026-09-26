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
- mobile (#mobile)
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

Serving the web

Which domains open the app, and which basePath each one maps to.

Which web surfaces the build produces: SSR pages, the CSR shell, or API only.

Where endpoints and the websocket are mounted. Defaults to `/api` and `/ws`.

The locales the app serves and the default one.

Sizes, formats and allowed sources for the image optimizer.

Which libraries' page folders this app serves as its own routes.

Mobile, data and env

The native app's identity and one target per Capacitor package.

The database modes the build can run in; a deployment picks one with `AKAN_DATABASE_MODE`.

An allowlist of extra env names for browser code. The build does not read it yet.

Private files that ship with `akan upload-env` and stay out of git.

Build and image

Packages kept out of the bundle and installed in the production image.

Extra barrels whose imports the build rewrites to the exact file.

Extra packages the browser build parses only as far as they are used.

The production image. A library adds `preRuns` and `postRuns` only.

Which fonts the build prunes from its `public/` copy. A library sets `keepFonts` only.

Akan plugins the CLI reads for runtime packages, native setup and assets.

Signal endpoints and the websocket. Always served; `web` does not switch it.

Server-rendered pages: the route renderer, its pages and client bundles, and the RSC worker.

The single-file SPA shell that the Capacitor mobile build ships.

What each value builds

The default. Pages and the mobile shell, for an app that also ships a native app.

Pages without the mobile shell, for a web-only app.

API only. Nothing under `page/` or `public/` is served, synced library routes included.

Remote sources the optimizer may fetch. A host not listed is refused.

Local `public/` paths it may serve.

Widths for full-width images. A width in neither size list is refused.

Widths for smaller, fixed-size images such as avatars and icons.

Output formats in order of preference. The first one the browser accepts wins.

Allowed quality values. A request for any other quality is refused.

Minimum cache lifetime in seconds, even when the source asks for less.

Serve SVG sources. Off by default because an SVG can carry script.

Redirects followed while fetching a remote source.

Timeout for fetching a remote source, in milliseconds.

The largest remote source it downloads.

Images encoded at once. `0` uses half the CPUs of the serving machine, at least one.

akan.config.ts Overview

Start from an empty object. Every key you leave out takes a framework default, so add a key only when the default stops fitting:

Every key at a glance

Key

App

Library

Can be declared

Not accepted

Config reference

Types and defaults for every key, including every mobile field.

Multi Client

How routes and basePath split one app into several clients.

Config File Shape

routes

The client this route opens, with pages under `page/<basePath>`. Omit it for a single client.

Hosts that open this route, keyed by branch: `debug`, `develop`, `main` or your own key.

mobile

Values at the mobile root are defaults for every target, and a target overrides only what it sets:

the app name

Display name of the native app.

Android applicationId and iOS bundle id.

User-facing version: Android versionName and the iOS marketing version.

Store build number: Android versionCode and the iOS build number.

one target

One entry per native package. The key is the target's name.

The client this package opens. It must be a basePath declared in `routes`.

Native permissions. Each one turns on the matching plugin's native setup.

database

Mode

Database, queue and cache

SQLite for all three, so no extra server runs.

One SQLite file on a host volume for data, Redis for the queue and cache.

Postgres for data, Redis for the queue and cache.

Declare every mode a deployment of the app may use. The first one is the default:

web

Surface

Value

Built and served

Left out

A web-only app with no native build drops the mobile shell like this:

images

i18n

Locale segments the app serves. Each one prefixes every route.

The fallback when none of the browser's languages match. Must be one of `locales`.

publicEnv

secrets

syncPageLibs

Routes the app serves

The default. No library routes; links from an earlier sync are removed.

Every library dependency that ships a `page/` folder.

Only the libraries listed.

externalLibs

A library declares the packages its own runtime needs the same way:

barrelImports

Already included

The framework facets.

This app's own facets.

The same facets of every library in the workspace.

Add only a barrel outside those facets, such as a design-system package:

optimizeImports

docker

The base image. The object form picks one per architecture.

Steps run before `bun install --production`, so native builds find their tools.

Steps run after the install, before the app files are copied.

The container's `CMD`.

Order of the generated Dockerfile

A whole Dockerfile

When the image must be fully under your control, write the whole Dockerfile as a string and keep the order above:

Library Config Fields

Dependents

Other apps

What a library adds

Appended after the app's own list, without duplicates.

Runs before the app's own steps, unless the app writes `docker` as a string.

Globs against the library's own `public/` whose fonts survive pruning.

Read by the CLI for runtime packages, native setup and assets.

Applied

Not applied

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
  mobile: {
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
  routes: [{ domains: {}, basePath: "shop" }],
  mobile: {
    appName: "Shop",
    appId: "com.koyo.shop",
    version: "1.0.0",
    buildNum: 12,
    targets: {
      shop: {
        basePath: "shop",
        permissions: ["camera", "push"],
      },
    },
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

