# Push Notifications

- Source: /cheatsheet/mobile/push
- Mirror: /llms/pages/cheatsheet/mobile/push.md
- Section: cheatsheet
- Category: Mobile
- Priority: P2

## Headings

- Push Setup (#push-setup)
- One Native Plugin (#push-plugins)
- Web Push (#web-push)
- Android Push (#android-push)
- iOS Push (#ios-push)
- Which APNs Environment You Built (#apns-environment)
- Client Registration (#client-registration)
- Where Tokens Live (#token-store)
- Send And Retire Dead Tokens (#token-lifecycle)

## Content

Push Notifications

Firebase Cloud Messaging. Akan sends to Android apps and browsers through it.

Apple's push service. The server sends to iOS apps through it directly; Firebase is not involved.

push token

The address of one app install. `register()` returns it with the `provider` that delivers to it.

`apns` on iOS, `fcm` on Android and the web. The server picks the sender by it.

A random id the app keeps in its own storage, so a rotated token replaces the old one.

VAPID key

The web push key pair. Its public half goes in the client env as `vapidKey`.

service account

The Firebase Admin credential the server sends to FCM with. It never reaches the client.

APNs auth key

The `.p8` key the server signs its APNs requests with. One key serves both APNs environments.

The iOS entitlement that says whether the app's tokens belong to APNs development or production.

Web

In the consoles

Firebase app

One Firebase project, with the web app and the Android app registered in it.

A Web Push certificate key pair, generated in Firebase's Cloud Messaging settings.

Push capability

Push Notifications turned on for the App ID in Apple Developer, so its profiles carry the entitlement.

APNs auth key (.p8)

Created under Keys in Apple Developer, with its Key ID and your Team ID. It goes to your server.

In the app folder

The public Firebase web config and `vapidKey`, under `firebase`.

The Android Firebase config, named by `native.android.googleServices` in the mobile target.

Adds the native push plugin to the mobile target in `akan.config.ts`.

On the server

In `env.server.*`: the service account the server sends to FCM with.

In `env.server.*`: the APNs key, its Key ID, your Team ID and the app's bundle id.

Registers with APNs directly, with no Firebase SDK. A tap, and a message that arrives in front, come through the shell's notification router.

An FCM module pinned with the runtime. The build reads `google-services.json` itself, so no Gradle plugin is involved.

Asks for permission, then returns a `PushToken`, or `undefined` when refused or unsupported.

Returns the token without asking. Registering shows no prompt, so check `getPermission()` first.

Reads the current permission state.

Shows the permission prompt and returns the answer.

Whether push can work here: the native plugin in a shell, the Firebase web config in a browser.

A native token rotates on its own; the listener gets each new `PushToken`. Returns the unsubscribe.

Routes the browser's notification clicks. The hook runs it on mount; a native shell needs nothing.

Stores this device's `DeviceToken` on the caller, replacing its earlier entry.

Removes one token from the caller: the push switch turned off.

Whether this device is registered, which is what the switch shows.

required

The notification title.

`actionRequired`, `notice`, `essential`, `suggestion` or `advertise`. The settings gate reads it.

The notification body.

A dictionary key for the body instead, resolved in the app's default locale.

Where a tap lands: a path inside the app.

A collapse key: a second push with the same tag replaces the first.

An image shown in the notification.

The app icon's badge count.

Push Setup

The prompt appears, a token comes back, and the server logs a send. Nothing arrives on the phone.

Words used on this page

Term

What you prepare

Item

Needed

Not needed

One Native Plugin

Web Push

Web push needs no native project at all. Register a Firebase web app and copy its public config into the client env.

Create or open a web app in Firebase Console.

Open Firebase Console

Open Firebase web config docs

Open Firebase web push credentials docs

The client env file then looks like this:

Android Push

Open Firebase Console and select the project.

Add an Android app.

Open Firebase Android setup docs

Open google-services.json docs

Android Notification Details

How a notification shows depends on whether the app is in front:

Open Android notification channel docs

iOS Push

iOS push needs no Firebase at all: the app registers with APNs, and the server sends to APNs itself. What you own is the capability on the App ID and the key the server signs with.

Open Apple push notification registration docs

Open APNs token-based connection docs

The target needs nothing else:

Which APNs Environment You Built

Command

Used for

Simulator and development-signed iPhone runs, through the APNs sandbox.

A simulator build.

The App Store profile: TestFlight and the App Store.

An ad hoc profile.

Client Registration

What usePushNotification() returns

Method

Where Tokens Live

Push token lifecycle

Client: register()

Server: addNotiDeviceTokenOfSelf

Server: push(userIds)

Settings accept it?

sendEach by provider

User device

Gone?

Server: drop the token

yes

The endpoints

Endpoint

Send And Retire Dead Tokens

Server credentials

Open Firebase Admin setup docs

Sending from a service

Load, save, then notify, with the push fire-and-forget:

What push() takes

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

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  secrets: ["secrets/**"],
  mobile: {
    appId: "com.myapp.app",
    targets: {
      default: {
        permissions: ["push"],
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
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  mobile: {
    appId: "com.myapp.app",
    targets: {
      default: {
        permissions: ["push"],
      },
    },
  },
};

export default config;
```

### apps/myapp/page/(user)/_layout.tsx

```ts
import { Notification } from "@libs/shared/client";
import { layout } from "akanjs/client";

export default layout().render(({ children }) => (
  <>
    <Notification.Zone.Initialize />
    {children}
  </>
));
```

### apps/myapp/ui/EnablePush.tsx

```ts
"use client";
import { st } from "@apps/myapp/client";
import { usePushNotification } from "@libs/util/webkit";
import { buttonRecipe } from "akanjs/ui";
import type { ReactNode } from "react";

interface EnablePushProps {
  className?: string;
  children: ReactNode;
}
export const EnablePush = ({ className, children }: EnablePushProps) => {
  const push = usePushNotification();
  return (
    <button
      className={buttonRecipe({ variant: "primary" }, className)}
      onClick={async () => {
        const pushToken = await push.register();
        if (pushToken) await st.do.registerPushToken(pushToken);
      }}
      type="button"
    >
      {children}
    </button>
  );
};
```

### libs/shared/lib/__scalar/deviceToken/deviceToken.constant.ts

```ts
import { dayjs, enumOf } from "akanjs/base";
import { via } from "akanjs/constant";

export class PushProvider extends enumOf("pushProvider", ["apns", "fcm"] as const) {}

export class DevicePlatform extends enumOf("devicePlatform", ["ios", "android", "web"] as const) {}

export class DeviceToken extends via((field) => ({
  token: field(String),
  provider: field(PushProvider, { default: "fcm" }),
  platform: field(DevicePlatform, { default: "web" }),
  deviceId: field(String).optional(),
  updatedAt: field(Date, { default: () => dayjs() }),
})) {}
```

### apps/myapp/env/env.server.local.ts

```ts
import type { ModulesOptions } from "../lib/option";
import { libEnv } from "./env.server.type";

export const env: ModulesOptions = {
  ...libEnv,
  pushNoti: {
    firebase: {
      type: "service_account",
      project_id: "...",
      private_key_id: "...",
      private_key: "...",
      client_email: "...",
    },
    apns: {
      teamId: "...",
      keyId: "...",
      privateKey: "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
      bundleId: "com.myapp.app",
    },
  },
};
```

### apps/myapp/lib/order/order.service.ts

```ts
import { serve } from "akanjs/service";
import * as db from "../db";
import type * as srv from "../srv";

export class OrderService extends serve(db.order, ({ service }) => ({
  notificationService: service<srv.NotificationService>(),
})) {
  async shipOrder(orderId: string) {
    const order = await this.orderModel.pickById(orderId);
    await order.ship().save();
    void this.notificationService.push([order.buyerId], {
      title: order.title,
      contentKey: "order.pushShipped",
      level: "notice",
      url: `/order/${order.id}`,
      tag: `order-${order.id}`,
    });
    return order;
  }
}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

