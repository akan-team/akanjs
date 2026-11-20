---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(devkit): in a git worktree, `akan sync` seeds a missing env file from the main checkout's

The env files are gitignored, so a new `git worktree` has none, and `akan sync` wrote empty defaults in their place.
An app whose options have a required value then failed its typecheck (`TS2322`) until the files were carried over by
hand, and a symlink to the main checkout's file, the obvious shortcut, resolves the file's `../lib/option` import in
the main checkout, so the worktree ran part of another checkout's code.

- When the workspace is a linked worktree and the main checkout holds the file of the same path, sync copies it:
  `env/env.server.local.ts were missing in this worktree … and now hold a copy of the main checkout's, from <dir>`.
  A file the main checkout lacks is seeded as before, from the tracked `env.<side>.example.ts` or the defaults.
- Only a missing file is written. One already in the worktree, an earlier empty seed included, is left alone: delete
  it and run `akan sync <app-or-lib>` to take the main checkout's.
- The copy does not follow a later change in the main checkout, and nothing outside a worktree changes.
