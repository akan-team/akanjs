---
"@akanjs/devkit": patch
---

Under `clientRuntime: "route"`, a build reads each scope's signal once, not once per generated `lib/__client/*.fetch.ts` piece, so an app with many modules builds about as fast as it did with `"all"`. The development server reads them once per compile round that holds a piece, and again for a file it has to build on its own. With `"all"` nothing changes.

- Each piece gets its module's descriptors written in where it called `getSerializedSignalOf`. A new read runs in a process of its own each time, so an edit to a signal between two builds is never served stale. That process sees the build's own environment and `define`, and no `.env` file the build did not load.
- A piece the read cannot answer exactly keeps running its macro as before. So do the pieces of a scope whose signal fails to load, or does not load within 60 seconds. The build names that scope, and the pieces of every other scope are still answered.
- The process reading the signals ends with the build that started it.
- The pages a build writes carry the same code as before; only the names the minifier picks for a few local variables can differ.
