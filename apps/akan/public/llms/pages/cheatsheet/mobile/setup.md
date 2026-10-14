# Setup

- Source: /cheatsheet/mobile/setup
- Mirror: /llms/pages/cheatsheet/mobile/setup.md
- Section: cheatsheet
- Category: Native
- Priority: P2

## Headings

- Native Setup Flow (#overview)
- Native Config (#native-config)
- Native Plugins (#native-plugins)
- Android Setup (#android-setup)
- iOS Setup (#ios-setup)
- Desktop (#desktop)
- Verify Setup (#verify)

## Content

Setup

Native Setup Flow

An Akan native app is your CSR web app running inside a native shell that akanjs's own runtime generates for iOS and Android, and for macOS, Windows and Linux too. The web app owns the pages and business logic. The shell owns the package ID, device permissions, plugins, native files, signing and store builds, all declared in akan.config.ts.

Words used on this page

Term

- native runtime: @akanjs/native, shipped inside akanjs. It runs your web app in a WebView and reaches device APIs through plugins.

- CSR bundle: The single-page build of your app. The native app ships it, so keep `web.csr` on.

- target: One native app built from your Akan app. Its key in `native.targets` is the `--target` value.

- appId: The app's permanent ID: the package name on Android and the bundle ID on iOS.

- dist/native/<app>/<target>: Each run's web root and builds for the target; generated and git-ignored, with no Xcode project to edit.

- plugin: A native runtime module such as camera or push. The app ships it when a permission or `native.plugins` names it.

Four steps

- 1. Native config — Name the app, fix its `appId`, and choose targets and permissions in `akan.config.ts`.

- 2. Native plugins — Permissions bring their plugin; name any other one in `native.plugins`.

- 3. Android · iOS · Desktop — Install the toolchains, run the app on a device, then set up signing and store builds.

- 4. Verify — Check each feature on a real device instead of stopping at a green build.

Push notifications and deep links are optional. Set them up after this page, and only if the app needs them.

Native Config

The `native` block in `akan.config.ts` describes the native app: its name, ID, version and permissions, with what only one platform reads under `ios`, `android` or `desktop`. An app that ships one native app needs nothing more:

- appName (string, default app name): Name under the home-screen icon. A store listing may show a different name.

- appId (string, default com.<repo>.<app>): Android package name and iOS bundle ID. Console and Firebase registrations must match it.

- version (string, default 0.0.1): The version users see: Android `versionName` and iOS `CFBundleShortVersionString`.

- buildNum (number, default 1): Store build number: Android `versionCode`, iOS `CFBundleVersion`. Raise it for every store upload.

- permissions (NativePermission[]): Device features to prepare. Only `camera`, `contacts`, `location`, `push` and `speech` exist.

- plugins (string[]): More runtime plugins, by builtin id such as `iap` or by absolute folder.

- indexPath (string, default /): Home route. A deep link opens on top of it, and Android back returns to it before exiting.

- basePath (string): The client to open in a multi-client app, a `basePath` in `routes`. Leave it out without one.

- ios ({ teamId?, infoPlist?, entitlements?, privacy?, files? }): iOS only: the universal-link team, Info.plist and entitlement keys, privacy manifest, bundle files.

- android ({ googleServices?, push?, autoplay?, files?, manifest?, … }): Android only: `googleServices` for FCM, how pushes show, app-link fingerprints, files, manifest XML.

- desktop ({ server?, recovery?, window?, screenCapture?, … }): Desktop only: `server` carries the app's server, and the rest keeps an app nobody attends running.

- targets (Record<string, AkanNativeSettings>, default { default: {} }): One entry per native app, keyed by the name `--target` takes. Each takes the fields above.

Icons, splash images and deep links are also `native` fields; see Config and Deep Links.

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

When one repo ships separate customer, admin or partner apps, split the clients with `basePath` and give each a key under `targets`. A target takes the same fields as `native` and wins: objects such as `ios` merge key by key, but lists are replaced, so a target's `permissions` replace those in `native`. A target with its own `appId` is a separate store app:

**`basePath` must exist in `routes`.** Declare the client first; the Multi Client page shows how.

**Pick a real appId.** IDs with a segment like `example`, `myapp` or `test` are usually taken on Apple's portal, so phone signing fails. `akan doctor --ios` flags them.

**Keep the CSR bundle on.** The native app ships it, so `web: { csr: false }` cannot sit next to a `native` block.

**Never change appId after release.** Android and iOS treat a different `appId` as a different app.

Native Plugins

The runtime ships a plugin only when the target asks for it. A base set every Akan page relies on is always in; `permissions` bring their feature's plugin; anything else is named in `native.plugins`. Calling a plugin the app does not ship rejects with `UNSUPPORTED`.

Package

Always

By a permission — permissions

By name — native.plugins

- What every Akan page may call

  - app: App info, the Android back button, deep-link events and app exit.

  - app-state: Foreground and background changes.

  - device: The platform, model and device language.

  - keyboard: Reports the keyboard height so the screen can move with it.

  - preferences: On-device storage, where the sign-in token is kept.

  - secure-storage: The keychain or keystore, for secrets.

  - browser · opener: Opens a page in an in-app browser, or a link in the system.

  - auth-session: The system sign-in sheet an OAuth flow opens.

  - dialog · haptics: System alerts and action sheets, and haptic feedback.

- Per feature

  - camera: Camera and photo picker. Brought by `camera`.

  - geolocation: Current and watched location. Brought by `location`.

  - push: APNs on iOS, FCM on Android. Brought by `push`.

  - iap: In-app purchase: StoreKit 2 and Play Billing.

  - share · biometric · …: The runtime's other plugins, by id, or a plugin folder by its absolute path.

Yes

No

Beyond the base set and the permissions, name only the plugins the app actually calls. In-app purchase, for example, has no permission of its own:

**Nothing goes in package.json.** The plugins ship inside akanjs, so the app installs no native package and pins no version of its own.

**A lib can claim a permission.** A `<name>.plugin.ts` with a `native` block names the permission, its plugins, usage texts and Android permissions; every app that mounts the lib gets them, and it replaces the builtin entry for that permission.

**Rerun after a change.** After changing permissions or `native`, run `start-ios`, `start-android` or a build command again; the app is generated anew each time.

Your Own Plugins

A device feature no builtin covers, such as a kiosk's boot receiver, is a plugin in the app's own `native/<id>/` folder. Nothing lists it: every target ships it, and its manifest says what runs on each platform. A lib's `native/` plugins reach the apps that depend on it.

`definePlugin` comes from `akanjs/client/native` and `defineDesktopPlugin` from `akanjs/native/desktop`; the runtime's own package is not installed in an app's workspace. A `webkit/` hook imports the plugin's API from `../native/kiosk/src`, and pages call the hook.

Android Setup

This gets the Android app running on an emulator or a phone. Keep one value consistent: `native.appId` becomes the Android `applicationId`.

Prerequisites

The Android SDK with build-tools 35 or newer, and an emulator or a phone with USB debugging. Android Studio installs both.

Open the Android Studio download

A JDK 17 or newer. Android Studio bundles one; `JAVA_HOME` picks another. The Kotlin compiler is fetched on the first build.

A stable `native.appId` such as `com.acme.shop`.

Open the Android application ID docs

Run on a device

When the SDK is not at ~/Library/Android/sdk, point your shell at it:

Check that `native.appId` is final (see Native Config above), then start the dev server. Without `--release`, the app loads its screens from it:

In a second terminal, run the app on an emulator or a connected phone:

Success looks like this: the app opens on the target's `indexPath`, and a save in the app shows up without a rebuild. A phone reaches the dev server over its USB connection.

Commands and store builds

Command

Default --env

What you get

- start-android — local — Runs on an emulator or phone. `--release` ships the web build instead of the dev server.

- build-android — debug — An APK signed with a local debug key, to check that the app builds.

- release-android — main — An AAB for the Play Store, or an APK with `--assemble-type apk`, signed with your upload key.

Check that the app builds, then make the Play Store AAB against the `main` backend:

`release-android` signs with your upload key, which it reads from the environment. Set three names, and a fourth when the key has its own password; a missing one stops the command before it builds:

Open the Android app signing docs

**`MYAPP_RELEASE_STORE_FILE` is relative to the app folder.** Keep the keystore under `secrets/`, never in `public/`.

**Keep passwords out of git.** A CI sets the same names as secrets. The passwords reach the signer through the environment, never the command line or the log.

**Where the file lands.** `dist/native/myapp/default/build/android`. `release-android` prints the path.

Native command flags

- --target (string): A key of `native.targets`, or `all`. With a single target it is picked for you; `start-*` runs one at a time.

- --env (local | debug | develop | main): The backend the app talks to. The default differs per command, as in the table above.

- --release (boolean, default false, start-*): Run a release build with the web build inside, so no dev server is needed.

- --device (string, start-ios, start-android): A simulator, emulator or device by id or name. A paired iPhone's name makes a signed phone build.

- -T, --team (string, start-ios, release-ios): The Apple team id to sign with, when the Mac holds profiles of several teams.

- --debug (boolean, default false, build-*): A debug build instead of a release one.

- --ad-hoc (boolean, default false, release-ios): Sign with an ad-hoc profile instead of an App Store one.

- --assemble-type (aab | apk, default aab, release-android): `aab` for a Play Store upload, `apk` to install the file directly.

- -l, --allow-local-release (boolean, default false, release-*): Allow `--env local` in a release build. For local testing only.

iOS Setup

This prepares the bundle ID, signing, simulator runs and store builds. There is no Xcode project: the runtime compiles the app with Xcode's tools and reads the signing Xcode keeps. Run on a simulator first, then on a phone for device-only features.

Xcode 26 or newer, with an iOS 26 simulator runtime (Xcode › Settings › Components).

Open the Xcode download

A stable `native.appId`, used as the bundle ID.

Open the Apple bundle ID docs

An Apple developer team, for phone runs and releases.

Open the Apple signing docs

With `akan start myapp` running, launch the app on a simulator, or name a paired iPhone:

**`--device` picks the device.** It takes a simulator's name or UDID, or a paired iPhone's name. Left out, a booted iPhone simulator is used, else the newest one is started.

**The signing is found, not made.** A phone run and a release pick the certificate and profile that fit, and print the one they used. `--team` chooses when several teams fit.

**When nothing fits.** The error lists every profile for the bundle ID and why it does not fit: expired, another team, a missing capability such as push, or the phone not in it.

Signing checks

Sign in to your team in Xcode (Settings › Accounts) and download its profiles, so the Mac holds an Apple Development certificate and a profile for the app ID. The runtime reads Xcode's profile folders; there is no project to open.

The profile's App ID is `native.appId`. A wildcard ID is used only when the app asks for neither push nor associated domains.

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

Carry the server

`desktop: { server: true }` in `native`, or in one target, puts the app's own server inside the desktop app, so it works on one computer with no backend elsewhere. It needs `single` in `database.modes`, and `akan start-desktop` then starts `akan start` itself when none is running:

**Guard it like a network server.** It listens on a loopback port, and any program on the computer can call it.

**Anyone with the app can read what it carries.** The server's `private/` (each lib's too), the `--env`'s `env.server.<env>.ts` and the libs' server env defaults ship in plain text, so keep cloud keys and license files out of them.

**Read runtime files from `AKAN_APP_DIR`.** The server has no `public/`, and its working folder is its data folder, not the app.

**Switching takes a reinstall.** An installed app refuses an update that adds or drops the server, and the reinstall moves no data.

Executables and files

A desktop app gets none of the image's `docker` steps. An executable its server or a native plugin spawns, such as ffmpeg, goes in `bin`: per platform, a checked download or a local file, which every desktop build puts first on the app's PATH.

Carry a static LGPL build: one that loads its own shared libraries runs only where it was built, and an --enable-nonfree build may not be redistributed.

A file the user picks reaches the server as a grant, never a copy or a path, so a large video is not uploaded. Name `file-picker` in `native.plugins`, pick with `forServer: true`, and resolve the grant with `NativeFile`:

Displays, windows, volume, global shortcuts, keep-awake and launch at login are native plugins, not server work: name each in native.plugins and import it from akanjs/client/native/<id>.

An app nobody attends

A kiosk or a signage screen has nobody to click Reload. `desktop.recovery: "reload"` reloads a crashed page and relaunches the app, and `desktop.window` opens it fullscreen without a taskbar button. `desktop.screenCapture: "auto"` shares the screen on Windows without the picker, for every media request, so leave it off in an app that uses a camera or a microphone. With `"reload"` its pages also open nothing outside the window: no print or file dialog, no share sheet, no download on Windows, no link handed to the OS, and on macOS no text service such as Search With Google in the right-click menu. The app's own `opener` and `file-picker` plugin calls still work, so open what it needs through them.

Updates

An installed app updates itself from releases you sign. `akan update-keygen` prints the public key for `native.updates`, and `akan publish-update` writes a release to `dist/native/<app>/<target>/updates` for you to upload to `updates.url`. A phone takes a new web bundle by itself; a desktop release is the whole app and a relaunch, so the app decides when:

**Pass the same `--env` to build and publish.** An app takes only its channel's releases, `updates.channel` or else the `--env` it was built with, and `build-desktop` defaults to `debug` while `publish-update` defaults to `main`.

**A new release runs on trial** until its first page mounts, and a carried server is up. A failed trial rolls back, and `check()` and `apply()` refuse meanwhile.

**Upload the manifest last.** `<channel>.json` and its `.sig` go up together after `app/` and `files/`, uncached behind a CDN: a manifest paired with another release's signature stops every app updating.

**`updates.url` is public.** The updater sends no credentials, and a desktop release is the whole app, carried server included.

**If a phone update key leaks, revoke it.** A key revokes only those listed before it in `updates.publicKeys`, so keep spares after the signing key. Point `AKAN_NATIVE_UPDATE_KEY` at a spare's file and publish iOS and Android on every channel with `--revoke <keyId>` (`akan update-keygen` prints a key's keyId). Then add the keyId to `updates.revokedKeys`, so every later release, signed with the spare, keeps revoking it, and keep it there after a new binary drops the key: older binaries still need it. A phone build already trusts none of the keys it lists. A desktop app trusts only the first key and takes no revocation: a desktop release signed with a revoked first key warns, and only a new binary with another first key ends that trust.

Signing, notarization, the dmg, Windows setup and AppImage people download, and a CI recipe are on Desktop Release.

Verify Setup

A green build is not the finish line. On a real device, check that plugins load, native files are in place, permission prompts appear, and push arrives and opens the right screen.

Symptom

What to check

- `camera.takePhoto() is not supported on ios` — The target does not ship that plugin. Add its permission, or name it in `native.plugins`, then run again.

- `No dev server answers on …` — A dev build loads its pages from `akan start myapp`. Start it first, or pass `--release`.

- A save reloads the whole app instead of updating it in place — Expected after a `*.constant.ts` change, a route added or removed, or a new dependency; other edits apply in place.

- No permission prompt, or an iOS crash on first use — Add the feature to `permissions` and rerun, so the usage text and native entries are written.

- A native file is missing — `ios.files` keys are bundle paths, `android.files` keys `res/…` or `assets/…`; values are app-relative.

- A notification tap opens the wrong screen — Send `url: "/some/path"` in the data and check that the tap opens that CSR route.

Push on each platform

- Android push

  - The package name matches the Android app registered in Firebase.

  - `native.android.googleServices` points at that app's `google-services.json`.

  - The notification permission is granted on the phone.

  - The server's Firebase credentials are for the same project.

- iOS push

  - You test on a real device.

  - The profile allows push; `aps-environment` follows it, `development` for a phone run and `production` for a release.

  - The server holds an APNs key (team ID, key ID, the .p8 file) for this bundle ID; iOS push does not go through Firebase.

Next

- Push Notifications — APNs, FCM and the client API, per platform.

- Deep Links — Custom URL schemes and verified HTTPS app links.

- Every Native Field — Icons, splash images, files and the ios, android and desktop sections.

- CLI Reference — Every flag of the native commands.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  native: {
    appName: "Acme Shop",
    appId: "com.acme.shop",
    version: "1.0.0",
    buildNum: 1,
    indexPath: "/home",
    permissions: ["camera", "push"],
    android: { googleServices: "secrets/google-services.json" },
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
  native: {
    appName: "Acme Shop",
    appId: "com.acme.shop",
    version: "1.0.0",
    buildNum: 1,
    permissions: ["push"],
    targets: {
      shop: { basePath: "shop" },
      partner: {
        basePath: "partner",
        appName: "Acme Partner",
        appId: "com.acme.partner",
        permissions: ["camera", "push"],
      },
    },
  },
};
```

### apps/myapp/akan.config.ts

```ts
native: {
  permissions: ["push"],
  plugins: ["iap"],
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

### apps/myapp/akan.config.ts

```ts
const config: AppConfig = {
  native: { desktop: { server: true } },
};
```

### apps/myapp/akan.config.ts

```ts
const config: AppConfig = {
  bin: {
    ffmpeg: {
      "darwin-arm64": { url: "https://files.example.com/ffmpeg-lgpl-darwin-arm64.zip", sha256: "…", file: "bin/ffmpeg" },
      "win32-x64": { url: "https://files.example.com/ffmpeg-lgpl-win64.zip", sha256: "…", file: "bin/ffmpeg.exe" },
      "linux-x64": { path: "tools/linux-x64/ffmpeg" },
    },
  },
};
```

### page → server

```typescript
// webkit/usePickVideo.tsx (akanjs/client/native)
const { files } = await filePicker.pickFiles({ types: ["video/*"], forServer: true });
await fetch.trimVideo(files[0].grant, 0, 30);

// lib/video/video.service.ts (akanjs/server)
const input = await NativeFile.resolve(grant, "read");
```

### apps/board/akan.config.ts

```ts
native: {
  desktop: { recovery: "reload", window: { fullscreen: true, skipTaskbar: true }, screenCapture: "auto" },
  android: { autoplay: true },
},
```

### webkit/useAppUpdates.tsx

```typescript
import { updates } from "akanjs/client/native";

// e.g. every 30 minutes; a kiosk applies at night, an app on its next launch
export const useAppUpdates = () => {
  const takeUpdate = async () => {
    if ((await updates.getState()).trial) return;
    const { available } = await updates.check();
    if (!available) return;
    await updates.download();
    await updates.apply();
  };
  return { takeUpdate };
};
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

