import type { BaseInsight } from "akanjs/constant";
import type { FetchInitForm, SliceMeta } from "akanjs/fetch";
import { type ClassValue, clsx as clsxLib } from "clsx";
import type { ReactElement, ReactNode } from "react";

/** Composes class names with the shared clsx implementation. */
export const clsx = (...args: ClassValue[]) => clsxLib(...args);

export type ReactFontStyle = "normal" | "italic" | "oblique";
export type ReactFontDisplay = "auto" | "block" | "swap" | "fallback" | "optional";
export type ReactFontCategory = "monospace" | "sans-serif" | "serif" | "display";
export type ReactFontSubset = "latin" | "latin-ext" | "ks-x-1001" | "auto" | (string & {});

export interface ReactFontDeclaration {
  prop: string;
  value: string;
}

export interface ReactFontPath {
  src: string;
  weight: number | string;
  style?: ReactFontStyle;
  declarations?: ReactFontDeclaration[];
}

export interface ReactFontFace {
  font: ReactFont;
  path: ReactFontPath;
  src: string;
  weight: number | string;
  style: ReactFontStyle;
  optimizedSrc: string;
}

export const loadFonts = <T extends ReactFont[]>(fonts: T) =>
  fonts.map((font) => ({ ...font, subsets: font.subsets ?? ["latin"] })) as T;

const FONT_URL_PREFIX = "/_akan/fonts";

export const getFontVariableName = (font: ReactFont) => font.variable ?? `--font-${font.name}`;
export const getFontFallbackName = (font: ReactFont) => font.fallbackName ?? `${font.name} fallback`;
export const isFontOptimizationEnabled = (font: ReactFont) => font.optimize !== false;
export const isFontPreloadEnabled = (font: ReactFont) => font.preload !== false;

export const getFontStyles = (font: ReactFont): ReactFontStyle[] => {
  const styles: ReactFontStyle[] = font.styles?.length ? font.styles : ["normal"];
  return [...new Set(styles)];
};

export const getFontFaces = (font: ReactFont): ReactFontFace[] => {
  const enabledStyles = new Set(getFontStyles(font));
  return font.paths
    .map((path) => {
      const style = path.style ?? "normal";
      return {
        font,
        path,
        src: path.src,
        weight: path.weight,
        style,
        optimizedSrc: getOptimizedFontSrc(font, path),
      };
    })
    .filter((face) => enabledStyles.has(face.style));
};

export const getOptimizedFontSrc = (font: ReactFont, path: ReactFontPath) => {
  const style = path.style ?? "normal";
  const hash = hashFontConfig({
    name: font.name,
    src: path.src,
    weight: path.weight,
    style,
    display: font.display,
    subset: font.subset,
    subsets: font.subsets,
    subsetText: font.subsetText,
    subsetFiles: font.subsetFiles,
    declarations: [...(font.declarations ?? []), ...(path.declarations ?? [])],
  });
  return `${FONT_URL_PREFIX}/${slugFontPart(font.name)}-${slugFontPart(String(path.weight))}-${style}-${hash}.woff2`;
};

const hashFontConfig = (value: unknown) => {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const slugFontPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "font";

/** Common props for list/zone components that render many model records. */
export interface ModelsProps<M extends { id: string }> {
  className?: string;
  slice?: SliceMeta;
  query?: Record<string, unknown>;
  init?: FetchInitForm<any, any>;
  onClickItem?: (model: M) => unknown;
}

/** Common props for unit/view components that render one named model record. */
export type ModelProps<T extends string, L extends { id: string }> = { [key in T]: L } & {
  className?: string;
  slice?: SliceMeta;
  onClick?: (model: L) => unknown;
  actions?: DataAction[];
  columns?: DataColumn<L>[];
  href?: string;
};

export interface ModelDashboardProps<Summary> {
  className?: string;
  summary: Summary;
  queryMap?: Record<string, unknown>;
  columns?: (keyof Summary)[];
  hidePresents?: boolean;
  slice?: SliceMeta;
}

export interface ModelInsightProps<Insight = BaseInsight> {
  className?: string;
  insight: Insight;
  slice?: SliceMeta;
}

export interface ModelEditProps {
  slice?: SliceMeta;
}

export interface ModelViewProps {
  id?: string;
  slice?: SliceMeta;
}
export type DataAction = "edit" | "view" | "remove" | null | undefined | ReactElement;
export interface DataTool {
  key: string;
  render: () => ReactNode;
}

export type DataColumn<L> =
  | string
  | {
      key: keyof L;
      title?: string;
      value?: (value: any, model: L) => string | number | boolean | undefined | null | object;
      responsive?: boolean;
      render?: (value: any, model: L) => ReactNode;
      only?: "user" | "admin";
    };

export interface DataMenuItem {
  key: string;
  icon: ReactNode;
  label?: string;
  render: () => ReactNode;
}
export interface DataMenu {
  [key: string]: DataMenuItem;
}

export interface UserMenuItem {
  title: string | ReactNode;
  icon?: ReactNode;
  path: string;
  query?: Record<string, unknown>;
  children?: UserMenuItem[];
  onClick?: () => void;
}

export interface MenuItem {
  icon?: ReactNode;
  title: string | ReactNode;
  href: string;
  hide?: "mobile" | "pc";
  children?: MenuItem[];
  onClick?: () => void;
}

export interface ReactFont {
  name: string;
  default?: boolean;
  paths: ReactFontPath[];
  styles?: ReactFontStyle[];
  display?: ReactFontDisplay;
  preload?: boolean;
  fallbacks?: string[];
  fallbackName?: string;
  subsets?: ReactFontSubset[];
  subsetText?: string;
  subsetFiles?: string[];
  subset?: false;
  category?: ReactFontCategory;
  variable?: string;
  className?: string;
  declarations?: ReactFontDeclaration[];
  adjustFontFallback?: boolean;
  optimize?: boolean;
}

/** Font declaration consumed by Akan layout modules and font optimization. */
export type Font = ReactFont;

export interface RootLayoutProps {
  children: ReactNode;
  params: {
    lang: "en" | "ko" | (string & {});
  };
}
