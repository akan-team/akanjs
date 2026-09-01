import { capitalize } from "akanjs/common";

export interface McpResourceTarget {
  endpointKey: string;
  args: Record<string, string | string[]>;
}

/**
 * Two-way map between an `akan://` resource URI and the endpoint that answers it.
 *
 * Parsing is done by hand rather than through `URL`: `akan:` is a non-special scheme, and how a runtime
 * normalizes the authority of one (case, percent-decoding) is exactly where a camelCase refName like
 * `agentSession` would quietly stop matching its model.
 */
export class McpUriTemplate {
  static readonly scheme = "akan";
  /** Reserved second segment: a model id may never take one of these values, and none is a valid ObjectId. */
  static readonly #reserved = new Set(["light", "list"]);

  static model(refName: string) {
    return `${McpUriTemplate.scheme}://${refName}/{${refName}Id}`;
  }
  static light(refName: string) {
    return `${McpUriTemplate.scheme}://${refName}/light/{${refName}Id}`;
  }
  /**
   * The model's own unfiltered list is the bare `…/list`, never `…/list/<token>`. A named slice occupies the
   * third segment, and a slice key is an author-chosen identifier — so any token put there for the root list
   * would be one a slice could also be called, and the two would publish the same uri with only one of them
   * readable. `list` in the *second* segment is already reserved against a model id, so there is nothing to
   * collide with here.
   */
  static list(refName: string, sliceKey: string, argNames: string[]) {
    const base = `${McpUriTemplate.scheme}://${refName}/list${sliceKey ? `/${sliceKey}` : ""}`;
    return argNames.length ? `${base}{?${argNames.join(",")}}` : base;
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
    if (segments.length === 3 && second === "light" && third)
      return { endpointKey: `light${capitalize(refName)}`, args: { [`${refName}Id`]: third } };
    if (segments.length === 3 && second === "list" && third)
      return { endpointKey: `${refName}List${capitalize(third)}`, args: McpUriTemplate.#searchArgs(search) };
    return null;
  }

  /**
   * A percent escape the decoder rejects (`akan://banner/%`) makes the uri unreadable, which is the same answer as
   * a uri naming nothing: `resources/read` says `Unknown resource`. Left to throw, `decodeURIComponent`'s `URIError`
   * reached the router's catch and became "the server failed" with a stack in the log — on a method an agent may
   * call with any string it likes, so it was a log-spam path as well as a wrong verdict. The query half needs no
   * such guard: `URLSearchParams` reads a bad escape as literal text.
   */
  static #decode(segments: string[]) {
    try {
      return segments.map(decodeURIComponent);
    } catch {
      return null;
    }
  }

  /** Repeated keys become an array so an `arrDepth` search arg round-trips through `{?statuses}` form expansion. */
  static #searchArgs(search: URLSearchParams): Record<string, string | string[]> {
    const args: Record<string, string | string[]> = {};
    for (const key of new Set(search.keys())) {
      const values = search.getAll(key);
      args[key] = values.length > 1 ? values : (values[0] ?? "");
    }
    return args;
  }
}
