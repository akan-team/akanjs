---
"@akanjs/cli": patch
---

`akan update` waits for a release the registry serves whole, and an rc is tagged once every package of it installs.

npm has shown the packages of one rc up to an hour apart: `akanjs` and `@akanjs/devkit` at once, `@akanjs/cli` 30 to 55 minutes later (3.3.0-rc.42, rc.43, rc.46). A workspace bumped in that window failed at `bun install`, or in a pipeline that installs `@akanjs/cli@<version>`.

- **`akan update`** checks, before it changes anything, that the registry serves that version of `akanjs`, `@akanjs/devkit`, `@akanjs/cli` and `@akanjs/language`, tarball included. Until the last one is there it stops, names the missing packages and leaves `package.json` alone.
- **The rc workflow** polls the registry after publishing and pushes the `v<version>` tag only when every published package answers. The tag, not the publish step, is the sign that the version installs.

Why `@akanjs/cli` appears later than the others was not found: its tarball is no larger than `akanjs`'s, and the workflow publishes them in one loop.
