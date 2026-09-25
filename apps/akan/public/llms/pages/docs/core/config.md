# App Config

- Source: /docs/core/config
- Mirror: /llms/pages/docs/core/config.md
- Section: docs
- Category: Core Concepts
- Priority: P0

## Headings

- App Config (#app-config)
- Config Shape (#config-shape)
- Application Env (#app-env)
- Routes and Domains (#routes)
- Mobile Metadata (#mobile)
- Images And Public Env (#images-env)
- Secret Files (#secret-files)
- Build And Runtime (#build-runtime)
- Defaults And Rules (#defaults)

## Content

App Config

akan.config.ts is the app-level settings file. You do not need to understand every option on day one. Start with an empty file, then add only the fields your app actually needs.

Domains

App identity

Env values

Image rules

Browser env

Secret files

Build options

Start small

Most defaults are already prepared, so an empty config is valid.

Add only what changes

Define only the parts your app actually needs to customize.

One source of truth

CLI commands, production builds, and mobile commands all read this file.

Config Shape

The default export can be a plain object or a function. Use an object for most apps. Use a function only when the config needs app metadata while it is being loaded.

Object config

Function config

Akan treats config as partial settings. Missing fields are filled with framework defaults.

Application Env

akan.config.ts describes how the app is built and routed. The env/ folder describes the actual values the app uses at runtime, such as public client keys, server-only options, and environment-specific service settings.

Values used by browser or client-side code. Keep only public-safe values here, such as map keys, site keys, or feature switches.

Values used only by server-side modules. Put server options, connection settings, and private service configuration here.

Each suffix is selected by AKAN_PUBLIC_ENV. Use local for your machine, testing for tests, debug/develop for shared stages, and main for production.

Type files define the shape of env values, so missing or misspelled settings can be caught while coding.

Client env and publicEnv are different. env.client.* stores app values for each environment, while publicEnv only allows selected process.env names to be exposed to browser builds.

Server env can also include options from shared libraries through env.server.type.ts. This lets an app keep one final server env object while reusing library-level defaults.

Routes and Domains

routes is where you list the public domains for the app. If your app has several clients, each route can also name the client with basePath. The multi-client page explains that structure in detail; here we focus on the config fields.

Optional client name for this route. Akan normalizes /store/ to store.

A map of environment names to domains. debug, develop, and main exist by default, and custom branches such as qa can be added.

If you declare basePath, the page folder must follow the same name. See Multi Client for the full page layout rule.

Mobile Metadata

mobile describes the native app identity used by Android and iOS commands. Think of it as the name, package id, and version information that will appear in native app projects.

Display name used for the native app. At the mobile root it becomes the default for every target; inside a target it overrides the display name for that package.

Native package identifier, such as com.example.app. Android uses it as applicationId/package name and iOS uses it as bundle id. Firebase Android/iOS app registration must use the same value.

User-facing native app version, mapped to Android versionName and iOS MARKETING_VERSION. Target value overrides the mobile root value.

Store build number, mapped to Android versionCode and iOS CURRENT_PROJECT_VERSION. Increase it for each native store release.

Named mobile packages built from the same Akan app. Each target can select a basePath, fallback indexPath, identity overrides, permissions, files, assets, and deepLinks.

Client/basePath opened by this native package. Use it when one Akan app ships separate customer/admin/partner mobile apps. It should match a configured route basePath.

Initial or fallback CSR path for the target. Akan uses it for mobile startup, deep link stack recovery, and back-button fallback.

Native permission hints used by devkit. Supported values are camera, contacts, location, and push. Declare push before using usePushNotification on native apps.

Optional app icon and splash image source paths, relative to the app root. Use icon and splash when the native package needs custom branding.

Native file copy map. Keys are generated native project paths and values are app-relative source paths. Use it for google-services.json, GoogleService-Info.plist, or other native config files.

Native URL schemes and verified HTTPS app links for a mobile target. iOS app links require teamId; Android app links require SHA-256 certificate fingerprints for release verification.

Custom URL schemes such as example://. Use simple lower-case app schemes and avoid schemes owned by other apps.

HTTPS app-link/universal-link domains. Akan can serve association files, but iOS still needs teamId and Android release verification needs SHA-256 fingerprints.

Apple Developer Team ID used for apple-app-site-association. Required for universal links on real iOS apps.

Signing certificate SHA-256 fingerprints used by assetlinks.json. Use debug fingerprints for local testing and release fingerprints for Play Store builds.

Passthrough Capacitor config fields. Use them only when a Capacitor plugin requires native configuration not covered by Akan's higher-level fields.

files maps native target paths to app-relative source files. It is useful for Firebase push config files such as google-services.json and GoogleService-Info.plist. Keep server service account JSON out of client/native file mappings. For platform setup steps, see

Mobile Development

.

When a multi-client app needs separate mobile apps per client, define mobile targets with basePath. The Multi Client page shows that pattern.

Images And Public Env

images controls the allow-list for optimized remote images. publicEnv is an allow-list for extra browser-visible environment variables beyond the built-in AKAN_PUBLIC_* pattern.

publicEnv does not store values. It only says which environment variable names are safe to expose to browser builds.

Secret Files

Some private values cannot live inside env.server.*.ts, such as service-account JSON, TLS certificates, or private key files. The secrets field lists glob patterns for these files so Akan ships them together with the env/ folder.

akan upload-env archives every matched file, and akan download-env restores them. Patterns are resolved relative to the app directory, and Akan syncs them into a managed block in the root .gitignore, so one declaration both deploys and git-ignores the files.

publicEnv exposes variable names to the browser; secrets does the opposite. Only glob patterns live in config — the matched files stay local and git-ignored, so never commit their contents.

Build And Runtime

Some config fields are mainly for the build system and production runtime. Most apps do not need to touch them, but they are useful when a package must stay external, imports need optimization, or the Docker image needs customization.

Packages kept as production runtime dependencies instead of only being bundled.

Extra packages whose imports should be optimized by the client build.

Barrel import paths that Akan can flatten while scanning and bundling.

Fallback database mode for commands that do not receive AKAN_DATABASE_MODE from the environment.

Defaults And Rules

Akan resolves the final app config by merging your file with framework defaults. For a first app, keep these rules in mind before adding advanced options.

Environment values

Put runtime values in env/ before adding config fields. Use client env for public values and server env for private server options.

Routes

Skip routes until you need custom domains or multiple clients.

Mobile

appName defaults to the app name, appId defaults to com.appName.app, version defaults to 0.0.1, and buildNum defaults to 1.

Images

Remote images are blocked unless remotePatterns allow them. WebP and quality 75 are used by default.

i18n

Only configure i18n when your app needs to change the default locale behavior.

Recommended order: start with an empty config, fill env/ values as the app needs them, add routes when domains are needed, add mobile when native apps are needed, and add advanced build options only after the default build is not enough.

## Code Examples

### apps/minimal/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {};

export default config;
```

### Code

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [{ domains: { main: ["www.example.com"] }, basePath: "store" }],
};

export default config;
```

### Code

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = (app) => ({
  mobile: {
    appName: app.name,
    appId: "com.example.app",
  },
});

export default config;
```

### env/env.client.local.ts

```ts
import { getEnv } from "akanjs/base";

import type { AppClientEnv } from "./env.client.type";

export const env: AppClientEnv = {
  ...getEnv(),
  google: {
    mapKey: "local-map-key",
  },
} as const;
```

### env/env.server.local.ts

```ts
import { getEnv } from "akanjs/base";

import type { ModulesOptions } from "../lib/option";

export const env: ModulesOptions = {
  ...getEnv(),
  hostname: null,
  security: {
    verifies: [["password", "phone"]],
    sso: {},
  },
};
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  externalLibs: ["shiki"],
  routes: [
    { domains: { main: ["www.akanjs.com", "akanjs.com"] }, basePath: "akanjs" },
    { domains: { main: ["soft.akanjs.com"] }, basePath: "soft" },
    { domains: { main: ["office.akanjs.com"] }, basePath: "office" },
  ],
};

export default config;
```

### Mobile config

```ts
const config: AppConfig = {
  mobile: {
    appName: "Example",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        basePath: "store",
        indexPath: "/explore",
        permissions: ["camera", "push"],
        assets: {
          icon: "public/icon.png",
          splash: "public/splash.png",
        },
        files: {
          android: {
            "app/google-services.json": "public/google-services.json",
          },
          ios: {
            "App/GoogleService-Info.plist": "public/GoogleService-Info.plist",
          },
        },
        deepLinks: {
          schemes: ["example"],
          domains: ["example.com"],
          ios: {
            teamId: "TEAMID",
          },
          android: {
            sha256CertFingerprints: [
              "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
            ],
          },
        },
      },
    },
    android: {
      buildOptions: {
        releaseType: "APK",
      },
    },
  },
};
```

### mobile target files

```ts
const config: AppConfig = {
  mobile: {
    appName: "Shop",
    appId: "com.example.shop",
    targets: {
      default: {
        permissions: ["push"],
        files: {
          android: {
            "app/google-services.json": "public/google-services.json",
          },
          ios: {
            "App/GoogleService-Info.plist": "public/GoogleService-Info.plist",
          },
        },
      },
    },
  },
};
```

### images

```ts
const config: AppConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "asset.example.com" }],
    qualities: [75, 90],
    dangerouslyAllowSVG: false,
  },
};
```

### publicEnv

```ts
const config: AppConfig = {
  publicEnv: ["AKAN_PUBLIC_FEATURE", "BUN_PUBLIC_*"],
};
```

### secrets

```ts
const config: AppConfig = {
  secrets: ["secrets/**/*", "certs/*.pem"],
};
```

### .gitignore (auto-synced on upload-env)

```ts
# akan:secrets (managed by akan.config.ts — do not edit)
apps/api/certs/*.pem
apps/api/secrets/**/*
# akan:secrets:end
```

### Build and runtime fields

```ts
const config: AppConfig = {
  externalLibs: ["shiki"],
  optimizeImports: ["custom-icons"],
  barrelImports: ["@acme/ui"],
  defaultDatabaseMode: "single",
  docker: {
    image: { amd64: "oven/bun:amd64", arm64: "oven/bun:arm64" },
    preRuns: ["echo before"],
    postRuns: ["echo after"],
    command: ["bun", "main.js"],
  },
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

