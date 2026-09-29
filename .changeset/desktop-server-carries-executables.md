---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

`bin` in `akan.config.ts` puts executables in a desktop app's server, and the build says what the image installs that the app does not

A desktop app's server ran whatever `ffmpeg` the user's computer had on its PATH, if any, and a Finder-launched app
sees only `/usr/bin:/bin:/usr/sbin:/sbin`. `bin` names an executable and, per platform (`darwin-arm64`,
`win32-x64`, …), where it comes from: a download with its `sha256` (an archive takes `file`, the executable inside
it) or a path next to the declaring `akan.config.ts`. `build-desktop --server` fetches the file for the computer it
builds on, checks it, and puts it in the server's `bin/`, which the launcher puts first on the server's PATH, so
`spawn("ffmpeg")` runs the carried file. A lib's entries reach the apps that depend on it, and an app's own entry of
the same name wins. The image does not read `bin`: it still installs through `docker`.

The same build now warns when the image runs `docker` steps (or the app writes its own Dockerfile) and the app
carries no `bin`, since a desktop app's server runs none of those steps.
