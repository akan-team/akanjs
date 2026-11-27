import { compareRouteSpecificity, matchRoutePattern } from "akanjs/common";

interface RouteMatch {
  path: string;
  route: string;
  params: { [param: string]: string };
}

/** The route patterns a deep link resolves against, and the screen each one names to lay under it (`stackOn`). */
export class DeepLinkStack {
  //? Each step resolves the screen under the one before, so a cycle of stackOn routes ends here.
  static readonly #depthLimit = 8;
  readonly #routes: string[];
  readonly #stackOn: Map<string, string>;

  constructor(routes: string[], stackOn: [route: string, under: string][] = []) {
    this.#routes = [...new Set(routes)].sort(compareRouteSpecificity);
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
    const segments = path.split("/").filter(Boolean);
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

  #match(path: string): RouteMatch | null {
    for (const route of this.#routes) {
      const params = matchRoutePattern(route, path);
      if (params) return { path, route, params };
    }
    return null;
  }

  static #fill(pattern: string, params: { [param: string]: string }) {
    const segments: string[] = [];
    for (const segment of pattern.split("/").filter(Boolean)) {
      if (!segment.startsWith(":")) segments.push(segment);
      else {
        const value = params[segment.slice(1)];
        if (value === undefined) return null;
        segments.push(encodeURIComponent(value));
      }
    }
    return `/${segments.join("/")}`;
  }
}
