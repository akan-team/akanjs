import type {
  McpDocument,
  McpExposedEndpoint,
  McpListingCost,
  McpPrompt,
  McpSignalCost,
  McpTool,
  McpUndescribed,
} from "akanjs/signal";

export class ServedMcpCatalogue {
  readonly tools: McpTool[];
  readonly prompts: McpPrompt[];
  /** The server's catalogue before any caller is applied: `refusals`, `appTools`, `unmatchedExclusions`. */
  readonly document: McpDocument;
  readonly #names: Set<string>;
  #cost: McpListingCost | null = null;
  constructor(document: McpDocument, { tools, prompts }: { tools: McpTool[]; prompts: McpPrompt[] }) {
    this.document = document;
    this.tools = tools;
    this.prompts = prompts;
    this.#names = new Set(tools.map((tool) => tool.name));
  }
  findTool(name: string): McpExposedEndpoint | undefined {
    return this.#names.has(name) ? this.document.findTool(name) : undefined;
  }
  get undescribed(): McpUndescribed[] {
    return this.document.undescribed.filter(({ key }) => this.#names.has(key));
  }
  get listingCost(): McpListingCost {
    if (this.#cost) return this.#cost;
    const bySignal = new Map<string, McpSignalCost>();
    for (const tool of this.tools) {
      const refName = this.document.findTool(tool.name)?.refName ?? tool.name;
      const cost = bySignal.get(refName) ?? { refName, entries: 0, bytes: 0 };
      cost.entries += 1;
      cost.bytes += JSON.stringify(tool).length;
      bySignal.set(refName, cost);
    }
    const costs = [...bySignal.values()].sort((a, b) => b.bytes - a.bytes);
    this.#cost = { bytes: costs.reduce((sum, cost) => sum + cost.bytes, 0), bySignal: costs };
    return this.#cost;
  }
}
