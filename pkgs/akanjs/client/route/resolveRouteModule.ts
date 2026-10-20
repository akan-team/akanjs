import type { RouteModule } from "../csrTypes";
import { type RouteDefinition, routeDefinitionMarker } from "./RouteDefinition";

export interface ResolveRouteModuleOption {
  /** The file kind the route convention derived from the path, so `page()` in a `_layout.tsx` is caught here. */
  kind?: "page" | "layout" | "overrides";
  /** The matched route pattern (`/:lang/project/:projectId`), checked against the chain's `.param()` stages. */
  pattern?: string;
}

/** What a route file's module may be: the named-export shape, or one default export holding a chain. */
export type RouteModuleSource = RouteModule | { default: RouteDefinition };

export interface ResolvedRouteModule {
  module: RouteModule;
  /** Present when the module's default export was a `page()` / `layout()` / `rootLayout()` chain. */
  definition?: RouteDefinition;
}

export const isRouteDefinition = (value: unknown): value is RouteDefinition =>
  typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[routeDefinitionMarker] === true;

/** Unfolds a chain module into the named-export shape every loader reads; a legacy module passes through untouched. */
export const resolveRouteModule = (
  mod: RouteModuleSource,
  key: string,
  { kind, pattern }: ResolveRouteModuleOption = {},
): ResolvedRouteModule => {
  const definition: unknown = mod.default;
  if (!isRouteDefinition(definition)) return { module: mod as RouteModule };
  const named = Object.keys(mod).filter((name) => name !== "default");
  if (named.length)
    throw new Error(
      `[route-convention] ${key} exports ${named.join(", ")} beside its ${definition.kind}() chain — every route setting is a stage of the chain`,
    );
  if (kind === "page" && definition.kind !== "page")
    throw new Error(`[route-convention] ${key} is a page file but exports ${definition.kind}()`);
  if (kind === "layout" && definition.kind === "page")
    throw new Error(`[route-convention] ${key} is a layout file but exports page()`);
  if (pattern) definition.assertPattern(pattern, key);
  return { module: definition.toRouteModule(), definition };
};

/** The export sets allow `guard` for an unfolded chain and the generated root layout; the legacy shape never gained it. */
export const assertGuardOnChain = (label: string, resolved: ResolvedRouteModule): ResolvedRouteModule => {
  if (resolved.definition || !("guard" in resolved.module)) return resolved;
  throw new Error(
    `[route-convention] ${label} exports guard beside a legacy default; declare it with .guard() on its chain`,
  );
};
