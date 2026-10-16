import type { MatchedRoute, RouteSeedEntry } from "./routeSeedIndexStore";

interface CompiledEntry {
  entry: RouteSeedEntry;
  parts: string[];
}

// Every page request matches its pathname against the whole index, so the patterns are split once per index instead
// of once per entry per request. A dev rebuild hands over a new `entries` array, which compiles a new matcher.
export class RouteSeedMatcher {
  static readonly #byEntries = new WeakMap<RouteSeedEntry[], RouteSeedMatcher>();

  static of(entries: RouteSeedEntry[]): RouteSeedMatcher {
    const cached = RouteSeedMatcher.#byEntries.get(entries);
    if (cached && cached.#size === entries.length) return cached;
    const matcher = new RouteSeedMatcher(entries);
    RouteSeedMatcher.#byEntries.set(entries, matcher);
    return matcher;
  }

  readonly #size: number;
  readonly #inOrder: CompiledEntry[];
  //? The order `matchPrefix` ranked its candidates in: the most segments first, then the pattern's text.
  readonly #bySpecificity: CompiledEntry[];

  constructor(entries: RouteSeedEntry[]) {
    this.#size = entries.length;
    this.#inOrder = entries.map((entry) => ({ entry, parts: RouteSeedMatcher.#split(entry.pattern ?? entry.routeId) }));
    this.#bySpecificity = [...this.#inOrder].sort((a, b) => {
      const lengthDelta = b.parts.length - a.parts.length;
      if (lengthDelta !== 0) return lengthDelta;
      const aPattern = a.entry.pattern ?? a.entry.routeId;
      const bPattern = b.entry.pattern ?? b.entry.routeId;
      return aPattern < bPattern ? -1 : aPattern > bPattern ? 1 : 0;
    });
  }

  static #split(text: string) {
    return text.split("/").filter(Boolean);
  }

  static #paramsOf(parts: string[], pathParts: string[]): Record<string, string> | null {
    const params: Record<string, string> = {};
    for (let idx = 0; idx < parts.length; idx += 1) {
      const part = parts[idx] as string;
      const value = pathParts[idx] as string;
      if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(value);
      else if (part !== value) return null;
    }
    return params;
  }

  match(pathname: string): MatchedRoute | null {
    const pathParts = RouteSeedMatcher.#split(pathname);
    for (const { entry, parts } of this.#inOrder) {
      if (parts.length !== pathParts.length) continue;
      const params = RouteSeedMatcher.#paramsOf(parts, pathParts);
      if (params) return { entry, params };
    }
    return null;
  }

  matchPrefix(pathname: string): MatchedRoute | null {
    const pathParts = RouteSeedMatcher.#split(pathname);
    for (const { entry, parts } of this.#bySpecificity) {
      if (parts.length > pathParts.length) continue;
      const params = RouteSeedMatcher.#paramsOf(parts, pathParts);
      if (params) return { entry, params };
    }
    return null;
  }
}
