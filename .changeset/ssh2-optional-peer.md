---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A workspace no longer installs `ssh2`, and with it the native `cpu-features` build, unless it opens a Redis or Postgres tunnel to a cluster environment. `@akanjs/cli` and `@akanjs/devkit` now declare `ssh2` as an optional peer dependency rather than a dependency, which neither Bun nor npm installs by default, and the tunnel loads it only when it starts. A tunnel that finds no `ssh2` fails before it dials, with an error naming the tunnel and the command that installs it in the workspace (`bun add -d ssh2`, or `npm install -D ssh2` in a workspace with only a `package-lock.json`).

**Upgrading.** If `akan start` opens a tunnel to a cluster environment, run `bun add -d ssh2` in the workspace once. Until then it stops with that error in every database mode but `single`, where it logs the error and runs without Redis. A workspace that already lists `ssh2` keeps working unchanged.
