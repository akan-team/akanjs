---
"@akanjs/devkit": patch
---

The 82 source files at the root of `@akanjs/devkit` now sit in folders by concern:
- `quality/`: the maintainability gate and its scanners
- `context/`: `akan context` and the MCP contract
- `guideline/`: guidelines and the files `akan agent install` writes
- `app/` (the app build runner and reporter, the route JS budget, route source checks and the signal test preload), `workspace/`, `docs/`, `subspace/`, `tunnel/` and `util/`, and `test/` for the shared test helpers
- `lint/`, `typecheck/` and `executors/`, which already existed (`executors.ts` is now `executors/index.ts`)

Each old root subpath (`@akanjs/devkit/scanInfo`, `@akanjs/devkit/workspaceLayout.ts`, …) is an explicit entry in `exports` pointing at the file's new place, so existing imports keep working. Those aliases are deprecated and go away in the next minor; import from the folder path instead (`@akanjs/devkit/workspace/scanInfo`). The package root now holds only the type barrel, and a test keeps it that way.
