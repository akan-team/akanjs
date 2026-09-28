---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

fix(dev): production listens before the RSC bundle loads again; a broken pages bundle is reported even with a route merge riding on it; the RSC worker falls back or restarts cleanly around recycles, exits and calls; a route's ok recovers only its own failure; a broken module nothing imports no longer blocks the registry
