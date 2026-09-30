---
"akanjs": minor
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

An app image carries the server env of the environment it runs and no other.

- `env/env.server.ts` imports every environment's file, so `akan build` used to bundle all of them into `server.js`:
  anyone holding the image of one environment could read the keys of every other. The backend build now keeps only
  `env.server.<AKAN_PUBLIC_ENV>.ts`, the environment the generated Dockerfile fixes, and swaps each other
  environment's file (`local`, `testing`, every branch) for exports that refuse to be read. Booting such an image under
  another `AKAN_PUBLIC_ENV` stops with `env/env.server.<name>.ts is not in this build` instead of running on a
  config it does not have. Nothing in `env/` needs to change.
- An app's generated `server.ts` no longer re-exports `env` from `env.server.testing.ts`, which put the testing env in
  every image. Signal tests read it from the file. A script or test that imported `env` from an app's `server.ts`
  imports `./env/env.server.testing` instead. A lib's `server.ts` still exports it, since each app's
  `env.server.type.ts` spreads it as the lib's defaults.
- Keys that already shipped in an image stay readable in it. Rotate them.
- A build for a named `--env` (a mobile or desktop build) writes that env into the Dockerfile too, so the image boots
  the environment its `server.js` carries.

**Breaking for an image started under another `AKAN_PUBLIC_ENV`, and for code importing `env` from an app's
`server.ts`:** the image stops at boot until it runs the environment it was built for, and the import moves to
`./env/env.server.testing`.
