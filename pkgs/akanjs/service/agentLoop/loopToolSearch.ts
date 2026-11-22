import type { AgentTool } from "../predefinedAdaptor/agentTools.adaptor";
import type { AgentLoopToolSearch, AgentLoopToolSearchCandidate } from "./agentLoopTypes";

export class LoopToolSearch {
  static readonly toolName = "findTools";
  static readonly limit = 5;
  static readonly noQuery = "findTools needs a query: what the tool should do.";

  readonly #search: AgentLoopToolSearch;

  constructor(search: AgentLoopToolSearch) {
    this.#search = search;
  }

  get limit(): number {
    return this.#search.limit || LoopToolSearch.limit;
  }

  tool(): AgentTool {
    return {
      name: LoopToolSearch.toolName,
      description:
        "Finds tools for the request among those not listed to you yet, by what they do, and lists the ones it returns from your next step on. Search before deciding that no tool fits.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What the tool should do, in a few words." },
          limit: { type: "integer", minimum: 1, maximum: this.limit },
        },
        required: ["query"],
        additionalProperties: false,
      },
      readOnly: true,
    };
  }

  async find(query: string, limit: unknown, tools: AgentTool[]): Promise<string[]> {
    const candidates = tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      keywords: [...(this.#search.keywords?.[tool.name] ?? [])],
    }));
    const ranked = this.#search.rank
      ? await this.#search.rank(query, candidates)
      : LoopToolSearch.rank(query, candidates);
    const names = new Set(candidates.map((candidate) => candidate.name));
    const most =
      typeof limit === "number" && Number.isInteger(limit) && limit >= 1 ? Math.min(limit, this.limit) : this.limit;
    return [...new Set(Array.isArray(ranked) ? ranked : [])].filter((name) => names.has(name)).slice(0, most);
  }

  static rank(query: string, candidates: readonly AgentLoopToolSearchCandidate[]): string[] {
    const terms = LoopToolSearch.#words(query);
    return candidates
      .map((candidate, at) => ({ name: candidate.name, at, score: LoopToolSearch.#score(terms, candidate) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .map(({ name }) => name);
  }

  static #score(terms: string[], { name, description, keywords }: AgentLoopToolSearchCandidate): number {
    const named = [
      ...LoopToolSearch.#words(name.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")),
      ...keywords.flatMap((word) => LoopToolSearch.#words(word)),
    ];
    const described = LoopToolSearch.#words(description);
    let score = 0;
    for (const term of terms) {
      if (named.some((word) => LoopToolSearch.#matches(term, word))) score += 3;
      else if (described.some((word) => LoopToolSearch.#matches(term, word))) score += 1;
    }
    return score;
  }

  //? A word may carry a particle or an ending ("티켓을" for "티켓", "만들어" for "만들기"), so outside Latin script two words
  //? sharing their first two letters match; a Latin pair must share three, or "to" would match "tool".
  static #matches(term: string, word: string): boolean {
    if (term === word) return true;
    const [short, long] = term.length < word.length ? [term, word] : [word, term];
    if (/[a-z0-9]/.test(term + word)) return short.length >= 3 && long.includes(short);
    return short.length >= 2 && (long.includes(short) || long.startsWith(short.slice(0, 2)));
  }

  static #words(text: string): string[] {
    return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  }
}
