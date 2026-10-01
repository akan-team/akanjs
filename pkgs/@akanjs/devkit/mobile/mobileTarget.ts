import type { AkanNativeAppId } from "akanjs";
import type { AkanAppConfig, AkanNativeTarget, NativeEnv } from "../akanConfig";
import type { App } from "../commandDecorators";

export type MobilePlatform = "ios" | "android";
export type DesktopPlatform = "macos" | "windows" | "linux";
export type NativePlatform = MobilePlatform | DesktopPlatform;
export type MobileTargetSelection = string | "all" | undefined;

export interface ResolvedMobileTarget {
  name: string;
  config: AkanNativeTarget;
}

export const MOBILE_ENVS = ["local", "debug", "develop", "main"] as const satisfies readonly NativeEnv[];

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

export const getMobileTargets = async (app: App): Promise<ResolvedMobileTarget[]> => {
  const config = await app.getConfig();
  return Object.entries(config.native.targets).map(([name, target]) => ({ name, config: target }));
};

//* An app with basePaths builds a CSR page per basePath and none at its root, so a target naming no basePath opens
//* nothing on its own there; it is the template each basePath's target is made from.
const isTemplateOnly = ({ basePaths, native }: Pick<AkanAppConfig, "basePaths" | "native">) =>
  basePaths.size > 0 && Object.values(native.targets).every((target) => !target.basePath);

export const getMobileTargetChoices = async (app: App): Promise<string[]> => {
  const config = await app.getConfig();
  const targetNames = Object.keys(config.native.targets);
  if (targetNames.length > 0 && !isTemplateOnly(config)) return targetNames;
  return [...config.basePaths];
};

const resolveMobileTargetByBasePath = (
  targets: ResolvedMobileTarget[],
  basePath: string,
): ResolvedMobileTarget | undefined => {
  const normalizedBasePath = trimSlashes(basePath);
  const byBasePath = targets.find(
    ({ config }) => config.basePath !== undefined && trimSlashes(config.basePath) === normalizedBasePath,
  );
  if (byBasePath) return byBasePath;
  const [template] = targets;
  if (!template) return undefined;
  return {
    name: normalizedBasePath,
    config: { ...template.config, name: normalizedBasePath, basePath: normalizedBasePath },
  };
};

export const resolveMobileTargets = async (
  app: App,
  selection: MobileTargetSelection,
): Promise<ResolvedMobileTarget[]> => {
  const config = await app.getConfig();
  const targets = await getMobileTargets(app);
  if (targets.length === 0) throw new Error(`No native targets configured for ${app.name}`);
  if (!selection && targets.length === 1 && !isTemplateOnly(config)) return targets;
  if (!selection) {
    const choices = await getMobileTargetChoices(app);
    if (choices.length === 1) return resolveMobileTargets(app, choices[0]);
    throw new Error(`Multiple native targets found for ${app.name}. Pass --target <${choices.join("|")}|all>.`);
  }
  if (selection === "all") {
    if (Object.keys(config.native.targets).length > 1) return targets;
    const basePaths = [...config.basePaths];
    if (basePaths.length > 1 || isTemplateOnly(config)) {
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
  if (basePathTarget && config.basePaths.has(trimSlashes(selection))) return [basePathTarget];
  const choices = await getMobileTargetChoices(app);
  throw new Error(`Native target '${selection}' was not found. Available: ${choices.join(", ")}`);
};

export const resolveAppId = (appId: AkanNativeAppId, platform: NativePlatform): string => {
  if (typeof appId === "string") return appId;
  const id = appId[platform] ?? appId.default;
  if (!id) throw new Error(`native.appId names no id for ${platform}; give it ${platform} or default.`);
  return id;
};

export const appIdsOf = (appId: AkanNativeAppId): string[] =>
  typeof appId === "string" ? [appId] : Object.values(appId).filter((id): id is string => !!id);

export const resolveMobilePath = (target: AkanNativeTarget, pathname: string) => {
  const basePath = trimSlashes(target.basePath ?? "");
  const normalizedPath = `/${pathname.replace(/^\/+/, "")}`;
  if (!basePath) return normalizedPath;
  if (normalizedPath === `/${basePath}` || normalizedPath.startsWith(`/${basePath}/`)) return normalizedPath;
  return `/${basePath}${normalizedPath === "/" ? "" : normalizedPath}`;
};

export const targetHtmlFilename = (target: AkanNativeTarget) => {
  const basePath = trimSlashes(target.basePath ?? "");
  return basePath ? `${basePath}.html` : "index.html";
};
