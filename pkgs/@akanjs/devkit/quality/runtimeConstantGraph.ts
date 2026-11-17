import { readFileSync } from "node:fs";
import path from "node:path";
import type { RuntimeConstantFact } from "./runtimeConstantFacts";
import type { RuntimeNameTable, RuntimeOwner } from "./runtimeNameTable";
import { RuntimeUse, type RuntimeUseProblem } from "./runtimeUse";

export interface RuntimeConstantNeeds {
  owners: RuntimeOwner[];
  problems: RuntimeUseProblem[];
}

const keyOf = ({ scope, module }: RuntimeOwner) => `${scope}/${module}`;

export class RuntimeConstantGraph {
  readonly #table: RuntimeNameTable;
  readonly #read: (file: string) => string | null;
  readonly #needs = new Map<string, RuntimeConstantNeeds>();

  constructor(table: RuntimeNameTable, read: (file: string) => string | null) {
    this.#table = table;
    this.#read = read;
  }

  static ofDisk(workspaceRoot: string, table: RuntimeNameTable) {
    return new RuntimeConstantGraph(table, (file) => {
      try {
        return readFileSync(path.join(workspaceRoot, file), "utf8");
      } catch {
        return null;
      }
    });
  }

  get table() {
    return this.#table;
  }

  factOf({ scope, module }: RuntimeOwner): RuntimeConstantFact | null {
    return this.#table.constantsOf(scope).find((fact) => fact.module === module) ?? null;
  }

  declarationsOf(owner: RuntimeOwner): RuntimeOwner[] {
    const kind = this.factOf(owner)?.kind;
    return kind ? this.#declarationsOf(owner.module, kind) : [];
  }

  #declarationsOf(module: string, kind: RuntimeConstantFact["kind"]): RuntimeOwner[] {
    return this.#table.layers
      .filter(({ constants }) => constants?.some((fact) => fact.module === module && fact.kind === kind))
      .map(({ scope }) => ({ scope, module }));
  }

  modelOf(module: string): RuntimeOwner | null {
    return this.#declarationsOf(module, "database").at(-1) ?? null;
  }

  //? The outermost scope: an app model extends the lib model of its name, so the app's piece registers both, lib first.
  registrationOf(owner: RuntimeOwner): RuntimeOwner | null {
    return this.declarationsOf(owner).at(-1) ?? null;
  }

  needsOf(owner: RuntimeOwner): RuntimeConstantNeeds {
    const key = keyOf(owner);
    const known = this.#needs.get(key);
    if (known) return known;
    const file = this.factOf(owner)?.file;
    const needs = file ? this.needsOfFile(`${file}.ts`) : { owners: [], problems: [] };
    const result = { ...needs, owners: needs.owners.filter((named) => keyOf(named) !== key) };
    this.#needs.set(key, result);
    return result;
  }

  needsOfFile(fileName: string): RuntimeConstantNeeds {
    const text = this.#read(fileName);
    if (text === null) return { owners: [], problems: [] };
    const { constants } = RuntimeUse.analyze({ fileName, text }, this.#table);
    const owners = new Map<string, RuntimeOwner>();
    for (const owner of constants.imports) owners.set(keyOf(owner), owner);
    for (const read of constants.reads)
      for (const { owner } of read.kind === "member" ? [read] : read.keys) owners.set(keyOf(owner), owner);
    return { owners: [...owners.values()], problems: constants.problems };
  }

  fetchNeedsOf(module: string): RuntimeOwner[] | null {
    const model = this.modelOf(module);
    const owners = model ? [model] : [];
    for (const { scope, modules } of this.#table.layers)
      for (const fact of modules)
        if (fact.module === module && fact.signal) {
          const dir = fact.kind === "service" ? `_${module}` : module;
          const needs = this.needsOfFile(`${scope}/lib/${dir}/${module}.signal.ts`);
          if (needs.problems.length) return null;
          owners.push(...needs.owners);
        }
    return this.closureOf(owners);
  }

  closureOf(owners: RuntimeOwner[]): RuntimeOwner[] {
    const found = new Map<string, RuntimeOwner>();
    const visit = (owner: RuntimeOwner) => {
      const registration = this.registrationOf(owner);
      if (!registration || found.has(keyOf(registration))) return;
      found.set(keyOf(registration), registration);
      for (const declaration of this.declarationsOf(registration))
        for (const named of this.needsOf(declaration).owners) visit(named);
    };
    owners.forEach(visit);
    return [...found.values()];
  }

  //? An edge closing a cycle is left out: a piece imported back by one it imports reads an unset binding at load.
  piecesBefore(owner: RuntimeOwner): { libs: RuntimeOwner[]; named: RuntimeOwner[] } {
    const libs = this.declarationsOf(owner).filter(({ scope }) => scope !== owner.scope);
    const named = new Map<string, RuntimeOwner>();
    for (const need of this.needsOf(owner).owners) {
      const registration = this.registrationOf(need);
      if (!registration || keyOf(registration) === keyOf(owner)) continue;
      if (this.closureOf([registration]).some((reached) => keyOf(reached) === keyOf(owner))) continue;
      named.set(keyOf(registration), registration);
    }
    return { libs, named: [...named.values()] };
  }
}
