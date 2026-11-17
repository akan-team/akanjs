---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

The image carries `bin`. `akan build` fetches each `bin` entry's `linux-x64` and `linux-arm64` file into the build's `bin/amd64/` and `bin/arm64/`, and the generated Dockerfile puts the folder its `TARGETARCH` names first on PATH, so an executable the server spawns is declared once for the image and the desktop app. An entry with no Linux file is still left to `docker.preRuns`; one that has both now runs the carried file, which is ahead on PATH. An app that writes its own Dockerfile adds `ENV PATH=/workspace/bin/$TARGETARCH:$PATH` itself, and the build says so. `akan start` warns when a declared executable is not on the computer's PATH. The byte budget of the `akan-runtime` skill's `runtimeRule-3.md` is raised on purpose for the new text.
