---
"@akanjs/devkit": patch
---

`akan verify` writes its build check to `dist/verify/<app>` and leaves `dist/apps/<app>` as `akan build` left it, so running `akan verify` after `akan build` no longer stops `cd dist/apps/<app> && bun main.js` from starting. The check no longer copies the app's `public/` and `private/` folders either.
