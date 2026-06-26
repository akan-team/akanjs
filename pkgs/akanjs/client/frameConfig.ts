import type { PageConfig, PageSafeAreaConfig, PageState, TransitionType } from "./csrTypes";

export type DevicePlatform = "ios" | "android" | "web" | (string & {});
export type SafeAreaInsets = { top: number; bottom: number };

export interface ResolvePageStateOptions {
  configChain?: PageConfig[];
  path: string;
  basePath?: string;
  platform: DevicePlatform;
  deviceSafeArea: SafeAreaInsets;
  cssSafeArea?: SafeAreaInsets;
}

const pageConfigKeys = new Set<keyof PageConfig>([
  "transition",
  "safeArea",
  "topInset",
  "bottomInset",
  "gesture",
  "cache",
  "rscPatchHeadSafe",
  "topSafeAreaColor",
  "bottomSafeAreaColor",
]);
const transitionTypes = new Set<TransitionType>(["none", "fade", "bottomUp", "stack", "scaleOut"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = <Key extends PropertyKey>(value: object, key: Key) => Object.hasOwn(value, key);

export function validatePageConfig(routeKey: string, config?: PageConfig) {
  if (config === undefined) return;
  if (!isRecord(config)) throw new Error(`[route-convention] pageConfig in ${routeKey} must be an object.`);
  const pageConfig = config as PageConfig;
  for (const key of Object.keys(pageConfig)) {
    if (!pageConfigKeys.has(key as keyof PageConfig)) {
      throw new Error(`[route-convention] unsupported pageConfig option "${key}" in ${routeKey}`);
    }
  }
  if (pageConfig.transition !== undefined && !transitionTypes.has(pageConfig.transition)) {
    throw new Error(`[route-convention] unsupported pageConfig.transition "${pageConfig.transition}" in ${routeKey}`);
  }
  if (pageConfig.topInset !== undefined && !isValidInsetValue(pageConfig.topInset)) {
    throw new Error(`[route-convention] pageConfig.topInset in ${routeKey} must be a non-negative px number.`);
  }
  if (pageConfig.bottomInset !== undefined && !isValidInsetValue(pageConfig.bottomInset)) {
    throw new Error(`[route-convention] pageConfig.bottomInset in ${routeKey} must be a non-negative px number.`);
  }
  validateSafeAreaConfig(routeKey, pageConfig.safeArea);
}

function isValidInsetValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateSafeAreaConfig(routeKey: string, safeArea?: PageSafeAreaConfig) {
  if (
    safeArea === undefined ||
    typeof safeArea === "boolean" ||
    safeArea === "top" ||
    safeArea === "bottom"
  )
    return;
  if (!isRecord(safeArea)) throw new Error(`[route-convention] pageConfig.safeArea in ${routeKey} is invalid.`);
  for (const key of Object.keys(safeArea)) {
    if (key !== "top" && key !== "bottom" && key !== "android") {
      throw new Error(`[route-convention] unsupported pageConfig.safeArea option "${key}" in ${routeKey}`);
    }
  }
  if (safeArea.top !== undefined && typeof safeArea.top !== "boolean") {
    throw new Error(`[route-convention] pageConfig.safeArea.top in ${routeKey} must be a boolean.`);
  }
  if (safeArea.bottom !== undefined && typeof safeArea.bottom !== "boolean") {
    throw new Error(`[route-convention] pageConfig.safeArea.bottom in ${routeKey} must be a boolean.`);
  }
  if (
    safeArea.android !== undefined &&
    safeArea.android !== "auto" &&
    safeArea.android !== "edge-to-edge" &&
    safeArea.android !== "none"
  ) {
    throw new Error(`[route-convention] pageConfig.safeArea.android in ${routeKey} is invalid.`);
  }
}

export function mergePageConfigs(configChain: PageConfig[] = []): PageConfig {
  const merged: PageConfig = {};
  for (const config of configChain) {
    for (const key of pageConfigKeys) {
      const value = config[key];
      if (value === undefined) continue;
      if (key === "safeArea" && isRecord(merged.safeArea) && isRecord(value)) {
        merged.safeArea = { ...merged.safeArea, ...value };
      } else {
        (merged as Record<keyof PageConfig, unknown>)[key] = value;
      }
    }
  }
  return merged;
}

export function getExplicitPageConfigKeys(configChain: PageConfig[] = []): Partial<Record<keyof PageConfig, boolean>> {
  const explicitKeys: Partial<Record<keyof PageConfig, boolean>> = {};
  for (const config of configChain) {
    for (const key of pageConfigKeys) {
      if (hasOwn(config, key)) explicitKeys[key] = true;
    }
  }
  return explicitKeys;
}

export function resolvePageState({
  configChain = [],
  path,
  basePath,
  platform,
  deviceSafeArea,
  cssSafeArea,
}: ResolvePageStateOptions): PageState {
  const profile = getPlatformFrameProfile(platform);
  const routeRole = getRouteRoleFrameDefaults(path, platform, basePath);
  const config = mergePageConfigs([profile, routeRole, ...configChain]);
  const explicitKeys = getExplicitPageConfigKeys(configChain);
  const safeArea = resolveSafeArea({
    safeArea: config.safeArea,
    platform,
    deviceSafeArea,
    cssSafeArea,
  });
  const transition = config.transition ?? "none";
  return {
    transition,
    topSafeArea: safeArea.top,
    bottomSafeArea: safeArea.bottom,
    topInset: config.topInset ?? 0,
    bottomInset: config.bottomInset ?? 0,
    gesture: explicitKeys.gesture ? (config.gesture ?? false) : transition === "none" ? false : (config.gesture ?? false),
    cache: config.cache ?? false,
    topSafeAreaColor: config.topSafeAreaColor ?? "var(--color-base-100, Canvas)",
    bottomSafeAreaColor: config.bottomSafeAreaColor ?? "var(--color-base-100, Canvas)",
  };
}

function getPlatformFrameProfile(platform: DevicePlatform): PageConfig {
  if (platform === "ios") return { safeArea: true, transition: "stack" };
  if (platform === "android") return { safeArea: { android: "auto" }, transition: "scaleOut", gesture: false };
  return { safeArea: false, transition: "none", gesture: false };
}

function getRouteRoleFrameDefaults(path: string, platform: DevicePlatform, basePath?: string): PageConfig {
  const normalizedBasePath = basePath?.replace(/^\/+|\/+$/g, "");
  const depth = path
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "[lang]" && segment !== ":lang")
    .filter((segment) => (normalizedBasePath ? segment !== normalizedBasePath : true)).length;
  if (depth <= 1) return { transition: "none", gesture: false, cache: true };
  return {
    transition: platform === "ios" ? "stack" : platform === "android" ? "scaleOut" : "none",
    gesture: platform === "ios",
  };
}

function resolveSafeArea({
  safeArea,
  platform,
  deviceSafeArea,
  cssSafeArea,
}: {
  safeArea?: PageSafeAreaConfig;
  platform: DevicePlatform;
  deviceSafeArea: SafeAreaInsets;
  cssSafeArea?: SafeAreaInsets;
}): SafeAreaInsets {
  if (safeArea === false) return { top: 0, bottom: 0 };
  const topEnabled =
    safeArea === true ||
    safeArea === "top" ||
    (isRecord(safeArea) ? safeArea.top !== false : safeArea === undefined && platform !== "web");
  const bottomEnabled =
    safeArea === true ||
    safeArea === "bottom" ||
    (isRecord(safeArea) ? safeArea.bottom !== false : safeArea === undefined && platform !== "web");
  if (platform === "android") {
    const androidMode = isRecord(safeArea) ? (safeArea.android as "auto" | "edge-to-edge" | "none" | undefined) : "auto";
    if (androidMode === "none") return { top: 0, bottom: 0 };
    const source =
      androidMode === "edge-to-edge"
        ? maxInsets(deviceSafeArea, cssSafeArea)
        : cssSafeArea && hasInset(cssSafeArea)
          ? cssSafeArea
          : null;
    return {
      top: topEnabled && source ? source.top : 0,
      bottom: bottomEnabled && source ? source.bottom : 0,
    };
  }
  return {
    top: topEnabled ? deviceSafeArea.top : 0,
    bottom: bottomEnabled ? deviceSafeArea.bottom : 0,
  };
}

const hasInset = (insets: SafeAreaInsets) => insets.top > 0 || insets.bottom > 0;

const maxInsets = (a: SafeAreaInsets, b?: SafeAreaInsets): SafeAreaInsets => ({
  top: Math.max(a.top, b?.top ?? 0),
  bottom: Math.max(a.bottom, b?.bottom ?? 0),
});

export function readCssSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === "undefined") return { top: 0, bottom: 0 };
  const style = window.getComputedStyle?.(document.documentElement);
  return {
    top: readCssPixel(style?.getPropertyValue("--safe-area-inset-top")) || readCssEnvProbe("top"),
    bottom: readCssPixel(style?.getPropertyValue("--safe-area-inset-bottom")) || readCssEnvProbe("bottom"),
  };
}

function readCssEnvProbe(side: "top" | "bottom") {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style[side] = `env(safe-area-inset-${side})`;
  document.documentElement.appendChild(probe);
  const value = readCssPixel(window.getComputedStyle(probe)[side]);
  probe.remove();
  return value;
}

function readCssPixel(value?: string) {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
