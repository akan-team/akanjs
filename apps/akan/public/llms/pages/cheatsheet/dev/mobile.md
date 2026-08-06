# Mobile

- Source: /cheatsheet/dev/mobile
- Mirror: /llms/pages/cheatsheet/dev/mobile.md
- Section: cheatsheet
- Category: Development
- Priority: P2

## Headings

- Mobile Setup Flow (#overview)
- Mobile Config (#mobile-config)
- Capacitor Plugins (#capacitor-plugins)
- Android Setup (#android-setup)
- iOS Setup (#ios-setup)
- Push Setup (#push-setup)
- Deep Link Setup (#deep-link-setup)
- Verify Setup (#verify)

## Content

Mobile

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

Push Setup

Push setup has three separate surfaces: web push, Android push, and iOS push. Akan gives one client API, usePushNotification(), but the platform setup is still different.

Akan automates

Serving /firebase-messaging-sw.js for web push.

Android POST_NOTIFICATIONS permission when target.permissions includes push.

iOS aps-environment, remote-notification background mode, and Capacitor AppDelegate bridge.

You provide

App package dependencies for Capacitor push and FCM.

Firebase web config, google-services.json, and GoogleService-Info.plist.

Firebase Console app registration and APNs credentials.

Web push

Create or open a Firebase web app in Firebase Console.

Copy the public Firebase web config into env.client.*.

Create a Web Push certificate key pair and put the VAPID public key in vapidKey.

Akan serves /firebase-messaging-sw.js automatically from the client Firebase config.

Android push

Open Firebase Console and select the project.

Add an Android app.

Enter the same package name as mobile.appId.

Download google-services.json.

Place it at apps/myapp/public/google-services.json.

google-services.json is a client/native Firebase config file. It is not the Firebase Admin service account JSON. Server credentials belong in env.server.*.

Android notification details

Android can require extra notification behavior outside token registration. Create channels when you need stable categories such as order updates or chat messages, set the default icon/color in the native project if the launcher icon is not appropriate, and decide foreground presentation behavior in app code.

iOS push

Register an iOS app in Firebase using the same bundle id as mobile.appId.

Download GoogleService-Info.plist.

Copy it into the generated App target and confirm target membership in Xcode.

Add permissions: ["push"] to the mobile target. Akan writes the iOS push entitlement, remote-notification background mode, and the AppDelegate bridge needed by Capacitor.

Akan sets aps-environment automatically: local, simulator, and debug runs use development; release builds use production.

In Apple Developer, prefer creating an APNs auth key from Keys and upload the .p8 key in Firebase Console > Cloud Messaging. If you are in Certificates and only see Apple Push Notification service SSL, that is the certificate-based APNs setup instead.

Upload APNs credentials for both development and production in Firebase. Development is required for simulator/debug delivery; production is required for TestFlight and App Store delivery.

Keep GoogleService-Info.plist in the app folder, then copy it into the generated iOS project with mobile.files. If Firebase Console sends to a token but nothing arrives while simctl push works, check the APNs development/production credential that matches the built aps-environment.

APNs environment mapping

Local simulator/device runs use the APNs sandbox path.

Release build generation uses the production APNs environment.

Store/TestFlight release uses the production APNs environment.

Do not add firebase-ios-sdk directly in Xcode when using @capacitor-community/fcm. Direct Firebase Swift Package products can conflict with the plugin's Firebase dependency version.

Why two Capacitor plugins?

@capacitor/push-notifications handles the OS push bridge: permission, native registration, notification click events, and Android channels. @capacitor-community/fcm handles Firebase-specific token access such as FCM.getToken(). Akan uses FCM as the provider, so native apps need both.

Use for notification permission, native registration, notification action/click listener, delivered notifications, and Android notification channels.

Use for Firebase Messaging token access. This keeps Android and iOS server delivery on the same Firebase Admin send({ token }) contract.

Client registration

Call register() from a user-facing action such as a settings toggle or an enable-notifications button. It may ask for permission. After it returns a PushToken, immediately pass that token to your app's storage API.

registerPushToken is not an Akan built-in API. It is the app-level API shown below. Name it and shape it to match your user/device domain.

Requests permission when needed and returns a PushToken containing token, platform, provider, and optional deviceId.

Store the returned PushToken through an app-level user/device API. Akan does not decide where your user domain keeps device credentials.

Send a url field from the server. Akan normalizes it into data.url so notification clicks can enter the CSR router.

Manage push tokens in the app DB

Each device's token is managed at the app level, not by Akan. This section explains how to store and manage tokens in a database and how to send notifications using active tokens.

The methods described in this section are examples. Manage tokens in a way that matches your app's structure.

Deep Link Setup

Deep links open a CSR route from outside the app. Use schemes for app-only URLs and domains for verified HTTPS links. Push notification clicks use the same routing path through data.url.

Think of deep link as the feature, and schemes/domains as the two common ways to implement it. Scheme links such as shop://orders/1 are easy to test and app-only. Domain links such as https://shop.example.com/orders/1 require iOS/Android verification, but they behave like normal web links and are better for sharing, emails, and push notification URLs.

Custom app-only URLs such as shop://orders/1. Easy to test, but not domain-verified.

Verified HTTPS links such as https://shop.example.com/orders/1. iOS uses apple-app-site-association; Android uses assetlinks.json.

Apple Developer Team ID used for universal link association files.

Signing certificate fingerprints used by Android app links. Debug builds and release builds usually have different fingerprints.

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

### apps/myapp/env/env.client.local.ts

```ts
export const env = {
  firebase: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "...",
    vapidKey: "...",
  },
};
```

### Android push file copy

```ts
const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        permissions: ["push"],
        files: {
          android: {
            "app/google-services.json": "public/google-services.json",
          },
        },
      },
    },
  },
};
```

### iOS push file copy

```ts
const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        permissions: ["push"],
        files: {
          ios: {
            "App/GoogleService-Info.plist": "public/GoogleService-Info.plist",
          },
        },
      },
    },
  },
};
```

### Client registration

```ts
import { fetch } from "@apps/myapp/client";
import { usePushNotification } from "akanjs/webkit";

export function EnablePushButton() {
  const push = usePushNotification();

  const handleClick = async () => {
    const pushToken = await push.register();
    if (!pushToken) return;
    await fetch.registerPushToken(pushToken);
  };

  return <button onClick={handleClick}>Enable push</button>;
}
```

### apps/myapp/lib/userDevice/userDevice.constant.ts

```ts
export class PushProvider extends enumOf("pushProvider", ["fcm"] as const) {}
export class PushPlatform extends enumOf("pushPlatform", ["web", "android", "ios"] as const) {}

export class UserDeviceToken extends via((field) => ({
  userId: field(String),
  token: field(String),
  platform: field(PushPlatform),
  provider: field(PushProvider),
  deviceId: field(String).optional(),
  disabledAt: field(Date).optional(),
})) {}
```

### apps/myapp/lib/userDevice/userDevice.signal.ts

```ts
export class UserDeviceEndpoint extends endpoint(srv.userDevice, ({ mutation }) => ({
  registerPushToken: mutation(Boolean, { guards: [User] })
    .body("pushToken", cnst.UserDeviceToken)
    .with(Self)
    .exec(async function (pushToken, self) {
      await this.userDeviceService.registerPushToken(self.id, pushToken);
      return true;
    }),
  invalidatePushToken: mutation(Boolean, { guards: [Admin] })
    .body("token", String)
    .exec(async function (token) {
      await this.userDeviceService.invalidatePushToken(token);
      return true;
    }),
})) {}
```

### apps/myapp/ui/PushTokenRegister.tsx

```ts
import { fetch } from "@apps/myapp/client";
import { usePushNotification } from "akanjs/webkit";

const push = usePushNotification();
const pushToken = await push.register();

if (pushToken) {
  await fetch.registerPushToken({
    token: pushToken.token,
    platform: pushToken.platform,
    provider: pushToken.provider,
    deviceId: pushToken.deviceId,
  });
}
```

### Server send

```ts
await pushNotificationServer.send({
  token,
  title: "Order update",
  body: "Your order is ready",
  url: "/orders/detail",
});
```

### Cleanup after failed send

```ts
try {
  await pushNotificationServer.send({ token, title, body, url });
} catch (error) {
  if (isInvalidPushTokenError(error)) {
    await fetch.invalidatePushToken(token);
  }
}
```

### apps/myapp/akan.config.ts

```ts
const config: AppConfig = {
  mobile: {
    targets: {
      default: {
        deepLinks: {
          schemes: ["shop"],
          domains: ["shop.example.com"],
          ios: {
            teamId: "TEAMID",
          },
          android: {
            sha256CertFingerprints: [
              "AA:BB:CC:DD:...",
            ],
          },
        },
      },
    },
  },
};
```

### Android debug SHA-256

```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

