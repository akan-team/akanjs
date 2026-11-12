/** `extends` target for a workspace `biome.json`; Biome resolves it through node_modules. */
export const biomeBaseConfig = "@akanjs/devkit/biome.base.json";

// Pinned: Biome moves rules between groups across minors and a stale position is a hard config error. Bump it with
// `biome.base.json` in one commit, running `biome migrate --write` in the workspace root and in this package.
export const biomeVersion = "2.5.14";
