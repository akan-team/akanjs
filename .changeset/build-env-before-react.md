---
"@akanjs/devkit": patch
"akanjs": patch
---

A built `main.js` sets its build's env before React loads.

An app whose `main.ts` imports `AkanApp` from the `akanjs/server` barrel got a `main.js` that imports `react/jsx-runtime` at its top. Started as `bun main.js` on a host with no `NODE_ENV`, React loaded its development build before `akan.env.json` set `NODE_ENV=production`, the production `react-dom` server then loaded beside it, and every server render failed with `dispatcher.getOwner is not a function` and fell back to client rendering. The image was unaffected, since its Dockerfile sets `NODE_ENV`.

`akan build` now writes the bundle of `main.ts` as `main.bundle.js`, and `main.js` is two lines: it imports `akan.env.js`, which applies `akan.env.json`, then loads the bundle. `bun main.js`, `bun main.js ops …` and the image's `CMD` are unchanged. `main.ts` should still import from `akanjs/server/akanApp`: the barrel makes the gateway process evaluate the whole server.
