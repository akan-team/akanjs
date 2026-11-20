---
"akanjs": minor
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

feat(devkit): an app's image sets its own env defaults, and a variant writes a second Dockerfile

An app that ships one build as two images, a control plane and a device, could only tell them apart by architecture
(`{ amd64: "…" }` on a step), and the generated Dockerfile always set `AKAN_PUBLIC_OPERATION_MODE=cloud`, so the
device's mode lived in a compose file that a plain `docker run` skipped.

- **`docker.env`** is laid over the `ENV` lines the build writes: `env: { EDGE_MODE: "camera" }` adds one, and a key
  the build sets (`AKAN_PUBLIC_OPERATION_MODE`) is replaced where it stood. A value Docker would split is quoted, and
  `$NAME` in it is expanded by Docker as in any `ENV` line. The config is tracked and the image shows the value, so it
  is never a secret. `akan.env.json`, which a host run without the image reads, does not carry it.
- **`docker.variants`** writes `Dockerfile.<name>` beside the Dockerfile for each entry
  (`docker build -f Dockerfile.edge .`). A variant is the app's `docker` with every field it names replaced whole,
  lists included, so `preRuns: []` leaves the app's steps out of that image and `crossBuild: true` may be the
  variant's alone. Its `env` is the exception: laid over the app's `env` key by key, so a variant adds or overrides a
  default and keeps the rest. A lib's `preRuns`, `installRuns` and `postRuns` reach every variant. The generated
  `.dockerignore` lists `Dockerfile.*`, so an edit to one variant does not rebuild the other image's `COPY . .`
  layer, and a desktop app's carried server leaves the variant files out, as it does the Dockerfile.
- A key of `env` that is no variable name, a value holding a line break, and a variant name outside lowercase
  letters, digits and `-` are refused when the config loads.

**Upgrading.** No config change is needed. `DockerImageConfig`, the resolved shape, gains `env`, so code that builds
one by hand adds `env: {}`. `DockerOption` gains the optional `variants`, and `DockerVariantOption` is exported.
