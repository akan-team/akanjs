# Mobile App Architecture

- Source: /docs/arch/mobile
- Mirror: /llms/pages/docs/arch/mobile.md
- Section: docs
- Category: Architecture
- Priority: P0

## Headings

- Mobile App Architecture (#mobile-overview)
- CSR Web Workflow (#csr-web-workflow)
- Deep Links (#deep-links)
- Android Packaging Workflow (#android-packaging)
- iOS Packaging Workflow (#ios-packaging)
- Native Build Troubleshooting (#native-build-troubleshooting)

## Content

Mobile App Architecture

Akan mobile apps are built by opening a CSR web client inside a Capacitor native shell, then packaging that shell as Android and iOS apps. The screen is developed with the same Akan UI system, while Capacitor provides the native project, app identity, and device bridge.

If the app declares multiple basePaths, one Akan app can release multiple mobile packages. For example, a customer app, an admin stock app, and a field worker app can each open a different basePath while sharing the same services, permissions, database rules, and generated fetch calls.

CSR web surface

The app opens a Single Page Application client, not a separate native UI rewrite.

Capacitor package

Capacitor wraps the CSR client with Android and iOS project files, app metadata, and device APIs.

Shared business logic

Web and mobile use the same Akan service, signal, document, auth, and generated client helpers.

CSR Web Workflow

Akan mobile work starts as normal UI work. Build the page, component, st state, fetch calls, and dictionary text the same way you would for the web. Then test it as a CSR Single Page Application before packaging it into Android or iOS.

The csr=true search parameter is useful when you want to check SPA navigation, client state, page transition, and mobile-like behavior from the browser. This is faster than opening the simulator for every small UI change.

Controls how screens move. Detail pages often use stack; tab roots often use none.

Prevents content from colliding with notches, home indicators, and system bars.

Reserves space for fixed headers, tab bars, keyboards, or bottom actions.

Keeps CSR page state when users return to list or tab screens.

Akan CSR pages can apply mobile-style page transitions from pageConfig. Use the demos below to compare the four transition presets in a browser CSR environment before packaging the same pages into a native shell.

/csr/bottomup_en.mp4

Good for modal-like flows or pages that should rise from the bottom.

/csr/fade_en.mp4

Keeps the movement calm when the screen context changes without hierarchy.

/csr/scale_en.mp4

Adds a light zoom motion for focused entry into the next page.

/csr/stack_en.mp4

Works well for detail pages that push over a list or parent screen.

FAQ: Are hybrid apps worse than native apps?

Akan improves the user experience with page transitions, safe-area handling, inset support, CSR page cache, and mobile pageConfig. Device capabilities are not blocked by the hybrid model: Capacitor plugins can bridge camera, Bluetooth, device, haptics, keyboard, safe area, and other native APIs when needed.

Deep Links

Mobile targets can open Akan CSR routes from native URL schemes and verified web links. Akan writes the native iOS and Android project settings, packages the mobile target metadata, and routes the incoming URL through the CSR router.

Custom native URL schemes such as example://orders/detail. Akan adds iOS CFBundleURLTypes and Android VIEW intent filters.

Verified HTTPS app links such as https://example.com/orders/detail. Akan serves the association files from /.well-known/apple-app-site-association and /.well-known/assetlinks.json.

Fallback CSR route used when a deep link needs to rebuild a mobile navigation stack or when the hardware back button has no previous route.

When domains are configured, iOS requires deepLinks.ios.teamId. Android release builds require deepLinks.android.sha256CertFingerprints so the generated assetlinks.json can verify the package signature.

Deep link URLs are normalized into CSR paths. If the target route exists in the route manifest, Akan can restore the closest existing parent stack before pushing the final route.

Android Packaging Workflow

Use the Android flow when you want to run the CSR client in an emulator/device, verify the native Android project, or prepare Play Store artifacts. Akan prepares the Capacitor project, syncs Android, applies metadata, and builds APK or AAB outputs.

Use startAndroid while developing screens and checking live reload.

Use buildAndroid to prepare the Android project and verify the release bundle.

Use releaseAndroid with a non-local env and a store-ready assemble type such as aab.

Declare the Capacitor packages that your app uses in the app package.json with "*" versions. This lets Capacitor sync discover and link native plugins from the app project, while the workspace controls the actual installed versions.

Android release needs stable package identity and signing. Keep appId stable after release, increase buildNum for native releases, and prepare release keystore settings for Play Store artifacts.

For device APIs and Capacitor details, use the Capacitor documentation as the native bridge reference.

Capacitor Docs

iOS Packaging Workflow

Use the iOS flow when you want to run the CSR client in the iOS simulator/device, verify the Xcode project, or prepare App Store artifacts. Akan prepares the Capacitor project, syncs iOS, applies bundle metadata, and opens or builds the native project.

Use startIos while developing screens and checking live reload.

Use buildIos to prepare the iOS project, sync Capacitor, and verify the native build.

Use releaseIos with a non-local env, then finish signing, archive, and submission in the Apple toolchain.

For iOS, keep the same app-level Capacitor dependencies in apps/myapp/package.json before running start-ios or build-ios. If a plugin is missing there, the JavaScript module can load while the native iOS plugin is not linked, causing "plugin is not implemented" errors in the simulator.

iOS release needs stable bundle identity and Apple signing setup. Keep appId stable after release, increase buildNum for native releases, and verify provisioning, certificates, and App Store Connect settings before submission.

Native Build Troubleshooting

Most mobile build issues come from native toolchain setup, plugin sync state, or confusing local mode with release mode. Check these items before debugging page code.

Set ANDROID_HOME or android/local.properties so Gradle can find the SDK. Start an emulator or connect a device before running start-android.

Capacitor Android builds require a Java 21 compiler. If you see invalid source release: 21, update JAVA_HOME and PATH to JDK 21.

After adding or removing Capacitor packages, rerun start-ios/start-android or a build command so native projects regenerate plugin files.

If Safari console says a plugin is not implemented, the JavaScript module loaded but the native plugin was not linked. Check app package.json and rerun iOS sync/build.

safeArea handles device system bars; topInset and bottomInset handle app UI such as nav bars, tabs, and fixed bottom actions.

Local mode uses a live server.url and does not package built CSR assets into the native app. Release mode builds CSR output first and copies the target HTML into the Capacitor webDir.

## Code Examples

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  routes: [
    { domains: { main: ["example.com"] }, basePath: "store" },
    { domains: { main: ["example.com"] }, basePath: "admin" },
  ],
  mobile: {
    appName: "Example App",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      store: { basePath: "store", appName: "Example Store", appId: "com.example.store" },
      admin: { basePath: "admin", appName: "Example Admin", appId: "com.example.admin" },
    },
  },
};

export default config;
```

### Open a CSR page in the browser

```bash
http://localhost:8282/store/product/123?csr=true
```

### page/store/product/[productId].tsx

```ts
import type { PageConfig } from "akanjs/client";

export default function Page() {
  return <div>Product detail</div>;
}

export const pageConfig = {
  safeArea: true,
  topInset: true,
  bottomInset: true,
  transition: "stack",
  cache: true,
} satisfies PageConfig;
```

### Deep link config

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  mobile: {
    appName: "Example App",
    appId: "com.example.app",
    version: "1.0.0",
    buildNum: 1,
    targets: {
      default: {
        indexPath: "/explore",
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
  },
};

export default config;
```

### Android commands

```bash
akan start-android myapp --target store
akan build-android myapp --target store
akan release-android myapp --target store --env main --assembleType aab
```

### Android local prerequisites

```bash
# Gradle/Android builds require JDK 21
brew install openjdk@21
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"

# Android SDK should be discoverable by Gradle
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

### apps/myapp/package.json

```ts
{
  "dependencies": {
    "@capacitor/app": "*",
    "@capacitor/browser": "*",
    "@capacitor/camera": "*",
    "@capacitor/core": "*",
    "@capacitor/device": "*",
    "@capacitor/geolocation": "*",
    "@capacitor/haptics": "*",
    "@capacitor/keyboard": "*",
    "@capacitor/preferences": "*",
    "capacitor-plugin-safe-area": "*"
  }
}
```

### iOS commands

```bash
akan start-ios myapp --target store
akan build-ios myapp --target store
akan release-ios myapp --target store --env main
```

### Common local fixes

```bash
# Android SDK path
echo "sdk.dir=$HOME/Library/Android/sdk" > android/local.properties

# Java 21 for Gradle
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"

# Re-sync after plugin/package changes
akan start-android myapp --target store
akan start-ios myapp --target store
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.

