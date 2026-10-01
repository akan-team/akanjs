---
"akanjs": minor
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

Mobile apps build and run on `@akanjs/native` instead of Capacitor.

The runtime ships inside `akanjs` (vendored, not published on its own), so an app installs nothing extra for it.
It generates each target's native projects under `.akan/native/<target>/build/<platform>` and loads the web
root it assembles in `.akan/native/<target>/web` from the production CSR build — nothing native is committed.

- **Configuration (`akan.config.ts`).** A `native` section, and each of its `targets`, takes `appName`, `appId`,
  `fileName`, `version`, `buildNum`, `basePath`, `indexPath`, `icon`, `splash`, `permissions`, `plugins` (builtin
  ids such as `iap`), `deepLinks`, `ios.{infoPlist, entitlements, files}` and
  `android.{manifest, application, activity, googleServices, files}`; a target overrides the section field by field.
  `files` maps where a file lands (a path in the iOS app bundle, `res/<type>/<file>` or `assets/<path>` on Android)
  to its source. A Capacitor-era key fails, naming the keys the section takes.
- **Plugins declare, they do not edit projects.** `AkanPlugin.native` names the permission it serves and what the
  target then needs: native plugins, usage texts, plist and entitlement entries, Android permissions and features.
  It replaces `capacitor.configureNative`, `editIosAppDelegate` and `runtimePackages`. A release build names each
  plugin's default permissions as its capabilities.
- **Commands.** `build-`, `start-` and `release-ios|android` go through the runtime. `start-*` follows `akan start`
  (it refuses when no dev server answers), runs one target at a time and takes `--device` (and `--team`/`-T` on
  iOS); `--release` runs a release build of its own bundle. `release-ios` takes `--team` and `--ad-hoc`;
  `release-android` builds an `.aab` by default (`--assemble-type apk` for an `.apk`), signed from
  `MYAPP_RELEASE_STORE_FILE`, `MYAPP_RELEASE_STORE_PASSWORD` and `MYAPP_RELEASE_KEY_ALIAS` (plus
  `MYAPP_RELEASE_KEY_PASSWORD` when the key has its own), which it checks before anything builds. `build-*` take
  `--debug`, and
  `akan doctor --ios` adds the native toolchain checks.
- **Pages.** `akanjs/client/native` wraps the native plugins a page uses, and `isNativeApp()` is true only inside
  a shell. `Device` reads the runtime's device plugin and safe-area variables, `storage` the shell's preferences,
  and the new `secretStorage` keeps the JWT and refresh tokens in the OS credential store (cleared on the first
  launch after a reinstall). `useCamera` is one hook — the native sheet asks camera or library and answers an
  upright JPEG data URL — and `useGeoLocation` answers the flat native position. A native release bundle opened at
  `/` starts on its target's home, and a target opened in a browser is a web device.

**Breaking, with a migration path.**

- Delete the app's `ios/`, `android/`, `mobile/` folders and `capacitor.config.*`: `akan sync`, `akan doctor` and
  `akan quality scan` now refuse them in an app root and say why.
- Move Capacitor settings to the keys above; `google-services.json` goes to `native.android.googleServices`, and
  `GoogleService-Info.plist` is no longer needed.
- Removed: `-g/--regenerate`, `--open`, `--allow-provisioning-updates`, `configure-app`, `codepush`,
  `release-source`, `capacitor.base.config`, `useContact`, `useCodepush`, the native path of `useSpeech`, and every
  `@capacitor/*`, `@capacitor-community/*`, `@capgo/*`, `capacitor-plugin-safe-area`, `cordova-plugin-purchase`
  and `@trapezedev/project` dependency — `akanjs` no longer lists them as peers.
- `baseSt` drops `deviceToken`; the notification store owns it.
