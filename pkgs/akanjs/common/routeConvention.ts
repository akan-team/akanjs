const ROUTE_SOURCE_RE = /^\.\/(.+)\.(tsx|ts|jsx|js)$/;
const SOURCE_EXT_RE = /\.(tsx|ts|jsx|js)$/;
const RESERVED_ROUTE_FILES = new Set(["_layout", "_index", "_overrides"]);
const INTERNAL_ROOT_LAYOUT_LEAF = "__root_layout";
const IMPLICIT_LOCALE_SEGMENT = "[lang]";
const SPECIAL_ROUTE_LEAVES = new Set(["robots.txt"]);
// Leaves that attach to their own directory node instead of creating a child route segment.
const DIRECTORY_SCOPED_LEAVES = new Set(["_layout", "_index", "_overrides"]);

export type RouteModuleKind = "page" | "layout" | "overrides";

export interface ParsedRouteModuleKey {
  key: string;
  kind: RouteModuleKind;
  routeSegments: string[];
  moduleSegments: string[];
  sourceRouteSegments: string[];
  ext: string;
  leaf: string;
  pattern: string;
  isSpecialRoute: boolean;
  isInternalRootLayout: boolean;
}

export interface ValidateSubRoutePageKeyOptions {
  appName?: string;
  filePath?: string;
}

export interface ValidatePageSourceFileOptions {
  filePath?: string;
}

export function isRouteSourceFile(filePath: string): boolean {
  if (!SOURCE_EXT_RE.test(filePath)) return false;
  const key = filePath.startsWith("./") ? filePath : `./${filePath.split(/[\\/]/).join("/")}`;
  return tryParseRouteModuleKey(key) !== null;
}

export function validatePageSourceFile(filePath: string, options: ValidatePageSourceFileOptions = {}): boolean {
  if (!SOURCE_EXT_RE.test(filePath)) return false;

  const key = filePath.startsWith("./") ? filePath : `./${filePath.split(/[\\/]/).join("/")}`;
  const match = ROUTE_SOURCE_RE.exec(key);
  const displayPath = options.filePath ?? key;
  if (!match) throw new Error(`[route-convention] invalid page source file: ${displayPath}`);

  const file = match[1] as string;
  const ext = match[2] as string;
  const leaf = file.split("/").filter(Boolean).at(-1);
  if (!leaf) throw new Error(`[route-convention] invalid page source file: ${displayPath}`);

  if (ext !== "tsx") throw new Error(`[route-convention] route source files under page/ must use .tsx: ${displayPath}`);
  if (leaf.startsWith("_") && !RESERVED_ROUTE_FILES.has(leaf) && leaf !== INTERNAL_ROOT_LAYOUT_LEAF)
    throw new Error(
      `[route-convention] only _index.tsx, _layout.tsx and _overrides.tsx are allowed as reserved route files under page/: ${displayPath}`,
    );
  if (/^[A-Z]/.test(leaf))
    throw new Error(`[route-convention] route page filenames must not start with an uppercase letter: ${displayPath}`);
  return true;
}

export function validateSubRoutePageKey(
  key: string,
  basePaths: Iterable<string>,
  options: ValidateSubRoutePageKeyOptions = {},
): void {
  const allowedBasePaths = [
    ...new Set([...basePaths].map((basePath) => basePath.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean)),
  ];
  if (allowedBasePaths.length === 0) return;

  const match = ROUTE_SOURCE_RE.exec(key);
  if (!match) throw new Error(`[route-convention] invalid route module key: ${key}`);

  const moduleSegments = (match[1] as string).split("/").filter(Boolean);
  const basePath = moduleSegments[0];
  if (basePath && allowedBasePaths.includes(basePath)) return;

  const appLabel = options.appName ? `app "${options.appName}"` : "app";
  const invalidRoute = options.filePath ?? key;
  throw new Error(
    `[route-convention] ${appLabel} uses subRoutes (${allowedBasePaths.join(", ")}), so route files must live under page/<basePath>. Invalid route file: ${invalidRoute}`,
  );
}

export function parseRouteModuleKey(key: string): ParsedRouteModuleKey {
  const match = ROUTE_SOURCE_RE.exec(key);
  if (!match) throw new Error(`[route-convention] invalid route module key: ${key}`);

  const file = match[1] as string;
  const ext = match[2] as string;
  const moduleSegments = file.split("/").filter(Boolean);
  const leaf = moduleSegments.at(-1);
  if (!leaf) throw new Error(`[route-convention] invalid route module key: ${key}`);

  if (moduleSegments.includes(IMPLICIT_LOCALE_SEGMENT)) {
    throw new Error(`[route-convention] Akan.js injects \`[lang]\` automatically. Move files one level up: ${key}`);
  }

  const isInternalRootLayout = leaf === INTERNAL_ROOT_LAYOUT_LEAF;
  const kind: RouteModuleKind =
    leaf === "_layout" || isInternalRootLayout ? "layout" : leaf === "_overrides" ? "overrides" : "page";
  if (leaf.startsWith("_") && !RESERVED_ROUTE_FILES.has(leaf) && !isInternalRootLayout) {
    throw new Error(`[route-convention] unsupported reserved route file "${leaf}" in ${key}`);
  }

  const sourceRouteSegments =
    DIRECTORY_SCOPED_LEAVES.has(leaf) || isInternalRootLayout ? moduleSegments.slice(0, -1) : moduleSegments;
  const isSpecialRoute = kind === "page" && SPECIAL_ROUTE_LEAVES.has(leaf);
  const routeSegments = isSpecialRoute ? sourceRouteSegments : [IMPLICIT_LOCALE_SEGMENT, ...sourceRouteSegments];
  for (const segment of routeSegments) validateRouteSegment(segment, key);

  return {
    key,
    kind,
    routeSegments,
    moduleSegments,
    sourceRouteSegments,
    ext,
    leaf,
    pattern: normalizeRoutePattern(routeSegments),
    isSpecialRoute,
    isInternalRootLayout,
  };
}

export function isSpecialRouteLeaf(leaf: string): boolean {
  return SPECIAL_ROUTE_LEAVES.has(leaf);
}

export function tryParseRouteModuleKey(key: string): ParsedRouteModuleKey | null {
  try {
    return parseRouteModuleKey(key);
  } catch {
    return null;
  }
}

export function normalizeRoutePattern(segments: string[]): string {
  const parts = segments.map(routeSegmentToPatternPart).filter((part) => part.length > 0);
  return `/${parts.join("/")}`.replace(/\/+$/, "") || "/";
}

export function routeSegmentToPatternPart(segment: string): string {
  if (/^\(.+\)$/.test(segment)) return "";
  return segment.replace(/^\[([^\]]+)\]$/, ":$1");
}

export function routeSegmentToTreePath(segment: string): string {
  return `/${segment.replace(/^\[([^\]]+)\]$/, ":$1")}`;
}

export function compareRouteSpecificity(a: string, b: string): number {
  const as = a.split("/").filter(Boolean);
  const bs = b.split("/").filter(Boolean);
  const len = Math.min(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const ad = (as[i] ?? "").startsWith(":");
    const bd = (bs[i] ?? "").startsWith(":");
    if (ad !== bd) return ad ? 1 : -1;
  }
  if (as.length !== bs.length) return bs.length - as.length;
  const aDyn = as.filter((s) => s.startsWith(":")).length;
  const bDyn = bs.filter((s) => s.startsWith(":")).length;
  if (aDyn !== bDyn) return aDyn - bDyn;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function matchRoutePattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pat = patternParts[i] ?? "";
    const val = pathParts[i] ?? "";
    if (pat.startsWith(":")) params[pat.slice(1)] = decodeURIComponent(val);
    else if (pat !== val) return null;
  }
  return params;
}

export function assertUniqueRoutePatterns(entries: { key: string; pattern: string }[]): void {
  const byPattern = new Map<string, string>();
  for (const entry of entries) {
    const prev = byPattern.get(entry.pattern);
    if (prev) {
      throw new Error(
        `[route-convention] route conflict for "${entry.pattern}": ${prev} and ${entry.key} resolve to the same URL`,
      );
    }
    byPattern.set(entry.pattern, entry.key);
  }
}

function validateRouteSegment(segment: string, key: string): void {
  if (segment.includes("[...") || segment.includes("[[...")) {
    throw new Error(`[route-convention] catch-all routes are not supported yet: ${key}`);
  }
  const dynamic = /^\[(.+)\]$/.exec(segment);
  if (dynamic && (dynamic[1]?.includes("[") || dynamic[1]?.includes("]") || dynamic[1]?.startsWith("..."))) {
    throw new Error(`[route-convention] invalid dynamic route segment "${segment}" in ${key}`);
  }
}
