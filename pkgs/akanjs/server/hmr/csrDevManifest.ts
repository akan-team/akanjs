export const CSR_DEV_DIRNAME = "csr-dev";
export const CSR_DEV_ROUTE_PREFIX = "/_akan/csr-dev/";
export const CSR_DEV_APP_FILE = "app.js";
export const CSR_DEV_MANIFEST_FILE = "manifest.json";

export type DevCsrMode = "registry" | "artifact";

export interface CsrDevManifest {
  version: 1;
  generation: number;
  vendorFile: string;
  entries: Record<string, string>;
}

export const resolveDevCsrMode = (env: Record<string, string | undefined> = process.env): DevCsrMode =>
  env.AKAN_DEV_CSR === "registry" ? "registry" : "artifact";
