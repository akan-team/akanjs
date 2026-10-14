import { isRecord } from "akanjs/common";
import type { PageConfig, PageSafeAreaConfig, PageState, ResponsiveInset, SsrRenderMode } from "./csrTypes";
import { transitionTypes } from "./transitionTypes";

export type DevicePlatform = "ios" | "android" | "web" | (string & {});
export type SafeAreaInsets = { top: number; bottom: number };

export interface ResolvePageStateOptions {
  configChain?: PageConfig[];
  path: string;
  basePath?: string;
  platform: DevicePlatform;
  deviceSafeArea: SafeAreaInsets;
  cssSafeArea?: SafeAreaInsets;
  /** The viewport width in px a responsive inset resolves at; left out, it resolves at `base`. */
  width?: number;
}

/** Tailwind's default breakpoints in rem, the widths a `ResponsiveInset` keys on; `ui/styles.css` repeats them. */
export const insetBreakpoints = [
  ["sm", 40],
  ["md", 48],
  ["lg", 64],
  ["xl", 80],
  ["2xl", 96],
] as const;
export type TailwindBreakpoint = (typeof insetBreakpoints)[number][0];
export type InsetBreakpoint = "base" | TailwindBreakpoint;

const breakpointRem = Object.fromEntries(insetBreakpoints) as { [name in TailwindBreakpoint]: number };

/** The media query Tailwind's `<name>:` variant matches, or with `below` its `max-<name>:` one. */
export const breakpointQuery = (name: TailwindBreakpoint, { below = false }: { below?: boolean } = {}) =>
  `(width ${below ? "<" : ">="} ${breakpointRem[name]}rem)`;

const pageConfigKeys = new Set<keyof PageConfig>([
  "transition",
  "safeArea",
  "topInset",
  "bottomInset",
  "gesture",
  "cache",
  "ssr",
  "rscPatchHeadSafe",
  "topSafeAreaColor",
  "bottomSafeAreaColor",
]);
//* Read by the build off the source file, never merged into a page's runtime state — keep it out of
//* `pageConfigKeys` so `mergePageConfigs` cannot leak it down the layout chain.
const buildPageConfigKeys = new Set<keyof PageConfig>(["devOnly"]);
const ssrRenderModes = new Set<SsrRenderMode>(["stream", "block"]);
const DEFAULT_BOOLEAN_INSET = 48;

const hasOwn = <Key extends PropertyKey>(value: object, key: Key) => Object.hasOwn(value, key);

export const validatePageConfig = (routeKey: string, config?: PageConfig) => {
  if (config === undefined) return;
  if (!isRecord(config)) throw new Error(`[route-convention] pageConfig in ${routeKey} must be an object.`);
  const pageConfig = config as PageConfig;
  for (const key of Object.keys(pageConfig)) {
    if (!pageConfigKeys.has(key as keyof PageConfig) && !buildPageConfigKeys.has(key as keyof PageConfig)) {
      throw new Error(`[route-convention] unsupported pageConfig option "${key}" in ${routeKey}`);
    }
  }
  if (pageConfig.devOnly !== undefined && typeof pageConfig.devOnly !== "boolean") {
    throw new Error(`[route-convention] pageConfig.devOnly in ${routeKey} must be a boolean.`);
  }
  if (pageConfig.transition !== undefined && !transitionTypes.includes(pageConfig.transition)) {
    throw new Error(`[route-convention] unsupported pageConfig.transition "${pageConfig.transition}" in ${routeKey}`);
  }
  if (pageConfig.ssr !== undefined && !ssrRenderModes.has(pageConfig.ssr)) {
    throw new Error(`[route-convention] unsupported pageConfig.ssr "${pageConfig.ssr}" in ${routeKey}`);
  }
  for (const key of ["topInset", "bottomInset"] as const) {
    if (pageConfig[key] !== undefined && !isValidInsetValue(pageConfig[key]))
      throw new Error(
        `[route-convention] pageConfig.${key} in ${routeKey} must be a boolean, a non-negative px number, or { base, sm?, md?, lg?, xl?, "2xl"? } of them.`,
      );
  }
  validateSafeAreaConfig(routeKey, pageConfig.safeArea);
};

const isInsetPx = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const responsiveInsetKeys = new Set<string>(["base", ...insetBreakpoints.map(([name]) => name)]);

const isValidInsetValue = (value: unknown): value is NonNullable<PageConfig["topInset"]> => {
  if (typeof value === "boolean" || isInsetPx(value)) return true;
  if (!isRecord(value) || !isInsetPx(value.base)) return false;
  return Object.entries(value).every(([key, px]) => responsiveInsetKeys.has(key) && isInsetPx(px));
};

export const isResponsiveInset = (inset: PageConfig["topInset"]): inset is ResponsiveInset => isRecord(inset);

/** The inset at each breakpoint, each one the nearest declared value at or below it. */
export const insetsByBreakpoint = (inset: PageConfig["topInset"]): { [bp in InsetBreakpoint]: number } => {
  const base = isResponsiveInset(inset) ? inset.base : resolveInset(inset);
  const values = { base } as { [bp in InsetBreakpoint]: number };
  let current = base;
  for (const [name] of insetBreakpoints) {
    current = (isResponsiveInset(inset) ? inset[name] : undefined) ?? current;
    values[name] = current;
  }
  return values;
};

/** The inset in force at `width` px, assuming a 16px rem. */
export const insetAt = (inset: PageConfig["topInset"], width?: number): number => {
  if (!isResponsiveInset(inset)) return resolveInset(inset);
  if (width === undefined) return inset.base;
  const values = insetsByBreakpoint(inset);
  return insetBreakpoints.reduce((value, [name, rem]) => (width >= rem * 16 ? values[name] : value), values.base);
};

const validateSafeAreaConfig = (routeKey: string, safeArea?: PageSafeAreaConfig) => {
  if (safeArea === undefined || typeof safeArea === "boolean" || safeArea === "top" || safeArea === "bottom") return;
  if (!isRecord(safeArea)) throw new Error(`[route-convention] pageConfig.safeArea in ${routeKey} is invalid.`);
  for (const key of Object.keys(safeArea)) {
    if (key !== "top" && key !== "bottom" && key !== "android") {
      throw new Error(`[route-convention] unsupported pageConfig.safeArea option "${key}" in ${routeKey}`);
    }
  }
  for (const side of ["top", "bottom"] as const) {
    if (safeArea[side] !== undefined && typeof safeArea[side] !== "boolean")
      throw new Error(`[route-convention] pageConfig.safeArea.${side} in ${routeKey} must be a boolean.`);
  }
  if (
    safeArea.android !== undefined &&
    safeArea.android !== "auto" &&
    safeArea.android !== "edge-to-edge" &&
    safeArea.android !== "none"
  ) {
    throw new Error(`[route-convention] pageConfig.safeArea.android in ${routeKey} is invalid.`);
  }
};

export const mergePageConfigs = (configChain: PageConfig[] = []): PageConfig => {
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
};

export const getExplicitPageConfigKeys = (
  configChain: PageConfig[] = [],
): Partial<Record<keyof PageConfig, boolean>> => {
  const explicitKeys: Partial<Record<keyof PageConfig, boolean>> = {};
  for (const config of configChain) {
    for (const key of pageConfigKeys) {
      if (hasOwn(config, key)) explicitKeys[key] = true;
    }
  }
  return explicitKeys;
};

//? Not in `csrTypes.ts`: under `react-server`, `react` exports no `createContext` or hooks, so the RSC worker (via
//? `routeTreeBuilder.ts`) needs this react-free half of the page frame contract.
export const defaultPageState: PageState = {
  transition: "none",
  topSafeArea: 0,
  bottomSafeArea: 0,
  topInset: 0,
  bottomInset: 0,
  gesture: true,
  cache: false,
  ssr: "stream",
  topSafeAreaColor: "var(--color-background, Canvas)",
  bottomSafeAreaColor: "var(--color-background, Canvas)",
};

export const resolvePageState = ({
  configChain = [],
  path,
  basePath,
  platform,
  deviceSafeArea,
  cssSafeArea,
  width,
}: ResolvePageStateOptions): PageState => {
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
  const responsive = isResponsiveInset(config.topInset) || isResponsiveInset(config.bottomInset);
  const safeAreaEnv = platform === "web" ? resolveSafeAreaEnv(config.safeArea) : undefined;
  return {
    transition,
    topSafeArea: safeArea.top,
    bottomSafeArea: safeArea.bottom,
    topInset: insetAt(config.topInset, width),
    bottomInset: insetAt(config.bottomInset, width),
    ...(responsive
      ? {
          responsiveInset: {
            top: isResponsiveInset(config.topInset) ? config.topInset : { base: resolveInset(config.topInset) },
            bottom: isResponsiveInset(config.bottomInset)
              ? config.bottomInset
              : { base: resolveInset(config.bottomInset) },
          },
        }
      : {}),
    ...(safeAreaEnv ? { safeAreaEnv } : {}),
    gesture: explicitKeys.gesture
      ? (config.gesture ?? false)
      : transition === "none"
        ? false
        : (config.gesture ?? false),
    cache: config.cache ?? false,
    ssr: config.ssr ?? "stream",
    topSafeAreaColor: config.topSafeAreaColor ?? defaultPageState.topSafeAreaColor,
    bottomSafeAreaColor: config.bottomSafeAreaColor ?? defaultPageState.bottomSafeAreaColor,
  };
};

const resolveInset = (inset: PageConfig["topInset"]): number => {
  if (inset === true) return DEFAULT_BOOLEAN_INSET;
  if (inset === false || inset === undefined) return 0;
  if (isResponsiveInset(inset)) return inset.base;
  return inset;
};

//? A browser has no safe-area API for script, so a page that asks for one on the web is padded by `env()` itself.
const resolveSafeAreaEnv = (safeArea?: PageSafeAreaConfig): { top: boolean; bottom: boolean } | undefined => {
  if (safeArea === undefined || safeArea === false) return undefined;
  const top = safeArea === true || safeArea === "top" || (isRecord(safeArea) && safeArea.top !== false);
  const bottom = safeArea === true || safeArea === "bottom" || (isRecord(safeArea) && safeArea.bottom !== false);
  return top || bottom ? { top, bottom } : undefined;
};

const getPlatformFrameProfile = (platform: DevicePlatform): PageConfig => {
  if (platform === "ios") return { safeArea: true, transition: "stack" };
  if (platform === "android") return { safeArea: { android: "auto" }, transition: "scaleOut", gesture: false };
  return { safeArea: false, transition: "none", gesture: false };
};

const getRouteRoleFrameDefaults = (path: string, platform: DevicePlatform, basePath?: string): PageConfig => {
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
};

const resolveSafeArea = ({
  safeArea,
  platform,
  deviceSafeArea,
  cssSafeArea,
}: {
  safeArea?: PageSafeAreaConfig;
  platform: DevicePlatform;
  deviceSafeArea: SafeAreaInsets;
  cssSafeArea?: SafeAreaInsets;
}): SafeAreaInsets => {
  if (safeArea === false) return { top: 0, bottom: 0 };
  const enabledAt = (side: "top" | "bottom") =>
    safeArea === true ||
    safeArea === side ||
    (isRecord(safeArea) ? safeArea[side] !== false : safeArea === undefined && platform !== "web");
  const [topEnabled, bottomEnabled] = [enabledAt("top"), enabledAt("bottom")];
  if (platform === "android") {
    const androidMode = isRecord(safeArea)
      ? (safeArea.android as "auto" | "edge-to-edge" | "none" | undefined)
      : "auto";
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
  //? A browser's only safe-area source is the CSS probe, which `viewport-fit=cover` makes report the notch.
  const source = platform === "web" && cssSafeArea ? cssSafeArea : deviceSafeArea;
  return {
    top: topEnabled ? source.top : 0,
    bottom: bottomEnabled ? source.bottom : 0,
  };
};

const hasInset = (insets: SafeAreaInsets) => insets.top > 0 || insets.bottom > 0;

const maxInsets = (a: SafeAreaInsets, b?: SafeAreaInsets): SafeAreaInsets => ({
  top: Math.max(a.top, b?.top ?? 0),
  bottom: Math.max(a.bottom, b?.bottom ?? 0),
});

export const readCssSafeAreaInsets = (): SafeAreaInsets => {
  if (typeof window === "undefined") return { top: 0, bottom: 0 };
  const style = window.getComputedStyle?.(document.documentElement);
  return {
    top: readCssPixel(style?.getPropertyValue("--akan-native-safe-area-top")) || readCssEnvProbe("top"),
    bottom: readCssPixel(style?.getPropertyValue("--akan-native-safe-area-bottom")) || readCssEnvProbe("bottom"),
  };
};

const readCssEnvProbe = (side: "top" | "bottom") => {
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
};

const readCssPixel = (value?: string) => {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
