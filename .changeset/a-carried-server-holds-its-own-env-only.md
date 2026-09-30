---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A desktop app's server carries the server env of the environment it is built for, and no other

`akan build` keeps only `env/env.server.<AKAN_PUBLIC_ENV>.ts` in `server.js` and swaps every other environment's file
for exports that refuse to be read. A `build-desktop`, `start-desktop --release` or `publish-update` build names its
own environment (`--env`) instead of the workspace's: the root `.env` usually sets `AKAN_PUBLIC_ENV=local`, and the app
would have carried that file while its server ran the `--env` one, and refused to boot.

The carried server's shutdown budget is 1 s, so it finishes before the launcher's 1.5 s grace runs out.
