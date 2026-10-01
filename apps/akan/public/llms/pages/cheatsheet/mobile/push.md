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

Push Setup

The prompt appears, a token comes back, and the server logs a send. Nothing arrives on the phone.

Push is one client API, `usePushNotification()`, and two senders on the server: APNs for iOS, FCM for Android and the web. A token sent without its sender's credential is skipped with one log line, so prepare every row that applies to you.

Words used on this page

Term

- FCM: Firebase Cloud Messaging. Akan sends to Android apps and browsers through it.

- APNs: Apple's push service. The server sends to iOS apps through it directly; Firebase is not involved.

- push token: The address of one app install. `register()` returns it with the `provider` that delivers to it.

- provider: `apns` on iOS, `fcm` on Android and the web. The server picks the sender by it.

- deviceId: A random id the app keeps in its own storage, so a rotated token replaces the old one.

- VAPID key: The web push key pair. Its public half goes in the client env as `vapidKey`.

- service account: The Firebase Admin credential the server sends to FCM with. It never reaches the client.

- APNs auth key: The `.p8` key the server signs its APNs requests with. One key serves both APNs environments.

- aps-environment: The iOS entitlement that says whether the app's tokens belong to APNs development or production.

What you prepare

Item

Web

Android

iOS

- In the consoles

  - Firebase app: One Firebase project, with the web app and the Android app registered in it.

  - VAPID key: A Web Push certificate key pair, generated in Firebase's Cloud Messaging settings.

  - Push capability: Push Notifications turned on for the App ID in Apple Developer, so its profiles carry the entitlement.

  - APNs auth key (.p8): Created under Keys in Apple Developer, with its Key ID and your Team ID. It goes to your server.

- In the app folder

  - env.client.*: The public Firebase web config and `vapidKey`, under `firebase`.

  - google-services.json: The Android Firebase config, named by `native.android.googleServices` in `akan.config.ts`.

  - permissions: ["push"]: Adds the native push plugin; it goes in `native` in `akan.config.ts`.

- On the server

  - pushNoti.firebase: In `env.server.*`: the service account the server sends to FCM with.

  - pushNoti.apns: In `env.server.*`: the APNs key, its Key ID, your Team ID and the app's bundle id.

Needed

Not needed

One Native Plugin

A native app gets push from the runtime's `push` plugin, and `permissions: ["push"]` in `native` is all that adds it. There is no package to install. The plugin speaks each platform's own service:

- iOS · APNs — push.register() → { provider: "apns" } — Registers with APNs directly, with no Firebase SDK. A tap, and a message that arrives in front, come through the shell's notification router.

- Android · FCM — push.register() → { provider: "fcm" } — An FCM module pinned with the runtime. The build reads `google-services.json` itself, so no Gradle plugin is involved.

`usePushNotification()` hides which is which: it calls the plugin in a native shell and Firebase in a browser, and hands back one `PushToken` shape either way. Which permission adds which plugin is on Setup.

Web Push

Web push needs no native project at all. Register a Firebase web app and copy its public config into the client env.

Create or open a web app in Firebase Console.

Open Firebase Console

Copy its public config into `env.client.*`, under `firebase`.

Open Firebase web config docs

Generate a Web Push certificate key pair and put its public key in `vapidKey`.

Open Firebase web push credentials docs

The client env file then looks like this:

**Only public values go here.** `env.client.*` ships to the browser; the server's service account belongs in `env.server.*`.

**Four fields are required.** Without `apiKey`, `projectId`, `messagingSenderId` or `appId`, `register()` returns `undefined` on the web.

**One file per environment.** `env.client.ts` picks `env.client.<env>.ts` by `AKAN_PUBLIC_ENV`, so fill in every environment you deploy.

**The service worker is generated.** With `firebase` in the client env, `akan sync` writes `public/firebase-messaging-sw.js` for each environment.

Android Push

Android push is a Firebase Android app whose package name matches `native.appId` exactly, plus one config file `native.android.googleServices` names.

Open Firebase Console and select the project.

Add an Android app.

Open Firebase Android setup docs

Enter the same package name as `native.appId`.

Download `google-services.json`.

Open google-services.json docs

Place it at `apps/myapp/secrets/google-services.json`.

Then name it in `native.android` in `akan.config.ts`:

**The build converts the file itself.** It picks the client whose package name is the target's `appId` (a debug build falls back to it too), and a file without that app fails the build with the names it has.

**`secrets/`, not `public/`.** Everything in `public/` is served to every visitor. `secrets` keeps the file out of git and carries it with `akan upload-env` and `akan download-env`.

**`permissions: ["push"]`** adds the push plugin and `POST_NOTIFICATIONS` to the app.

**`google-services.json` is not the server credential.** It is the Android app's Firebase config, not the Firebase Admin service account JSON. The server credential goes in `env.server.*`, as the last section shows.

Android Notification Details

How a notification shows depends on whether the app is in front:

Open Android notification channel docs

**Foreground.** The framework asks the plugin to show a push that arrives while the app is open (banner, list, sound, badge), so it can be tapped like any other.

**Background.** FCM draws the notification itself while the app is not in front. A tap opens the app and routes the push's `url`.

**Channel, icon and color.** Firebase posts into its default channel with the launcher icon, which the status bar draws as a gray square. `native.android.push` names a `channel` (`{ id, name, importance? }`), a `smallIcon` (a white-on-transparent PNG in the app folder) and an accent `color` instead.

iOS Push

iOS push needs no Firebase at all: the app registers with APNs, and the server sends to APNs itself. What you own is the capability on the App ID and the key the server signs with.

In Apple Developer, open Identifiers, pick the App ID that matches `native.appId`, and turn on Push Notifications.

Open Apple push notification registration docs

Under Keys, create a key with Apple Push Notifications service enabled and download its `.p8`. Apple lets you download it once; note its Key ID and your Team ID.

Open APNs token-based connection docs

Put the three into `pushNoti.apns` on the server, as the last section shows.

Add `permissions: ["push"]` to `native`.

Nothing else goes in the config:

**No `GoogleService-Info.plist`, no firebase-ios-sdk.** The push plugin adds `UIBackgroundModes` and `aps-environment` to the app itself.

**An iOS token is an APNs device token**, with `provider: "apns"`. FCM does not accept it, so the server sends it to APNs itself.

**`xcrun simctl push` needs no server.** It hands a payload to a simulator, which tests the tap and the routing. Put `url` at the top level, beside `aps`, as the server does.

**Keep the `.p8` on the server.** It signs pushes to every app of your team. It belongs in `env.server.*`, never in `env.client.*` or `public/`.

Which APNs Environment You Built

You never write `aps-environment`: the push plugin declares `development`, and a build signed with a provisioning profile takes the profile's value. It decides which APNs environment the device's token belongs to.

Command

Used for

Simulator and development-signed iPhone runs, through the APNs sandbox.

A simulator build.

The App Store profile: TestFlight and the App Store.

An ad hoc profile.

**The server tries both.** With `environment` unset, a send goes to production first and, when APNs answers `BadDeviceToken` (a development build's token), to the sandbox. Set `environment` to pin one.

**One key serves both.** An APNs auth key is not tied to an environment, so a development run and a TestFlight build need nothing different on the server.

**A token no environment knows is dropped.** A `410`, or `BadDeviceToken` from the last environment tried, removes the token from its owner.

Client Registration

An app that mounts `libs/shared` needs no code of its own. Mount `Notification.Zone.Initialize` once in a signed-in layout: it registers the device again on every visit and on every token a native shell rotates, and never asks for permission.

The permission prompt belongs to a user action, because Chrome ignores a request with no gesture behind it and iOS refuses one. `Notification.Util.PushSetting` is that switch. A button of your own calls `register()` and hands the `PushToken` to the store:

**`registerPushToken` comes with `libs/shared`.** Without it, hand the `PushToken` to an endpoint of your own; its fields map one to one onto the `DeviceToken` shown next.

What usePushNotification() returns

Import it from `@libs/util/webkit`. Most screens need only `register()`.

Method

- register(): Asks for permission, then returns a `PushToken`, or `undefined` when refused or unsupported.

- getToken(): Returns the token without asking. Registering shows no prompt, so check `getPermission()` first.

- getPermission(): Reads the current permission state.

- requestPermission(): Shows the permission prompt and returns the answer.

- isSupported(): Whether push can work here: the native plugin in a shell, the Firebase web config in a browser.

- onTokenChange(listener): A native token rotates on its own; the listener gets each new `PushToken`. Returns the unsubscribe.

- initClickBridge(): Routes the browser's notification clicks. The hook runs it on mount; a native shell needs nothing.

**PushToken** holds `token`, `platform` (`web` | `android` | `ios`), `provider` (`apns` | `fcm`) and `deviceId`, the installation id `getPushDeviceId()` keeps in the app's storage.

**Built-in storage.** With `libs/shared`, `st.do.registerPushToken(pushToken)` stores it on the signed-in user. The next section shows where.

**Click routing.** Send a `url` and a tap opens it through the CSR router. In a native shell the framework routes it from boot, the tap that launched the app included; in a browser the service worker hands it to the open tab. Only a path inside the app is followed.

Where Tokens Live

`libs/shared` keeps every device's token on its owner: `user.notiInfo.deviceTokens`, one `DeviceToken` per installation. The field is secret, so it never leaves the server.

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

The scalar holds what `register()` returned, plus when the server stored it:

**One entry per installation.** Registering again with the same `token` or the same `deviceId` replaces that entry, so a rotated token does not pile up.

**`updatedAt` is the server's.** It is written when the token is registered; the value a client sends is not used.

**Signing out drops this device.** `signoutUser` sends the installation's `deviceId`, so a handed-down phone does not get the previous person's notifications.

**Older tokens are skipped.** A token stored as a plain string before this shape is not read; `Notification.Zone.Initialize` registers the device again on its next visit.

The endpoints

All three are `User`-guarded mutations and queries on the `user` signal, called through the notification store's `registerPushToken`, `unregisterPushToken` and `loadPushState`:

Endpoint

- addNotiDeviceTokenOfSelf(deviceToken): Stores this device's `DeviceToken` on the caller, replacing its earlier entry.

- subNotiDeviceTokenOfSelf(token): Removes one token from the caller: the push switch turned off.

- hasNotiDeviceTokenOfSelf(token): Whether this device is registered, which is what the switch shows.

**`Self` supplies the owner,** so a client cannot register a token under someone else's account.

**Kept off MCP.** An agent has no device, so the token endpoints are `mcp: false`.

Send And Retire Dead Tokens

`notificationService.push(userIds, payload)` is the one call a domain service makes. It reads each recipient's settings, sends every accepted device through its own provider, and drops the tokens APNs or FCM call gone.

Server credentials

Put both senders' credentials under `pushNoti` in each server env file:

Open Firebase Admin setup docs

**`firebase` is the service account** from Firebase Console, under Project settings, then Service accounts. Copy the five fields above from the downloaded JSON. Android and the web need it.

**`apns` is the `.p8` key.** `privateKey` is the file's text (`\n` escapes are fine), `keyId` and `teamId` come from Apple Developer, and `bundleId` is the app's `native.appId`. iOS needs it.

**Neither is `google-services.json`.** That file is the Android app's config; these sign every send.

**A sender without credentials sends nothing and throws nothing.** Its tokens are skipped with one `warn` line, such as `pushNoti.apns is not configured`, and counted as failures.

Sending from a service

Load, save, then notify, with the push fire-and-forget:

**The settings gate is one function.** `NotificationService.accepts`: `block` and `disagree` stop everything, `fewer` lets only `actionRequired` and `essential` through, a future `pauseUntil` stops everything, and a user without tokens is skipped.

**Dead tokens go at once.** APNs `410` or `BadDeviceToken`, and FCM `messaging/registration-token-not-registered`, remove the token from its owner in the same call.

**It never throws.** A push is best effort: `push()` answers what it reached (`targetUserIds`, `tokenNum`, `successCount`, `prunedTokens`), and a failed send never fails the caller's own work.

**A megaphone takes the same gate.** An admin notification of `type: "all"` goes to every active user, 500 at a time, through `accepts` like any other push.

What push() takes

- title (string): The notification title.

  - required

- level (cnst.NotiLevel): `actionRequired`, `notice`, `essential`, `suggestion` or `advertise`. The settings gate reads it.

- content (string): The notification body.

- contentKey (string): A dictionary key for the body instead, resolved in the app's default locale.

- url (string): Where a tap lands: a path inside the app.

- tag (string): A collapse key: a second push with the same tag replaces the first.

- imageUrl (string): An image shown in the notification.

- badge (number): The app icon's badge count.

**No topics.** A topic cannot hold an APNs token, cannot ask a person's settings and never reports a dead token, so every send goes to stored tokens. Without `libs/shared`, call `PushNotificationServer.sendEach(targets, message)` from `@libs/util/srvkit` with `{ token, provider }` targets, and stop storing the `invalidTokens` it returns.

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
  native: {
    appId: "com.myapp.app",
    permissions: ["push"],
    android: { googleServices: "secrets/google-services.json" },
  },
};

export default config;
```

### apps/myapp/akan.config.ts

```ts
import type { AppConfig } from "akanjs";

const config: AppConfig = {
  native: {
    appId: "com.myapp.app",
    permissions: ["push"],
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

