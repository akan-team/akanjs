---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

The workspace-root `akan.config.ts` takes `cloud: { host }`, the cloud the CLI uses when a command names no `--host`. This lets a workspace on a self-hosted Akan Cloud skip passing `--host` every time. It applies to login, env, secret, subspace and tunnel commands. The host must be https, or http on this computer.
