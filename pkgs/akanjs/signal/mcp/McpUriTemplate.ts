import { capitalize } from "akanjs/common";

export interface McpResourceTarget {
  endpointKey: string;
  args: Record<string, string | string[]>;
}

// Parsed by hand, not through `URL`: a runtime may normalize a non-special scheme's authority, lowercasing `agentSession`.
export class McpUriTemplate {
  static readonly scheme = "akan";
  /** Reserved second segment: a model id may never take one of these values, and none is a valid ObjectId. */
  static readonly #reserved = new Set(["list"]);

  static model(refName: string) {
    return `${McpUriTemplate.scheme}://${refName}/{${refName}Id}`;
  }
  /** The root list is the bare `…/list`: any third-segment token could also be an author's slice key. */
  static list(refName: string, sliceKey: string, argNames: string[]) {
    const base = `${McpUriTemplate.scheme}://${refName}/list${sliceKey ? `/${sliceKey}` : ""}`;
    return argNames.length ? `${base}{?${argNames.join(",")}}` : base;
  }

  static expand(template: string, args: Record<string, unknown>): string {
    const queryAt = template.indexOf("{?");
    const path = (queryAt === -1 ? template : template.slice(0, queryAt)).replace(/\{([^{}]+)\}/g, (_, name: string) =>
      encodeURIComponent(String(args[name] ?? "")),
    );
    if (queryAt === -1) return path;
    const names = template.slice(queryAt + 2, template.indexOf("}", queryAt)).split(",");
    const search = new URLSearchParams();
    for (const name of names) {
      const value = args[name];
      if (value === undefined || value === null) continue;
      for (const item of Array.isArray(value) ? value : [value]) search.append(name, String(item));
    }
    const query = search.toString();
    return query ? `${path}?${query}` : path;
  }

  static parse(uri: string): McpResourceTarget | null {
    const authority = `${McpUriTemplate.scheme}://`;
    if (!uri.startsWith(authority)) return null;
    const rest = uri.slice(authority.length);
    const queryAt = rest.indexOf("?");
    const segments = (queryAt === -1 ? rest : rest.slice(0, queryAt)).split("/");
    if (segments.some((segment) => !segment)) return null;
    const search = new URLSearchParams(queryAt === -1 ? "" : rest.slice(queryAt + 1));
    const decoded = McpUriTemplate.#decode(segments);
    if (!decoded) return null;
    const [refName, second, third] = decoded as [string, string?, string?];

    if (segments.length === 2 && second && !McpUriTemplate.#reserved.has(second))
      return { endpointKey: refName, args: { [`${refName}Id`]: second } };
    if (segments.length === 2 && second === "list")
      return { endpointKey: `${refName}List`, args: McpUriTemplate.#searchArgs(search) };
    if (segments.length === 3 && second === "list" && third)
      return { endpointKey: `${refName}List${capitalize(third)}`, args: McpUriTemplate.#searchArgs(search) };
    return null;
  }

  // A bad escape must read as an unknown resource, not a 500; the query half needs no guard, since
  // `URLSearchParams` reads one as literal text.
  static #decode(segments: string[]) {
    try {
      return segments.map(decodeURIComponent);
    } catch {
      return null;
    }
  }

  static #searchArgs(search: URLSearchParams): Record<string, string | string[]> {
    const args: Record<string, string | string[]> = {};
    for (const key of new Set(search.keys())) {
      const values = search.getAll(key);
      args[key] = values.length > 1 ? values : (values[0] ?? "");
    }
    return args;
  }
}
