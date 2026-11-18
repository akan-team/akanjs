import type { BarrelAnalyzer } from "./barrelAnalyzer";
import type { ObjectKeepReason, ObjectMemberImportsOptions } from "./objectMemberImports";
import type { ObjectMemberImport, ObjectModuleFacts, ObjectShape } from "./objectModule";
import type { ObjectModuleAnalyzer } from "./objectModuleAnalyzer";

export interface ObjectBarrels {
  names: readonly string[];
  analyzer: BarrelAnalyzer;
}

export interface ObjectSource {
  file: string;
  object: string;
  facts: ObjectModuleFacts;
  shape: ObjectShape;
}

export interface ObjectMemberOwner {
  /** The object module that lists the member, which the member's specifier is relative to. */
  file: string;
  member: ObjectMemberImport;
  nested: boolean;
  /** Whether the object module the importer names, the one that lists the member or one between is `"use client"`. */
  useClient: boolean;
}

export interface ObjectLookupRead {
  files: Set<string>;
  barrels: Set<string>;
}

type ObjectCopyLink = [module: string, specifier: string, imported: string, file: string | null, object: string | null];

export interface ObjectCopyReach {
  modules: string[];
  barrelFiles: string[];
  links: ObjectCopyLink[];
}

const MAX_COPY_DEPTH = 4;

const keyOf = ({ file, object }: Pick<ObjectSource, "file" | "object">) => `${file}#${object}`;

//* Finds the object module that lists a member an importer names. A member the object's own shape does not list may
//* come from an imported object `Object.assign` copied in (`Object.assign(Section, Field, { Rich })`), read from that
//* object's module, last copy first as the later source wins.
export class ObjectMemberLookup {
  readonly #modules: ObjectModuleAnalyzer;
  readonly #resolve: ObjectMemberImportsOptions["resolve"];
  readonly #barrels: ObjectBarrels | null;

  constructor(
    modules: ObjectModuleAnalyzer,
    resolve: ObjectMemberImportsOptions["resolve"],
    barrels: ObjectBarrels | null = null,
  ) {
    this.#modules = modules;
    this.#resolve = resolve;
    this.#barrels = barrels;
  }

  async find(
    source: ObjectSource,
    memberPath: string[],
    read: ObjectLookupRead,
  ): Promise<ObjectMemberOwner | ObjectKeepReason> {
    return (await this.#find(source, memberPath, read, [])) ?? "unresolved-member";
  }

  async namesFile(source: ObjectSource, read: ObjectLookupRead, above: string[] = []): Promise<boolean> {
    if ([...source.shape.members.values()].some(Boolean)) return true;
    const path = [...above, keyOf(source)];
    if (source.shape.open || path.length > MAX_COPY_DEPTH) return false;
    for (const copied of source.shape.copied) {
      const from = await this.#copiedSource(source.file, copied, read);
      if (from && !path.includes(keyOf(from)) && (await this.namesFile(from, read, path))) return true;
    }
    return false;
  }

  async reach(file: string): Promise<ObjectCopyReach> {
    const read: ObjectLookupRead = { files: new Set([file]), barrels: new Set() };
    const links: ObjectCopyLink[] = [];
    for (const module of read.files) {
      const facts = await this.#modules.facts(module);
      for (const shape of facts?.objects.values() ?? [])
        for (const copied of shape.copied) {
          const declared = await this.#declarationOf(copied, read);
          const from = declared && (await this.#resolve(declared.specifier, module));
          if (from) read.files.add(from);
          links.push([module, copied.specifier, copied.imported, from ?? null, declared?.imported ?? null]);
        }
    }
    const barrelFiles = await Promise.all([...read.barrels].map((barrel) => this.#barrels?.analyzer.filesOf(barrel)));
    return { modules: [...read.files], barrelFiles: barrelFiles.flatMap((files) => files ?? []), links };
  }

  //? null: the object holds no such member, so an object copied in before it may.
  async #find(
    source: ObjectSource,
    memberPath: string[],
    read: ObjectLookupRead,
    above: string[],
  ): Promise<ObjectMemberOwner | ObjectKeepReason | null> {
    const { file, facts, shape } = source;
    const [name, inner] = memberPath;
    if (name === undefined) return "unresolved-member";
    const nestedKey = inner === undefined ? null : `${name}.${inner}`;
    if (shape.members.has(name) || (nestedKey !== null && shape.members.has(nestedKey))) {
      const nested = nestedKey === null ? null : shape.members.get(nestedKey);
      const member = nested ?? shape.members.get(name);
      return member ? { file, member, nested: !!nested, useClient: facts.useClient } : "unresolved-member";
    }
    if (shape.open) return "unresolved-member";
    const path = [...above, keyOf(source)];
    for (const copied of [...shape.copied].reverse()) {
      const from = await this.#copiedSource(file, copied, read);
      if (!from || path.includes(keyOf(from)) || path.length > MAX_COPY_DEPTH) return "unresolved-member";
      //? Naming the member's file skips this module as well as the one that copies from it.
      if (from.facts.failed) return from.facts.failed.clause;
      const found = await this.#find(from, memberPath, read, path);
      if (found === null) continue;
      return typeof found === "string" ? found : { ...found, useClient: found.useClient || facts.useClient };
    }
    return null;
  }

  async #copiedSource(
    importer: string,
    copied: ObjectMemberImport,
    read: ObjectLookupRead,
  ): Promise<ObjectSource | null> {
    const declared = await this.#declarationOf(copied, read);
    const file = declared && (await this.#resolve(declared.specifier, importer));
    if (!declared || !file) return null;
    read.files.add(file);
    const facts = await this.#modules.facts(file);
    const shape = facts?.objects.get(declared.imported);
    return facts && shape ? { file, object: declared.imported, facts, shape } : null;
  }

  //? Followed as `rewriteBarrelImports` rewrites an importer's own import, so every caller finds the object at one file.
  async #declarationOf(copied: ObjectMemberImport, read: ObjectLookupRead): Promise<ObjectMemberImport | null> {
    if (!this.#barrels?.names.includes(copied.specifier) || copied.imported === "default") return copied;
    read.barrels.add(copied.specifier);
    const target = (await this.#barrels.analyzer.analyze(copied.specifier))?.get(copied.imported);
    if (!target) return copied;
    return target.namespace ? null : { specifier: target.subpath, imported: target.originalName };
  }
}
