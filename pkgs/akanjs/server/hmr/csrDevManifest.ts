export const CSR_DEV_DIRNAME = "csr-dev";
export const CSR_DEV_ROUTE_PREFIX = "/_akan/csr-dev/";
export const CSR_DEV_APP_FILE = "app.js";
export const CSR_DEV_MANIFEST_FILE = "manifest.json";

export type DevCsrMode = "registry" | "artifact";

export interface CsrDevManifest {
  version: 1;
  generation: number;
  /** The generation `app.js` holds; a patch is announced before `app.js` catches up, so it may trail `generation`. */
  appGeneration?: number;
  vendorFile: string;
  entries: Record<string, string>;
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
