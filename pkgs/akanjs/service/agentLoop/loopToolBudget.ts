import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";

export class LoopToolBudget {
  readonly #max: number | undefined;
  readonly #used = new Map<string, number>();
  #step = 0;

  constructor(max: number | undefined) {
    this.#max = max;
  }

  called(names: Iterable<string>) {
    this.#step += 1;
    this.loaded(names);
  }

  loaded(names: Iterable<string>) {
    for (const name of names) this.#used.set(name, this.#step);
  }

  //? What a tool costs a round is its definition as sent; the ones the last step loaded or called stay whatever it costs.
  over(tools: readonly AgentTool[]): string[] {
    if (this.#max === undefined) return [];
    const sizeOf = ({ name, description, parameters }: AgentTool) =>
      JSON.stringify({ name, description, parameters }).length;
    let size = tools.reduce((sum, tool) => sum + sizeOf(tool), 0);
    const oldest = tools
      .filter((tool) => (this.#used.get(tool.name) ?? 0) < this.#step)
      .sort((a, b) => (this.#used.get(a.name) ?? 0) - (this.#used.get(b.name) ?? 0));
    const out: string[] = [];
    for (const tool of oldest) {
      if (size <= this.#max) break;
      size -= sizeOf(tool);
      out.push(tool.name);
    }
    return out;
  }
}
