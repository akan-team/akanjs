---
"@akanjs/devkit": minor
"@akanjs/cli": minor
---

A lib root takes a `script/` folder, for the tooling that makes the lib's own assets.

A lib had no folder that stays out of an image: the root allowlist refused `script/`, so a lib's build-time tooling (a model converter and its Dockerfile, say) could only sit under `private/`, which every app that mounts the lib ships as `private/libs/<lib>/`.

- **`libs/<lib>/script/` is allowed** by `akan sync`, `akan doctor` and the layout check. Nothing runs it and nothing copies it into an app, an image or a desktop build.
- **Its TypeScript is typechecked** with the lib's tests (`akan verify <lib>`, `akan typecheck <lib>`), as an app's `script/` is.
- **`libs/<lib>/script/migration` is refused** at sync, naming the folder: only an app's migrations are run, so one in a lib would never be applied.

The `app.md` agent rule grows by 246 bytes for the sentence that says so, and its budget is raised to match.
