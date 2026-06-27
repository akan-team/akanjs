import type { AkanMobileTargetConfig, MobileEnv } from "../akanConfig";
import type { App } from "../commandDecorators";

export type MobilePlatform = "ios" | "android";
export type MobileTargetSelection = string | "all" | undefined;

export interface ResolvedMobileTarget {
  name: string;
  config: AkanMobileTargetConfig;
}

export const MOBILE_ENVS = ["local", "debug", "develop", "main"] as const satisfies readonly MobileEnv[];

export const getMobileTargets = async (app: App): Promise<ResolvedMobileTarget[]> => {
  const config = await app.getConfig();
  return Object.entries(config.mobile.targets).map(([name, target]) => ({ name, config: target }));
};

export const getMobileTargetChoices = async (app: App): Promise<string[]> => {
  const config = await app.getConfig();
  const targetNames = Object.keys(config.mobile.targets);
  if (targetNames.length > 0) return targetNames;
  const basePaths = [...config.basePaths];
  return basePaths;
};

const resolveMobileTargetByBasePath = (
  targets: ResolvedMobileTarget[],
  basePath: string,
): ResolvedMobileTarget | undefined => {
  const normalizedBasePath = basePath.replace(/^\/+|\/+$/g, "");
  const byBasePath = targets.find((target) => target.config.basePath?.replace(/^\/+|\/+$/g, "") === normalizedBasePath);
  if (byBasePath) return byBasePath;
  const [template] = targets;
  if (!template) return undefined;
  return {
    name: normalizedBasePath,
    config: {
      ...template.config,
      name: normalizedBasePath,
      basePath: normalizedBasePath,
    },
  };
};

export const resolveMobileTargets = async (
  app: App,
  selection: MobileTargetSelection,
): Promise<ResolvedMobileTarget[]> => {
  const config = await app.getConfig();
  const targets = await getMobileTargets(app);
  if (targets.length === 0) throw new Error(`No mobile targets configured for ${app.name}`);
  if (!selection && targets.length === 1) return targets;
  if (!selection) {
    const choices = await getMobileTargetChoices(app);
    if (choices.length === 1) return resolveMobileTargets(app, choices[0]);
    throw new Error(`Multiple mobile targets found for ${app.name}. Pass --target <${choices.join("|")}|all>.`);
  }
  if (selection === "all") {
    if (Object.keys(config.mobile.targets).length > 1) return targets;
    const basePaths = [...config.basePaths];
    if (basePaths.length > 1) {
      return basePaths.flatMap((basePath) => {
        const resolved = resolveMobileTargetByBasePath(targets, basePath);
        return resolved ? [resolved] : [];
      });
    }
    return targets;
  }
  const target = targets.find((candidate) => candidate.name === selection);
  if (target) return [target];
  const basePathTarget = resolveMobileTargetByBasePath(targets, selection);
  if (basePathTarget && config.basePaths.has(selection.replace(/^\/+|\/+$/g, ""))) return [basePathTarget];
  const choices = await getMobileTargetChoices(app);
  throw new Error(`Mobile target '${selection}' was not found. Available: ${choices.join(", ")}`);
};

export const resolveMobilePath = (target: AkanMobileTargetConfig, pathname: string) => {
  const basePath = target.basePath?.replace(/^\/+|\/+$/g, "");
  const normalizedPath = `/${pathname.replace(/^\/+/, "")}`;
  if (!basePath) return normalizedPath;
  if (normalizedPath === `/${basePath}` || normalizedPath.startsWith(`/${basePath}/`)) return normalizedPath;
  return `/${basePath}${normalizedPath === "/" ? "" : normalizedPath}`;
};

export const targetHtmlFilename = (target: AkanMobileTargetConfig) =>
  target.basePath?.replace(/^\/+|\/+$/g, "") ? `${target.basePath.replace(/^\/+|\/+$/g, "")}.html` : "index.html";
