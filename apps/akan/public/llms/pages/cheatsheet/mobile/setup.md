# Setup

- Source: /cheatsheet/mobile/setup
- Mirror: /llms/pages/cheatsheet/mobile/setup.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Mobile Setup Flow (#overview)
- Mobile Config (#mobile-config)
- Capacitor Plugins (#capacitor-plugins)
- Android Setup (#android-setup)
- iOS Setup (#ios-setup)
- Verify Setup (#verify)

## Content

Setup

Mobile Setup Flow

Akan mobile apps reuse the CSR web app inside a Capacitor Android/iOS shell. The web app owns pages and business logic. The native shell owns package identity, device permissions, plugin linking, native files, signing, and store builds.

Start with the mobile identity, declare only the Capacitor plugins the app actually uses, then prepare Android and iOS builds. Push notifications and deep links are optional features; configure them only when the app needs them.

App name, package id, version, target basePath, permissions, native files.

List the native plugins used by this app in apps/myapp/package.json.

Prepare platform toolchains, app IDs, signing, and sync/build commands.

Mobile Config

The mobile block in akan.config.ts describes the native package. These values become Android application metadata, iOS bundle metadata, target entry paths, native permission hints, and native file copy rules.

Native display name. Users see it on the launcher/home screen unless the platform or store overrides it.

Stable native package identity. Android uses it as applicationId/package name; iOS uses it as bundle id. Any platform console registration must match it exactly.

version is the user-facing version. buildNum is the store build number and must increase for every native store submission.

The Akan client route opened by the native app. Use separate targets when one app repo ships separate customer/admin/partner apps.

Native capability hints such as "camera", "contacts", "location", and "push". They prepare Akan-side native metadata, but plugin-specific setup can still be required.

Copies app-owned files into generated native project paths. Use it for native config files that must live inside Android or iOS projects.

Do not change appId casually after release. Android and iOS treat a different appId as a different app.

Capacitor Plugins

Capacitor links native plugins from the app package. A workspace-level dependency is not enough if the app package does not declare the plugin. Add only the plugins your app actually calls.

Use * because the app package declares usage, not the resolved version. The workspace lockfile and root package control the actual installed version.

start-ios/start-android run Capacitor add/sync/run commands, but they do not add dependencies to apps/myapp/package.json. Declare the app dependencies first, then rerun the mobile command.

Small bridge plugins such as haptics or device often work after package declaration and sync.

Camera, geolocation, push, background work, file access, and auth plugins often require Info.plist, AndroidManifest, Xcode capabilities, Gradle settings, or console credentials.

Run start-ios/start-android or a build command again. That regenerates native plugin files.

Android Setup

Android setup prepares a generated Android project that can build and run on an emulator or physical device. The important path is package name consistency: mobile.appId and the generated Android applicationId must match.

Prerequisites

Android Studio with Android SDK installed.

JDK 21 available from your shell.

A stable mobile.appId such as com.example.shop.

Use during development. It prepares native files and runs the app on an emulator or connected device.

Use to verify the Android project builds without starting an interactive device run.

Use for store artifacts such as AAB. Release signing and Play Store settings matter here.

Success check

Generated applicationId matches mobile.appId.

The app runs on an emulator or physical device.

Push notifications are covered in Push Setup. Keep Android Setup focused on the native project and package identity first.

iOS Setup

iOS setup prepares the Xcode project, bundle identity, signing, simulator runs, and store-oriented builds. Push notifications are covered in Push Setup.

Xcode installed.

A stable mobile.appId used as the iOS bundle id.

Apple signing setup when running on a physical device or releasing.

Xcode checks

Open the generated iOS project after sync.

Check that bundle identifier matches mobile.appId.

Check signing team and provisioning when running on a physical device.

Run the app in a simulator first, then move to a physical device for device-only features.

Push notifications are covered in Push Setup.

Verify Setup

Do not stop at a successful build. Verify the actual feature surface: plugin availability, native file placement, permission prompt, push token creation, server send, and click routing.

If the console says plugin is not implemented, the JS package exists but the native plugin was not linked. Check app package.json and rerun sync/build.

Check package name, app/google-services.json, Google Services Gradle setup, notification permission, and Firebase project match.

Check real device testing, aps-environment entitlement, APNs key upload, provisioning profile, and GoogleService-Info.plist target membership.

Send a notification with url: /some/path and confirm tapping it opens the expected CSR route.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  mobile: {
    appName: "Shop",
    appId: "com.example.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        basePath: "shop",
        permissions: ["camera"],
      },
    },
  },
};

export default config;
```

### Base mobile shell dependencies

```ts
{
  "dependencies": {
    "@capacitor/app": "*",
    "@capacitor/core": "*",
    "@capacitor/device": "*",
    "@capacitor/keyboard": "*",
    "@capacitor/preferences": "*",
    "capacitor-plugin-safe-area": "*"
  }
}
```

### Push notification add-on dependencies

```ts
{
  "dependencies": {
    "@capacitor/push-notifications": "*",
    "@capacitor-community/fcm": "*"
  }
}
```

### 1. Configure local toolchain

```bash
brew install openjdk@21
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

### 2. Set Android package identity

```ts
const config: AppConfig = {
  mobile: {
    appName: "Shop",
    appId: "com.example.shop",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        basePath: "shop",
      },
    },
  },
};
```

### 3. Sync and build

```bash
akan start-android myapp --target default
akan build-android myapp --target default
akan release-android myapp --target default --env main --assembleType aab
```

### 1. Sync and build

```bash
akan start-ios myapp --target default
akan build-ios myapp --target default
akan release-ios myapp --target default --env main
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

