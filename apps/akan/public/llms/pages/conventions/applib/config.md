# akan.config.ts

- Source: /conventions/applib/config
- Mirror: /llms/pages/conventions/applib/config.md
- Section: conventions
- Category: App & Library
- Priority: P1

## Headings

- Akan Config Overview (#akan-config-overview)
- Config File Shape (#config-shape)
- routes (#routes)
- mobile (#mobile)
- defaultDatabaseMode (#default-database-mode)
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

Akan Config Overview

akan.config.ts is the app or library configuration entry point. Akan uses it to prepare server, web, mobile app, database, build, image, and environment behavior.

You can start with an empty config. Akan treats the file as partial settings and fills missing fields with framework defaults.

Config File Shape

AppConfig and LibConfig can be plain objects or functions. Use a plain object for most cases. Use a function when the config needs the app or library metadata while it is being loaded.

routes

routes connects domains and basePath values to one app. Use it when one Akan app needs to serve several brands, services, or entry paths.

Akan normalizes basePath values, collects domains, adds branch names, and creates default development domains when no explicit domain is provided.

If mobile targets use basePath, define that basePath in routes first. Akan validates mobile target basePath values against the route list.

mobile

mobile defines the native app identity and target-specific packaging settings used when a web surface is shipped through Capacitor.

Missing values fall back to app name, com.<app>.app, version 0.0.1, build number 1, and a default target. Target basePath must exist in routes.

Keep local keystore paths and private signing values out of shared examples. Put machine-specific values in local-only files or deployment secrets.

defaultDatabaseMode

defaultDatabaseMode chooses the app's default database operating model. Most apps can leave it empty and use the single database default.

Akan stores the resolved mode in the app scan result so database-related commands and runtime setup can share the same default.

Only customize this when your deployment model really needs separated or clustered database behavior. For details, see

Database Mode

.

web

web declares which browser surfaces this app builds and serves, as true | false | { csr: boolean }. false is an api-only app; true, the default, is both surfaces; the object form keeps SSR and toggles only the CSR bundle. SSR is the RSC route renderer with its pages bundle, client bundles and RSC worker process; CSR is the single-file SPA bundle the Capacitor mobile build ships. The API is always served and is not part of this switch.

Turning a surface off removes its build phase, so the deployment image never carries the artifact — and the runtime never mounts the routes that read it. There is no CSR-without-SSR option, by type: the CSR bundle inlines the stylesheet the SSR build compiles, so it would ship an unstyled app.

An api-only build writes no route artifact, skips the RSC worker entrypoint, and leaves public/ out of the image, because the web router's catch-all is its only reader. Nothing under page/ is served, including routes a library contributed through syncPageLibs.

AKAN_SSR and AKAN_CSR narrow the same two surfaces per deployment. They only narrow: a surface the build left out cannot be switched back on, and the boot log names what the process ended up serving. The generated Dockerfile writes the build's own answer as the image default.

Turning CSR off is refused when the app declares mobile targets, because akan build-ios copies dist/apps/<app>/csr/<target>.html into the native project.

akan start ignores web and keeps the whole dev surface: the incremental builder is also the file watcher, so switching it off would take server-code HMR with it. It warns once when the config and the dev server disagree.

images

images configures Akan's optimized image pipeline. It controls allowed image sizes, output formats, remote sources, local paths, redirects, timeout, and byte limits.

Akan merges your image config with defaults. List fields such as deviceSizes, imageSizes, formats, remotePatterns, and localPatterns keep defaults unless you replace them.

i18n

i18n defines the locales your app supports and the default locale used when no user preference is resolved.

Akan writes the resolved default locale and locale list to AKAN_PUBLIC_DEFAULT_LOCALE and AKAN_PUBLIC_LOCALES for build/runtime use.

Keep i18n here for app-level language availability. Put actual translated copy in the page, dictionary, or localization layer that owns the text.

publicEnv

publicEnv lists environment keys that are allowed to be exposed to browser code. Treat it as an allowlist for public-safe values.

Akan keeps the list in resolved app config so build and runtime code know which env values may cross the server-to-browser boundary.

Never include secrets, database URLs, private tokens, or server credentials in publicEnv.

secrets

secrets lists glob patterns for private files that must ship to the cloud alongside the default env/ files. On `akan upload-env` Akan bundles every matched file into the env archive, and `akan download-env` restores them to the same paths.

Patterns are resolved relative to the app directory. Akan also syncs them into a managed block in the workspace root .gitignore on upload-env, so declaring a pattern here is enough to both ship and git-ignore the files. You do not maintain .gitignore separately.

Use secrets for private key files, service-account JSON, or certificates that env.server.* cannot inline. The default env/env.(client|server).*.ts files are always included, so you only list extra paths here.

Only the glob patterns live in akan.config.ts. The matched files stay local and git-ignored — never commit their contents. Removing a pattern also removes it from the managed .gitignore block on the next upload-env.

syncPageLibs

syncPageLibs declares which library page folders this app serves. On akan sync, each selected library is linked into apps/<app>/page/(libs)/(<lib>), so the library keeps ownership of its routes and the app only opts in.

true takes every library dependency that ships a page folder, an array takes exactly the libraries listed, and false (the default) syncs nothing and removes what an earlier sync created.

The linked folder is generated and gitignored, so edit the library source instead. An explicit list fails the sync when a named library is not a dependency or has no page folder, while true simply skips libraries without one.

externalLibs

externalLibs marks dependencies that should not be bundled into app code. When declared here, Akan installs them as separate packages during the production build.

Akan includes externalLibs in the production package dependencies together with the required SSR runtime packages.

Use this for native or runtime-sensitive packages. Normal TypeScript helpers usually do not need externalLibs.

barrelImports

barrelImports adds import roots that should be treated as barrel folders. Akan already includes framework barrels and the standard barrel folders from each app and library.

Akan starts with framework defaults such as akanjs/webkit, akanjs/common, akanjs/ui, akanjs/client, and akanjs/server. It also adds @apps/<app>/{ui,webkit,common,client,server} and the same folders from every used @libs/<lib>. Your custom entries are appended after those defaults.

Most ui, webkit, common, client, and server folders are already covered. Add this only for a custom barrel outside the standard facets.

optimizeImports

optimizeImports tells Akan which packages or barrels should participate in optimized import handling so pages load only what they use. Akan already includes common UI, icon, chart, hook, and utility packages by default.

Akan merges your entries with default optimized packages such as lucide-react, date-fns, lodash-es, ramda, antd, ahooks, Heroicons, MUI, Recharts, react-use, Tabler icons, and react-icons/*, then removes duplicates.

Pair this with a clean barrel shape. One file per export makes optimized imports easier to reason about.

docker

docker customizes the production container Akan generates for an app. Use it only when deployment needs extra system packages or a different startup command.

Akan builds Dockerfile content from the base image, your run scripts, app env values, base paths, locale values, and command. The generated image installs ca-certificates and tzdata and nothing else, so an app that needs a headless browser, ffmpeg, or a native toolchain declares it in preRuns.

docker is either those parts or a whole Dockerfile written as a string. preRuns run before bun install --production, so build tools a native dependency needs are present for it; postRuns run after it, before app files are copied. image and each run entry also take a per-architecture object, which compiles to a TARGETARCH guard.

The string form is useful when the deployment image must be fully controlled. It is used exactly as written, so nothing is merged into it — including the preRuns a library contributes. Keep the default Dockerfile flow when possible: install runtime packages, install production dependencies, copy app files, set Akan public env values, then define CMD.

Library Config Fields

LibConfig uses the same partial object or function shape, and its practical surface is externalLibs and docker. Use externalLibs when a shared library wraps a dependency that must be available in production runtime packaging.

docker declares the image steps the library's own runtime needs, as preRuns and postRuns only — the base image and the command stay the app's decision. Library steps are emitted before the app's own, and a step declared on both sides becomes one layer.

Akan resolves missing values to an empty list and merges every workspace library's externalLibs and docker steps into each app, so an app that uses the library does not repeat the declaration. An app whose docker is a whole Dockerfile string takes neither.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;
```

### object config

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: { main: ["www.example.com"] }, basePath: "store" }],
};

export default config;
```

### function config

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = (app) => ({
  mobile: {
    appName: app.name,
    appId: `com.${app.name}.app`,
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
    appId: "com.example.shop",
    version: "1.0.0",
    buildNum: 12,
    targets: {
      shop: {
        name: "shop",
        basePath: "shop",
        appName: "Shop",
        appId: "com.example.shop",
        version: "1.0.0",
        buildNum: 12,
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
  defaultDatabaseMode: "multiple",
};

export default config;
```

### web without the mobile bundle

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: { csr: false },
};

export default config;
```

### api-only deployment

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: false,
};

export default config;
```

### apps/catalog/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.example.com", pathname: "/products/**" },
    ],
    formats: ["image/webp"],
    minimumCacheTTL: 86400,
    maxRemoteBytes: 10 * 1024 * 1024,
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

### .gitignore (auto-synced)

```ts
# akan:secrets (managed by akan.config.ts — do not edit)
apps/api/certs/*.pem
apps/api/secrets/**/*
# akan:secrets:end
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
  externalLibs: ["puppeteer"],
};

export default config;
```

### apps/admin/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  barrelImports: ["@pkgs/mypkg/ui/icons"],
};

export default config;
```

### apps/dashboard/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  optimizeImports: ["barrel-library"],
};

export default config;
```

### apps/worker/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: {
    image: "oven/bun:1-slim",
    preRuns: ["apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick"],
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
    "ENV AKAN_PUBLIC_OPERATION_MODE=cloud",
    "",
    'CMD ["bun","main.js"]',
  ].join("\n"),
};

export default config;
```

### libs/shared/akan.config.ts

```ts
import type { LibConfig } from "akanjs";

const config: LibConfig = {
  externalLibs: ["puppeteer"],
  docker: {
    preRuns: ["apt-get update && apt-get install -y --no-install-recommends chromium"],
  },
};

export default config;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

