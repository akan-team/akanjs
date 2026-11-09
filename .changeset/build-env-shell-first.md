---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

A variable the shell sets now outranks the workspace `.env` when `akan` builds or runs an app, as dotenv and Bun's own `.env` loading do: `AKAN_PUBLIC_ENV=main akan build <app>` builds `main` where the `.env` says `local`. The order is `--env` (for `AKAN_PUBLIC_ENV`), then the shell, then the `.env`, then the defaults, and the bundles, the bundled server env, `akan.env.json` and the Dockerfile still take one set of values. The warning that listed the shell values a build ignored is gone, and the server-env message, the `--env` help, the README and the CLI reference state the new order.

**Behavior change:** where the shell exports a value the workspace `.env` also sets, such as `AKAN_PUBLIC_ENV`, `AKAN_PUBLIC_REPO_NAME` or `AKAN_PUBLIC_SERVE_DOMAIN`, `akan` now takes the shell's. Unset it, or match the `.env`, to build what you built before.
