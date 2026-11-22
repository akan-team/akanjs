import type { McpDocument, McpExposedEndpoint, McpTool, McpToolResult } from "../../signal/mcp";
import { McpFoundTools, type McpFoundToolsStore } from "./McpFoundTools";

export interface McpSearchOption {
  /** Entry names listed from the start; every other tool a caller may use is found with `findTools`. */
  listed: string[];
  /** Most tools one `findTools` returns: 8 by default, 20 at most. */
  limit?: number;
  /** More words a tool is found by, keyed by its name: the words its callers ask in, another language's included. */
  keywords?: Record<string, string[]>;
}

export type McpReadTarget = { exposed: McpExposedEndpoint; args: unknown } | { refusal: string; code: string };

// Found tools join the caller's listing as themselves, so a client still asks before each write by the tool's own name.
export class McpSearch {
  static readonly findName = "findTools";
  static readonly readName = "readTool";
  static readonly defaultLimit = 8;
  static readonly maxLimit = 20;

  readonly listed: ReadonlySet<string>;
  readonly #limit: number;
  readonly #keywords: ReadonlyMap<string, string[]>;
  readonly #found: McpFoundTools;

  constructor({ listed, limit, keywords }: McpSearchOption, store: McpFoundToolsStore | null) {
    this.listed = new Set(listed);
    this.#limit = McpSearch.#clamp(limit, McpSearch.defaultLimit);
    this.#keywords = new Map(Object.entries(keywords ?? {}));
    this.#found = new McpFoundTools(store);
  }

  get keywordNames(): string[] {
    return [...this.#keywords.keys()];
  }

  /** Endpoints the meta tools hide: a call by either name reaches the meta tool. */
  shadowed(document: McpDocument): string[] {
    return [McpSearch.findName, McpSearch.readName].filter((name) => document.findTool(name));
  }

  //? Prompt caches match a prefix, so tools a caller finds are listed after every tool listed before them.
  async listing(document: McpDocument, caller: string, pages: McpTool[]): Promise<McpTool[]> {
    const found = (await this.#found.of(caller)).filter((name) => !this.listed.has(name));
    const byName = new Map(document.tools.map((tool) => [tool.name, tool]));
    return [
      ...document.tools.filter((tool) => this.listed.has(tool.name)),
      McpSearch.#findTool,
      McpSearch.#readTool,
      ...pages,
      ...found.flatMap((name) => byName.get(name) ?? []),
    ];
  }

  /** `visible`: the catalogue as the caller's guards list it, so a search names nothing the caller may not see. */
  async find(
    visible: McpTool[],
    args: Record<string, unknown>,
    caller: string,
  ): Promise<{ error: string } | { tools: Pick<McpTool, "name" | "description" | "inputSchema">[]; added: boolean }> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return { error: "`query` names what the tool should do, in words." };
    const terms = McpSearch.#words(query);
    const ranked = visible
      .filter((tool) => !this.listed.has(tool.name))
      .map((tool, order) => ({ tool, order, score: this.#score(tool, terms) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, McpSearch.#clamp(args.limit, this.#limit))
      .map(({ tool }) => tool);
    const added = await this.#found.add(
      caller,
      ranked.map((tool) => tool.name),
    );
    return {
      tools: ranked.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      added,
    };
  }

  /** What `readTool` runs: a published query, which then passes its guards as a direct call does. */
  static readTarget(document: McpDocument, args: Record<string, unknown>): McpReadTarget {
    const name = typeof args.name === "string" ? args.name : "";
    // Security: an app-only tool is a view's, never the model's, and not-exposed reads like nonexistent.
    const exposed = document.isAppOnly(name) ? undefined : document.findTool(name);
    if (!exposed) return { refusal: `Unknown tool: ${name}.`, code: "unknownTool" };
    if (exposed.endpoint.type !== "query")
      return {
        refusal: `${McpSearch.readName} runs read-only tools, and ${name} writes. Find it with ${McpSearch.findName} and call it by its own name.`,
        code: "notReadOnly",
      };
    return { exposed, args: args.args };
  }

  static result(value: object, structured: boolean): McpToolResult {
    return {
      content: [{ type: "text", text: JSON.stringify(value) }],
      ...(structured ? { structuredContent: value as Record<string, unknown> } : {}),
      isError: false,
    };
  }

  #score(tool: McpTool, terms: string[]): number {
    const name = McpSearch.#words(`${tool.name} ${tool.title ?? ""}`);
    const keywords = (this.#keywords.get(tool.name) ?? []).flatMap((keyword) => McpSearch.#words(keyword));
    const description = McpSearch.#words(tool.description ?? "");
    let score = 0;
    for (const term of terms) {
      if (McpSearch.#matches(name, term) || McpSearch.#matches(keywords, term)) score += 3;
      else if (McpSearch.#matches(description, term)) score += 1;
    }
    return score;
  }

  static #words(text: string): string[] {
    return text
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  //? A prefix either way, as Korean adds particles (`티켓을`) and English inflects; a Latin one needs 3 letters, not `in`.
  static #matches(words: string[], term: string): boolean {
    return words.some((word) => {
      if (word === term) return true;
      const [short, long] = word.length < term.length ? [word, term] : [term, word];
      return short.length >= (/^[a-z0-9]+$/.test(short) ? 3 : 2) && long.startsWith(short);
    });
  }

  static #clamp(value: unknown, fallback: number): number {
    const limit = typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
    return Math.min(limit, McpSearch.maxLimit);
  }

  static readonly #findTool: McpTool = {
    name: McpSearch.findName,
    description: `Finds this server's tools that are not listed to you yet, by what they do, and lists the ones it returns to you from then on. Call one by its own name once it is listed; ${McpSearch.readName} runs a read-only one at once.`,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the tool should do, in the user's words." },
        limit: { type: "integer", minimum: 1, maximum: McpSearch.maxLimit },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  };

  static readonly #readTool: McpTool = {
    name: McpSearch.readName,
    description: `Runs a read-only tool by its name, listed to you or not, with its arguments in \`args\`. A tool that writes is called by its own name once ${McpSearch.findName} has listed it.`,
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, args: { type: "object" } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  };
}
