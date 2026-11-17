import path from "node:path";
import type { ClientBundleGraph } from "./clientBuildTypes";

export interface RouteRuntimeNarrowed {
  //? Build entry to the source entry it wraps, for each entry built to load only the modules its code names.
  entries: ReadonlyMap<string, string>;
  wholeReaders: ReadonlySet<string>;
  //? The files `akan quality runtime` names for keeping every constant; only through one may a page reach `lib/cnst.ts`.
  wholeConstantReaders?: ReadonlySet<string>;
}

const pieceFile = /^(?:apps|libs)\/[^/]+\/lib\/__client\/[^/]+\.ts$/;
const constantPiece = /^(?:apps|libs)\/[^/]+\/lib\/__client\/[^/]+\.cnst\.ts$/;
const wholeFile = /^(?:apps|libs)\/[^/]+\/lib\/(?:useClient|st)\.ts$/;
const constantsFile = /^(?:apps|libs)\/[^/]+\/lib\/cnst\.ts$/;
const storeFile = /^(?:apps|libs)\/[^/]+\/lib\/_?[^/]+\/[^/]+\.store\.ts$/;
const advice = 'Set `clientRuntime: "all"` in akan.config.ts to build until it is fixed.';

//* What a `clientRuntime: "route"` build proves about its own output before it reports success: each runtime piece
//* loads before the module importing it, no store file or registration piece is imported back by what it loads, and no
//* page built to load pieces reaches a file that needs the whole runtime, or every constant for no named reason.
export class RouteRuntimeCheck {
  static readonly shown = 5;
  readonly #workspaceRoot: string;
  readonly #graph: ClientBundleGraph;
  readonly #narrowed: RouteRuntimeNarrowed | null;
  readonly #reached = new Map<string, Set<string>>();

  constructor(workspaceRoot: string, graph: ClientBundleGraph, narrowed: RouteRuntimeNarrowed | null = null) {
    this.#workspaceRoot = workspaceRoot;
    this.#graph = graph;
    this.#narrowed = narrowed;
  }

  get failures(): string[] {
    return [...this.#unordered(), ...this.#cycles(), ...this.#unanswered()];
  }

  assert() {
    const failures = this.failures;
    if (failures.length === 0) return;
    const more = failures.length - RouteRuntimeCheck.shown;
    throw new Error(
      [
        `[client-runtime] the build of \`clientRuntime: "route"\` would not load its modules in order:`,
        ...failures.slice(0, RouteRuntimeCheck.shown).map((failure) => `  - ${failure}`),
        ...(more > 0 ? [`  - and ${more} more`] : []),
        advice,
      ].join("\n"),
    );
  }

  #nameOf(absPath: string) {
    return path.relative(this.#workspaceRoot, absPath).split(path.sep).join("/");
  }

  #isPiece(absPath: string) {
    return pieceFile.test(this.#nameOf(absPath));
  }

  #staticImportsOf(module: string): string[] {
    return (this.#graph.importsByModule.get(module) ?? []).filter(({ lazy }) => !lazy).map((imported) => imported.path);
  }

  #reachedBy(chunk: string): Set<string> {
    const known = this.#reached.get(chunk);
    if (known) return known;
    const reached = new Set([chunk]);
    for (const next of reached)
      for (const imported of this.#graph.importsByChunk.get(next) ?? []) reached.add(imported);
    this.#reached.set(chunk, reached);
    return reached;
  }

  //? A registration piece answering from `lib/cnst.ts` is a bare re-export, which the bundler may leave in a chunk
  //? nothing imports: what has to load first is the file it re-exports.
  #loadedFirstFor(piece: string): string[] {
    const answered = constantPiece.test(this.#nameOf(piece)) && this.#narrowed?.wholeConstantReaders?.has(piece);
    return answered ? this.#staticImportsOf(piece) : [piece];
  }

  #unordered(): string[] {
    const failures: string[] = [];
    for (const [module, chunks] of this.#graph.chunksByModule)
      for (const piece of this.#staticImportsOf(module)) {
        if (!this.#isPiece(piece)) continue;
        const holdersOf = this.#loadedFirstFor(piece).map((first) => this.#graph.chunksByModule.get(first) ?? []);
        const unlinked = chunks.find((chunk) =>
          holdersOf.some((holders) => !holders.some((holder) => this.#reachedBy(chunk).has(holder))),
        );
        if (!unlinked) continue;
        failures.push(
          `${this.#nameOf(module)} needs ${this.#nameOf(piece)} loaded first, but its chunk ${path.basename(unlinked)} does not import the chunk holding that piece`,
        );
      }
    return failures;
  }

  #cycles(): string[] {
    const failures: string[] = [];
    for (const component of this.#components()) {
      const members = new Set(component);
      const store = component.find((module) => storeFile.test(this.#nameOf(module)));
      const registration = component.find(
        (module) => constantPiece.test(this.#nameOf(module)) && !this.#narrowed?.wholeConstantReaders?.has(module),
      );
      if (!store && registration) {
        const importer = component.find((module) => this.#staticImportsOf(module).includes(registration)) ?? "";
        failures.push(
          `${this.#nameOf(registration)} loads files that import it back through ${this.#nameOf(importer)}, which reads the model before it is registered`,
        );
      }
      if (!store || !component.some((module) => this.#isPiece(module))) continue;
      const pieceOf = (module: string) =>
        this.#staticImportsOf(module).find((imported) => members.has(imported) && this.#isPiece(imported));
      const importer = component.find((module) => !this.#isPiece(module) && pieceOf(module));
      const piece = importer ? pieceOf(importer) : undefined;
      failures.push(
        importer && piece
          ? `${this.#nameOf(store)} imports ${this.#nameOf(importer)}, which loads ${this.#nameOf(piece)}, and that piece imports the store file back before it is defined: move what ${this.#nameOf(importer)} reads from the store out of the files a store file imports`
          : `${this.#nameOf(store)} is imported back by a runtime piece it loads`,
      );
    }
    return failures;
  }

  #unanswered(): string[] {
    if (!this.#narrowed) return [];
    const failures: string[] = [];
    const { entries, wholeReaders, wholeConstantReaders = new Set<string>() } = this.#narrowed;
    for (const [buildEntry, entry] of entries) {
      const importerOf = this.#importersFrom(buildEntry);
      const narrowed = `${this.#nameOf(entry)} was built to load only the modules its code names`;
      const reader = [...importerOf.keys()].find((module) => wholeReaders.has(module));
      const whole = [...importerOf.keys()].find((module) => wholeFile.test(this.#nameOf(module)));
      const constantsOf = this.#importersFrom(buildEntry, wholeConstantReaders);
      const constants = [...constantsOf.keys()].find((module) => constantsFile.test(this.#nameOf(module)));
      if (reader) failures.push(`${narrowed}, but it reaches ${this.#nameOf(reader)}, which needs every module`);
      else if (whole)
        failures.push(
          `${narrowed}, but ${this.#nameOf(importerOf.get(whole) ?? whole)} imports ${this.#nameOf(whole)}, the runtime of every module`,
        );
      else if (constants)
        failures.push(
          `${narrowed}, but ${this.#nameOf(constantsOf.get(constants) ?? constants)} imports ${this.#nameOf(constants)}, the constants of every model, for no reason \`akan quality runtime\` names`,
        );
    }
    return failures;
  }

  #importersFrom(buildEntry: string, stops: ReadonlySet<string> = new Set()): Map<string, string> {
    const importerOf = new Map([[buildEntry, buildEntry]]);
    for (const module of importerOf.keys()) {
      if (stops.has(module)) continue;
      for (const imported of this.#staticImportsOf(module))
        if (!importerOf.has(imported)) importerOf.set(imported, module);
    }
    return importerOf;
  }

  //? Tarjan's algorithm with its own stack: a real import chain is deeper than the call stack allows.
  #components(): string[][] {
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const open: string[] = [];
    const onStack = new Set<string>();
    const components: string[][] = [];
    for (const root of this.#graph.importsByModule.keys()) {
      if (index.has(root)) continue;
      const frames: { module: string; imports: string[]; next: number }[] = [];
      const enter = (module: string) => {
        index.set(module, index.size);
        low.set(module, index.size - 1);
        open.push(module);
        onStack.add(module);
        frames.push({ module, imports: this.#staticImportsOf(module), next: 0 });
      };
      enter(root);
      while (frames.length > 0) {
        const frame = frames[frames.length - 1];
        if (!frame) break;
        const imported = frame.imports[frame.next++];
        const lowOf = (module: string) => low.get(module) ?? 0;
        if (imported === undefined) {
          frames.pop();
          const parent = frames[frames.length - 1];
          if (parent) low.set(parent.module, Math.min(lowOf(parent.module), lowOf(frame.module)));
          if (lowOf(frame.module) !== index.get(frame.module)) continue;
          const component = open.splice(open.lastIndexOf(frame.module));
          for (const module of component) onStack.delete(module);
          if (component.length > 1) components.push(component);
        } else if (!index.has(imported)) enter(imported);
        else if (onStack.has(imported)) low.set(frame.module, Math.min(lowOf(frame.module), index.get(imported) ?? 0));
      }
    }
    return components;
  }
}
