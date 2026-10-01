---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`native` in `akan.config.ts` replaces `mobile`, with each platform's settings in a section of its own

**Breaking:** `mobile` is gone with no fallback; a config that still has it, or a key that moved, stops and names the
new place. `native` and each of `native.targets` take the same fields, a target merging objects key by key and
replacing lists and every other value, and without `targets` the app has one target, `default`. The next `akan start`
removes the old `.akan/mobile`.

The agent guide `akan agent install` writes now covers native apps: the `native` section, the `start-*` / `build-*`
commands and updates, with the full contract in the `runtimeRule` guideline.

| Before | Now |
|---|---|
| `mobile` | `native` |
| `mobile.native.X`, `targets.<t>.native.X` (`plugins`, `ios`, `android`, `desktop`) | `native.X`, `native.targets.<t>.X` |
| `native.push.android` | `android.push` |
| `native.privacy` | `ios.privacy` |
| `assets.icon`, `assets.splash` | `icon`, `splash` |
| `files["ios/<path>"]` | `ios.files["<path>"]` |
| `files["android/res/…"]`, `files["android/assets/…"]` | `android.files["res/…"]`, `android.files["assets/…"]` |
| `deepLinks.ios.teamId` | `ios.teamId` |
| `deepLinks.android.sha256CertFingerprints` | `android.sha256CertFingerprints` |
| `indexPath` on a target only | on `native` too, inherited by every target |
| root and target `plugins` joined, Android XML lists appended | the target's list replaces |
| `.akan/mobile/<target>/native/<platform>` | `.akan/native/<target>/build/<platform>` |
| `.akan/mobile/<target>/{dev,updates,web,bin}` | `.akan/native/<target>/{dev,updates,web,bin}` |
| `AkanMobileConfig`, `AkanMobileTargetConfig` | `AkanNativeAppConfig` (resolved: `AkanNativeAppResult`), `AkanNativeTarget`; `AkanNativeSettings` is what `native` and a target share |
| `AkanMobileUpdatesConfig`, `AkanMobileAppId`, `AkanMobileTargetDeepLinks` | `AkanNativeUpdatesConfig`, `AkanNativeAppId`, `AkanNativeDeepLinks` |
| `AkanMobileNativeConfig` | `AkanNativeIosConfig`, `AkanNativeAndroidConfig`, `AkanNativeDesktopConfig` |
| `AkanMobileTargetAssets`, `AkanMobileTargetFiles` | removed: `icon`, `splash` and each platform's `files` |
| `MobilePermission`, `MobileEnv`, `AppConfigResult.mobile` | `NativePermission`, `NativeEnv`, `AppConfigResult.native` |
