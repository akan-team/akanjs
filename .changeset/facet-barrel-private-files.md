---
"@akanjs/cli": patch
---

The layer rule now says how to keep a file out of a generated barrel.

A layer's `index.ts` exports each camelCase file and folder (PascalCase in `ui/`), so a file whose name has a dot (`srvkit/vision.worker.ts`) and a folder that starts with an underscore (`srvkit/_vision/`) were always left out. That is the place for code only a spawned process may load, such as a file importing a native addon, which a server importing the `srvkit` barrel would otherwise load too. The behaviour is unchanged and now has a test (`facetBarrel.test.ts`); the rule file is 217 bytes larger.
