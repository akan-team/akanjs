---
"@akanjs/devkit": patch
---

`akan start` keeps `apps/<app>/.akan/cache` between runs, so a restart reuses the CSS class scan and the subset fonts instead of redoing them. Each entry names the akanjs and Bun versions and the build of the cache code that wrote it, and an entry another one wrote, or one cut short, is rebuilt.
