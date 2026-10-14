---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A server env profile build (`akan build --profile <p>`, `native.desktop.server.profile`) now swaps each lib's env defaults as it swaps the app's: for the lib's `env/env.server.testing.<p>.ts`, which the build refuses when a secret-named key holds a value, or for the defaults with every secret-named value left out, named in a build warning. Before, a lib's `env.server.testing.ts` reached the carried server whole. Secret names now also cover `pass`, `passphrase`, `authKey`, `hashKey`, `cred`, and the `iapVerify` and service-account blocks whole.

Upgrade note: a profile build that passed may now be refused, because more counts as a secret: besides the names above, `pwd`, a key ending in `dsn`, a connection string, a signing, encryption, master or session key, and, under any key, a URL holding a password or a secret-named query parameter. A profile file that imports the file it replaces is refused, and so is a lib default a JSON snapshot cannot hold (a function, `Map`, `Set`, `Date`, class instance, bigint or non-finite number) unless the lib has a profile file. A desktop app that carries its server is now refused a release build or `publish-update`, signed or not, while that server's bundle holds a secret value; build its server with a profile (`native.desktop.server.profile`).
