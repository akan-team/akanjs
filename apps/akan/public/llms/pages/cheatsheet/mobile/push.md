# Push Notifications

- Source: /cheatsheet/mobile/push
- Mirror: /llms/pages/cheatsheet/mobile/push.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Push Setup (#push-setup)

## Content

Push Notifications

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

## Code Examples

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

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

