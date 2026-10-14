import "dayjs/locale/ko";

import { Binary } from "akanjs/base";
import {
  type InsetBreakpoint,
  insetBreakpoints,
  insetsByBreakpoint,
  type PageState,
  type RootLayoutProps,
  type RouteViewport,
  toManifestJson,
  type WebAppManifest,
  webManifestHref,
} from "akanjs/client";
import type { AkanTheme } from "akanjs/fetch";
import type { CSSProperties, ReactNode } from "react";

export interface ProviderProps {
  className?: string;
  appName: string;
  params: RootLayoutProps["params"];
  head?: ReactNode;
  /** Emitted as a data URL. */
  manifest?: WebAppManifest;
  /** App-specific public client config (`env/env.client.ts`) merged over the framework's own `getEnv()`. */
  env?: object;
  theme?: AkanTheme;
  viewport?: RouteViewport;
  prefix?: string;
  children: ReactNode | ReactNode[];
  layoutStyle?: "mobile" | "web";
  /** Defaults to local operation mode in CSR. */
  reconnect?: boolean;
  /** Connects the client WebSocket runtime once the browser loads. */
  wsConnect?: boolean;
  /** SSR only: the active-locale dictionary that seeds the client Translator. */
  dictionary?: Record<string, Record<string, unknown>>;
  /** SSR server only: every locale seeds the RSC-worker Translator, and only the active one reaches the client. */
  allDictionary?: Record<string, Record<string, Record<string, unknown>>>;
  /** Root route component for CSR page loading. */
  of: (props: unknown) => ReactNode | null;
}

export const Common = () => {
  return null;
};

/** An SSR document links the URL its server answers, where `start_url`, `scope` and icons resolve; a CSR bundle,
 *  which no server serves in a native shell, carries the manifest inline. */
export function ManifestLink({ manifest, basePath }: { manifest?: WebAppManifest; basePath?: string | null }) {
  if (!manifest) return null;
  const href = basePath === undefined ? createManifestDataUrl(manifest) : webManifestHref(basePath);
  return <link rel="manifest" href={href} />;
}

export function createManifestDataUrl(manifest: WebAppManifest): string {
  const json = JSON.stringify(toManifestJson(manifest));
  return `data:application/manifest+json;base64,${Binary.toBase64(new TextEncoder().encode(json))}`;
}

export type AkanFrameCssVarName =
  | "--akan-top-safe-area"
  | "--akan-bottom-safe-area"
  | "--akan-top-inset"
  | "--akan-bottom-inset"
  | "--akan-page-padding-top"
  | "--akan-page-padding-bottom"
  | "--akan-content-height"
  | `--akan-${"top" | "bottom"}-inset-visibility`
  | `--akan-${"top" | "bottom"}-inset-${InsetBreakpoint}`
  | `--akan-${"top" | "bottom"}-inset-visibility-${InsetBreakpoint}`;

export type AkanFrameCssVars = CSSProperties & { [name in AkanFrameCssVarName]?: string };

const px = (value: number) => `${Math.max(0, value)}px`;
//? A slot clipped to no height still holds its controls; hidden, they leave the tab order and the accessibility tree.
const visibility = (value: number) => (value > 0 ? "visible" : "hidden");
const breakpointNames: InsetBreakpoint[] = ["base", ...insetBreakpoints.map(([name]) => name)];

/** Whether a frame's insets are left to the stylesheet's media rules, which key on `data-akan-frame-responsive`. */
export const isResponsiveFrame = (pageState: PageState, { cssResolved }: { cssResolved: boolean }) =>
  cssResolved && !!pageState.responsiveInset;

/**
 * `cssResolved` is the SSR document, whose width and safe area only CSS knows: insets per breakpoint and the web's
 * `env()` safe area. A CSR frame lays pages out from the same numbers in script, so it gets those numbers.
 */
export function getFrameCssVars(pageState: PageState, { cssResolved }: { cssResolved: boolean }): AkanFrameCssVars {
  const safeAreaEnv = cssResolved ? pageState.safeAreaEnv : undefined;
  const vars: AkanFrameCssVars = {
    "--akan-top-safe-area": safeAreaEnv?.top ? "env(safe-area-inset-top, 0px)" : px(pageState.topSafeArea),
    "--akan-bottom-safe-area": safeAreaEnv?.bottom ? "env(safe-area-inset-bottom, 0px)" : px(pageState.bottomSafeArea),
    "--akan-page-padding-top": "calc(var(--akan-top-safe-area) + var(--akan-top-inset))",
    "--akan-page-padding-bottom": "calc(var(--akan-bottom-safe-area) + var(--akan-bottom-inset))",
    "--akan-content-height":
      "calc(var(--akan-viewport-height, 100dvh) - var(--akan-page-padding-top) - var(--akan-page-padding-bottom))",
  };
  const responsive = isResponsiveFrame(pageState, { cssResolved }) ? pageState.responsiveInset : undefined;
  if (!responsive) {
    vars["--akan-top-inset"] = px(pageState.topInset);
    vars["--akan-bottom-inset"] = px(pageState.bottomInset);
    vars["--akan-top-inset-visibility"] = visibility(pageState.topInset);
    vars["--akan-bottom-inset-visibility"] = visibility(pageState.bottomInset);
    return vars;
  }
  const top = insetsByBreakpoint(responsive.top);
  const bottom = insetsByBreakpoint(responsive.bottom);
  for (const name of breakpointNames) {
    vars[`--akan-top-inset-${name}`] = px(top[name]);
    vars[`--akan-bottom-inset-${name}`] = px(bottom[name]);
    vars[`--akan-top-inset-visibility-${name}`] = visibility(top[name]);
    vars[`--akan-bottom-inset-visibility-${name}`] = visibility(bottom[name]);
  }
  return vars;
}
