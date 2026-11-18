import path from "node:path";
import type { ExportReach, ReachedImport } from "../transforms/exportReach";
import type { DiscoverOptions, ScannedImport } from "./clientBuildTypes";

export interface RenderedFile {
  isClientEntry: boolean;
  imports: ScannedImport[];
  /** Null for a module whose exports cannot be read. */
  reach?: ExportReach | null;
}

export interface RenderedGraph {
  fileOf(file: string): Promise<RenderedFile | null>;
  resolve(specifier: string, fromDir: string): Promise<string | null>;
  /** Bumped when a file changed: an answer computed across a bump is not kept. */
  epoch(): number;
}

interface ExportAsk {
  file: string;
  name: string;
  how: "whole" | "always" | "named" | "starred";
  key: string;
}

interface AskAnswer {
  isEntry: boolean;
  whole: boolean;
  next: ExportAsk[];
}

type ImportsAs = NonNullable<DiscoverOptions["importsAs"]>;

/**
 * The client entries a route can render. A server module asked for one export gives only what that export's
 * declaration reaches, and every server module the route evaluates gives what its top-level statements reach.
 */
export class RenderedEntries {
  #graph: RenderedGraph;
  #answers = new Map<string, AskAnswer>();
  //? Keyed by a walk's `importsAs`: an ask's answer under swapped imports holds only for walks swapping the same ones.
  #swappedAnswers = new WeakMap<ImportsAs, Map<string, AskAnswer>>();

  constructor(graph: RenderedGraph) {
    this.#graph = graph;
  }

  forget(): void {
    this.#answers.clear();
    this.#swappedAnswers = new WeakMap();
  }

  async of(
    seeds: string[],
    { serverModules, within, importsAs }: { serverModules: string[]; within: string[]; importsAs?: ImportsAs },
  ): Promise<string[]> {
    const answers = importsAs ? this.#answersUnder(importsAs) : this.#answers;
    const reachable = new Set(within);
    const entries = new Set<string>();
    const asked = new Set<string>();
    const whole = new Set<string>();
    const queue = seeds.map((seed) => RenderedEntries.#ask(path.resolve(seed), "whole"));
    for (const file of serverModules) queue.push(RenderedEntries.#ask(file, "always"));
    for (const ask of queue) {
      if (asked.has(ask.key) || whole.has(ask.file)) continue;
      asked.add(ask.key);
      const answer = answers.get(ask.key) ?? (await this.#answer(ask, answers, importsAs));
      if (answer.isEntry) {
        if (ask.how !== "always" && reachable.has(ask.file)) entries.add(ask.file);
        continue;
      }
      if (answer.whole) whole.add(ask.file);
      for (const next of answer.next) if (!asked.has(next.key) && !whole.has(next.file)) queue.push(next);
    }
    return [...entries].sort();
  }

  #answersUnder(importsAs: ImportsAs): Map<string, AskAnswer> {
    const answers = this.#swappedAnswers.get(importsAs) ?? new Map<string, AskAnswer>();
    this.#swappedAnswers.set(importsAs, answers);
    return answers;
  }

  async #answer(ask: ExportAsk, answers: Map<string, AskAnswer>, importsAs?: ImportsAs): Promise<AskAnswer> {
    const epoch = this.#graph.epoch();
    const answer = await this.#answerOf(ask, importsAs);
    if (epoch === this.#graph.epoch()) answers.set(ask.key, answer);
    return answer;
  }

  async #answerOf(ask: ExportAsk, importsAs?: ImportsAs): Promise<AskAnswer> {
    const facts = await this.#graph.fileOf(ask.file);
    if (!facts) return { isEntry: false, whole: false, next: [] };
    if (facts.isClientEntry) return { isEntry: true, whole: false, next: [] };
    const reached = RenderedEntries.#reachedBy(ask, facts);
    const swaps = importsAs?.get(ask.file);
    const next: ExportAsk[] = [];
    for (const { specifier, names } of reached.imports) {
      const swapped = swaps?.get(specifier);
      const spec = swapped === undefined ? specifier : swapped;
      if (!spec) continue;
      const resolved = await this.#graph.resolve(spec, path.dirname(ask.file));
      if (!resolved) continue;
      const file = path.resolve(resolved);
      if (names === null) next.push(RenderedEntries.#ask(file, "whole"));
      else for (const name of names) next.push(RenderedEntries.#ask(file, reached.starred ? "starred" : "named", name));
    }
    return { isEntry: false, whole: reached.whole ?? false, next };
  }

  //? A name asked through `export *` that the target does not hold is another target's, so it reaches nothing here.
  static #reachedBy(
    { name, how }: ExportAsk,
    { reach, imports }: RenderedFile,
  ): { imports: ReachedImport[]; whole?: boolean; starred?: boolean } {
    if (!reach) return { imports: imports.map((imported) => ({ specifier: imported.path, names: null })), whole: true };
    if (how === "whole") return { imports: reach.whole(), whole: true };
    if (how === "always") return { imports: reach.always() };
    const reached = reach.of(name);
    if (reached.known) return { imports: reached.imports };
    if (reached.stars.length > 0)
      return { imports: reached.stars.map((specifier) => ({ specifier, names: [name] })), starred: true };
    return how === "starred" ? { imports: [] } : { imports: reach.whole(), whole: true };
  }

  static #ask(file: string, how: ExportAsk["how"], name = ""): ExportAsk {
    return { file, name, how, key: `${file}\0${how}\0${name}` };
  }
}
