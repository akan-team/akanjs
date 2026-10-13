---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan` cloud commands read `--host` and the root `cloud.host` the same way: as the URL's origin and path, with a trailing slash removed, so a trailing slash, an uppercase host or a default port no longer names a separate sign-in. Upgrade note: a login saved under a host spelled with a trailing slash, in uppercase or with `:443` is not found under the normalized spelling; run `akan login` once more.
