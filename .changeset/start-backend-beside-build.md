---
"@akanjs/devkit": patch
"akanjs": patch
---

`akan start` boots the backend while the first base build runs: the backend loads its server graph beside the build and mounts the web surface as soon as the build's artifact is on disk, so the dev server is ready sooner. The port answers from the start of the build; a request that arrives before the first artifact waits for it instead of being refused.
