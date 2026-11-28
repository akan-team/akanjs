interface RouteMatch {
  path: string;
  route: string;
  params: { [param: string]: string };
}

/** The route patterns a deep link resolves against, and the screen each one names to lay under it (`stackOn`). */
export class DeepLinkStack {
  //? Each step resolves the screen under the one before, so a cycle of stackOn routes ends here.
  static readonly #depthLimit = 8;
  readonly #routes: string[][];
  readonly #stackOn: Map<string, string>;

  constructor(routes: string[], stackOn: [route: string, under: string][] = []) {
    this.#routes = [...new Set(routes)].map(DeepLinkStack.#segmentsOf).sort(DeepLinkStack.#bySpecificity);
    this.#stackOn = new Map(stackOn);
  }

  get size() {
    return this.#routes.length;
  }

  has(path: string) {
    return this.#match(path) !== null;
  }

  /** The concrete paths of `path`'s leading segments that are routes themselves, `path` last; with no routes, `path`. */
  prefixesOf(path: string) {
    if (this.#routes.length === 0) return [path];
    const segments = DeepLinkStack.#segmentsOf(path);
    if (segments.length === 0) return this.has("/") ? ["/"] : [];
    return segments
      .map((_, idx) => `/${segments.slice(0, idx + 1).join("/")}`)
      .filter((candidate) => this.has(candidate));
  }

  /** The screens `path`'s route names under it through `stackOn`, bottom first; a route naming itself ends the chain. */
  underOf(path: string) {
    const under: string[] = [];
    let current = this.#match(path);
    while (current && under.length < DeepLinkStack.#depthLimit) {
      const pattern = this.#stackOn.get(current.route);
      const parentPath = pattern ? DeepLinkStack.#fill(pattern, current.params) : null;
      if (!parentPath || parentPath === current.path || under.includes(parentPath)) break;
      const parent = this.#match(parentPath);
      if (!parent) break;
      under.unshift(parentPath);
      current = parent;
    }
    return under;
  }

  /** The part of `path`'s `stackOn` chain above `currentPath`, the screen on view: all of it when that is not in it. */
  missingUnder(path: string, currentPath: string) {
    if (currentPath === path) return [];
    const under = this.underOf(path);
    return under.slice(under.indexOf(currentPath) + 1);
  }

  #match(path: string): RouteMatch | null {
    const segments = DeepLinkStack.#segmentsOf(path);
    for (const route of this.#routes) {
      if (route.length !== segments.length) continue;
      const params: { [param: string]: string } = {};
      const isMatch = route.every((part, idx) => {
        const value = segments[idx] ?? "";
        if (!part.startsWith(":")) return part === value;
        params[part.slice(1)] = value;
        return true;
      });
      if (isMatch) return { path, route: `/${route.join("/")}`, params };
    }
    return null;
  }

  static #segmentsOf(path: string) {
    return path.split("/").filter(Boolean);
  }

  //? Of two routes that match one path, a static segment wins over a param at the first place they differ.
  static #bySpecificity(a: string[], b: string[]) {
    for (let idx = 0; idx < Math.min(a.length, b.length); idx++) {
      const isParamA = (a[idx] ?? "").startsWith(":");
      if (isParamA !== (b[idx] ?? "").startsWith(":")) return isParamA ? 1 : -1;
    }
    return 0;
  }

  static #fill(pattern: string, params: { [param: string]: string }) {
    const segments: string[] = [];
    for (const segment of DeepLinkStack.#segmentsOf(pattern)) {
      const value = segment.startsWith(":") ? params[segment.slice(1)] : segment;
      if (value === undefined) return null;
      segments.push(value);
    }
    return `/${segments.join("/")}`;
  }
}
