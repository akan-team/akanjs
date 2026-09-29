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

native runtime

@akanjs/native, shipped inside akanjs. It runs your web app in a WebView and reaches device APIs through plugins.

CSR bundle

The single-page build of your app. The native app ships it, so keep `web.csr` on.

One native app built from your Akan app. Its key in `mobile.targets` is the `--target` value.

The app's permanent ID: the package name on Android and the bundle ID on iOS.

Where each run writes the target's web root and native builds. It is generated and ignored by git: there is no Xcode or Android Studio project to edit.

plugin

A native runtime module such as camera or push. The app ships it when a permission or `native.plugins` names it.

1. Mobile config

2. Native plugins

Install the toolchains, run the app on a device, then set up signing and store builds.

4. Verify

Check each feature on a real device instead of stopping at a green build.

app name

Name under the home-screen icon. A store listing may show a different name.

Android package name and iOS bundle ID. Console and Firebase registrations must match it.

The version users see: Android `versionName` and iOS `CFBundleShortVersionString`.

Store build number: Android `versionCode`, iOS `CFBundleVersion`. Raise it for every store upload.

One entry per native app. The key is the name `--target` takes.

Device features to prepare. Only `camera`, `contacts`, `location`, `push` and `speech` exist.

Home route. A deep link opens on top of it, and Android back returns to it before exiting.

The client to open in a multi-client app. It must be a `basePath` declared in `routes`.

Native settings: more `plugins`, `ios.infoPlist` and `ios.entitlements` keys, `android.manifest` / `application` / `activity` XML, and `android.googleServices` for FCM.

Copies app files into the app. Key: where it lands, `ios/<path>`, `android/res/<type>/<file>` or `android/assets/<path>`. Value: the source, relative to the app folder.

Per-target override, like `appName`, `version`, `buildNum`. A different `appId` is a separate app. `files` and `native` at the `mobile` root merge into every target.

Camera and photo library usage texts

None: the system camera and photo picker need no permission

`contacts` (read-only)

Contacts usage text

Location usage texts, for always and while in use

Remote-notification background mode and the `aps-environment` entitlement

`POST_NOTIFICATIONS` and the FCM module (needs `native.android.googleServices`)

None yet: the app ships without it

What a lib's plugin declares

Always

By a permission

By name

What every Akan page may call

App info, the Android back button, deep-link events and app exit.

Foreground and background changes.

The platform, model and device language.

Reports the keyboard height so the screen can move with it.

On-device storage, where the sign-in token is kept.

The keychain or keystore, for secrets.

Opens a page in an in-app browser, or a link in the system.

The system sign-in sheet an OAuth flow opens.

System alerts and action sheets, and haptic feedback.

Per feature

Camera and photo picker. Brought by `camera`.

Current and watched location. Brought by `location`.

APNs on iOS, FCM on Android. Brought by `push`.

In-app purchase: StoreKit 2 and Play Billing.

The runtime's other plugins, by id, or a plugin folder by its absolute path.

Runs on an emulator or phone. `--release` ships the web build instead of the dev server.

An APK signed with a local debug key, to check that the app builds.

An AAB for the Play Store, or an APK with `--assemble-type apk`, signed with your upload key.

Runs on a simulator or phone. `--release` ships the web build instead of the dev server.

A simulator app, to check that the app builds.

An iPhone app and its `.ipa`, signed for the App Store.

Command

Default --env

What you get

A key of `mobile.targets`, or `all`. With a single target it is picked for you; `start-*` runs one at a time.

The backend the app talks to. The default differs per command, as in the table above.

Run a release build with the web build inside, so no dev server is needed.

A simulator, emulator or device by id or name. A paired iPhone's name makes a signed phone build.

The Apple team id to sign with, when the Mac holds profiles of several teams.

A debug build instead of a release one.

Sign with an ad-hoc profile instead of an App Store one.

`aab` for a Play Store upload, `apk` to install the file directly.

Allow `--env local` in a release build. For local testing only.

For a phone run, the development profile lists that phone: register it once (build to it from Xcode, or add it on the developer site) and download the profile again. A release needs an Apple Distribution certificate and an App Store (or ad-hoc) profile.

Run on a simulator first, then move to a phone for device-only features.

Xcode command line tools (`xcode-select --install`).

Visual Studio 2022 Build Tools with "Desktop development with C++".

A C compiler, pkg-config, and the WebKitGTK 4.1, GTK 3 and libsoup 3 development packages.

The target does not ship that plugin. Add its permission, or name it in `native.plugins`, then run again.

`No dev server answers on …`

A dev build loads its pages from `akan start myapp`. Start it first, or pass `--release`.

A save reloads the whole app instead of updating it in place

A component, store, page or layout edit applies in place and keeps state; a `*.constant.ts` change, an added or removed route, or a new npm dependency reloads. `AKAN_DEV_CSR=artifact` on `akan start` brings back the single-file dev bundle, which reloads on every save.

No permission prompt, or an iOS crash on first use

Add the feature to `permissions` and rerun, so the usage text and native entries are written.

A native file is missing

A `files` key is where the file lands (`ios/…`, `android/res/…`, `android/assets/…`); the value is the path in the app folder.

A notification tap opens the wrong screen

Send `url: "/some/path"` in the data and check that the tap opens that CSR route.

Android push

The package name matches the Android app registered in Firebase.

The notification permission is granted on the phone.

The server's Firebase credentials are for the same project.

iOS push

You test on a real device.

The server holds an APNs key (team ID, key ID, the .p8 file) for this bundle ID; iOS push does not go through Firebase.

Push Notifications

APNs, FCM and the client API, per platform.

Deep Links

Custom URL schemes and verified HTTPS app links.

Every Mobile Field

Icons, splash images, native files and the native block.

CLI Reference

Every flag of the mobile commands.

Mobile Setup Flow

An Akan mobile app is your CSR web app running inside a native shell that akanjs's own runtime generates for iOS and Android, and for macOS, Windows and Linux too. The web app owns the pages and business logic. The shell owns the package ID, device permissions, plugins, native files, signing and store builds, all declared in akan.config.ts.

Words used on this page

Term

Four steps

Push notifications and deep links are optional. Set them up after this page, and only if the app needs them.

Mobile Config

What each permission adds

A permission brings the feature's plugin and writes its native settings on the next run. For speech the runtime has no plugin yet: the build says so and ships without it, and a lib that claims the permission adds only its own entries.

Permission

Plugin

Several native apps from one app

Native Plugins

Package

Yes

No

Beyond the base set and the permissions, name only the plugins the app actually calls. In-app purchase, for example, has no permission of its own:

Android Setup

Prerequisites

The Android SDK with build-tools 35 or newer, and an emulator or a phone with USB debugging. Android Studio installs both.

Open the Android Studio download

A JDK 17 or newer. Android Studio bundles one; `JAVA_HOME` picks another. The Kotlin compiler is fetched on the first build.

Open the Android application ID docs

Run on a device

When the SDK is not at ~/Library/Android/sdk, point your shell at it:

In a second terminal, run the app on an emulator or a connected phone:

Commands and store builds

Open the Android app signing docs

Mobile command flags

iOS Setup

This prepares the bundle ID, signing, simulator runs and store builds. There is no Xcode project: the runtime compiles the app with Xcode's tools and reads the signing Xcode keeps. Run on a simulator first, then on a phone for device-only features.

Xcode 26 or newer, with an iOS 26 simulator runtime (Xcode › Settings › Components).

Open the Xcode download

Open the Apple bundle ID docs

An Apple developer team, for phone runs and releases.

Open the Apple signing docs

Signing checks

Desktop

It needs Rust through rustup, which installs the toolchain the build pins, plus this OS's native build tools:

Open rustup

The server needs `single` in `database.modes`. `env.server.<env>.ts` ships inside the app in plain text, so keep deployment secrets such as cloud keys out of it.

start-desktop is for development and testing, and build-desktop makes an app for this computer signed ad hoc. Distribution signing, notarization and installers are not akan commands yet.

Carry a static LGPL build. A build that loads its own shared libraries runs only where it was built, and one configured with --enable-nonfree (the macOS binary npm's ffmpeg-static downloads) may not be redistributed.

Verify Setup

A green build is not the finish line. On a real device, check that plugins load, native files are in place, permission prompts appear, and push arrives and opens the right screen.

Symptom

What to check

Push on each platform

Next

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
akan start-desktop myapp --server true
akan build-desktop myapp --server true --env main
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

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

