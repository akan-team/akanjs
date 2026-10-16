---
"akanjs": patch
"@akanjs/devkit": patch
"@akanjs/cli": patch
"create-akan-workspace": patch
---

- The akan CLI runs in a workspace with no root `.env`: the workspace root is the folder with `package.json`, `tsconfig.json` and an `apps/`, `libs/` or `pkgs/` folder. Unset, `AKAN_PUBLIC_REPO_NAME` falls back to the origin remote's name and `AKAN_PUBLIC_SERVE_DOMAIN` to `localhost`; `akan build` and the redis/postgres tunnels refuse either fallback for any environment but `local`.
- The theme contrast check reads every theme block. It used to read every other block, and none after an `@source` line, so on the framework stylesheet it checked only the light theme. `akan lint` may now report contrast failures in a `:root` or dark theme that were always there.
- `declaredCustomProperties` skips a whole `@theme` block, nested `@keyframes` included, and ignores tokens inside comments. Theme CSS and the generated `useClient.ts` are parsed in linear time.
- `akan agent install` writes an `AGENTS.md` about 60% smaller: the conventions guideline keeps the rules and points at the on-demand guidelines for the detail, and a new `pageRule` guideline covers routing.
