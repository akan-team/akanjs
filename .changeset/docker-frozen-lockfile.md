---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan build` writes a `bun.lock` beside the image's `package.json`, cut down from the workspace's lockfile to what the server needs with every locked version kept, and the generated Dockerfile installs it with `bun install --production --frozen-lockfile`. The image used to install `package.json`'s ranges unlocked, so each image build could pick newer versions than the ones CI tested. A workspace without a root `bun.lock` gets a warning and the unlocked install as before.
