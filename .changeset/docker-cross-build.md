---
"akanjs": minor
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

feat(devkit): the generated image builds for another architecture, prunes in the install layer and ignores a hand-run build's data

Shipping an app as an arm64 image from an amd64 host met four things in the Dockerfile `akan build` writes.

- **`docker.crossBuild: true`.** The image's `bun install` ran in the target's stage, so
  `docker buildx build --platform linux/arm64` on an amd64 host ran Bun under QEMU, where it crashes. With
  `crossBuild`, a `FROM --platform=$BUILDPLATFORM` stage runs `bun install --production --os linux --cpu <target>` on
  the build machine's own architecture, and the target's stage copies its `/workspace` and runs only `apt-get`,
  `preRuns` and `postRuns`. A lifecycle script of a `trustedDependencies` package then runs on the build machine's
  CPU, and the build needs BuildKit. The app sets it; a lib does not.
- **`docker.installRuns`**, for an app and a lib. The steps are chained onto `bun install` in one `RUN`, so a file one
  deletes from `node_modules` is in no layer: a package that ships every platform's native addon is pruned by the lib
  that brings it. An `rm` in `postRuns` is a later layer and leaves the image as large.
- **`.dockerignore`.** `akan build` writes one beside the Dockerfile with `sqlite`, `local`, `runtime`, `data`,
  `.akan/artifact/image-cache` and `node_modules`. A build run by hand (`bun main.js` in `dist/apps/<app>`) writes its
  database there, and `COPY . .` carried it into the image, where a new named volume started from it.
- **`docker.image` as `{ amd64, arm64 }`** used the arm64 entry on every leg: the stages were declared and the build
  went on in the last one. The Dockerfile now ends them with `FROM $TARGETARCH`, so each leg builds from its own.

**Upgrading.** No config change is needed: both options are optional in `akan.config.ts`. `DockerImageConfig` and
`LibDockerConfig`, the resolved shapes, gain `installRuns` (and `crossBuild` on the first), so code that builds one by
hand adds `installRuns: []` and `crossBuild: false`. An app that declared `image` per architecture gets the amd64
image on amd64 from its next build.
