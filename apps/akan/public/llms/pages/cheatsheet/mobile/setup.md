# Setup

- Source: /cheatsheet/mobile/setup
- Mirror: /llms/pages/cheatsheet/mobile/setup.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Mobile Setup Flow (#overview)
- Mobile Config (#mobile-config)
- Native Plugins (#native-plugins)
- Android Setup (#android-setup)
- iOS Setup (#ios-setup)
- Desktop (#desktop)
- Verify Setup (#verify)

## Content

Setup

Mobile Setup Flow

An Akan mobile app is your CSR web app running inside a native shell that akanjs's own runtime generates for iOS and Android, and for macOS, Windows and Linux too. The web app owns the pages and business logic. The shell owns the package ID, device permissions, plugins, native files, signing and store builds, all declared in akan.config.ts.

Words used on this page

Term

- native runtime: @akanjs/native, shipped inside akanjs. It runs your web app in a WebView and reaches device APIs through plugins.

- CSR bundle: The single-page build of your app. The native app ships it, so keep `web.csr` on.

- target: One native app built from your Akan app. Its key in `mobile.targets` is the `--target` value.

- appId: The app's permanent ID: the package name on Android and the bundle ID on iOS.

- .akan/mobile/<target>: Where each run writes the target's web root and native builds. It is generated and ignored by git: there is no Xcode or Android Studio project to edit.

- plugin: A native runtime module such as camera or push. The app ships it when a permission or `native.plugins` names it.

Four steps

- 1. Mobile config — Name the app, fix its `appId`, and choose targets and permissions in `akan.config.ts`.

- 2. Native plugins — Permissions bring their plugin; name any other one in `native.plugins`.

- 3. Android · iOS · Desktop — Install the toolchains, run the app on a device, then set up signing and store builds.

- 4. Verify — Check each feature on a real device instead of stopping at a green build.

Push notifications and deep links are optional. Set them up after this page, and only if the app needs them.

Mobile Config

The `mobile` block in `akan.config.ts` describes the native app: its name, ID, version and targets. Values at the `mobile` root apply to every target, and a target overrides the ones it sets.

- string — app name — Name under the home-screen icon. A store listing may show a different name.

- string — com.<repo>.<app> — Android package name and iOS bundle ID. Console and Firebase registrations must match it.

- string — 0.0.1 — The version users see: Android `versionName` and iOS `CFBundleShortVersionString`.

- number — 1 — Store build number: Android `versionCode`, iOS `CFBundleVersion`. Raise it for every store upload.

- Record<string, Target> — { default: {} } — One entry per native app. The key is the name `--target` takes.

- MobilePermission[] — Device features to prepare. Only `camera`, `contacts`, `location`, `push` and `speech` exist.

- string — / — Home route. A deep link opens on top of it, and Android back returns to it before exiting.

- string — The client to open in a multi-client app. It must be a `basePath` declared in `routes`.

- { plugins?, ios?, android?, desktop? } — Native settings: more `plugins`, `ios.infoPlist` and `ios.entitlements` keys, `android.manifest` / `application` / `activity` XML, `android.googleServices` for FCM, `android.autoplay`, `desktop.server` for a desktop app that carries the app's server, and for an unattended desktop app `desktop.recovery`, `desktop.window` and `desktop.screenCapture`.

- Record<string, string> — Copies app files into the app. Key: where it lands, `ios/<path>`, `android/res/<type>/<file>` or `android/assets/<path>`. Value: the source, relative to the app folder.

- string — Per-target override, like `appName`, `version`, `buildNum`. A different `appId` is a separate app. `files` and `native` at the `mobile` root merge into every target.

Icons, splash images and deep links are also target fields; see Config and Deep Links.

What each permission adds

A permission brings the feature's plugin and writes its native settings on the next run. For speech the runtime has no plugin yet: the build says so and ships without it, and a lib that claims the permission adds only its own entries.

Permission

Plugin

- camera — `camera` — Camera and photo library usage texts — None: the system camera and photo picker need no permission

- contacts — `contacts` (read-only) — Contacts usage text — `READ_CONTACTS`

- location — `geolocation` — Location usage texts, for always and while in use — `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`

- push — `push` — Remote-notification background mode and the `aps-environment` entitlement — `POST_NOTIFICATIONS` and the FCM module (needs `native.android.googleServices`)

- speech — None yet: the app ships without it — What a lib's plugin declares — What a lib's plugin declares

Several native apps from one app

When one repo ships separate customer, admin or partner apps, split the clients with `basePath` and give each its own target. A target that sets its own `appId` is a separate store app:

**`basePath` must exist in `routes`.** Declare the client first; the Multi Client page shows how.

**Pick a real appId.** IDs with a segment like `example`, `myapp` or `test` are usually taken on Apple's portal, so phone signing fails. `akan doctor --ios` flags them.

**Keep the CSR bundle on.** The native app ships it, so `web: { csr: false }` cannot sit next to a `mobile` block.

**Capacitor keys are refused.** `plugins`, `ios` and `android` directly under `mobile` or a target stop the build; they live under `native` now.

**Never change appId after release.** Android and iOS treat a different `appId` as a different app.

Native Plugins

The runtime ships a plugin only when the target asks for it. A base set every Akan page relies on is always in; `permissions` bring their feature's plugin; anything else is named in `native.plugins`. Calling a plugin the app does not ship rejects with `UNSUPPORTED`.

Package

- Always

- By a permission — permissions

- By name — native.plugins

- What every Akan page may call

- Per feature

Yes

No

Beyond the base set and the permissions, name only the plugins the app actually calls. In-app purchase, for example, has no permission of its own:

**Nothing goes in package.json.** The plugins ship inside akanjs, so the app installs no native package and pins no version of its own.

**A lib can claim a permission.** A `<name>.plugin.ts` with a `native` block names the permission, its plugins, usage texts and Android permissions; every app that mounts the lib gets them, and it replaces the builtin entry for that permission.

**Rerun after a change.** After changing permissions or `native`, run `start-ios`, `start-android` or a build command again; the app is generated anew each time.

Your Own Plugins

A device feature no builtin covers — a kiosk's boot receiver, a Windows registry setting — is a plugin in the app's own `native/` folder, one folder per plugin, named after its id. It is not listed anywhere: every target of the app ships it, and its manifest says what runs on each platform. A lib's `native/` plugins reach the apps that depend on it, and an app's own plugin wins an id a lib also uses.

`definePlugin` comes from `akanjs/client/native` and `defineDesktopPlugin` from `akanjs/native/desktop`; the runtime's own package is not installed in an app's workspace. A `webkit/` hook imports the plugin's API from `../native/kiosk/src`, and pages call the hook.

Android Setup

This gets the Android app running on an emulator or a phone. Keep one value consistent: `mobile.appId` becomes the Android `applicationId`.

Prerequisites

The Android SDK with build-tools 35 or newer, and an emulator or a phone with USB debugging. Android Studio installs both.

Open the Android Studio download

A JDK 17 or newer. Android Studio bundles one; `JAVA_HOME` picks another. The Kotlin compiler is fetched on the first build.

A stable `mobile.appId` such as `com.acme.shop`.

Open the Android application ID docs

Run on a device

When the SDK is not at ~/Library/Android/sdk, point your shell at it:

Check that `mobile.appId` is final (see Mobile Config above), then start the dev server. Without `--release`, the app loads its screens from it:

In a second terminal, run the app on an emulator or a connected phone:

Success looks like this: the app opens on the target's `indexPath`, and a save in the app shows up without a rebuild. A phone reaches the dev server over its USB connection.

Commands and store builds

- Command

- Default --env

- What you get

- start-android — local — Runs on an emulator or phone. `--release` ships the web build instead of the dev server.

- build-android — debug — An APK signed with a local debug key, to check that the app builds.

- release-android — main — An AAB for the Play Store, or an APK with `--assemble-type apk`, signed with your upload key.

Check that the app builds, then make the Play Store AAB against the `main` backend:

`release-android` signs with your upload key, which it reads from the environment. Set three names, and a fourth when the key has its own password; a missing one stops the command before it builds:

Open the Android app signing docs

**`MYAPP_RELEASE_STORE_FILE` is relative to the app folder.** Keep the keystore under `secrets/`, never in `public/`.

**Keep passwords out of git.** A CI sets the same names as secrets. The passwords reach the signer through the environment, never the command line or the log.

**Where the file lands.** `apps/myapp/.akan/mobile/default/native/android`. `release-android` prints the path.

Mobile command flags

- string — A key of `mobile.targets`, or `all`. With a single target it is picked for you; `start-*` runs one at a time.

- local | debug | develop | main — The backend the app talks to. The default differs per command, as in the table above.

- boolean — false — Run a release build with the web build inside, so no dev server is needed.

- string — A simulator, emulator or device by id or name. A paired iPhone's name makes a signed phone build.

- string — The Apple team id to sign with, when the Mac holds profiles of several teams.

- boolean — false — A debug build instead of a release one.

- boolean — false — Sign with an ad-hoc profile instead of an App Store one.

- aab | apk — aab — `aab` for a Play Store upload, `apk` to install the file directly.

- boolean — false — Allow `--env local` in a release build. For local testing only.

iOS Setup

This prepares the bundle ID, signing, simulator runs and store builds. There is no Xcode project: the runtime compiles the app with Xcode's tools and reads the signing Xcode keeps. Run on a simulator first, then on a phone for device-only features.

Xcode 26 or newer, with an iOS 26 simulator runtime (Xcode › Settings › Components).

Open the Xcode download

A stable `mobile.appId`, used as the bundle ID.

Open the Apple bundle ID docs

An Apple developer team, for phone runs and releases.

Open the Apple signing docs

With `akan start myapp` running, launch the app on a simulator, or name a paired iPhone:

**`--device` picks the device.** It takes a simulator's name or UDID, or a paired iPhone's name. Left out, a booted iPhone simulator is used, else the newest one is started.

**The signing is found, not made.** A phone run and a release pick the certificate and profile that fit, and print the one they used. `--team` chooses when several teams fit.

**When nothing fits.** The error lists every profile for the bundle ID and why it does not fit: expired, another team, a missing capability such as push, or the phone not in it.

Signing checks

Sign in to your team in Xcode (Settings › Accounts) and download its profiles, so the Mac holds an Apple Development certificate and a profile for the app ID. The runtime reads Xcode's profile folders; there is no project to open.

The profile's App ID is `mobile.appId`. A wildcard ID is used only when the app asks for neither push nor associated domains.

For a phone run, the development profile lists that phone: register it once (build to it from Xcode, or add it on the developer site) and download the profile again. A release needs an Apple Distribution certificate and an App Store (or ad-hoc) profile.

Run on a simulator first, then move to a phone for device-only features.

- start-ios — local — Runs on a simulator or phone. `--release` ships the web build instead of the dev server.

- build-ios — debug — A simulator app, to check that the app builds.

- release-ios — main — An iPhone app and its `.ipa`, signed for the App Store.

Check that the app builds, then make the App Store build against the `main` backend, which `release-ios` uses by default:

Desktop

The same target also runs as a desktop app, which is the quickest way to try a change outside the browser. `akan start-desktop` builds for this computer's own OS, since a desktop app builds only there, and loads its pages from `akan start` like the phone commands:

It needs Rust through rustup, which installs the toolchain the build pins, plus this OS's native build tools:

Open rustup

- macOS: Xcode command line tools (`xcode-select --install`).

- Windows: Visual Studio 2022 Build Tools with "Desktop development with C++".

- Linux: A C compiler, pkg-config, and the WebKitGTK 4.1, GTK 3 and libsoup 3 development packages.

A desktop app can also carry the app's own server, so it works on one computer with no backend elsewhere. Turn it on for a target with `native: { desktop: { server: true } }`. Then `akan start-desktop` starts `akan start` in the same command when none is running, and `akan build-desktop` and `akan publish-update` build the app with the server inside: it starts beside the window on a loopback port, serves the API only, and keeps its SQLite data in the app data folder's `server/` (on Windows under `%LOCALAPPDATA%`; a `--debug` build keeps its own `server-debug/`). It trusts the certificates the operating system trusts and follows the proxy variables of the user's session, as the page does. The port is usually the one it had last time but is not guaranteed, so a sign-in whose provider wants an exact redirect URI goes through your cloud server's adapter, not through the carried server. An installed app refuses an update that adds or drops the server, so switching it for an app already out there takes a reinstall.

The server needs `single` in `database.modes`. The app carries the server's `private/` folder, `env.server.<env>.ts` of the `--env` it is built with and no other environment's file, and the defaults each lib it uses exports as its server env (the lib's `env.server.testing.ts`), all in plain text: anyone who has the app can read every file and value in them. Keep deployment secrets such as cloud keys, and license files, out of them. The carried server has no `public/`, and its working folder is its data folder: read a file it needs at runtime from the app folder, `AKAN_APP_DIR` or else the folder of `Bun.main`, never from `process.cwd()`.

start-desktop is for development and testing, and build-desktop makes an app for this computer: on macOS signed ad hoc or with the development identity, on Windows and Linux unsigned. Distribution signing and notarization are not akan commands yet; on Windows, --installer makes an unsigned installer for the current user.

The carried server gets none of the image's `docker` steps. An executable the server or a native plugin spawns, such as ffmpeg, goes in `bin` in `akan.config.ts`: per platform, a download checked against its `sha256` or a file next to the config. Every desktop build, run and dev carries it, with a server or without: the build fetches the one for this computer, puts it in the app and its folder first on the app's PATH, so the server's `spawn("ffmpeg")` runs it and the user installs nothing; a native plugin finds it in `ctx.binDir`. A package that builds itself at install goes in `trustedDependencies`.

Carry a static LGPL build. A build that loads its own shared libraries runs only where it was built, and one configured with --enable-nonfree (the macOS binary npm's ffmpeg-static downloads) may not be redistributed.

A file the user picks reaches that server as a grant, never as a copy or a path, so a video of several gigabytes is not copied or uploaded. Add `file-picker` to the target's `native.plugins`, pick with `forServer: true`, hand the grant to an endpoint, and let the server exchange it with `NativeFile`: it gets the files the user picked and nothing else.

Devices belong to native plugins, not to the server: displays and their changes (screen), windows placed on them (window), the system volume and mute (volume, on Android the media volume too), global shortcuts, keep-awake and launch at login. Add each to the target's native.plugins; every builtin plugin's API is akanjs/client/native/<id> (akanjs/client/native/window, …/screen), and volume and filePicker also come from akanjs/client/native.

An App Nobody Attends

A kiosk or a signage screen has nobody to click Reload. `desktop.recovery: "reload"` loads a page whose process ended again every time, waiting longer after each end in a row, and relaunches the app when the webview's browser process ends. `desktop.window` opens the main window fullscreen and without a taskbar button from its first frame, and `app.relaunch()` starts the app over in a new process on the desktop and Android. For remote support on Windows, `desktop.screenCapture: "auto"` answers `getDisplayMedia()` with the first screen, without the picker or a tap; it covers every media request, so leave it off in an app that asks for a camera or a microphone.

Installing On Windows

`akan build-desktop myapp --installer true` on Windows adds a setup program next to the app folder (NSIS: `winget install NSIS.NSIS`). It installs for the current user, so updates swap the app without an administrator; `/S` installs silently and `/RUN` starts the app afterwards, which is what a remote install passes; a PC without the WebView2 Runtime gets it too. The program is not code-signed yet, so a copy downloaded in a browser meets a SmartScreen warning.

The build follows the CPU of the Bun that runs it, so an ARM64 Windows machine builds an x64 PC's app when `akan` runs on an x64 Bun (`bun-windows-x64-baseline`, which also runs on CPUs without AVX2) after `rustup target add x86_64-pc-windows-msvc`.

Updates

An installed app updates itself from releases you sign. `akan update-keygen` makes the key once and prints its public half for `mobile.updates`; `akan publish-update` builds a release (the whole app on the desktop, the web bundle on a phone) into `.akan/mobile/<target>/updates`, which you upload to `updates.url`, the manifests last. A new release runs on trial until its first page mounts. A phone looks for a newer web bundle by itself, at start and on each return to the front, and runs it from the next cold start; on the desktop a release is the whole app and a relaunch, so when to check, download and apply is the app's call. `akan pack-update` writes a phone update unsigned instead, for a signer that keeps the key elsewhere.

An app follows the channel `updates.channel` names, or else the `--env` it was built with, so it takes only releases published for its own env. `build-desktop` defaults to `debug` and `publish-update` to `main`: pass the same `--env` to both. `--channel` on `publish-update` names only the manifest it writes: the release inside keeps its build's channel, and an app that takes it follows that channel afterwards, so a pilot group gets a target of its own whose `updates.channel` is the pilot's. What makes a desktop app itself — its install folder, uninstall entry, data folder, single running instance and update state — comes from the target's `appId` and name, not from the env, so two envs of one target on one computer share all of it. To install them side by side, give each env its own target with its own `appId`.

Behind a CDN, the files under `app/` and `files/` are named by their hash and may be cached for long, but `<channel>.json` and `<channel>.json.sig` must not be cached, or must be invalidated together: a manifest paired with another release's signature fails verification, and every app stops updating until the caches expire. Upload `app/` and `files/` first, then those two files last, together.

Verify Setup

A green build is not the finish line. On a real device, check that plugins load, native files are in place, permission prompts appear, and push arrives and opens the right screen.

Symptom

What to check

- `camera.takePhoto() is not supported on ios` — The target does not ship that plugin. Add its permission, or name it in `native.plugins`, then run again.

- `No dev server answers on …` — A dev build loads its pages from `akan start myapp`. Start it first, or pass `--release`.

- A save reloads the whole app instead of updating it in place — A component, store, page or layout edit applies in place and keeps state; a `*.constant.ts` change, an added or removed route, or a new npm dependency reloads. `AKAN_DEV_CSR=artifact` on `akan start` brings back the single-file dev bundle, which reloads on every save.

- No permission prompt, or an iOS crash on first use — Add the feature to `permissions` and rerun, so the usage text and native entries are written.

- A native file is missing — A `files` key is where the file lands (`ios/…`, `android/res/…`, `android/assets/…`); the value is the path in the app folder.

- A notification tap opens the wrong screen — Send `url: "/some/path"` in the data and check that the tap opens that CSR route.

Push on each platform

- Android push

- iOS push

Next

- Push Notifications — APNs, FCM and the client API, per platform.

- Deep Links — Custom URL schemes and verified HTTPS app links.

- Every Mobile Field — Icons, splash images, native files and the native block.

- CLI Reference — Every flag of the mobile commands.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  mobile: {
    appName: "Acme Shop",
    appId: "com.acme.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        indexPath: "/home",
        permissions: ["camera", "push"],
        native: {
          android: { googleServices: "secrets/google-services.json" },
        },
      },
    },
  },
};

export default config;
```

### apps/myapp/akan.config.ts

```ts
const config: AppConfig = {
  routes: [
    { basePath: "shop", domains: { main: ["shop.acme.com"] } },
    { basePath: "partner", domains: { main: ["partner.acme.com"] } },
  ],
  mobile: {
    appName: "Acme Shop",
    appId: "com.acme.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      shop: { basePath: "shop" },
      partner: {
        basePath: "partner",
        appName: "Acme Partner",
        appId: "com.acme.partner",
      },
    },
  },
};
```

### apps/myapp/akan.config.ts

```ts
mobile: {
  targets: {
    default: {
      permissions: ["push"],
      native: { plugins: ["iap"] },
    },
  },
},
```

### apps/myapp/native/kiosk

```ts
native-plugin.json   { "id": "kiosk", "apiVersion": 1, "methods": ["hideTaskbar"], "desktop": "./src/desktop.ts", … }
src/index.ts         export const kiosk = definePlugin<KioskApi>("kiosk", { methods: ["hideTaskbar"] });
src/desktop.ts       export default defineDesktopPlugin<KioskApi>({ id: "kiosk", methods: { hideTaskbar: … } });
android/KioskPlugin.kt
```

### Terminal

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

### Terminal

```bash
akan start myapp
```

### Terminal

```bash
akan start-android myapp
```

### Terminal

```bash
akan build-android myapp --target default
akan release-android myapp --target default --env main
```

### Terminal

```bash
export MYAPP_RELEASE_STORE_FILE=secrets/release.keystore
export MYAPP_RELEASE_STORE_PASSWORD=<store password>
export MYAPP_RELEASE_KEY_ALIAS=upload
export MYAPP_RELEASE_KEY_PASSWORD=<key password>
```

### Terminal

```bash
akan start-ios myapp
akan start-ios myapp --device "iPhone 17"
akan start-ios myapp --device "Jane's iPhone" --team ABCDE12345
```

### Terminal

```bash
akan build-ios myapp --target default
akan release-ios myapp --target default --env main
```

### Terminal

```bash
akan start myapp
akan start-desktop myapp
akan start-desktop myapp --release true --env debug
```

### Terminal

```bash
akan start-desktop myapp --target kiosk
akan build-desktop myapp --target kiosk --env main
```

### akan.config.ts

```typescript
const config: AppConfig = {
  bin: {
    ffmpeg: {
      "darwin-arm64": { url: "https://files.example.com/ffmpeg-lgpl-darwin-arm64.zip", sha256: "…", file: "bin/ffmpeg" },
      "win32-x64": { url: "https://files.example.com/ffmpeg-lgpl-win64.zip", sha256: "…", file: "bin/ffmpeg.exe" },
      "linux-x64": { path: "tools/linux-x64/ffmpeg" },
    },
  },
  trustedDependencies: ["rclnodejs"],
};
```

### page → server

```typescript
// webkit/usePickVideo.tsx (akanjs/client/native)
const { files } = await filePicker.pickFiles({ types: ["video/*"], forServer: true });
await fetch.trimVideo(files[0].grant, 0, 30);

// lib/video/video.service.ts (akanjs/server)
const input = await NativeFile.resolve(grant, "read");
const output = await NativeFile.resolve(saveGrant, "write"); // from filePicker.saveFile({ name, forServer: true })
```

### apps/board/akan.config.ts

```ts
mobile: {
  targets: {
    default: {
      native: {
        desktop: { recovery: "reload", window: { fullscreen: true, skipTaskbar: true }, screenCapture: "auto" },
        android: { autoplay: true },
      },
    },
  },
},
```

### webkit/useAppUpdates.tsx

```typescript
import { updates } from "akanjs/client/native";

// e.g. every 30 minutes; a kiosk applies at night, an app on its next launch
const { available } = await updates.check();
if (available) {
  await updates.download();
  await updates.apply();
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

