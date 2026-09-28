export const CSR_DEV_DIRNAME = "csr-dev";
export const CSR_DEV_ROUTE_PREFIX = "/_akan/csr-dev/";
export const CSR_DEV_APP_FILE = "app.js";
export const CSR_DEV_MANIFEST_FILE = "manifest.json";
/** Present only while the resident builder patches: a builder that dies holding it takes the patcher off. */
export const CSR_DEV_PATCHING_MARKER = ".patching";
/** Patches kept on disk behind the newest, and as many as a reconnecting tab catches up on before it reloads instead. */
export const CSR_DEV_KEPT_PATCHES = 40;

export const SSR_DEV_DIRNAME = "ssr-dev";
export const SSR_DEV_ROUTE_PREFIX = "/_akan/ssr-dev/";
/** The one chunk every SSR registry row names: loading it boots the registry in the tab. */
export const SSR_DEV_CHUNK = "ssr-dev";
/** Marks a row id as a registry module, so the dev shim tells it from the runtime rows that stay chunk URLs. */
export const SSR_DEV_ID_PREFIX = "ssr-dev:";

export type DevCsrMode = "registry" | "artifact";

export interface CsrDevManifest {
  version: 1;
  generation: number;
  /** The generation `app.js` holds; a patch is announced before `app.js` catches up, so it may trail `generation`. */
  appGeneration?: number;
  vendorFile: string;
  entries: Record<string, string>;
  /** When the registry was last built whole: a tab from an earlier registry must reload, whatever its generation. */
  epoch?: number;
}

export const appGenerationOf = (manifest: CsrDevManifest): number => manifest.appGeneration ?? manifest.generation;

/** Where each module's generated code starts in a combined file (`app.js`, a patch), for its source map. */
export interface CsrDevLayout {
  lineCount: number;
  modules: [id: string, line: number][];
}

export const csrDevModuleFile = (id: string, extension: ".js" | ".js.map") =>
  `modules/${Bun.hash(id).toString(36)}${extension}`;

export const resolveDevCsrMode = (env: Record<string, string | undefined> = process.env): DevCsrMode =>
  env.AKAN_DEV_CSR === "artifact" ? "artifact" : "registry";
