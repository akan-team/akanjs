import { AkanError } from "akanjs/base";
import type { McpDocument } from "../../signal/mcp";
import { McpAuth, type McpAuthOption } from "./McpAuth";
import type { McpSearch } from "./McpSearch";

export interface McpShelfOption {
  /** Entry names (`createTicket`, `ticketListInOrg`), each listed as a tool the caller's guards still filter. */
  endpoints: string[];
  /** Handed to the model with this shelf's tool list, in place of the app's. */
  instructions?: string;
}

export interface McpSurface {
  /** `null` for the root listing. */
  shelf: string | null;
  path: string;
  auth: McpAuth;
  instructions?: string;
  /** The shelf's tools; `null` at the root, which lists the whole catalogue. */
  endpoints: ReadonlySet<string> | null;
}

export class McpShelves {
  static readonly namePattern = /^[a-z][a-z0-9-]{0,31}$/;
  static readonly instructionsWarnChars = 2_000;

  //? A shelf is its own OAuth resource (`<root resource>/<name>`), which the bundled authorization server serves under the root's.
  static surfaces(
    shelves: Record<string, McpShelfOption> | undefined,
    { path, auth, root }: { path: string; auth: McpAuthOption | undefined; root: McpAuth },
  ): McpSurface[] {
    return Object.entries(shelves ?? {}).map(([name, shelf]) => {
      if (!McpShelves.namePattern.test(name))
        throw new AkanError(
          "invalidConfig",
          `MCP shelf "${name}" is not a path segment of lowercase letters, digits and dashes starting with a letter.`,
        );
      if (!shelf.endpoints.length) throw new AkanError("invalidConfig", `MCP shelf "${name}" lists no endpoints.`);
      const resource = auth?.resource ? `${auth.resource.replace(/\/+$/, "")}/${name}` : undefined;
      return {
        shelf: name,
        path: `${path}/${name}`,
        auth: new McpAuth({ ...auth, resource, path: `${path}/${name}`, parent: root }),
        instructions: shelf.instructions,
        endpoints: new Set(shelf.endpoints),
      };
    });
  }

  /** Throws for a shelf or search name no served signal has; returns what to warn about. */
  static report(document: McpDocument, surfaces: McpSurface[], search: McpSearch | null): string[] {
    const lists: { where: string; names: Iterable<string> }[] = surfaces.flatMap(({ shelf, endpoints }) =>
      endpoints ? [{ where: `shelf "${shelf}"`, names: endpoints }] : [],
    );
    const long = surfaces.flatMap(({ shelf, instructions }) =>
      (instructions?.length ?? 0) > McpShelves.instructionsWarnChars
        ? [
            `MCP instructions${shelf ? ` for shelf "${shelf}"` : ""} run ${instructions?.length} characters, which every client hands its model on connecting. Move detail into tool descriptions.`,
          ]
        : [],
    );
    lists.push(
      ...(search
        ? [
            { where: "search.listed", names: search.listed },
            { where: "search.keywords", names: search.keywordNames },
          ]
        : []),
    );
    return [
      ...McpShelves.#check(document, lists),
      ...long,
      ...(search?.shadowed(document) ?? []).map(
        (name) => `MCP search lists its own "${name}" tool, so the endpoint by that name is called only over HTTP.`,
      ),
    ];
  }

  static #check(document: McpDocument, lists: { where: string; names: Iterable<string> }[]): string[] {
    const warnings: string[] = [];
    for (const { where, names } of lists) {
      const unknown = [...names].filter((name) => !document.knows(name));
      if (unknown.length)
        throw new AkanError(
          "invalidConfig",
          `MCP ${where} names ${unknown.map((name) => `"${name}"`).join(", ")}, which no served signal has. Check the spelling in option.setMcp.`,
        );
      for (const name of names) {
        if (document.findTool(name) && !document.isAppOnly(name)) continue;
        const reason = document.refusals.find(({ key }) => key === name)?.reason ?? "MCP does not publish it";
        warnings.push(`MCP ${where} names "${name}", which it cannot list: ${reason}`);
      }
    }
    return warnings;
  }
}
