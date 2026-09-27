# @akanjs/native

The native runtime of Akan.js. It turns an app's CSR build (one HTML file with the bundle inlined,
plus `public/`) into iOS, Android, macOS, Windows and Linux apps, without Capacitor, Xcode projects,
Gradle or CocoaPods.

This package is internal to akanjs. It is not published on its own (`private: true`): akanjs copies it
into its `dist/vendor/` folder, apps use the `akanjs/native` wrapper, and the akanjs devkit calls the
build API. The docs call it akan-native for short.

## What it contains

| Part | Where | What it does |
|---|---|---|
| Page runtime | `packages/core`, `packages/react` | The bridge client in the WebView, `definePlugin`, env, React hooks |
| Plugins | `plugins/<id>` | 41 plugins: a TypeScript API, a web fallback, and Swift, Kotlin or desktop code, described by `native-plugin.json` |
| iOS shell | `native/ios` | Swift: WKWebView, the `app://` scheme handler, the reply bridge |
| Android shell | `native/android` | Kotlin: WebView, MessagePort bridge, asset server, the pinned Maven lock for the push (FCM) and iap (Play Billing) modules |
| Desktop shell | `native/desktop`, `packages/desktop` | Rust cdylib (TAO + WRY behind a C ABI) with Bun running the plugin host in a Worker |
| Build tools | `packages/cli` | Config, the programmatic build API, and one builder per platform. Swift is compiled with `swiftc`, Android with aapt2, kotlinc, d8 and apksigner, and the desktop app with cargo and `bun build --compile` |

## Entry points

| Import | Contents |
|---|---|
| `@akanjs/native/api` | The build API for the akanjs devkit: `build`, `run`, `dev`, `release`, `validateConfig` ([docs/api.md](docs/api.md)) |
| `@akanjs/native/config` | `defineConfig` and the config types |
| `@akanjs/native/core` | The page runtime: `platform`, `env`, `AkanNativeError`, `fileBlob`, `definePlugin` |
| `@akanjs/native/react` | `useLiveValue`, `usePluginEvent` |
| `@akanjs/native/plugins/<id>` | A plugin's page API, for example `@akanjs/native/plugins/camera` |
| `@akanjs/native/desktop` | `defineDesktopPlugin` for desktop plugin code |

Plugins are named in the config by builtin id (`"camera"`) or by the absolute path of a plugin
folder. akanjs passes absolute paths.

## Embedding in akanjs

- Inside the package, modules import each other by relative path. A copy therefore works without
  rewriting. Only akanjs's own `@akanjs/native/...` imports need rewriting.
- The package root is found by walking up to `native/android/maven.lock.json`, not through
  `package.json`. The copy may leave out `package.json`, `tsconfig.json`, `docs/`, `scripts/`,
  `examples/` and every `test/` folder. It must keep:
  - `packages/*/src`
  - `packages/core/vectors` (debug builds embed them)
  - `plugins/*` without `test/`
  - `native/`
- Build output stays outside the package:
  - the app's build goes to the `outDir` the caller passes (default `<app>/.akan/native/build/<platform>`)
  - toolchains, keys and caches go to `~/.akan/native` (`AKAN_NATIVE_HOME`)
  - Cargo builds go to `~/.akan/native/cache/desktop-target` (`CARGO_TARGET_DIR`)

## Requirements

- Bun 1.4 or later
- iOS: Xcode 26 or later. Apps run on iOS 16 and later.
- Android: the Android SDK (build-tools 35 or later, 37 recommended; platform 36) with its licenses
  accepted by you, and JDK 21 (Android Studio's JBR works). Apps run on Android 10 (API 29) and later.
- Desktop: Rust through rustup (the version is pinned in `native/desktop/rust-toolchain.toml`).
- kotlinc, bundletool and the pinned Maven libraries are downloaded into `~/.akan/native`, each checked
  against a pinned SHA-256. The Android SDK licenses are never accepted for you.

## Developing

```sh
bun install
bun test                                     # TypeScript tests
bun run typecheck
bun scripts/native-vectors.ts                # shared vectors against the Swift and Kotlin kernels
CARGO_TARGET_DIR=~/.akan/native/cache/desktop-target/dev cargo test --manifest-path native/desktop/Cargo.toml

bun run akan-native doctor                   # toolchains, pinned versions against what is found
bun run akan-native test macos --app examples/sample     # the sample app's self-test (ios, android, web too)
bun run akan-native test android --app examples/sample --avd <name>
bun scripts/vm/linux.ts bun run akan-native test linux --app examples/sample   # Linux in Docker
bun scripts/vm/windows.ts test               # Windows in a VM over SSH
```

`bun run akan-native` is the development CLI for this package (self-tests, toolchains, doctor, plugin
code generation). Apps build through `akan` and the API instead.

## Documents

- [docs/api.md](docs/api.md): the build API that the akanjs devkit calls
- [docs/architecture.md](docs/architecture.md): shells, bridge protocol, security layers, build and signing
- [docs/plugins.md](docs/plugins.md): plugins and their platform support
- [docs/plugin-authoring.md](docs/plugin-authoring.md): writing a plugin
- [docs/requirements.md](docs/requirements.md): requirements and decisions
- [docs/testing-windows-linux.md](docs/testing-windows-linux.md): testing Windows and Linux from a Mac
- [docs/move-checklist.md](docs/move-checklist.md): checks before a move into akanjs (`bun scripts/move-check.ts`)

## License

MIT, see [LICENSE](LICENSE). Third-party software is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
