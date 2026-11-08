---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A fresh clone of a workspace now builds and starts after `bun install` alone. The env files that hold secrets stay gitignored, so a clone has none of them: before, `akan typecheck`, `akan build` and `akan verify` failed with `Cannot find module './env.server.local'`, and with no `.env` the CLI picked the `debug` environment, so `akan build` stopped asking for `AKAN_PUBLIC_REPO_NAME` and `AKAN_PUBLIC_SERVE_DOMAIN`.

- **Missing env files are written on sync.** `akan sync`, and every command that syncs first (`build`, `start`, `typecheck`, `verify`, `test`), writes each per-environment file that `env/env.server.ts` or `env/env.client.ts` imports and the checkout lacks, plus `env/env.server.testing.ts`, in apps and libs alike. A file comes from the folder's tracked `env.server.example.ts` or `env.client.example.ts` when there is one, otherwise with the defaults a new workspace starts with. A file that exists is never touched, and sync logs the files it wrote. Put this machine's values in them, or fetch the team's with `akan download-env`, which overwrites them.
- **No `.env` means the local environment.** A workspace command run where there is no `.env` takes `AKAN_PUBLIC_ENV=local`, the environment a new workspace's `.env` names and `env/env.server.ts` falls back to, unless the shell sets `AKAN_PUBLIC_ENV`. A `.env` that exists is read as before, so a CI job that writes one, or sets the variable, builds what it did.
- **New workspaces** also track `env.client.example.ts`: its `.gitignore` no longer ignores it, as it already did not ignore `env.server.example.ts`.

**For an existing workspace** nothing is required. To give a fresh clone values other than the empty defaults, commit an `env/env.server.example.ts` (and `env.client.example.ts`) without secrets in it; in an older workspace, add `!**/env.client.example.ts` to `.gitignore` for the client one. If you link env files into a new worktree, link them before the first `akan` command there, or replace the defaults it wrote.
