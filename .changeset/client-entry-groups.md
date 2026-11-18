---
"@akanjs/devkit": patch
---

A production page loads fewer, larger client files: the client entries exactly the same routes load are built as one.

`akan build` gave every `"use client"` file, and every export of one it takes apart, an entry of its own. The bundler puts a module in a chunk of its own for every different set of entries that reach it, so an app with several hundred entries ended with hundreds of small files per page, many under 1 KB, where a file is served uncompressed. Entries that the same set of routes loads are now one entry, so what only they reach is one chunk. Entries any other set of routes loads stay apart, and a route still downloads nothing it did not download before.

On a real workspace's largest app (236 routes, brotli as served) every route got smaller, by 3.8 to 60.6 KB: the JS all routes load fell 3.4% in total, the median route went from 764.7 to 748.1 KB, and the routes of its signed-in area from a median of 836.0 to 801.8 KB. A signed-in route loads a median of 354 files against 454. The build writes 1,414 client files against 1,827, 5.7% fewer bytes on disk, and 518 files under 1 KB against 688. This repository's sample apps write 214 files against 232 and 132 against 156.

What changes for an app: the files of one group run together, the first time a page uses any of them. A file that does work when it loads — registers something, reads the window — now does it when a file grouped with it is first used, on the same routes as before, and a file that throws while loading takes its group with it. A group's file name changes when any file in it changes, so a returning visitor downloads a group again where one small file changed.

`akan start` (development) and the server bundle are unchanged. No upgrade step.
