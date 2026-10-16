---
"@akanjs/devkit": patch
---

`AKAN_BUILD_METAFILE=1 akan build <app>` writes the bundler's metafile for each backend entry (`main`, `server`, `rscWorker`, `console`) to `local/build-meta/<app>/<entry>.json`, which says which inputs put how many bytes into which output. Outside `dist/`, so an image never carries it, and off by default, since a server metafile is the size of its module graph.
