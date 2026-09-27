---
"akanjs": minor
---

Push notifications go to each device token over the service that issued it — APNs or FCM — and a tap opens its
page from the app's first frame.

- `akanjs/client/native` exports `push`: permission, `register()` answering `{ token, provider, platform }`,
  `unregister`, foreground presentation, and the `token`, `received` and `action` events. A tap that launched the
  app is held until the first listener, and `akanjs` routes it from boot: an `action` whose `data.url` is an app
  path opens it, and a foreground notification shows as a banner.
- `akanjs/client/capacitor` is gone.

Libraries synced into a workspace:

- `libs/util`: `usePushNotification` takes the native `push` plugin in a shell and Firebase on the web, and
  answers a `PushToken` of `{ token, platform, provider, deviceId }`, where `deviceId` is a random id kept per
  installation (`getPushDeviceId()`). `PushNotificationServer` reads `pushNoti.firebase` and `pushNoti.apns`
  (`teamId`, `keyId`, the `.p8` key's `privateKey`, `bundleId`, optional `environment`) and sends APNs itself
  over HTTP/2 with an ES256 provider token; a token APNs or FCM reports gone is dropped. Topics are gone.
- `libs/shared`: `notiInfo.deviceTokens` holds one `DeviceToken` per installation (token, provider, platform,
  `deviceId`, `updatedAt`), replaced on re-registration and removed on sign-out (`signoutUser(pushDeviceId)`).
  An `all` notification fans out to active users in pages of 500 and honours each one's notification settings,
  which the old topic send did not.

**Breaking.** Stored plain-string tokens are dropped on read and each device registers again on its next visit.
`addNotiDeviceTokenOfSelf` takes a `DeviceToken`, `subscribeToMegaphone` is gone, and a server sending to iOS
needs `pushNoti.apns`.
