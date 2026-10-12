---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A server env profile build (`akan build --profile <p>`, `native.desktop.server.profile`) now swaps each lib's env defaults as it swaps the app's: for the lib's `env/env.server.testing.<p>.ts`, which the build refuses when a secret-named key holds a value, or for the defaults with every secret-named value left out, named in a build warning. Before, a lib's `env.server.testing.ts` reached the carried server whole. Secret names now also cover `pass`, `passphrase`, `authKey`, `hashKey`, `cred`, and the `iapVerify` and service-account blocks whole.
