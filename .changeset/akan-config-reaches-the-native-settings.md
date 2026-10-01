---
"akanjs": minor
"@akanjs/devkit": patch
---

`akan.config.ts` reaches the native settings a store release needs, and an app keeps a different id on each store.

- `native.android.push` (channel, `smallIcon` relative to the app folder, `color`) and `native.ios.privacy` (the iOS
  privacy manifest) pass through, per target too.
- `native.icon` takes `{ image, backgroundColor }` and `native.splash` the runtime's `{ image, backgroundColor,
  autoHide, timeout }`, besides a path.
- `appId` is a string or one per platform — `{ ios, android, default }` — for an app whose listings already carry
  different ids. The app-link files serve each platform's own id.
