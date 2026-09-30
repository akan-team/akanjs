---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`bin` in `akan.config.ts` puts executables in a desktop app, and the build says what the image installs that the app does not

A desktop app ran whatever `ffmpeg` the user's computer had on its PATH, if any, and a Finder-launched app sees only
`/usr/bin:/bin:/usr/sbin:/sbin`. `bin` names an executable and, per platform (`darwin-arm64`, `win32-x64`, …), where it
comes from: a download with its `sha256` (an archive takes `file`, the executable inside it) or a path next to the
declaring `akan.config.ts`. `build-desktop` and `start-desktop` fetch the file for the computer they build on, check it,
and carry it in the app's `bin/`, which the app puts first on its PATH: the carried server's `spawn("ffmpeg")` runs
that file, and a native plugin finds it in `ctx.binDir`. A download is kept as `download` plus its URL's extension
(`.zip`, `.tar.xz`, `.exe`, …), never under a name the URL spells. Bun's own `spawn` without `env` reads the environment the app
started with, so a plugin passes `env: process.env` to run one by name. A lib's entries reach the apps that depend on
it, and an app's own entry of the same name wins. macOS builds sign every executable the app carries, in `bin/` and
in the carried server, found by its Mach-O header rather than its name, so one a package ships without an extension
passes Developer ID signing and notarization too. The image does not read `bin`: it still installs through `docker`.

`build-desktop` of a target that carries its server now warns when the image runs `docker` steps (or the app writes
its own Dockerfile) and the app carries no `bin`, since the carried server runs none of those steps.
