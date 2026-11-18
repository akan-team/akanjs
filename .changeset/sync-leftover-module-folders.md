---
"@akanjs/devkit": patch
"@akanjs/cli": patch
---

`akan sync` removes a module folder that holds only its generated `index.ts`.

A module's `index.ts` is generated and git-ignored, so a merge or checkout that moves or deletes the module's sources leaves the folder behind with that one file. Nothing regenerated it, since the folder is no longer a module, and its stale exports pointed at files that were gone.

Sync now removes such a folder under `lib/`, `lib/_<service>` and `lib/__scalar/`, in the target and in the libs it depends on, and logs each one: `Removed apps/face/lib/person: its generated index.ts was all that was left of the module`. A folder with any other file, a dotfile included, and an empty folder are left alone.
