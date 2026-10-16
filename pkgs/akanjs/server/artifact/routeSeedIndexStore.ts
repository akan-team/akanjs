import path from "node:path";
import { RouteSeedMatcher } from "./routeSeedMatcher";

export interface RouteSeedEntry {
  routeId: string;
  pattern: string;
  seeds: string[];
}

export interface RouteSeedIndex {
  entries: RouteSeedEntry[];
  globalLayoutFiles: string[];
}

export interface MatchedRoute {
  entry: RouteSeedEntry;
  params: Record<string, string>;
}

type SerializedRouteSeedEntry = Pick<RouteSeedEntry, "routeId"> & Partial<Pick<RouteSeedEntry, "pattern" | "seeds">>;

interface SerializedRouteSeedIndex {
  entries: SerializedRouteSeedEntry[];
  globalLayoutFiles?: string[];
}

export const ROUTE_SEED_INDEX_JSON = "route-seed-index.json";

// Built by devkit's `routeSeedIndex.ts` at build time; computing it in-process (Function#toString) drifted from it.
export class RouteSeedIndexStore {
  static async load(artifactDir: string): Promise<RouteSeedIndex> {
    const absPath = path.join(path.resolve(artifactDir), ROUTE_SEED_INDEX_JSON);
    const file = Bun.file(absPath);
    if (!(await file.exists())) {
      throw new Error(
        `[route-seed-index] ${absPath} missing — rebuild with \`akan build\` or \`akan start-backend\` so the index is generated`,
      );
    }
    const json = (await file.json()) as unknown;
    if (!json || typeof json !== "object") {
      throw new Error(`[route-seed-index] ${absPath} is not a valid JSON object`);
    }
    return RouteSeedIndexStore.normalize(json as SerializedRouteSeedIndex, path.resolve(artifactDir));
  }

  static normalize(index: SerializedRouteSeedIndex, artifactDir: string): RouteSeedIndex {
    const normalizedArtifactDir = path.resolve(artifactDir);
    return {
      entries: index.entries.map((entry) => ({
        ...entry,
        pattern: entry.pattern ?? entry.routeId,
        seeds: (entry.seeds ?? []).map((seed) =>
          RouteSeedIndexStore.#normalizeArtifactPath(seed, normalizedArtifactDir),
        ),
      })),
      globalLayoutFiles: (index.globalLayoutFiles ?? []).map((file) =>
        RouteSeedIndexStore.#normalizeArtifactPath(file, normalizedArtifactDir),
      ),
    };
  }

  static match(pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null {
    return RouteSeedMatcher.of(entries).match(pathname);
  }

  static matchPrefix(pathname: string, entries: RouteSeedEntry[]): MatchedRoute | null {
    return RouteSeedMatcher.of(entries).matchPrefix(pathname);
  }

  static #normalizeArtifactPath(artifactPath: string, artifactDir: string): string {
    if (path.isAbsolute(artifactPath)) return artifactPath;
    return path.resolve(artifactDir, artifactPath);
  }
}
