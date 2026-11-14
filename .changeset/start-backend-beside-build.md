---
"@akanjs/devkit": patch
"akanjs": patch
---

`akan start` boots the backend while the first base build runs: the backend loads its server graph beside the build and mounts the web surface as soon as the build's artifact is on disk, so the dev server is ready sooner.

The port now answers from the start of the build. A request to `localhost` or an IP address, page or API, waits for the first artifact; a build longer than the 15 s the gateway holds a request ends the wait with a 503 "Backend is starting" page that reloads itself. A request to one of the app's own domains (a custom local domain) gets that 503 at once until the backend is ready, because the build has not written the app's hosts yet; after that it is served as before, and any other Host is refused as before.
