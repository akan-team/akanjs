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
- Server Option (#server-option)
- Routes and Domains (#routes)
- Web Surfaces And Prefixes (#web-surfaces)
- Native Apps (#native)
- Images And Public Env (#images-env)
- Secret Files (#secret-files)
- Build And Runtime (#build-runtime)
- Defaults And Rules (#defaults)

## Content

App Config

akan.config.ts is the app-level settings file. You do not need to understand every option on day one. Start with an empty file, then add only the fields your app actually needs.

This is the whole key set. Every one of them has a default that a working app can live with, and the slides below cover the ones you are most likely to change:

- routes (AkanRouteConfig[]): Public domains for the app, optionally split per client with basePath.

- api ({ prefix, websocketPrefix }, default /api, /ws): Where signal endpoints and the websocket upgrade are mounted. Baked into every client bundle.

- web (boolean | { csr: boolean }, default true): Which web surfaces the build produces and the app mounts at boot.

- i18n ({ defaultLocale, locales }, default en, ["en", "ko"]): The locale segment every route sits under. defaultLocale must be one of locales.

- native (AkanNativeAppConfig): The iOS, Android and desktop app: its identity, platform settings and targets.

- images (AkanImageConfig, default webp, quality 75): Allow-list, sizes, and limits for the image optimizer. A remote host not listed is refused.

- publicEnv (string[], default []): Extra process.env names the browser build may inline, beyond the built-in AKAN_PUBLIC_* pattern.

- secrets (string[], default []): Globs for files that cannot live inside env.server.*.ts. Shipped by upload-env and git-ignored.

- assets ({ pruneFonts, keepFonts }, default true, []): How akan build trims the public/ copy it ships. Source trees are never touched.

- syncPageLibs (string[] | boolean, default false): Which library page folders this app mounts as its own routes.

- plugins (AkanPlugin[], default []): Akan plugins this app contributes, read live by the CLI.

- docker (string | DockerImageConfig, default oven/bun:1-slim): A whole Dockerfile as a string, or the parts akan build assembles one from.

- database ({ modes: DatabaseMode[] }, default { modes: ["single"] }): The modes the build can run in; each deployment picks one with AKAN_DATABASE_MODE.

- externalLibs (string[], default []): Packages kept as production runtime dependencies instead of being bundled.

- trustedDependencies (string[], default []): Packages whose install scripts bun install --production runs, in the image and in a desktop app's server.

- bin (Record<string, { [platform]: AkanBinSource }>, default {}): Executables every desktop build carries, per platform, first on its PATH; the image ignores it.

- barrelImports (string[], default akanjs + workspace): Barrel paths Akan flattens while scanning and bundling.

- optimizeImports (string[], default built-in list): Extra packages whose imports the client build rewrites to the exact source file.

Start small

Most defaults are already prepared, so an empty config is valid.

Add only what changes

Define only the parts your app actually needs to customize.

One source of truth

CLI commands, production builds, and native app commands all read this file.

Config Shape

The default export can be a plain object or a function. Use an object for most apps. Use a function only when the config needs app metadata while it is being loaded.

Object config

Function config

Akan treats config as partial settings. Missing fields are filled with framework defaults.

Application Env

akan.config.ts describes how the app is built and routed. The env/ folder describes the actual values the app uses at runtime, such as public client keys, server-only options, and environment-specific service settings.

File

- env.client.*: Public-safe values for client code, such as map keys, site keys, or feature switches.

- env.server.*: Server-only values: server options, connection settings, private service configuration.

- local, testing, debug, develop, main: Suffixes chosen by AKAN_PUBLIC_ENV: your machine, tests, two shared stages, production.

- env.*.type.ts: The shape of env values, so a missing or misspelled setting is caught while coding.

Client env and publicEnv are different. env.client.* stores app values for each environment, while publicEnv only allows selected process.env names to be exposed to browser builds.

Server env can also include options from shared libraries through env.server.type.ts. This lets an app keep one final server env object while reusing library-level defaults.

Server Option

lib/option.ts is where the app configures its server. env/ holds the values, akan.config.ts holds the build, and this file wires them into the runtime: use objects, signal middleware, adaptor overrides, web proxies, the MCP server, the agent relay's access policy, and the LLM that relay speaks to. Every library the app depends on brings its own option.ts, read in mount order with the app's last — so an app tightens what a library declared without restating it.

Stage

- setLlm: apiKey, model, and host for whichever adaptor holds LlmAdaptorRole.

- setAgentAccess: Guards (ANDed) for spending the LLM key via runAgentTurn; with none, every call is refused.

- setMcp: MCP server settings such as instructions, readOnly, and auth.

- use, applyMiddleware, applyAdaptor, applyWebProxy: Register env-derived use<T>() singletons, signal middleware, adaptor overrides, web proxies.

Read the LLM key from the env object, never write it in option.ts: env.server.* is gitignored, this file is not.

Each of these has an env spelling too (AKAN_MCP_*, AKAN_AGENT), for a deployment that must configure what the source does not. A value written in option.ts wins over the env of the same name.

Routes and Domains

routes is where you list the public domains for the app. If your app has several clients, each route can also name the client with basePath. The multi-client page explains that structure in detail; here we focus on the config fields.

- basePath (string): The client this route opens and its first page folder; without one, the route is the app.

- domains (Record<branch, string[]>, default {}): Hosts that open this route, keyed by branch: debug, develop, main, or any key you add.

If you declare basePath, the page folder must follow the same name. See Multi Client for the full page layout rule.

Web Surfaces And Prefixes

web decides which web surfaces the build produces, and api decides where the server mounts its endpoints. Both are declared here rather than only in main.ts, because both are baked into the client bundles: a prebuilt CSR shell or a native app never reaches a server that could tell it otherwise.

- web (boolean | { csr: boolean }, default true): true builds SSR and CSR, false is API-only, and { csr: false } drops only the CSR shell.

- api.prefix (string, default /api): Where signal endpoints are mounted; read it back with getApiPrefix() from akanjs/base.

- api.websocketPrefix (string, default /ws): Where the websocket upgrade sits; read it back with getWsPrefix().

Never write either prefix as a literal; new AkanApp({ prefix, websocketPrefix }) still overrides both for the server and every page it renders.

AKAN_SSR and AKAN_CSR narrow the same choice at boot, and can only narrow it: a deployment cannot switch on a surface the build left out. akan start ignores web entirely, so the dev surface stays whole.

A native app ships the CSR shell, so web: { csr: false } and a native section do not go together — drop the native section or leave CSR on.

Native Apps

native describes the app the Android, iOS and desktop commands build from this app's CSR client: its name, package id, version, permissions and plugins. A value only one platform reads sits in that platform's section, ios, android or desktop.

An app without basePaths leaves basePath out, and an app that ships one native app needs no targets. So the shortest config for a desktop app that carries the app's server is this:

When the first page is not /, add indexPath beside it: native: { indexPath: "/board", desktop: { server: true } }. When one platform starts elsewhere, give that platform section its own: native: { indexPath: "/mobile", desktop: { indexPath: "/", server: true } } opens the phones on /mobile and the desktop app on /.

Targets

targets builds several native apps from one Akan app, such as a store app and an admin app that each open their own basePath. A target takes every field of native but targets, and its own values win: objects (deepLinks, updates, ios, android, desktop and the objects inside them) merge key by key, while lists, icon, splash and every other value are replaced, so a target's permissions replace native's instead of adding to them. Without targets the app has one target, named default, or named after the app and opening that basePath when routes declares one with the app's name.

- basePath (string): The client the app opens, a basePath routes declares. An app without basePaths leaves it out.

- indexPath (string, default /): Start path, and where a deep link's stack and a back with no history fall back to. ios.indexPath, android.indexPath and desktop.indexPath win on their platform.

- appName (string, default the app name): Display name of the native app.

- appId (string | { default?, ios?, android?, macos?, windows?, linux? }, default com.<repo>.<app>): Android applicationId and iOS bundle id; one per platform when the store listings already differ.

- fileName (string, default the app folder name): Name of the executables and archives: letters, digits, `.`, `_` and `-`.

- version (string, default 0.0.1): User-facing app version, written to Android versionName and iOS MARKETING_VERSION.

- buildNum (number, default 1): Store build number, written to Android versionCode and iOS CURRENT_PROJECT_VERSION.

- icon (string | { image, backgroundColor? }): A square PNG relative to the app folder, or it with the color behind its transparent areas.

- splash (string | { image?, backgroundColor?, autoHide?, timeout? }): A PNG shown centered at launch, or the launch screen's image, color and when it hides.

- permissions (camera | contacts | location | push | speech, default []): Native permission hints; each activates the matching plugin's native configuration.

- plugins (string[], default []): Runtime plugins beyond the ones the permissions bring, by builtin id (iap) or absolute folder.

- deepLinks.schemes (string[]): Custom URL schemes such as example://.

- deepLinks.domains (string[]): App-link and universal-link hosts, normalized to the bare host.

- updates ({ url, publicKey, channel?, readyTimeout? }): Where installed apps find new releases: a phone updates itself, a desktop app when it calls updates.

- updates.url (string): A static base URL, such as a storage bucket, holding what akan publish-update writes; https in a release build.

- updates.publicKey (string): The public key akan update-keygen prints; an app takes no release it cannot verify with it.

- updates.channel (string, default the --env it is built with): The channel the app follows; unset, only releases of the env it was built with. A pilot target names its own.

- updates.readyTimeout (number, default 10000): How long, in ms, a release on trial has to mount its first page before it is rolled back.

- ios.teamId (string): Apple Developer Team ID for apple-app-site-association; universal links need it.

- ios.infoPlist (Record<string, AkanNativeValue>): Info.plist keys added to the iOS app.

- ios.entitlements (Record<string, AkanNativeValue>): Entitlements added to the iOS app.

- ios.privacy ({ tracking?, trackingDomains?, collectedDataTypes?, accessedApis? }): The app's part of the privacy manifest, PrivacyInfo.xcprivacy, which an App Store upload requires.

- ios.files (Record<string, string>): Files copied into the app bundle, keyed by their path there; the value is app-relative.

- android.sha256CertFingerprints (string[]): assetlinks.json signing fingerprints: debug for a local build, release for Play Store.

- android.googleServices (string): The google-services.json FCM push reads, relative to the app folder.

- android.push ({ channel?, smallIcon?, color? }): The channel pushes arrive in, the status bar icon (an app-relative PNG) and the accent color.

- android.autoplay (boolean, default false): Media plays with sound without a tap first, as it does on iOS and the desktop.

- android.manifest (string[]): XML added at the <manifest> level, with the applicationId placeholder filled in.

- android.application (string[]): XML added inside <application>.

- android.activity (string[]): XML added inside the app's activity.

- android.files (Record<string, string>): Files copied into the app, keyed res/<type>/<file> or assets/<path>; the value is app-relative.

- desktop.server (boolean | { omit?: string[] }, default false): Carries the app's server on loopback, the only backend its pages call; switching takes a reinstall. omit leaves out packages only the image needs, with what only they pull in.

- desktop.recovery ("errorPage" | "reload", default "errorPage"): "reload" reloads a crashed page every time and relaunches the app; "errorPage" shows an error page.

- desktop.window ({ fullscreen?, skipTaskbar? }): Opens the main window fullscreen, and without a taskbar button (Windows, Linux), from its first frame.

- desktop.screenCapture ("picker" | "auto", default "picker"): "auto" (Windows) shares the first screen without a picker; leave it off in an app that asks for a camera.

- targets (Record<string, AkanNativeSettings>, default { default: {} }): Several native apps from one Akan app; each takes the fields above, without targets.

Firebase app registration and the stores must use the same appId.

ios.files and android.files copy app-relative source files into the app, keyed by where they land, such as a notification sound at res/raw/chime.mp3. Android FCM push reads google-services.json from android.googleServices instead, and iOS needs no GoogleService-Info.plist because its push goes to APNs. Keep server service account JSON out of these file mappings. For platform setup steps, see

Mobile Development

.

When a multi-client app needs a separate native app per client, give each a target with its own basePath. The Multi Client page shows that pattern.

Images And Public Env

images controls the allow-list for optimized remote images. publicEnv is an allow-list for extra browser-visible environment variables beyond the built-in AKAN_PUBLIC_* pattern.

publicEnv does not store values. It only says which environment variable names are safe to expose to browser builds.

Secret Files

Some private values cannot live inside env.server.*.ts, such as service-account JSON, TLS certificates, or private key files. The secrets field lists glob patterns for these files so Akan ships them together with the env/ folder.

akan upload-env archives every matched file, and akan download-env restores them. Patterns are resolved relative to the app directory, and one declaration both deploys and git-ignores the files.

publicEnv exposes variable names to the browser; secrets does the opposite. Only glob patterns live in config — the matched files stay local and git-ignored, so never commit their contents.

Build And Runtime

The rest of the config is for the build system and the production image. Most apps never touch it, but it is where a package stays external, a font survives pruning, a library's routes join the app, and the image gains a system dependency.

- externalLibs (string[], default []): Unbundled packages, installed in production at the workspace-pinned version.

- trustedDependencies (string[], default []): Packages allowed to run their install scripts, for an addon that builds itself at install.

- bin (Record<string, { [platform]: AkanBinSource }>, default {}): { url, sha256, file? } or { path, file? } per platform, carried in a desktop app and put first on its PATH.

- optimizeImports (string[], default built-in list): Extra packages the client build imports by exact file, so an icon set does not ship whole.

- barrelImports (string[], default akanjs + workspace): Extra barrels to flatten while scanning and bundling, for ones outside the workspace.

- database.modes (("single" | "multiple" | "cluster")[], default ["single"]): Every declared mode's drivers ship: multiple adds bullmq and ioredis, cluster also postgres.

- assets.pruneFonts (boolean, default true): Drops unreferenced fonts from dist's public/ copy; an optimize-on font's source goes too.

- assets.keepFonts (string[], default []): Font globs kept whatever the scan concludes, such as a URL assembled at runtime.

- syncPageLibs (string[] | boolean, default false): true mounts every dependency lib with a page folder, an array only those; false unlinks all.

- plugins (AkanPlugin[], default []): Read live by the CLI for runtime packages, native project setup, and public/ assets.

- docker (string | DockerImageConfig, default oven/bun:1-slim): A whole Dockerfile, or its parts: image, preRuns and postRuns around bun install, command.

A library contributes to five of these: its own externalLibs, trustedDependencies, docker.preRuns and docker.postRuns, and assets.keepFonts carry into every app that mounts it, and its bin into the apps that depend on it. The generated image installs ca-certificates and tzdata and nothing else, which is why an app that needs ffmpeg or a headless browser declares it.

**One image, several deployments.** With `["single", "cluster"]` the same image runs an edge site and a cloud cluster, and each deployment names its mode with `AKAN_DATABASE_MODE`.

**libSQL is opt-in.** No mode ships `@libsql/client`, so an app that applies `LibsqlDatabase` itself lists it in `externalLibs`.

**A desktop app carries its own executables.** It gets none of the image's `docker` steps, so `bin` puts ffmpeg, or anything else its server or a native plugin spawns, into every desktop build for the computer it is built on, first on the app's PATH and in a plugin's `ctx.binDir`. Carry a static LGPL build: a `--enable-nonfree` build may not be redistributed.

A docker written as a string is the whole Dockerfile, taken verbatim. Nothing is merged into it — including the preRuns and postRuns your libraries declared, which are silently dropped rather than silently unapplied.

Defaults And Rules

Akan resolves the final app config by merging your file with framework defaults. For a first app, keep these rules in mind before adding advanced options.

Environment values

Put runtime values in env/ before adding config fields. Use client env for public values and server env for private server options.

Routes

Skip routes until you need custom domains or multiple clients.

Native apps

appName defaults to the app name, appId defaults to com.<repoName>.<appName>, version defaults to 0.0.1, and buildNum defaults to 1. Pin a real reverse-DNS appId before you ship: a placeholder such as com.example.app has almost always been claimed in Apple's portal already.

Images

Remote images are blocked unless remotePatterns allow them. WebP and quality 75 are used by default.

i18n

Locales default to en and ko with en first. Change it only to move the default locale or to serve a different set — defaultLocale must be one of locales.

Recommended order: start with an empty config, fill env/ values as the app needs them, add routes when domains are needed, add native when native apps are needed, and add advanced build options only after the default build is not enough.

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
  native: {
    appName: app.name,
    appId: "com.example.app",
  },
});

export default config;
```

### env/env.client.local.ts

```ts
import type { AppClientEnv } from "./env.client.type";

export const env: AppClientEnv = {
  google: {
    mapKey: "local-map-key",
  },
} as const;
```

### env/env.server.local.ts

```ts
import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  hostname: null,
  security: {
    verifies: [["password", "phone"]],
    sso: {},
  },
};
```

### lib/option.ts

```ts
import { AkanOption } from "akanjs/server";
import type { LlmOption } from "akanjs/service";

import { SignedIn } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  llm?: LlmOption;
};

export const option = new AkanOption<ModulesOptions>()
  .setLlm((options) => options.llm ?? {})
  .setAgentAccess(SignedIn)
  .setMcp({ instructions: "Domain tools for the app. Start from taskInTodo." });
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

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  web: { csr: false },
  api: { prefix: "/backend", websocketPrefix: "/socket" },
};

export default config;
```

### Native config

```ts
const config: AppConfig = {
  native: {
    appName: "Example",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    indexPath: "/explore",
    icon: "public/icon.png",
    splash: "public/splash.png",
    permissions: ["camera", "push"],
    plugins: ["iap"],
    deepLinks: { schemes: ["example"], domains: ["example.com"] },
    ios: { teamId: "TEAMID" },
    android: {
      googleServices: "secrets/google-services.json",
      sha256CertFingerprints: [
        "00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
      ],
      files: { "res/raw/chime.mp3": "public/chime.mp3" },
    },
  },
};
```

### native without basePath

```ts
const config: AppConfig = {
  native: { desktop: { server: true } },
};
```

### native.targets

```ts
const config: AppConfig = {
  routes: [
    { domains: { main: ["store.example.com"] }, basePath: "store" },
    { domains: { main: ["admin.example.com"] }, basePath: "admin" },
  ],
  native: {
    appId: "com.example.store",
    permissions: ["push"],
    targets: {
      store: { basePath: "store" },
      admin: {
        basePath: "admin",
        appName: "Example Admin",
        appId: "com.example.admin",
        permissions: ["camera", "push"],
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

### Build and runtime fields

```ts
import { pushNotificationPlugin } from "./plugin/pushNotification.plugin";

const config: AppConfig = {
  externalLibs: ["shiki"],
  trustedDependencies: ["rclnodejs"],
  bin: {
    ffmpeg: {
      "linux-x64": { url: "https://files.example.com/ffmpeg-lgpl-linux64.tar.xz", sha256: "…", file: "bin/ffmpeg" },
      "darwin-arm64": { path: "tools/darwin-arm64/ffmpeg" },
    },
  },
  optimizeImports: ["custom-icons"],
  barrelImports: ["@acme/ui"],
  database: { modes: ["single", "cluster"] },
  assets: { pruneFonts: true, keepFonts: ["fonts/Assistant-*.woff2"] },
  syncPageLibs: ["shared"],
  plugins: [pushNotificationPlugin],
  docker: {
    image: { amd64: "oven/bun:amd64", arm64: "oven/bun:arm64" },
    preRuns: ["apt-get install -y ffmpeg"],
    postRuns: ["echo after"],
    command: ["bun", "main.js"],
  },
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Treat convention and generated-file rules as stronger than local style guesses.

