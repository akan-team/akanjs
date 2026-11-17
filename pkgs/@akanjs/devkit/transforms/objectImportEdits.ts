import type ts from "typescript";
import type { ObjectKeepReason } from "./objectMemberImports";

export interface ObjectImportCandidate {
  declaration: ts.ImportDeclaration;
  element: ts.ImportSpecifier;
  local: string;
  imported: string;
  file?: string;
  shadowed: boolean;
  typeUse: boolean;
  keep: { reason: ObjectKeepReason; node: ts.Node } | null;
  paths: { path: string[]; nodes: ts.Expression[] }[];
  destructures: { node: ts.Identifier; keys: string[] }[];
}

export interface ObjectMemberTarget {
  file: string;
  bare: string | null;
  imported: string;
  depth: 1 | 2;
}

export interface ObjectMemberUse {
  member: string;
  written: string;
  target: ObjectMemberTarget;
  nodes: ts.Node[];
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class ObjectImportEdits {
  readonly #source: string;
  readonly #sourceFile: ts.SourceFile;
  readonly #keepLines: boolean;
  readonly #edits: Edit[] = [];
  readonly #declarations = new Map<ts.ImportDeclaration, { dropped: Set<ts.ImportSpecifier>; added: string[] }>();
  readonly #taken = new Set<string>();

  constructor(source: string, sourceFile: ts.SourceFile, keepLines: boolean) {
    this.#source = source;
    this.#sourceFile = sourceFile;
    this.#keepLines = keepLines;
  }

  narrow(
    candidate: ObjectImportCandidate,
    uses: ObjectMemberUse[],
    specifierOf: (target: ObjectMemberTarget) => string,
  ) {
    const locals = new Map<string, string>();
    const named = new Map<string, string[]>();
    const namespaces: string[] = [];
    const localOf = (member: string, target: ObjectMemberTarget) => {
      const key = `${target.file}\0${target.imported}`;
      let local = locals.get(key);
      if (local) return local;
      local = this.#allocate([candidate.local, ...member.split(".")]);
      locals.set(key, local);
      const specifier = JSON.stringify(specifierOf(target));
      if (target.imported === "*") namespaces.push(`import * as ${local} from ${specifier};`);
      else named.set(specifier, [...(named.get(specifier) ?? []), `${target.imported} as ${local}`]);
      return local;
    };
    const destructured = new Map<ts.Node, string[]>();
    for (const { member, target, nodes } of uses) {
      const local = localOf(member, target);
      const node = nodes[target.depth - 1] ?? nodes[0];
      if (!node) continue;
      if (node.kind === candidate.element.name.kind) {
        const key = member.split(".")[0] ?? member;
        const entry = `${IDENTIFIER_RE.test(key) ? key : JSON.stringify(key)}: ${local}`;
        destructured.set(node, [...(destructured.get(node) ?? []), entry]);
        continue;
      }
      this.#replace(node, local);
    }
    for (const [node, entries] of destructured) this.#replace(node, `{ ${[...new Set(entries)].join(", ")} }`);
    const declaration = this.#declarations.get(candidate.declaration) ?? { dropped: new Set(), added: [] };
    declaration.dropped.add(candidate.element);
    const specifier = candidate.declaration.moduleSpecifier.getText(this.#sourceFile);
    if (candidate.typeUse)
      declaration.added.push(`import type { ${candidate.element.getText(this.#sourceFile)} } from ${specifier};`);
    for (const [from, items] of named) declaration.added.push(`import { ${items.join(", ")} } from ${from};`);
    declaration.added.push(...namespaces);
    this.#declarations.set(candidate.declaration, declaration);
  }

  apply(): string | null {
    for (const [declaration, { dropped, added }] of this.#declarations)
      this.#edits.push({
        start: declaration.getStart(this.#sourceFile),
        end: declaration.end,
        text: this.#join([...this.#remainingOf(declaration, dropped), ...added], declaration),
      });
    if (this.#edits.length === 0) return null;
    let out = this.#source;
    for (const edit of [...this.#edits].sort((a, b) => b.start - a.start))
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    return out;
  }

  #remainingOf(declaration: ts.ImportDeclaration, dropped: Set<ts.ImportSpecifier>): string[] {
    const clause = declaration.importClause;
    const bindings = clause?.namedBindings;
    const kept =
      bindings && "elements" in bindings
        ? bindings.elements
            .filter((element) => !dropped.has(element))
            .map((element) => element.getText(this.#sourceFile))
        : [];
    const parts = [...(clause?.name ? [clause.name.text] : []), ...(kept.length > 0 ? [`{ ${kept.join(", ")} }`] : [])];
    if (parts.length === 0) return [];
    return [`import ${parts.join(", ")} from ${declaration.moduleSpecifier.getText(this.#sourceFile)};`];
  }

  #join(lines: string[], node: ts.Node) {
    if (!this.#keepLines) return lines.join("\n");
    return `${lines.join(" ")}${"\n".repeat(this.#newlinesOf(node))}`;
  }

  #replace(node: ts.Node, text: string) {
    const padding = this.#keepLines ? "\n".repeat(this.#newlinesOf(node)) : "";
    this.#edits.push({ start: node.getStart(this.#sourceFile), end: node.end, text: `${text}${padding}` });
  }

  #newlinesOf(node: ts.Node) {
    return this.#source.slice(node.getStart(this.#sourceFile), node.end).split("\n").length - 1;
  }

  #allocate(parts: string[]) {
    const base = `${/^[a-z]/.test(parts[0] ?? "") ? "$" : ""}${parts.join("$")}`;
    let name = base;
    for (let n = 1; this.#taken.has(name) || this.#appears(name); n++) name = `${base}$${n}`;
    this.#taken.add(name);
    return name;
  }

  #appears(name: string) {
    return new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`).test(this.#source);
  }
}
