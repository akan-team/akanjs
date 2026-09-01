/** `extends` target for a workspace `biome.json`; Biome resolves it through node_modules. */
export const biomeBaseConfig = "@akanjs/devkit/biome.base.json";

// Biome moves rules between groups across minors — `noUnnecessaryConditions` sat in `nursery` at 2.4 and moved to
// `suspicious` at 2.5 — and the stale position is a hard "unknown key" error, not a warning. A workspace whose
// Biome disagrees with the shipped base config therefore fails to load it at all, which is why the version is
// pinned here instead of resolved to latest at create time. Bump this and `biome.base.json` in one commit, and run
// `biome migrate --write` in the workspace root and in `pkgs/@akanjs/devkit` so both configs move together.
export const biomeVersion = "2.5.8";
