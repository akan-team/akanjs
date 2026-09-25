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

Akan includes externalLibs in the production package dependencies together with required SSR and native runtime packages.

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

Akan builds Dockerfile content from the base image, default system packages, your run scripts, app env values, base paths, locale values, and command.

docker.content is useful when the deployment image must be fully controlled. Keep the default Dockerfile flow when possible: install runtime packages, install production dependencies, copy app files, set Akan public env values, then define CMD.

Library Config Fields

LibConfig uses the same partial object or function shape, but its current practical surface is externalLibs. Use it when a shared library wraps a dependency that must be available in production runtime packaging.

Akan resolves missing values to an empty list and stores the result with the library scan result.

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
  externalLibs: ["sharp"],
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
    preRuns: ["apt-get install -y --no-install-recommends imagemagick"],
    command: ["bun", "main.js"],
  },
};

export default config;
```

### apps/custom-runtime/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  docker: {
    content: [
      "FROM oven/bun:1-slim",
      "RUN ln -sf /usr/share/zoneinfo/Asia/Seoul /etc/localtime",
      "RUN apt-get update && apt-get upgrade -y",
      "RUN apt-get install -y --no-install-recommends git redis build-essential python3 ca-certificates ffmpeg imagemagick",
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
  },
};

export default config;
```

### libs/shared/akan.config.ts

```ts
import type { LibConfig } from "akanjs";

const config: LibConfig = {
  externalLibs: ["sharp"],
};

export default config;
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

