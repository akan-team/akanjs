---
"akanjs": patch
"@akanjs/devkit": patch
---

fix(dev): a broken module nothing reaches any more leaves the SSR registry however it was detached; a case-only rename never leaves an importer on a module app.js lost; a package installed while the dev server runs goes to a build worker; a first boot whose pages bundle exits fails instead of restarting forever
