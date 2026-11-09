---
"@akanjs/cli": patch
"@akanjs/devkit": patch
---

`akan build <app> --env <env>` builds for an environment other than the workspace `.env`'s, the way the desktop and mobile builds already do. Before, the shell's `AKAN_PUBLIC_ENV` lost to the `.env`, so a new workspace could only build `local` without editing it. The local-build notice, the image guard and the README now say what a `local` build changes in a built server: no endpoint rate limits, and local defaults for Redis and the database mode. They no longer say the dev routes are served, which a built server never does.
