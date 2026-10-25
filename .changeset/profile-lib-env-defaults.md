---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

A server env profile build (`akan build --profile <p>`, `native.desktop.server.profile`) swaps each lib's env defaults as it swaps the app's: for the lib's `env/env.server.testing.<p>.ts`, which the build refuses when a secret-named key holds a value, or for the defaults with every secret-named value left out, named in a build warning. A secret name is one `Logger.isSecretKey` masks, and everything under such a key counts, so an `iapVerify` or service-account block is left out whole; under any key, a URL holding a password or a secret-named query parameter is a secret too. A profile file that imports the file it replaces is refused, and so is a lib default a JSON snapshot cannot hold (a function, `Map`, `Set`, `Date`, class instance, bigint or non-finite number) unless the lib has a profile file.

Upgrade note: a desktop app that carries its server is refused a release build or `publish-update`, signed or not, while that server's bundle holds a secret value of the workspace's server env files; build its server with a profile (`native.desktop.server.profile`).
