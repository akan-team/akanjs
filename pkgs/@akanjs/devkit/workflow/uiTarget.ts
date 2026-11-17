import type { Sys } from "../commandDecorators";
import { getSysRoot, moduleSourcePaths } from "./modulePaths";
import type { UiSurface, WorkflowDiagnostic } from "./types";

const uiSurfaces: readonly string[] = ["view", "unit", "template", "zone", "util"];
const serviceSurfaces: readonly string[] = ["zone", "util"];

export const isUiSurface = (value: unknown): value is UiSurface =>
  typeof value === "string" && uiSurfaces.includes(value);

export interface UiTarget {
  module: string | null;
  diagnostic: WorkflowDiagnostic | null;
}

const bareName = (name: string) => name.replace(/^_/, "").toLowerCase();

export const resolveUiTarget = async (sys: Sys, module: string, surface: string | null): Promise<UiTarget> => {
  if (!isUiSurface(surface) || (await sys.getDatabaseModules()).includes(module))
    return { module: null, diagnostic: null };
  const service = (await sys.getServiceModules()).find((name) => bareName(name) === bareName(module));
  if (!service) return { module: null, diagnostic: null };
  const root = getSysRoot(sys);
  if (!serviceSurfaces.includes(surface))
    return {
      module: null,
      diagnostic: {
        severity: "error",
        code: "workflow-module-not-database",
        input: "module",
        message: `${root}/lib/${service} is a service module, which stores no model, so create-ui takes only zone or util there; a ${surface} needs a database module.`,
      },
    };
  return { module: service, diagnostic: null };
};

export const uiFileExists = async (
  sys: Sys,
  module: string,
  surface: UiSurface,
): Promise<WorkflowDiagnostic | null> => {
  const path = moduleSourcePaths(module)[surface];
  if (!(await sys.exists(path))) return null;
  return {
    severity: "error",
    code: "workflow-ui-file-exists",
    input: "surface",
    message: `${getSysRoot(sys)}/${path} already exists, and create-ui does not overwrite it; edit that file, or remove it first to scaffold it again.`,
  };
};
