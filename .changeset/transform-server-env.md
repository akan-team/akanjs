---
"akanjs": patch
---

`option.transformEnv(fn)` in a lib's or app's `lib/option.ts` rewrites the server env once, when the server is built and before any option, lib or `env(...)` injection reads it. It runs in every replica, in `bun main.js ops …` and in the test server. Each lib's transform runs in mount order and the app's last, and each gets what the one before returned. `fn` gets a copy, so the imported env module keeps its values, and code that imports that module itself still reads them.
