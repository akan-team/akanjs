<!-- akan:generated -->

## Native Apps — The `native` Section

An app's iOS, Android and desktop (macOS, Windows, Linux) apps are the `native` section of its `akan.config.ts`.
Each ships the CSR bundle on the native runtime, so one set of pages serves the web and every app.

```ts
const config: AppConfig = {
  native: {
    appName: "Board",
    appId: "com.example.board", // or one per platform: { default, ios, android, macos, windows, linux }
    version: "1.2.0",
    buildNum: 12,
    indexPath: "/explore", // the first page, and where a deep link's stack and a back with no history land
    permissions: ["camera", "push"],
    plugins: ["file-picker", "keep-awake"],
    deepLinks: { schemes: ["board"], domains: ["board.example.com"] },
    ios: { teamId: "ABCDE12345" }, // universal links for deepLinks.domains
    android: { googleServices: "secrets/google-services.json", sha256CertFingerprints: ["…"] }, // FCM, app links
    desktop: { server: true },
  },
};
```

- **Without `targets` the app has one target, `default`** — the usual case, with every setting in the section
  itself; `native: { desktop: { server: true } }` alone is a whole desktop app that carries its server. Defaults:
  the app's folder name for `appName` and `fileName`, an id made from the repository's and the app's names for
  `appId`, `0.0.1` and `1`.
- **A target is another app made from the section.** It has the section's shape minus `targets` and overrides it
  field by field: plain objects merge key by key — `ios`, `android`, `desktop`, `deepLinks`, `updates` and the
  objects inside them — and every other value replaces the section's, a list included, so a target's `plugins` or
  `permissions` is its whole list. An `icon` or `splash` object is one value. Once `targets` is declared, only the
  targets it names are built:

  ```ts
  native: {
    appId: "com.example.board",
    plugins: ["file-picker"],
    targets: {
      board: {},
      lobby: { appId: "com.example.lobby", plugins: ["file-picker", "keep-awake"], desktop: { recovery: "reload" } },
    },
  },
  ```

- **A platform section may name its own `indexPath`**, which wins on that platform: `indexPath: "/mobile"` with
  `desktop: { indexPath: "/" }` opens the phones on `/mobile` and the desktop app on `/`, from one target, so no
  command needs `--target`. It moves the dev build's first page and the `indexPath` its bundle carries alike.
- **`basePath` is the client a target opens.** An app with no basePaths leaves it out. Without `targets`, the one
  target opens the basePath named like the app when there is one; in an app with basePaths, a target that names
  none is a template, and `--target <basePath>` builds that client from it.
- Every native command takes `--target <name>`. `build-*`, `release-*`, `update-keygen` and `publish-update` also
  take `all`; `start-*` and `pack-update` handle one target at a time.
- **Everything a build makes is under `dist/native/<app>/<target>/`**: `build/<platform>` (`build-ios`,
  `build-android`, `build-desktop`), `dev/<platform>` (the dev builds `start-*` run), `updates` (what
  `publish-update` signs and `pack-update` packs), `web` (the bundle the app loads) and `bin`. It sits outside
  `dist/apps/<app>`, which every `akan build` empties, so a signed release waiting for upload survives the next
  build; `akan start` leaves it alone too.
- **`start-ios` / `start-android` / `start-desktop` run a dev build that loads its pages from `akan start`.** It has
  to be running — except for a desktop app that carries its server, which starts it when none of this checkout
  answers. `--release true` runs a release build of the app's own bundle instead.
- **A desktop app builds only for the computer that builds it** — a `.app` on macOS, and an unsigned folder on
  Windows and Linux. `build-desktop --installer true` adds what a person downloads: a per-user NSIS setup on Windows
  (`/S` installs silently), a dmg on macOS, an AppImage on Linux (it needs `mksquashfs`; an AppImage cannot update
  itself, so a release with `updates` ships a new one). The dmg opens on a drag-to-Applications window with the app's
  icon on the mounted disk, laid out without Finder so CI builds it too; `native.desktop.dmg` (per target as well)
  replaces the background (`background`, `background2x` for Retina) and moves the window and the icons (`window`,
  `iconSize`, `textSize`, `app`, `applications`, in points) — the default background lines up with the default icon
  positions only. `--arch arm64|x64` builds a Windows or Linux app for the
  other CPU of that OS: the Rust library, Bun's executable, the server's `bun install --cpu` and each `bin` file
  follow it, and a server addon with no binary for that CPU stops the build. A macOS app is Apple silicon only —
  Intel Macs are not a target, so `--arch x64` on macOS is refused.
- **A release is signed only with `--sign` and notarized only with `--notarize`** (`build-desktop`,
  `publish-update`); the environment names the identity and never decides to use it, so a shell exporting a Developer
  ID signs and uploads nothing unasked. Every release build and every `publish-update` of a target that carries a
  server, signed or not, first searches that server for every secret value of the workspace's server env files and
  refuses with the paths; an env file it cannot evaluate stops the release too, and a debug build is not searched.
  One line then names the identity and the service the app goes to.
- **A macOS release for download is signed with a Developer ID and notarized.**
  `AKAN_NATIVE_MACOS_IDENTITY` names a keychain identity, or `AKAN_NATIVE_MACOS_CERTIFICATE` +
  `_CERTIFICATE_PASSWORD` a `.p12` the build imports into a keychain of its own (a CI runner);
  `AKAN_NATIVE_MACOS_NOTARY_KEY` + `_KEY_ID` + `_ISSUER` (an App Store Connect API key) or `_NOTARY_PROFILE` are the
  credentials `--notarize` staples the app and the dmg with. Every Mach-O file — the server's addons and `bin` included — is
  signed inside out with the hardened runtime and a timestamp; the executable gets Bun's JIT entitlements and the
  camera's or microphone's when a usage text asks for them, and `desktop.entitlements` adds the app's own.
  `publish-update --sign` signs with the same identity, since the updater checks the installed app's signature. Without a
  Developer ID the build warns, because Gatekeeper blocks a downloaded copy.
- **A Windows release is signed with Authenticode.** `AKAN_NATIVE_WINDOWS_CERTIFICATE` +
  `_CERTIFICATE_PASSWORD` (a `.pfx`), `AKAN_NATIVE_WINDOWS_THUMBPRINT` (a certificate in the store, a token's or an
  HSM's), or `AKAN_NATIVE_WINDOWS_SIGN_COMMAND` (a JSON array run per file with `{file}`, e.g. signtool with Azure
  Trusted Signing's dlib) signs every PE file of the app — the server's `.node` and `bin` included — the setup program
  and the uninstaller it writes, SHA-256 with a timestamp (`AKAN_NATIVE_WINDOWS_TIMESTAMP_URL`).
- **`updates: { url, publicKeys }` lets an installed app update itself** — the whole app on a desktop, the web
  bundle on a phone. `akan update-keygen <app>` makes the signing key once
  (`~/.akan/native/keys/<app id>.update.key`, or the path `AKAN_NATIVE_UPDATE_KEY` names) and prints its public
  key. List the online signing key first and offline spares after it (up to three): a phone binary trusts all of
  them, and a key may revoke only the keys listed before it, so a leaked key cannot lock out its spares. A desktop
  app trusts the first; `publicKey` is the one-key form. `akan publish-update <app>` builds and signs a release
  into `updates/`: upload that release's files to `url` and its manifest last, or let
  `--upload s3://<bucket>/<prefix>` do it (credentials and endpoint from `S3_*` or `AWS_*`; a release file the bucket
  holds is skipped), which sends that release alone, and nothing when it is missing or fails a check. Never upload the
  folder whole: a phone's is also where `pack-update` writes by default.
  A phone reads only `<url>/<platform>/<channel>/<nativeApi>.json`, so each store generation on a channel takes its
  own fixes.
  `akan pack-update` writes an unsigned phone bundle for whoever holds the key to sign and records it in
  `<out>/pack.json`, exiting 2 when `--against` says it needs a new store build; `akan push-update` packs and uploads to
  the Akan Cloud project that holds the key, and `akan register-binary` registers a store build after `release-*`. A
  release that hangs is rolled back while the app runs, and `report: { url }` has a phone post what became of each
  release (applied, confirmed, rolled back and why) at its next launch, so rollback rates are visible. `devtools: true`
  opens the web inspector of a release build for an internal test target. The channel is the backend env the binary was built for unless `channel` names one;
  on a desktop, `updates.setChannel({ channel })` moves the installed app to another manifest until set back with
  `null` — a server putting a device on a pilot channel — and never to a release older than the one running. A
  release that does not come up is rolled back to the one before.
- **An unattended screen** — signage, a kiosk — takes `desktop.recovery: "reload"` (a crashed page loads again,
  and the app relaunches when the webview ends), `desktop.window: { fullscreen, skipTaskbar, frameless }`,
  `desktop.screenCapture: "auto"` (Windows answers `getDisplayMedia()` with the first screen, no picker) and
  `android.autoplay` (media plays with sound without a tap). Its carried server takes `desktop.server: { restart:
  "forever", watchdog: true }` — restarted after every crash, never given up on, and killed and restarted when its
  health route stops answering (every 10 s, 3 misses; `{ intervalMs, failures }` to tune) — and
  `desktop.webview2: "standalone"` puts the whole WebView2 Runtime (~200 MB) in the Windows setup for a PC offline at
  install. `desktop.server.env` adds variables to the server's start; the build refuses a secret-named one and those
  the stage owns. The `window` plugin places it: `placeOnDisplay({ index, bounds, unit: "physical" })` puts a window
  on one display in that display's device pixels — a 640×128 LED panel — lowering the minimum size to fit, beside
  `setAlwaysOnTop`, `setCursorVisible` (which hides the pointer over its external views too, on Windows) and
  `setDecorations`. `native.backgroundColor` (or `{ light, dark }`) is what a window and an external view show before
  their page paints, so a dark board never flashes white, and `desktop.publisher` names who publishes a Windows app in
  Apps & features and its executable's company (the app name when unset, never Bun's own).
- **A third-party page shown first-party** — a scoreboard, a menu board — is the `external-view` plugin, listed in
  `native.plugins`: a webview over the window with a browser profile of its own, its top level held to the origins it
  was opened for while its frames load web content from anywhere, with an init script that runs in the top document
  only, `evaluate`, a trusted `sendKey`, `capture`, and `loadFailed` / `gone` (it reloads, or is rebuilt, by itself;
  the reason is `terminated` on macOS, and `rebuildFailed` when a rebuild failed and the view is closed, to be opened
  again) / `consoleMessage` events. Every method on Windows; macOS 14+ lacks `sendKey`, `setMuted` and `capture`.

## A Desktop App's Server — `bin` And `trustedDependencies`

A desktop app whose `native` section, or target, declares `desktop: { server: true }` carries the app's server:
`akan build-desktop`, `start-desktop --release` and `publish-update` put the backend `akan build` made into the
app — everything the backend build wrote (the `.js`, `akan.build.json`, `private/`, a bundled package's `.node`,
`.wasm` or file asset) but the Dockerfile, the RSC worker, the console, `csr/` and `public/` — and install its
packages first with `bun install --production --prefer-offline`, before `akan build` runs. `start-desktop` without
`--release` starts `akan start` beside the app when no dev server of this checkout answers. The setting is the
app's backend, so it does not change under an installed app: an update whose release carries a server when the app
has none, or none when it has one, is refused, and switching means a reinstall.
`desktop: { server: { omit: ["rclnodejs"] } }` carries the server without packages only the image needs — an addon
tied to the image's system, code only a process the app never starts loads — and whatever only they pull in; the
image keeps them, and the server's own bundle must not import them. A package another dependency still installs
stops the build, naming who needs it. So does a native addon that would not load on a user's computer: no binary
for the app's OS and CPU, a link outside the system, or a `binding.gyp` its install never compiled. It runs as an API-only edge server in database mode `single` (SQLite), on a loopback port the launcher picks — the last session's when
it is free, which is not a guarantee, so a provider that needs an exact redirect URI signs in through a cloud
server's adapter. It refuses a `Host` other than its own, but any program on the computer can still call that port:
guard its endpoints as a network server's. It runs in one process, so a `main.ts` or an env asking for replicas (`replica`,
`solo: false`, `AKAN_SOLO=false`, `AKAN_REPLICA`, `AKAN_COMMAND_TYPE=start`) does not boot in the app. Its data lives in the app's local data folder (`%LOCALAPPDATA%\<id>\server`
on Windows, never Roaming; `server-debug` for a `--debug` build). It trusts the OS certificate store, and of the
user's environment it takes a fixed set and nothing else: the system's own (`PATH`, `HOME`, the temp folder, `LANG`,
`TZ`, Windows' folders and `ComSpec`), the desktop session a `bin` tool needs for the screen or the audio server
(`DISPLAY`, `XAUTHORITY`, `WAYLAND_DISPLAY`, the session bus, `PULSE_*`, `XDG_*`), and the proxy and CA variables
(`HTTP(S)_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`).

**Everything it carries is on the user's computer, readable.** That is `private/` as it is — each lib's too, under
`private/libs/<lib>` — and the server env of the one environment the build is for (`--env`: `debug` for
`build-desktop`, `local` for `start-desktop --release`, `main` for `publish-update`, unless named): the build keeps
`env/env.server.<env>.ts` and swaps every other environment's file for exports that refuse to be read. The server env
each lib exports as its defaults (the lib's `env.server.testing.ts`, spread into every environment by
`env.server.type.ts`) ships as well. Keep a key in those files only if every user of the app may hold it; a secret the
server needs belongs to a cloud server its adapter calls. There is no `public/`: a file the server reads at runtime
goes in `private/` and is read from `AKAN_APP_DIR` (the folder `server.js` sits in), never from `process.cwd()`, which
is the app's data folder.

**Nothing from `docker` reaches it.** `preRuns`, `postRuns` and a whole Dockerfile install into a Linux image the
desktop app never runs in, and the build warns when an app has them and carries no `bin`. What the server needs
from them comes one of two ways:

```ts
const config: AppConfig = {
  trustedDependencies: ["rclnodejs"],
  bin: {
    ffmpeg: {
      "darwin-arm64": {
        url: "https://files.example.com/ffmpeg-7.1-lgpl-darwin-arm64.zip",
        sha256: "…",
        file: "ffmpeg-7.1/bin/ffmpeg",
      },
      "win32-x64": { url: "https://files.example.com/ffmpeg-7.1-lgpl-win64.zip", sha256: "…", file: "bin/ffmpeg.exe" },
      "linux-x64": { path: "tools/linux-x64/ffmpeg" },
    },
  },
};
```

- **An executable the desktop app spawns goes in `bin`** — its server's code or its native plugins, whether or not
  it carries a server — keyed by the name the code spawns and then by
  `${process.platform}-${process.arch}` (`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`,
  `win32-x64`) — Node's names, unlike an update feed's folder, which is `<os>-<arch>` with the OS spelled `macos`,
  `windows` or `linux` (`windows-x64/<channel>.json`). A source is `{ url, sha256, file? }` — downloaded when the app is built, refused unless it hashes
  to `sha256` (so plain http is as safe as https), kept in `apps/<app>/.akan/cache/bin/<sha256>` — or
  `{ path, file? }`, relative to the `akan.config.ts` that declares it. `file` is the executable inside an archive
  (`.zip`, `.tar.gz`, `.tgz`, `.tar.xz`, `.tar.bz2`, `.tar`), unpacked with the OS's own `tar` (`unzip` for a zip
  on Linux).
- Only the building computer's platform is fetched, and an entry without it fails the build instead of the user's
  call. `build-desktop` and `start-desktop` copy the file into the app's `bin/` (keeping `.exe` on Windows), sign it
  with the app on macOS, and put that folder first on the app's PATH. The server's `spawn("ffmpeg")` needs no change
  and finds the carried file even in an app launched from the Finder, whose PATH is only
  `/usr/bin:/bin:/usr/sbin:/sbin`. A native plugin finds the folder in `ctx.binDir`: Bun's own `spawn` and `which`
  without `env` read the environment the app started with, so a plugin passes `env: process.env` to run one by name.
  The server passes it too when it spawns a carried `bun build --compile` executable: the shell starts the server as
  Bun with `BUN_BE_BUN=1`, which akanjs takes out of `process.env` at boot, and a child spawned without `env` still
  inherits it and runs as Bun's own CLI instead of the tool.
- **One file per entry, so carry a static build.** A build that loads its own shared libraries — a `-shared`
  archive, or Homebrew's ffmpeg with its 55 dylibs — runs on the computer that built it and nowhere else.
- **A lib's `bin` reaches only the apps that depend on it**, unlike its `docker` steps; the app's own entry of the
  same name wins, and two libs that declare one name differently fail the build.
- **The image does not read `bin`.** Keep installing through `docker.preRuns` there.
- **A package that builds itself at install goes in `trustedDependencies`.** `bun install --production` runs no
  dependency's install or postinstall script unless the package is trusted, so an addon with no prebuild arrives
  unbuilt and fails at its first call. The list lands in the built `package.json`, so it applies to the image and to
  the desktop server alike, and a lib's list reaches every app, like its `externalLibs`.

**Carry an LGPL ffmpeg.** A build configured with `--enable-nonfree` may not be redistributed at all — the macOS
binary npm's `ffmpeg-static` downloads is one — and a `--enable-gpl` build obliges you to offer its source. An LGPL
build has no `libx264`, so encode H.264 through the OS's encoder: `h264_videotoolbox` on macOS, `h264_mf` on
Windows, VAAPI or NVENC on Linux. Codec patents are a separate question to settle before shipping.

**A server bound to its machine stays a service.** A server that needs a whole environment — ROS, system services,
root to change the network or the clock — runs as a service on that machine (the image), and the desktop app's
target leaves `desktop.server` off, pinned to it with `AKAN_PUBLIC_SERVER_URL` at build time. A carried server runs
as the signed-in user and stops with the app, and so does what it started. On macOS and Linux the server leads its
own process group: quitting the app ends the group, and when the app was killed or crashed — even while the server
was still starting — the server sees its parent gone and ends the group itself, SIGTERM first and SIGKILL a second
later for whatever ignored it. On Windows the job object ends them all with the app. A process started `detached`
leaves the group, or the job, and keeps running.

**An edge server carries no cloud secret.** The carried server runs `operationMode` edge, and the same app's cloud
deployment runs cloud: a module whose `serve(ref, { operationMode: ["edge"] }, …)` lists the modes it belongs to mounts
in those alone, and `modules: ["@edge"]` (or `AKAN_MODULES=@edge`) names every module that lists edge, with what they
inject, cascade to and hold a relation to. `desktop: { server: { profile: "edge", modules: ["@edge"] } }` builds the
carried server that way: `env/env.server.<env>.edge.ts` is bundled in place of `env/env.server.<env>.ts`, which never
enters it, and the build evaluates the profile file with no app env and refuses one whose secret-named keys hold a
value — a `process.env.X ?? "literal"` counts as the literal. Signing, encryption, master and session keys, `pwd`, a
`…dsn` and a connection string are secret-named, and a URL holding a password or a secret-named query parameter is a
secret under any key. The profile may spread `libEnv`, and the lib defaults it reaches are checked as the bundle
carries them; a profile that imports the file it replaces is refused. Each lib's env defaults (`env.server.testing.ts`) are
swapped the same way: for the lib's `env/env.server.testing.edge.ts`, held to the same check, or for the defaults with
every secret-named value left out, which the build names in a warning — and a default a JSON snapshot cannot carry (a
function, Map, Set, Date, class instance, bigint or non-finite number) is refused unless the lib has its profile file.
`akan build <app> --profile edge` does the same for an image. A module listing only edge does not mount under `akan start` (local): list `local` too to develop
it there.

**A file the user picks reaches the server as a grant, never as a copy or a path.** With `"file-picker"` in
`native.plugins`, `filePicker.pickFiles({ forServer: true })` (also `pickDirectory` and `saveFile`,
from `akanjs/client/native`) copies nothing, whatever the size: its FileRefs serve the originals for a preview, and
each result carries a `grant`. The page hands the grant to an endpoint, and the server exchanges it:

```ts
const input = await NativeFile.resolve(grant, "read"); // "write" for a saveFile grant, "folder" for pickDirectory
const clip = await NativeFile.resolveIn(folderGrant, "day1/a.mp4"); // refused if it climbs out of the folder
```

The carried server asks the shell that showed the dialog over its IPC channel, so it reaches what the user picked
and nothing else, and no page ever holds a path. Behind a dev build `akan start` checks the grant's signature
against a key in `~/.akan/native` instead, in `operationMode` local only; every other server refuses a grant.

**A secret the user gives the server is kept by the OS, never in a file.** `NativeSecret.set(key, value)`,
`get(key)` (null when none is kept) and `remove(key)` from `akanjs/server` reach the OS credential store through the
shell that carries the server — the macOS Keychain, the Windows Credential Manager, the Secret Service on Linux — in a
store of the server's own, apart from the page's `secretStorage`, so no page script reads it. Anywhere but a carried
server `NativeSecret.available` is false and every call rejects: keep secrets in the env there. On macOS without a
Team ID signature, any program of the same user can read the store's key through `security`, as with
`secretStorage`.

**Devices belong to the shell, not the server.** Displays and their changes (`screen`), windows placed on them
(`window`), the system volume and mute (`volume`), global shortcuts (`global-shortcut`), keep-awake (`keep-awake`)
and launch at login (`autostart`) are native runtime plugins, each added to `native.plugins`. Every builtin plugin's
page API is
`akanjs/client/native/<id>` (`akanjs/client/native/window`, `…/screen`, `…/global-shortcut`), imported in a `webkit/`
hook; `volume` and `filePicker` also come from `akanjs/client/native` itself. A capability the shell
lacks is added there: an app's own plugin runs as Bun code in the plugin host and cannot add a native shell op.

**A plugin the app or lib owns lives in `native/<id>/`**, the folder named after the plugin id: `native-plugin.json`
beside its page API (`src/index.ts`, `definePlugin` from `akanjs/client/native`), its desktop part (`src/desktop.ts`,
`defineDesktopPlugin` from `akanjs/native/desktop`), Kotlin and Swift. Every mobile and desktop target ships it; a
lib's reach only the apps that depend on it, and the app's own wins an id. Its page API is imported by a `webkit/`
hook (`../native/<id>/src`) and nothing else; pages and components call the hook, the same way they reach
`akanjs/client/native`. A plugin throws `AkanNativeError`, the error its bridge carries back to the page, which is
why `no-throw-raw-error` exempts a root `native/` folder.

**A page's storage and browser APIs follow the shell, not the browser.** A native shell serves the page from
`app://localhost` on iOS, macOS and Linux, which keeps no cookies: `document.cookie` reads `""` and a write is
dropped, so the value exists in the browser and vanishes in the app. Web Storage does work in the shells, but it
bypasses the store akanjs picks per platform (the shell's Preferences in an app) and throws during SSR. So app and lib
code never touches `document.cookie`, `localStorage` or `sessionStorage` (`no-document-cookie`, `no-web-storage`): it
uses `getCookie` / `setCookie` / `removeCookie`, `storage`, and `secretStorage` for tokens and credentials, all from
`akanjs/client`. `setCookie` writes `path=/; SameSite=Lax; Secure`, and an options object overrides only the keys it
names — pass `sameSite: "none"` only for a cookie a cross-site POST must carry back. `getCookie` reads a name sent
twice as unset, since a sibling subdomain can plant a second copy; server code reads `cookieJar()` from
`akanjs/fetch`, or `CookieJar.parse(req.headers.get("cookie"))`, never `req.cookies`. Browser APIs an app WebView lacks
stay in a `webkit/` hook that branches on `isNativeApp()` from `akanjs/client/native`, which is where the app side goes
too (`no-web-only-api-outside-webkit`, a warning): `navigator.share` / `canShare` (Android's WebView has none),
`navigator.serviceWorker` and `Notification.requestPermission` / `.permission` (no app page has them),
`navigator.geolocation` (use `useGeoLocation` from `akanjs/webkit`) and `navigator.vibrate` (iOS has none; use
`haptics`). They are legal on the web, so the rule does not ban them; a root `native/` folder is out of its scope,
since a plugin's web part is where those APIs belong.
