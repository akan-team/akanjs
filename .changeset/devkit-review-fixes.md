---
"@akanjs/devkit": patch
---

`akan subspace push` keeps whatever root `Jenkinsfile` and `akan.config.ts` a subspace has, a `Jenkinsfile` an earlier push left there included, and never delivers the workspace's.

`akan build` reads the workspace `.env` as Bun's own loader does: an unquoted value ends at its first `#`, and a quoted one at its closing quote. An inline comment used to stay in the value, so `AKAN_PUBLIC_SERVE_DOMAIN=example.com # prod domain` reached the app's domains and its Dockerfile, whose `ENV` line Docker refused (`can't find = in "#"`). The image, its bundles and its domains now take `example.com`.
