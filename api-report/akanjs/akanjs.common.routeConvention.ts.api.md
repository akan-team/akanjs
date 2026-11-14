# `akanjs/common/routeConvention.ts`

Generated from the declaration emit by `bun run api:report`. Do not edit it by hand.

```ts
export declare const GENERATED_ROOT_LAYOUT_EXPORTS: ReadonlySet<string>;

export declare const LAYOUT_ROUTE_EXPORTS: ReadonlySet<string>;

export declare const PAGE_ROUTE_EXPORTS: ReadonlySet<string>;

export interface ParsedRouteModuleKey {
    key: string;
    kind: RouteModuleKind;
    routeSegments: string[];
    moduleSegments: string[];
    sourceRouteSegments: string[];
    ext: string;
    leaf: string;
    pattern: string;
    isInternalRootLayout: boolean;
}

export declare const RESERVED_ROUTE_CONFIG_EXPORTS: ReadonlySet<string>;

export declare const ROOT_LAYOUT_ROUTE_EXPORTS: ReadonlySet<string>;

export type RouteModuleKind = "layout" | "overrides" | "page";

export interface ValidatePageSourceFileOptions {
    filePath?: string;
}

export interface ValidateSubRoutePageKeyOptions {
    appName?: string;
    filePath?: string;
}

export declare function assertUniqueRoutePatterns(entries: {
    key: string;
    pattern: string;
}[]): void;

export declare function compareRouteSpecificity(a: string, b: string): number;

export declare function getPageSourceFileViolation(filePath: string): null | string;

export declare function getRouteExports(kind: "layout" | "page", { rootLayout }?: {
    rootLayout?: boolean | undefined;
}): ReadonlySet<string>;

export declare function isRouteSourceFile(filePath: string): boolean;

export declare function matchRoutePattern(pattern: string, pathname: string): Record<string, string> | null;

export declare function matchRoutePrefix(pattern: string, pathname: string): Record<string, string> | null;

export declare function normalizeRoutePattern(segments: string[]): string;

export declare function parseRouteModuleKey(key: string): ParsedRouteModuleKey;

export declare function routeSegmentToPatternPart(segment: string): string;

export declare function routeSegmentToTreePath(segment: string): string;

export declare function tryParseRouteModuleKey(key: string): ParsedRouteModuleKey | null;

export declare function validatePageSourceFile(filePath: string, options?: ValidatePageSourceFileOptions): boolean;

export declare function validateSubRoutePageKey(key: string, basePaths: Iterable<string>, options?: ValidateSubRoutePageKeyOptions): void;
```
