---
"@akanjs/devkit": patch
---

A route's dictionary files stop depending on the other routes.

The files were cut by merging over every route at once and by forcing the widest routes down to four files, so adding or removing one page re-cut most of the others: on a 240-route fixture one page removed changed 184 other routes' files and grew one by 63 KB. Now no route is handed more than 8 KB of raw text it does not show (about 2 KB brotli), and a route that still needs more than four files keeps the three that hold most of its texts and takes the rest in a file of its own, which near-identical routes share. The same probe now changes at most a handful of routes' files, by under 2 KB each, and the median route's first-visit dictionary on that fixture goes from 78 KB to 40 KB.

The cost: the own files repeat texts the shared files hold, so a large app writes more dictionary files (about 1.6 to 2.9 MB brotli per locale on the fixture) and a page reached from another may download a text the browser already has.
