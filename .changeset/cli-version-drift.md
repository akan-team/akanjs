---
"@akanjs/cli": minor
"@akanjs/devkit": minor
---

A CLI whose major.minor differs from the workspace's `akanjs` now refuses every command that writes to the workspace (`akan sync`, the generators and scaffolds, `akan workflow apply`, `akan verify`, `akan lint` with fixes, `akan start`, `akan build` and the rest), naming both versions and `akan update`; commands that only read (`akan context`, `akan doctor`, `akan logs`, `akan lint --fix false`, `akan workflow plan` and the like) keep the warning, and a patch or prerelease difference within one major.minor still only warns. `akan update` also moves `react`, `react-dom` and `react-server-dom-webpack` to the peers of the `akanjs` release it installs, and a new workspace's devcontainer and README install the CLI at the workspace's `akanjs` version instead of `latest`.

A command marks itself as only reading with `readOnly` on its target (`target({ readOnly: true })`, or a function of its arguments and options); a command without it counts as writing.

**Upgrading.** A command that ran with a warning under a CLI of another major.minor now stops with exit code 2. Run `akan update` to move the workspace and the CLI to one release, install the CLI at the workspace's version, or set `AKAN_ALLOW_VERSION_MISMATCH=1` to run it anyway. A workspace created before this release still installs `@akanjs/cli@latest` in its devcontainer: change its `onCreateCommand` to `bun add -g "@akanjs/cli@$(bun -p "require('./package.json').dependencies.akanjs")"`.
