---
"akanjs": patch
---

In the `util` library that `akan install-library` copies, `security` and `security.jwtSecret` are now optional in `ModulesOptions`. A fresh clone of an app on `util` typechecks and builds with the empty env files `akan sync` writes. Before, `akan typecheck`, `akan build` and `akan verify` failed with TS2322 (`Property 'security' is missing`) until someone wrote real env files. The runtime already worked without both keys: a local server derives the JWT secret, and outside `local` the server still refuses to boot with `util.error.jwtSecretRequired` unless `JWT_SECRET` or `security.jwtSecret` is set.
