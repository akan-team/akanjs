---
"akanjs": minor
"@akanjs/devkit": patch
---

No locale serves a route more dictionary than the whole file.

A route's dictionary files were held under the whole file by measuring the default locale only, and without the table and group names each written file carries, so in another locale (a Korean page, say) a route could still load files that together cost more than that locale's whole file. The build now records what each dictionary file costs a browser (its brotli q11 size, or its raw size where that is smaller, as the server serves it), and the server sends a route the whole page file wherever its files would cost that much or more in the request's locale, keeping the API description file the route names. The build report counts a route the same way.

`DictAsset` (`akanjs/server`) gains an optional `bytes` on the page file and on each route file. No upgrade step is needed: an artifact built before this release has none, and its routes keep their files as before.
