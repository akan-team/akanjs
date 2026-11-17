---
"@akanjs/devkit": patch
---

Under `clientRuntime: "route"`, a build and the development server read each scope's signal once, not once per generated `lib/__client/*.fetch.ts` piece, so an app with many modules builds about as fast as it did with `"all"`. With `"all"`, the default, nothing changes.

- Each piece gets its module's descriptors written in where it called `getSerializedSignalOf`, from one read of the signals in a process of its own per build, so an edit to a signal between two builds is never served stale.
- A piece the read cannot answer exactly, or a signal that fails to load, keeps running its macro as before, and the build says which scopes it could not read.
- The pages a build writes carry the same code as before; only the names the minifier picks for a few local variables can differ.
