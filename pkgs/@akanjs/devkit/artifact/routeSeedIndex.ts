import path from "node:path";
import { assertUniqueRoutePatterns, compareRouteSpecificity, parseRouteModuleKey } from "akanjs/common";
import type { PageEntry } from "./implicitRootLayout";

/**
 * Build-time utilities for the route seed index. `computeRouteSeedIndex`
 * takes resolved `PageEntry` rows (`key` plus absolute module path — files
 * under `app/` or the generated implicit root layout) and produces — for every
 * route — the list of source files that seed the `"use client"` graph walk.
 *
 * The result is serialized to `route-seed-index.json` by
 * `saveRouteSeedIndex` so the runtime server can call
 * `loadRouteSeedIndex` to restore it without re-importing `pages.ts`
 * (which no longer exists) or reparsing loader sources.
 */

export interface RouteSeedEntry {
  routeId: string;
  pattern: string;
  seeds: string[];
}

export interface RouteSeedIndex {
  entries: RouteSeedEntry[];
  globalLayoutFiles: string[];
}

export type SerializedRouteSeedEntry = Pick<RouteSeedEntry, "routeId"> &
  Partial<Pick<RouteSeedEntry, "pattern" | "seeds">>;

export interface SerializedRouteSeedIndex {
  entries: SerializedRouteSeedEntry[];
  globalLayoutFiles?: string[];
}

/**
 * Compute the route seed index from `PageEntry`s (disk paths or generated
 * implicit root layout absolute paths).
 */
export function computeRouteSeedIndex(pageEntries: PageEntry[]): RouteSeedIndex {
  const layoutsByPrefix = new Map<string, string[]>();
  const pagesBySegments: Array<{
    key: string;
    pattern: string;
    segments: string[];
    files: string[];
    includeOwnLayout: boolean;
  }> = [];

  for (const { key, moduleAbsPath, seedAbsPaths } of pageEntries) {
    const parsed = parseRouteModuleKey(key);
    const files = [path.resolve(moduleAbsPath), ...(seedAbsPaths ?? []).map((seed) => path.resolve(seed))];
    if (parsed.kind === "layout" || parsed.kind === "overrides") {
      // Overrides seed the client graph like layouts: every route under the prefix must pull the generated
      // `"use client"` override wrapper (and its slot components) into the client bundle / RSC client manifest.
      const prefix = parsed.routeSegments.join("/");
      const prev = layoutsByPrefix.get(prefix) ?? [];
      layoutsByPrefix.set(prefix, [...prev, ...files]);
    } else if (parsed.kind === "page") {
      pagesBySegments.push({
        key,
        pattern: parsed.pattern,
        segments: parsed.routeSegments,
        files,
        includeOwnLayout: parsed.leaf === "_index",
      });
    }
  }
  assertUniqueRoutePatterns(pagesBySegments);

  const rootLayouts = layoutsByPrefix.get("") ?? [];
  const globalLayoutFiles = rootLayouts;

  const seedEntries: RouteSeedEntry[] = [];
  for (const { pattern, segments, files, includeOwnLayout } of pagesBySegments) {
    const layouts: string[] = [];
    const maxPrefixLength = includeOwnLayout ? segments.length : Math.max(segments.length - 1, 0);
    for (let i = 0; i <= maxPrefixLength; i++) {
      const prefix = segments.slice(0, i).join("/");
      const layoutFiles = layoutsByPrefix.get(prefix);
      if (layoutFiles) layouts.push(...layoutFiles);
    }
    const seeds = Array.from(new Set([...layouts, ...files]));
    const routeId = pattern || "/";
    seedEntries.push({ routeId, pattern: routeId, seeds });
  }
  // Static segments must beat `:param` ones at match time, otherwise
  // `/persona/new` resolves to `[personaId]=new`. Sort once at build time
  // so the runtime matcher can stay first-match-wins.
  seedEntries.sort((a, b) => compareRouteSpecificity(a.pattern, b.pattern));
  return { entries: seedEntries, globalLayoutFiles };
}

export const ROUTE_SEED_INDEX_JSON = "route-seed-index.json";

export function serializeRouteSeedIndexForArtifact(
  index: RouteSeedIndex,
  artifactDir: string,
  options: { production?: boolean } = {},
): SerializedRouteSeedIndex {
  const normalizedArtifactDir = path.resolve(artifactDir);
  if (options.production) {
    return {
      entries: index.entries.map((entry) => ({ routeId: entry.routeId })),
    };
  }
  return {
    entries: index.entries.map((entry) => ({
      ...entry,
      seeds: entry.seeds.map((seed) => serializeArtifactPath(seed, normalizedArtifactDir)),
    })),
    globalLayoutFiles: index.globalLayoutFiles.map((file) => serializeArtifactPath(file, normalizedArtifactDir)),
  };
}

export async function saveRouteSeedIndex(
  artifactDir: string,
  index: RouteSeedIndex,
  options: { production?: boolean } = {},
): Promise<string> {
  const absPath = path.join(path.resolve(artifactDir), ROUTE_SEED_INDEX_JSON);
  await Bun.write(
    absPath,
    `${JSON.stringify(serializeRouteSeedIndexForArtifact(index, artifactDir, options), null, 2)}\n`,
  );
  return absPath;
}

function serializeArtifactPath(artifactPath: string, artifactDir: string): string {
  if (!path.isAbsolute(artifactPath)) return artifactPath;
  return path.relative(artifactDir, artifactPath).split(path.sep).join("/");
}
